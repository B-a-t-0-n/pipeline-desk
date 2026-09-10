import {icon} from './icons.js';
import {demoProjects} from './demo.js';
import {installSetup} from './setup.js';
import {installGroups} from './groups.js';
let setup,groupEditor;
let selectedGroup=localStorage.getItem('desk-group')||'all',previewView=null,renderedGroup=null;

const $ = selector => document.querySelector(selector);
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const native = !!window.desk;
const widgetKey = new URLSearchParams(location.search).get('widget');
const activeStatuses = new Set(['running','pending','created','preparing','waiting_for_resource','scheduled']);
const labels = {running:'Выполняется',success:'Успешно',failed:'Ошибка',pending:'В очереди',created:'Создан',preparing:'Подготовка',waiting_for_resource:'Ждёт ресурс',scheduled:'Запланирован',manual:'Нужен запуск',canceled:'Отменён',skipped:'Пропущен',warning:'С замечаниями',unknown:'Нет данных'};
let state = {connected:false,projects:[],widgets:[],interval:15000,lastUpdate:null}, filter='all', view=localStorage.getItem('desk-view') || 'grid', currentDetail=null, toastTimer, pinned=true;
let demo = demoProjects();
const hiddenDemo = new Set(JSON.parse(localStorage.getItem('desk-hidden-demo') || '[]'));
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
document.body.classList.toggle('desktop',native);
document.body.classList.toggle('widget-mode',!!widgetKey);
$('#overview').hidden=!!widgetKey;$('#widget').hidden=!widgetKey;
document.documentElement.dataset.theme=localStorage.getItem('desk-theme') || 'dark';

