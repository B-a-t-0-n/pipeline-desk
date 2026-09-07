import {icon} from './icons.js';
const $=s=>document.querySelector(s);
const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function installGroups({getState,openSettings,onSaved,notify}){
  let editing=null,mode='projects',selected={keys:new Set(),ids:new Set(),sources:new Set(),groups:new Set()},items=[],nextPage=null,request=0,searchTimer,busy=false;
  const count=()=>Object.values(selected).reduce((n,s)=>n+s.size,0);
  function updateSelection(){
    $('#group-selection').textContent=count()?`Выбрано: ${count()}`:'Выберите проекты или группы';
    $('#save-group').textContent=busy?'Сохранение…':editing?'Сохранить':'Создать';
    $('#save-group').disabled=busy;$('#delete-group').disabled=busy;
  }
  function projectItems(){
    return getState().projects.map(p=>({kind:'keys',value:p.key,name:p.name,description:`${p.namespace}${p.branch?' · '+p.branch:''}`}));
  }
  function render(){
    $('#group-catalog').innerHTML=items.map(p=>`<label class="catalog-project"><input type="checkbox" name="members" data-kind="${p.kind}" value="${escape(p.value)}" ${selected[p.kind].has(p.value)?'checked':''}><span><strong>${escape(p.name)}</strong><small>${escape(p.description)}</small></span>${icon(p.kind==='keys'||p.kind==='ids'?'repo':'layers')}</label>`).join('');
    $('#group-more').hidden=!nextPage;updateSelection();
  }
  async function load(append=false){
    const generation=++request,search=$('#group-search').value.trim();
    $('#group-catalog-status').textContent='Загрузка…';$('#group-more').disabled=true;
    if(!append){items=[];nextPage=null;}
    try{
      if(mode==='local'){
        items=(getState().groups||[]).filter(g=>g.key!==editing&&g.name.toLocaleLowerCase().includes(search.toLocaleLowerCase())).map(g=>({kind:'groups',value:g.key,name:g.name,description:`${g.memberKeys.length} проектов`}));
      }else if(mode==='gitlab'){
        const result=await window.desk.listGroups({search,page:append?nextPage:1});
        if(generation!==request||!$('#group-dialog').open)return;
        items.push(...result.items.map(g=>({kind:'sources',value:g.id,name:g.name,description:g.fullPath})));nextPage=result.nextPage;
      }else{
        if(!append)items=projectItems().filter(p=>(p.name+' '+p.description).toLocaleLowerCase().includes(search.toLocaleLowerCase()));
        render();
        const result=await window.desk.listProjects({search,page:append?nextPage:1});
        if(generation!==request||!$('#group-dialog').open)return;
        const tracked=new Set(getState().projects.filter(p=>!p.branch).map(p=>p.id));
        items.push(...result.items.filter(p=>!tracked.has(p.id)).map(p=>({kind:'ids',value:p.id,name:p.name,description:p.namespace})));nextPage=result.nextPage;
      }
      if(generation!==request||!$('#group-dialog').open)return;
      items=[...new Map(items.map(p=>[`${p.kind}:${p.value}`,p])).values()];render();
      $('#group-catalog-status').textContent=items.length?'':mode==='local'?'Других групп пока нет.':'Ничего не найдено.';
    }catch(error){if(generation===request){render();$('#group-catalog-status').textContent=error.message;$('#group-catalog-status').insertAdjacentHTML('beforeend',' <button type="button" class="text-button" id="retry-groups">Повторить</button>');}}
    finally{if(generation===request)$('#group-more').disabled=false;}
  }
  function changeMode(value){
    clearTimeout(searchTimer);mode=value;$('#group-search').value='';$('#subgroup-option').hidden=mode!=='gitlab';
    document.querySelectorAll('[data-group-mode]').forEach(b=>{const active=b.dataset.groupMode===mode;b.classList.toggle('active',active);b.setAttribute('aria-pressed',active);});
    load();
  }
  function open(key){
    if(!getState().connected){openSettings();return;}
    const g=(getState().groups||[]).find(g=>g.key===key);editing=g?.key||null;busy=false;
    selected={keys:new Set(g?.projectKeys||[]),ids:new Set(),sources:new Set(g?.sources.map(s=>s.id)||[]),groups:new Set()};
    $('#group-form').reset();$('#group-name').value=g?.name||'';$('#include-subgroups').checked=g?g.sources.every(s=>s.includeSubgroups!==false):true;
    $('#group-title').textContent=g?'Изменить группу':'Новая группа';$('#delete-group').hidden=!g;$('#group-error').textContent='';
    $('#group-dialog').showModal();changeMode(g?.sources.length?'gitlab':'projects');$('#group-name').focus();
  }
  document.querySelectorAll('[data-group-mode]').forEach(b=>b.addEventListener('click',()=>changeMode(b.dataset.groupMode)));
  $('#group-search').addEventListener('input',()=>{request++;clearTimeout(searchTimer);searchTimer=setTimeout(()=>load(),250);});
  $('#group-more').addEventListener('click',()=>load(true));
  $('#group-catalog-status').addEventListener('click',e=>{if(e.target.id==='retry-groups')load();});
  $('#group-catalog').addEventListener('change',e=>{
    if(!e.target.matches('input[data-kind]'))return;
    const kind=e.target.dataset.kind,value=kind==='ids'||kind==='sources'?Number(e.target.value):e.target.value;
    if(e.target.checked)selected[kind].add(value);else selected[kind].delete(value);updateSelection();$('#group-error').textContent='';
  });
  $('#group-dialog').addEventListener('close',()=>{request++;clearTimeout(searchTimer);});
  $('#group-form').addEventListener('submit',async e=>{
    e.preventDefault();if(busy)return;$('#group-error').textContent='';
    if(!count()){$('#group-error').textContent='Выберите хотя бы один проект или группу.';$('#group-catalog input')?.focus();return;}
    busy=true;updateSelection();
    try{
      const result=await window.desk.saveGroup({key:editing,name:$('#group-name').value,projectKeys:[...selected.keys],projectIds:[...selected.ids],sourceIds:[...selected.sources],mergeKeys:[...selected.groups],includeSubgroups:$('#include-subgroups').checked});
      $('#group-dialog').close();onSaved(result.state,result.key);notify(editing?'Группа сохранена':'Группа создана');
    }catch(error){$('#group-error').textContent=error.message;}
    finally{busy=false;updateSelection();}
  });
  $('#delete-group').addEventListener('click',async()=>{
    if(!editing||busy)return;busy=true;updateSelection();
    try{const state=await window.desk.removeGroup(editing);$('#group-dialog').close();onSaved(state,'all');notify('Группа удалена');}
    catch(error){$('#group-error').textContent=error.message;}finally{busy=false;updateSelection();}
  });
  return {open};
}
