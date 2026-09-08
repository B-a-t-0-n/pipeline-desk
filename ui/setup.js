import {icon} from './icons.js';
const $=selector=>document.querySelector(selector);
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const defaultHost='https://nzkjew7r.npo-enel.ru';

export function installSetup({getState,updateState,notify}){
  const native=!!window.desk;
  let mode='list',items=[],selected=new Set(),nextPage=null,requestId=0,searchTimer,busy=false;
  function host(){return $('#host-input').value.trim();}
  function setConnectionBusy(value){
    $('#connect-submit').disabled=value;$('#netrc-button').disabled=value;$('#disconnect-button').disabled=value;
    $('#connect-submit').textContent=value?'Подключение…':getState().connected?'Сохранить':'Подключить';
  }
  function updateServer(){
    try{$('#server-name').textContent=new URL(host()).hostname;}catch{$('#server-name').textContent='Сервер GitLab';}
    const s=getState();$('#netrc-button').hidden=!native||!s.netrcAvailable||host().replace(/\/+$/,'')!==s.host;
    $('#token-input').required=!s.connected&&(!s.netrcAvailable||s.netrcFailed||host().replace(/\/+$/,'')!==s.host);
  }
  function openSettings(){
    const s=getState();$('#host-input').value=s.host||defaultHost;$('#token-input').value='';
    $('#token-input').placeholder=s.connected?'Сохранён · новый токен необязателен':'Вставьте токен один раз';
    $('#token-input').removeAttribute('aria-invalid');$('#settings-error').textContent='';
    $('#interval-input').value=String(s.interval);$('#host-field').hidden=true;$('#edit-server').setAttribute('aria-expanded','false');
    $('#disconnect-button').hidden=!s.connected;$('#settings-dialog .setup-details').open=false;
    $('#credential-note').textContent=!native?'Подключение доступно в настольном приложении.':s.netrcFailed&&!s.connected?'Данные .netrc не подошли. Нужен токен с правом read_api.':'Сохраним автоматически. Повторный ввод не нужен.';
    $('#netrc-label').textContent=s.netrcFailed?'Повторить из .netrc':'Использовать .netrc';
    setConnectionBusy(false);updateServer();$('#settings-dialog').showModal();$('#token-input').focus();
  }
  async function connect(useNetrc=false){
    $('#settings-error').textContent='';
    if(!native){$('#settings-error').textContent='Откройте Pipeline Desk с рабочего стола.';return;}
    setConnectionBusy(true);
    try{
      const s=getState(),secret=$('#token-input').value.trim();
      if(useNetrc||(!secret&&!s.connected&&s.netrcAvailable))updateState(await window.desk.connectNetrc());
      else if(secret)updateState(await window.desk.connect({host:host(),token:secret}));
      else if(!s.connected)throw new Error('Вставьте токен или используйте .netrc.');
      else if(host().replace(/\/+$/,'')!==s.host)throw new Error('Для другого сервера нужен токен.');
      updateState(await window.desk.settings({interval:Number($('#interval-input').value)}));
      $('#token-input').value='';$('#settings-dialog').close();notify('GitLab подключён');
      if(!getState().projects.length)addProjects();
    }catch(error){$('#settings-error').textContent=error.message;$('#token-input').setAttribute('aria-invalid','true');$('#token-input').focus();updateServer();}
    finally{setConnectionBusy(false);}
  }
  function updateAddButton(){const b=$('#add-form button[type="submit"]');b.disabled=busy;b.textContent=busy?'Добавление…':mode==='list'&&selected.size?`Добавить · ${selected.size}`:'Добавить';}
  function renderItems(){
    const existing=new Set(getState().projects.filter(p=>!p.branch).map(p=>p.id));
    $('#catalog-items').innerHTML=items.map(p=>`<label class="catalog-project"><input type="checkbox" name="projectIds" value="${p.id}" ${existing.has(p.id)?'checked disabled':selected.has(p.id)?'checked':''}><span><strong>${escape(p.name)}</strong><small>${escape(p.namespace)}</small></span>${existing.has(p.id)?'<span class="catalog-added">Добавлен</span>':icon('repo')}</label>`).join('');
    $('#more-projects').hidden=!nextPage;updateAddButton();
  }
  async function loadProjects(append=false){
    const id=++requestId;$('#catalog-status').textContent='Загрузка проектов…';$('#more-projects').disabled=true;
    if(!append){items=[];nextPage=null;renderItems();}
    try{
      const result=await window.desk.listProjects({search:$('#project-search').value,page:append?nextPage:1});
      if(id!==requestId||!$('#add-dialog').open)return;
      const known=new Set(items.map(p=>p.id));items.push(...result.items.filter(p=>!known.has(p.id)));nextPage=result.nextPage;
      renderItems();$('#catalog-status').textContent=items.length?'':'Проекты не найдены. Попробуйте другое название или добавьте по ссылке.';
    }catch(error){if(id===requestId){$('#catalog-status').textContent=error.message;$('#catalog-status').insertAdjacentHTML('beforeend',' <button type="button" class="text-button" id="catalog-retry">Повторить</button>');}}
    finally{if(id===requestId)$('#more-projects').disabled=false;}
  }
  function setMode(value){
    mode=value;$('#project-catalog').hidden=value!=='list';$('#manual-project').hidden=value!=='manual';$('#project-input').required=value==='manual';
    document.querySelectorAll('[data-picker-mode]').forEach(b=>{const active=b.dataset.pickerMode===value;b.classList.toggle('active',active);b.setAttribute('aria-pressed',active);});
    $('#add-error').textContent='';updateAddButton();
  }
  function addProjects(){
    if(!getState().connected){openSettings();return;}
    selected=new Set();items=[];nextPage=null;$('#add-form').reset();$('#add-error').textContent='';setMode('list');
    $('#add-dialog').showModal();loadProjects();$('#project-search').focus();
  }
  $('#edit-server').addEventListener('click',()=>{const show=$('#host-field').hidden;$('#host-field').hidden=!show;$('#edit-server').setAttribute('aria-expanded',show);if(show)$('#host-input').focus();});
  $('#host-input').addEventListener('input',updateServer);
  $('#token-input').addEventListener('input',()=>{$('#token-input').removeAttribute('aria-invalid');$('#settings-error').textContent='';});
  $('#settings-form').addEventListener('submit',e=>{e.preventDefault();connect();});
  $('#netrc-button').addEventListener('click',()=>connect(true));
  $('#create-token-button').addEventListener('click',async()=>{
    if(!$('#host-input').checkValidity()){$('#host-field').hidden=false;$('#host-input').reportValidity();return;}
    try{if(native)await window.desk.createToken(host());else{$('#settings-error').textContent='Откройте настольное приложение, чтобы перейти в ваш GitLab.';}}catch(e){$('#settings-error').textContent=e.message;}
  });
  $('#disconnect-button').addEventListener('click',async()=>{try{updateState(await window.desk.disconnect());$('#token-input').value='';$('#settings-dialog').close();notify('GitLab отключён');}catch(e){$('#settings-error').textContent=e.message;}});
  $('#settings-dialog').addEventListener('close',()=>{$('#token-input').value='';});
  document.querySelectorAll('[data-picker-mode]').forEach(b=>b.addEventListener('click',()=>setMode(b.dataset.pickerMode)));
  $('#project-search').addEventListener('input',()=>{clearTimeout(searchTimer);requestId++;searchTimer=setTimeout(()=>loadProjects(),250);});
  $('#more-projects').addEventListener('click',()=>loadProjects(true));
  $('#catalog-status').addEventListener('click',e=>{if(e.target.id==='catalog-retry')loadProjects();});
  $('#catalog-items').addEventListener('change',e=>{if(e.target.matches('input[type="checkbox"]')){const id=Number(e.target.value);if(e.target.checked)selected.add(id);else selected.delete(id);updateAddButton();$('#add-error').textContent='';}});
  $('#add-dialog').addEventListener('close',()=>{requestId++;clearTimeout(searchTimer);});
  $('#add-form').addEventListener('submit',async e=>{
    e.preventDefault();$('#add-error').textContent='';
    if(mode==='list'&&!selected.size){$('#add-error').textContent='Отметьте хотя бы один проект.';$('#catalog-items input:not(:disabled)')?.focus();return;}
    busy=true;updateAddButton();
    try{
      const result=mode==='list'?await window.desk.addProjects([...selected]):await window.desk.addProject({path:$('#project-input').value,branch:$('#branch-input').value});
      updateState(result);$('#add-dialog').close();notify(mode==='list'&&selected.size>1?'Проекты добавлены':'Проект добавлен');
    }catch(error){$('#add-error').textContent=error.message;}
    finally{busy=false;updateAddButton();}
  });
  return {openSettings,addProjects};
}