function initializeIcons() {
  document.querySelectorAll('[data-icon]').forEach(el => el.innerHTML=icon(el.dataset.icon));
  $('#app-symbol').innerHTML=icon('logo');
  $('#settings-button').innerHTML=icon('settings');
  $('#refresh-button').innerHTML=icon('refresh');
  document.querySelector('[data-window="minimize"]').innerHTML=icon('minus');
  document.querySelector('[data-window="close"]').innerHTML=icon('x');
  document.querySelectorAll('[data-view]').forEach(el=>el.innerHTML=icon(el.dataset.view));
  updateThemeButton();
}
function updateThemeButton() {const light=document.documentElement.dataset.theme==='light';$('#theme-button').innerHTML=icon(light?'moon':'sun');$('#theme-button').setAttribute('aria-label',light?'Тёмная тема':'Светлая тема');}
function projects(){return state.connected ? state.projects : demo.filter(p=>!hiddenDemo.has(p.key)).map(p=>({...p,pinned:state.widgets.includes(p.key)}));}
function findProject(key){return projects().find(p=>p.key===key);}
function notificationButton(item){
  if(!item)return '';
  const enabled=!!state.notifications?.[item.key],group=!!item.memberKeys;
  const inherited=!group&&groups().some(g=>state.notifications?.[g.key]&&g.memberKeys.includes(item.key));
  const title=enabled?'Выключить уведомления':inherited?'Также включены через группу. Включить отдельно':'Уведомлять о завершении пайплайнов';
  return `<button class="icon-button notification-toggle ${inherited?'via-group':''}" data-action="notifications" data-key="${escape(item.key)}" aria-label="Уведомления ${group?'группы':'проекта'} ${escape(item.name)}" aria-pressed="${enabled}" title="${title}">${icon('bell')}${enabled?'<span class="notification-mark" aria-hidden="true"></span>':''}</button>`;
}
function symbol(status){const s=labels[status]?status:'unknown';return `<span class="status-symbol ${s}">${s==='success'?icon('check'):s==='failed'?icon('x'):s==='canceled'?icon('minus'):s==='manual'?icon('play'):s==='warning'?icon('alert'):s==='skipped'?icon('minus'):''}</span>`;}
function duration(p){
  if(!p)return '—';
  let sec=p.duration;
  if(activeStatuses.has(p.status)&&p.startedAt)sec=Math.max(0,(Date.now()-new Date(p.startedAt).getTime())/1000);
  if(sec==null || !Number.isFinite(sec))return '—';
  const n=Math.floor(sec),h=Math.floor(n/3600),m=Math.floor(n/60)%60,s=n%60;
  return h?`${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`:`${m}:${String(s).padStart(2,'0')}`;
}
function stagesMarkup(p,complete=false){
  if(!p.pipeline)return `<div class="card-empty">${p.error?'Нет актуальных данных':p.fetchedAt?'Пайплайнов пока нет':'Получаем пайплайн…'}</div>`;
  if(!p.stages?.length)return '<div class="card-empty">Задания ещё не созданы</div>';
  const shown=complete?p.stages:p.stages.slice(0,6),columns=Math.min(4,shown.length);
  return `<div class="stages ${complete?'complete-stages':''}" style="--stage-columns:${columns}" aria-label="Этапы пайплайна">${shown.map((stage,index)=>`<button class="stage ${escape(stage.status)} ${complete&&index%columns===0?'stage-row-start':''}" data-action="detail" data-key="${escape(p.key)}" title="${escape(stage.name)}: ${escape(labels[stage.status] || stage.status)}" aria-label="${escape(stage.name)}: ${escape(labels[stage.status] || stage.status)}">${symbol(stage.status)}<span>${escape(stage.name)}</span></button>`).join('')}${!complete&&p.stages.length>6?`<button class="stage" data-action="detail" data-key="${escape(p.key)}" aria-label="Ещё ${p.stages.length-6} этапов"><span class="status-symbol">+</span><span>${p.stages.length-6} ещё</span></button>`:''}</div>`;
}
function renderCard(p,widget=false,omitHeading=false){
  const pipeline=p.pipeline, status=pipeline?.status || 'unknown', key=escape(p.key);
  const widgetControls=widgetTools(p);
  const heading=`<div class="card-heading"><div class="project-name-group"><button class="project-name" data-action="detail" data-key="${key}" title="${escape(p.name)}">${escape(p.name)}</button><span class="namespace">${escape(p.namespace)}${widget&&p.demo?'<span class="widget-demo">Демо</span>':''}</span></div>${!widget?notificationButton(p)+repoButton(p):''}${widget?widgetControls:`<button class="icon-button ${p.pinned?'pinned':''}" data-action="pin" data-key="${key}" aria-label="${p.pinned?'Закрыть виджет':'Закрепить виджет'} ${escape(p.name)}" aria-pressed="${!!p.pinned}" title="${p.pinned?'Закрыть виджет':'Закрепить на рабочем столе'}">${icon('pin')}</button>`}</div>`;
  return `<article class="pipeline-card" data-status="${escape(status)}" data-project="${key}" aria-label="${escape(p.name)}, ${escape(labels[status]||status)}">
    <div class="card-main">${omitHeading?'':heading}
    <div class="status-row"><div class="pipeline-status ${escape(status)}">${symbol(status)}<span>${escape(pipeline?labels[status] || status:p.error?'Недоступен':'Нет пайплайнов')}</span></div>${pipeline?`<button class="pipeline-link" data-action="detail" data-key="${key}" aria-label="Пайплайн ${pipeline.id}">#${pipeline.id}${icon('chevronRight')}</button>`:''}</div>
    <div class="pipeline-meta"><span class="branch-label" title="${escape(pipeline?.ref || p.branch || 'Любая ветка')}">${icon('branch')}<span>${escape(pipeline?.ref || p.branch || 'Любая ветка')}</span></span><span class="sha">${escape(pipeline?.sha?.slice(0,8) || '')}</span></div>
    ${stagesMarkup(p,!!widgetKey)}</div>
    ${p.error?`<div class="card-error" role="status">${icon('alert')}<span>${escape(p.error)}${p.fetchedAt?` · Данные за ${new Date(p.fetchedAt).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})}`:''}</span></div>`:''}
    <div class="card-bottom"><div class="history" aria-label="Последние запуски, старые слева">${[...(p.history || [])].reverse().map(h=>`<button class="${escape(h.status)}" data-action="history" data-url="${escape(h.webUrl || '')}" data-key="${key}" title="#${h.id} · ${escape(labels[h.status] || h.status)}" aria-label="Пайплайн ${h.id}: ${escape(labels[h.status] || h.status)}"></button>`).join('')}</div><span class="duration">${icon('clock')}<span data-duration="${key}">${duration(pipeline)}</span></span></div></article>`;
}
function groups(){
  if(state.connected)return state.groups||[];
  return [{key:'demo-group-platform',name:'Веб-приложение',memberKeys:['demo-0','demo-1'],sources:[],demo:true},{key:'demo-group-services',name:'Сервисы',memberKeys:['demo-3','demo-5'],sources:[],demo:true}].map(g=>({...g,pinned:state.widgets.includes(g.key)}));
}
function repoButton(p){return `<button class="icon-button" data-action="external" data-url="${escape(p.webUrl||'')}" aria-label="Открыть репозиторий ${escape(p.name)}" title="Открыть репозиторий">${icon('external')}</button>`;}
function widgetView(){
  const options=state.widgetOptions?.[widgetKey];
  if(!native&&previewView)return previewView;
  if(options?.view)return options.view;
  if(typeof options?.compact==='boolean')return options.compact?'compact':'full';
  return widgetKey?.startsWith('group:')||widgetKey?.startsWith('demo-group-')?'stages':'full';
}
function widgetTools(p){return `<div class="widget-controls"><select class="widget-view-select" name="widgetView" aria-label="Вид виджета" title="Вид виджета">${[['compact','Строка'],['stages','Стадии'],['full','Подробно']].map(([value,label])=>`<option value="${value}" ${widgetView()===value?'selected':''}>${label}</option>`).join('')}</select>${notificationButton(p)}${p?.webUrl||p?.demo?repoButton(p):''}<button class="icon-button" data-action="overview" aria-label="Все проекты" title="Все проекты">${icon('layers')}</button><button class="icon-button ${pinned?'pinned':''}" data-action="window-pin" aria-label="${pinned?'Открепить':'Поверх окон'}" aria-pressed="${pinned}" title="Поверх окон">${icon('pin')}</button><button class="icon-button" data-action="window-close" aria-label="Закрыть виджет" title="Закрыть виджет">${icon('x')}</button></div>`;}
function compactRow(p,widget=false){
  const status=p.error?'failed':p.pipeline?.status||'unknown';
  return `<article class="compact-project" data-project="${escape(p.key)}" data-status="${escape(status)}" data-error="${!!p.error}" aria-label="${escape(p.name)}, ${escape(p.error||labels[status])}" title="${escape(p.error||labels[status])}">${symbol(status)}<div class="compact-identity"><button class="project-name" data-action="detail" data-key="${escape(p.key)}" title="${escape(p.namespace+'/'+p.name)}">${escape(p.name)}</button></div><span class="compact-status-label">${escape(p.error?'Нет связи':labels[status])}</span>${p.pipeline?`<button class="pipeline-link" data-action="detail" data-key="${escape(p.key)}" aria-label="Пайплайн ${p.pipeline.id}">#${p.pipeline.id}</button>`:''}${notificationButton(p)}${repoButton(p)}${widget?'':`<button class="icon-button ${p.pinned?'pinned':''}" data-action="pin" data-key="${escape(p.key)}" aria-label="${p.pinned?'Закрыть виджет':'Закрепить виджет'} ${escape(p.name)}">${icon('pin')}</button>`}</article>`;
}
function renderCollections(){
  const focused=document.activeElement,action=focused?.dataset.action,key=focused?.dataset.key,restoreFocus=!!focused?.closest('#collection-context');
  const list=groups();if(selectedGroup!=='all'&&!list.some(g=>g.key===selectedGroup))selectedGroup='all';
  const markup=[{key:'all',name:'Все проекты'},...list].map(g=>`<button class="collection-tab" data-action="select-group" data-key="${escape(g.key)}" aria-pressed="${g.key===selectedGroup}">${g.key==='all'?'':icon('layers')}<span>${escape(g.name)}</span>${g.memberKeys?`<small>${g.memberKeys.length}</small>`:''}</button>`).join('');
  if($('#collection-tabs').innerHTML!==markup)$('#collection-tabs').innerHTML=markup;
  if(renderedGroup!==selectedGroup){$('#collection-tabs [aria-pressed="true"]')?.scrollIntoView({block:'nearest',inline:'nearest'});renderedGroup=selectedGroup;}
  const selected=list.find(g=>g.key===selectedGroup),context=$('#collection-context');context.hidden=!selected;
  if(selected)context.innerHTML=`<div><h2>${escape(selected.name)}</h2>${selected.error?`<p class="collection-error" role="status">Состав группы: ${escape(selected.error)}</p>`:''}</div><div class="context-actions">${notificationButton(selected)}${selected.sources.length===1?`<button class="icon-button" data-action="external" data-url="${escape(selected.sources[0].webUrl)}" title="Открыть группу в GitLab" aria-label="Открыть группу в GitLab">${icon('external')}</button>`:''}<button class="icon-button" data-action="edit-group" data-key="${escape(selected.key)}" aria-label="Изменить группу ${escape(selected.name)}" title="Изменить группу">${icon('edit')}</button><button class="secondary-button ${selected.pinned?'pinned':''}" data-action="pin-group" data-key="${escape(selected.key)}" aria-pressed="${!!selected.pinned}" aria-label="${selected.pinned?'Закрыть виджет группы':'Закрепить группу'} ${escape(selected.name)}">${icon('pin')}${selected.pinned?'Закреплена':'Виджет группы'}</button></div>`;
  if(restoreFocus)[...context.querySelectorAll('[data-action]')].find(b=>b.dataset.action===action&&b.dataset.key===key)?.focus({preventScroll:true});
  return selected;
}
function stageBlock(p){return `<section class="pipeline-stage-block" aria-label="${escape(p.name)}: стадии">${compactRow(p,true)}${p.error?`<p class="stage-error" role="status">${escape(p.error)}</p>`:''}${stagesMarkup(p,true)}</section>`;}
function updateWidget(markup){
  const template=document.createElement('template');template.innerHTML=markup;
  const current=$('#widget').firstElementChild,next=template.content.firstElementChild;
  // Keep the native view picker mounted while pipeline data refreshes.
  if(current?.matches('.widget-bar')&&next?.matches('.widget-bar')&&current.outerHTML===next.outerHTML){
    while(current.nextSibling)current.nextSibling.remove();next.remove();$('#widget').append(template.content);
  }else $('#widget').replaceChildren(template.content);
}
function render(){
  let all=projects();
  if(widgetKey){
    const p=all.find(p=>p.key===widgetKey),g=groups().find(g=>g.key===widgetKey),mode=widgetView(),scroll=$('.group-body')?.scrollTop||0;
    const focusAction=document.activeElement?.dataset.action,focusKey=document.activeElement?.dataset.key;
    document.body.classList.toggle('group-widget',!!g);document.body.classList.toggle('compact-widget',!g&&mode!=='full');document.body.classList.toggle('solo-widget',!!p&&!g);document.body.dataset.widgetView=mode;
    if(g){
      const members=new Set(g.memberKeys),items=all.filter(p=>members.has(p.key));
      updateWidget(`<header class="widget-bar"><div class="widget-title"><span title="${escape(g.name)}">${escape(g.name)}</span><small>${items.length}</small></div>${widgetTools(g.sources.length===1?{...g,webUrl:g.sources[0].webUrl}:g)}</header>${g.error?`<p class="collection-error" role="status">Состав группы: ${escape(g.error)}</p>`:''}<div class="group-body ${mode==='full'?'group-expanded':''}">${items.length?items.map(p=>mode==='compact'?compactRow(p,true):mode==='stages'?stageBlock(p):renderCard(p)).join(''):'<div class="empty-state"><h2>В группе пока нет проектов</h2></div>'}</div><footer class="app-footer"><div><span class="live-dot"></span><span>${g.demo?'Демо · пример группы':state.updating?'Обновление…':`Каждые ${state.interval/1000} сек.`}</span></div><span>${items.filter(p=>p.error||p.pipeline?.status==='failed').length} ошибок</span></footer>`);
      $('.group-body').scrollTop=scroll;
    }else if(p){
      const header=`<header class="widget-bar"><div class="widget-title"><span title="${escape(p.name)}">${escape(p.name)}</span>${p.demo?'<small>Демо</small>':''}</div>${widgetTools(p)}</header>`;
      const summary=`<div class="solo-summary"><span class="pipeline-status ${escape(p.pipeline?.status||'unknown')}">${symbol(p.error?'failed':p.pipeline?.status)}${escape(p.error?'Нет связи':labels[p.pipeline?.status]||'Нет пайплайнов')}</span>${p.pipeline?`<button class="pipeline-link" data-action="detail" data-key="${escape(p.key)}" aria-label="Пайплайн ${p.pipeline.id}">#${p.pipeline.id}${icon('chevronRight')}</button>`:''}</div>`;
      updateWidget(header+(mode==='full'?`<div class="solo-detail-body">${renderCard(p,true,true)}</div><footer class="app-footer"><div><span class="live-dot"></span><span>${p.demo?'Демо · пример пайплайна':p.error?'Нет связи':`Каждые ${state.interval/1000} сек.`}</span></div></footer>`:`<div class="solo-body">${summary}${mode==='stages'?stagesMarkup(p,true):''}</div>`));
    }else updateWidget('<div class="empty-state"><h2>Проект или группа удалены</h2><button class="secondary-button" data-action="overview">Все проекты</button></div>');
    if(focusAction)[...$('#widget').querySelectorAll('[data-action]')].find(b=>b.dataset.action===focusAction&&b.dataset.key===focusKey)?.focus({preventScroll:true});
    if(currentDetail&&$('#detail-dialog').open)renderDetail(currentDetail);
    document.body.classList.toggle('connected',state.connected);return;
  }
  const selected=renderCollections();if(selected){const members=new Set(selected.memberKeys);all=all.filter(p=>members.has(p.key));}
  $('#project-total').textContent=all.length;
  $('#count-all').textContent=all.length;
  $('#count-active').textContent=all.filter(p=>activeStatuses.has(p.pipeline?.status)).length;
  $('#count-failed').textContent=all.filter(p=>p.pipeline?.status==='failed'||p.error).length;
  document.body.classList.toggle('connected',state.connected);
  $('#connection-label').textContent=state.connected?new URL(state.host).hostname:'Демо';
  $('#refresh-button').classList.toggle('refreshing',!!state.updating);
  $('#refresh-button').disabled=!!state.updating;
  $('#global-error').hidden=!state.error;$('#global-error').textContent=state.error || '';
  document.querySelectorAll('[data-filter]').forEach(b=>{b.classList.toggle('active',b.dataset.filter===filter);b.setAttribute('aria-pressed',b.dataset.filter===filter);});
  document.querySelectorAll('[data-view]').forEach(b=>{b.classList.toggle('selected',b.dataset.view===view);b.setAttribute('aria-pressed',b.dataset.view===view);});
  $('#projects').classList.toggle('list-view',view==='list');
  $('#projects').classList.toggle('compact-view',view==='compact');
  const visible=all.filter(p=>filter==='all'||(filter==='active'&&activeStatuses.has(p.pipeline?.status))||(filter==='failed'&&(p.pipeline?.status==='failed'||p.error)));
  const focused=document.activeElement;
  const focusKey=focused?.dataset.key,focusAction=focused?.dataset.action;
  $('#projects').innerHTML=visible.length?visible.map(p=>view==='compact'?compactRow(p):renderCard(p)).join(''):`<div class="empty-state">${icon(filter==='failed'?'check':'layers')}<h2>${filter==='failed'?'Ошибок нет':filter==='active'?'Всё спокойно':selected?'В группе пока нет проектов':'Добавьте первый проект'}</h2><p>${filter==='active'?'Сейчас нет выполняющихся пайплайнов.':filter==='failed'?'Здесь появятся пайплайны с ошибками.':selected?'Измените состав группы.':'Выберите проекты из вашего GitLab.'}</p>${filter==='all'?`<button class="primary-button" data-action="${selected?'edit-group':'add'}" data-key="${escape(selected?.key||'')}">${selected?'Изменить группу':'Добавить проект'}</button>`:''}</div>`;
  if(focusKey&&focusAction) [...$('#projects').querySelectorAll('[data-action]')].find(b=>b.dataset.key===focusKey&&b.dataset.action===focusAction)?.focus({preventScroll:true});
  updateSync();
  $('#footer-connect').innerHTML=state.connected?`@${escape(state.username)} ${icon('settings')}`:`Подключить GitLab ${icon('arrowRight')}`;
  if(currentDetail&&$('#detail-dialog').open)renderDetail(currentDetail);
}
function updateSync(){
  if(!state.connected){$('#sync-label').textContent='Демонстрационные данные';return;}
  const ago=state.lastUpdate?Math.max(0,Math.floor((Date.now()-new Date(state.lastUpdate))/1000)):0;
  $('#sync-label').textContent=state.updating?'Обновление…':`Обновлено ${ago<2?'только что':`${ago} сек. назад`} · каждые ${state.interval/1000} сек.`;
}
function notify(text){clearTimeout(toastTimer);$('#toast').textContent=text;$('#toast').classList.add('visible');toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),3600);}
function openDialog(selector){$(selector).showModal();}
function openSettings(){setup.openSettings();}
function addProject(){setup.addProjects();}
function renderDetail(key){
  const focused=document.activeElement,action=focused?.closest('#detail-content')?focused.dataset.action:null;
  const p=findProject(key);if(!p){$('#detail-dialog').close();return;}
  const h=p.pipeline;
  $('#detail-content').innerHTML=`<div class="dialog-heading"><h2 id="detail-title">${escape(p.name)}</h2><button class="icon-button" data-close aria-label="Закрыть">${icon('x')}</button></div><div class="detail-top"><span class="pipeline-status ${escape(h?.status || '')}">${symbol(h?.status)}${escape(labels[h?.status] || 'Нет пайплайна')}</span><span class="branch-label">${icon('branch')}<span>${escape(h?.ref || p.branch || 'Любая ветка')}</span></span></div>${p.demo?'<p class="field-note">Демонстрационный пайплайн</p>':''}${p.error?`<p class="form-error">${escape(p.error)}</p>`:''}${(p.stages || []).map(s=>`<section class="job-stage"><h3>${escape(s.name)}</h3>${s.jobs.map(j=>`<div class="job-row">${symbol(j.status)}<span class="job-name">${escape(j.name)}</span><span class="job-status">${escape(labels[j.status] || j.status)}${j.allowFailure?' · необязательное':''}</span>${j.webUrl?`<button class="icon-button" data-action="external" data-url="${escape(j.webUrl)}" aria-label="Открыть задание ${escape(j.name)}">${icon('external')}</button>`:''}</div>`).join('')}</section>`).join('')}<div class="detail-footer">${notificationButton(p)}${repoButton(p)}<button class="text-button danger-text" data-action="remove" data-key="${escape(key)}">${icon('trash')}Убрать проект</button>${h?.webUrl?`<button class="secondary-button" data-action="external" data-url="${escape(h.webUrl)}">#${h.id}${icon('external')}</button>`:''}</div>`;
  if(action)[...$('#detail-content').querySelectorAll('[data-action]')].find(b=>b.dataset.action===action&&b.dataset.key===key)?.focus({preventScroll:true});
}
async function external(url){if(!url){notify('Демонстрационный пайплайн');return;}if(native)await window.desk.openExternal(url);}
async function act(action,key,el){
  const p=findProject(key);
  if(action==='notifications'){
    if(!native||!state.connected){notify('Подключите GitLab, чтобы включить уведомления.');return;}
    const enabled=!state.notifications?.[key];
    state=await window.desk.setNotifications({key,enabled});render();
    const inherited=!enabled&&p&&groups().some(g=>state.notifications?.[g.key]&&g.memberKeys.includes(key));
    notify(enabled?'Уведомления включены':inherited?'Личные уведомления выключены. Уведомления группы остаются.':'Уведомления выключены');
  }
  if(action==='select-group'){selectedGroup=key;localStorage.setItem('desk-group',key);filter='all';render();}
  if(action==='edit-group')groupEditor.open(key);
  if(action==='pin-group'){
    const g=groups().find(g=>g.key===key);if(!g)return;
    if(native){await window.desk[g.pinned?'closeWidget':'openWidget'](key);notify(g.pinned?'Виджет закрыт':'Группа закреплена');}
    else{window.open(`${location.pathname}?widget=${encodeURIComponent(key)}`,'widget-'+key,'popup,width=440,height=400');notify('Предпросмотр виджета группы');}
  }
  if(action==='window-compact'){
    if(native)await window.desk.windowAction('compact');else previewView=widgetView()==='full'?'compact':'full';render();
  }
  if(action==='add')addProject();
  if(action==='detail'){currentDetail=key;renderDetail(key);if(!$('#detail-dialog').open)openDialog('#detail-dialog');}
  if(action==='pin'){
    if(native){await window.desk[p.pinned?'closeWidget':'openWidget'](key);notify(p.pinned?'Виджет закрыт':'Виджет закреплён на рабочем столе');}
    else {window.open(`${location.pathname}?widget=${encodeURIComponent(key)}`,'widget-'+key,'popup,width=388,height=280');notify('Предпросмотр. Закрепление доступно в Windows-приложении.');}
  }
  if(action==='history'||action==='external')await external(el.dataset.url);
  if(action==='window-pin'){
    if(native){pinned=await window.desk.windowAction('pin');render();}
    else notify('Закрепление поверх окон доступно в приложении Windows.');
  }
  if(action==='window-close'){if(native)await window.desk.windowAction('close');else window.close();}
  if(action==='overview'){if(native)await window.desk.windowAction('overview');else location.href=location.pathname;}
  if(action==='remove'){
    if(p.demo){hiddenDemo.add(key);localStorage.setItem('desk-hidden-demo',JSON.stringify([...hiddenDemo]));if(native)await window.desk.closeWidget(key);}
    else state=await window.desk.removeProject(key);
    $('#detail-dialog').close();currentDetail=null;render();notify('Проект убран из панели');
  }
}
document.addEventListener('click',async e=>{
  const close=e.target.closest('[data-close]');if(close){close.closest('dialog').close();return;}
  const target=e.target.closest('[data-action]');if(!target)return;
  try{await act(target.dataset.action,target.dataset.key,target);}catch(error){notify(error.message);}
});
document.addEventListener('change',async e=>{
  if(!e.target.matches('.widget-view-select'))return;
  try{if(native)await window.desk.setWidgetView(e.target.value);else previewView=e.target.value;render();}
  catch(error){e.target.value=widgetView();notify(error.message);}
});
$('#detail-dialog').addEventListener('close',()=>{currentDetail=null;});
document.querySelectorAll('[data-filter]').forEach(b=>b.addEventListener('click',()=>{filter=b.dataset.filter;render();}));
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>{view=b.dataset.view;localStorage.setItem('desk-view',view);render();}));
document.querySelectorAll('[data-window]').forEach(b=>b.addEventListener('click',()=>window.desk?.windowAction(b.dataset.window)));
$('#theme-button').addEventListener('click',()=>{
  const apply=()=>{document.documentElement.dataset.theme=document.documentElement.dataset.theme==='light'?'dark':'light';localStorage.setItem('desk-theme',document.documentElement.dataset.theme);updateThemeButton();};
  if(document.startViewTransition&&!reduced.matches)document.startViewTransition(apply);else apply();
});
window.addEventListener('storage',event=>{if(event.key==='desk-theme'){document.documentElement.dataset.theme=event.newValue;updateThemeButton();}});
$('#add-button').addEventListener('click',addProject);
$('#settings-button').addEventListener('click',openSettings);
$('#connection-button').addEventListener('click',openSettings);
$('#footer-connect').addEventListener('click',openSettings);
$('#refresh-button').addEventListener('click',async()=>{
  if(native&&state.connected){try{await window.desk.refresh();}catch(e){notify(e.message);}}
  else notify('Это демо. Подключите GitLab для актуальных данных.');
});
document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key==='r'){e.preventDefault();$('#refresh-button').click();}});
setup=installSetup({getState:()=>state,updateState:next=>{state=next;render();},notify});
groupEditor=installGroups({getState:()=>state,openSettings,onSaved:(next,key)=>{state=next;selectedGroup=key;filter='all';localStorage.setItem('desk-group',key);render();},notify});
$('#new-group-button').addEventListener('click',()=>groupEditor.open());
initializeIcons();
if(native){
  try{state=await window.desk.snapshot();pinned=state.windowPinned??true;}catch(error){state.error=error.message;}
  window.desk.onUpdate(next=>{state=next;render();});
  window.desk.onNotice?.(notify);
}
render();
setInterval(()=>{
  for(const p of projects()){document.querySelectorAll(`[data-duration="${CSS.escape(p.key)}"]`).forEach(el=>el.textContent=duration(p.pipeline));}
  if(!widgetKey)updateSync();
},1000);
