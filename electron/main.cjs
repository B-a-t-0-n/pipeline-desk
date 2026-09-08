const {app,BrowserWindow,ipcMain,safeStorage,shell,screen,Tray,Menu,nativeImage,dialog} = require('electron');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {normalizeHost,parseProject,createClient} = require('./gitlab.cjs');
const {readNetrc} = require('./netrc.cjs');
const {createGroupService,groupProjectKeys}=require('./groups.cjs');
const {openConfigStore}=require('./storage.cjs');
const {windowIcon,dismissOverview,restoreOverview}=require('./platform.cjs');
const {createTokenVault}=require('./credentials.cjs');

const tokenVault=createTokenVault(safeStorage);
if (process.env.PIPELINE_DESK_PROFILE) app.setPath('userData', process.env.PIPELINE_DESK_PROFILE);
const single = app.requestSingleInstanceLock();
if (!single) app.quit();
let config = {host:'',token:'',username:'',interval:15000,projects:[],groups:[],widgets:{},bounds:null,netrcPath:'',netrcFailed:false,netrcAuto:true,authMode:'private'};
let token = '', data = new Map(), overview, tray, timer, refreshing, epoch = 0, lastUpdate = null, startupError = '', quitting = false, store;
const widgets = new Map();
const pagePath = path.join(__dirname,'../ui/index.html');
const pageUrl = pathToFileURL(pagePath).href;
const groupService=createGroupService({getConfig:()=>config,getEpoch:()=>epoch,getClient:()=>{
  if(!token)throw new Error('Сначала подключите GitLab.');
  return createClient(config.host,token,undefined,config.authMode);
},commit:async update=>{const next=update(config);await persist(next);config=next;broadcast();}});
const isGroupKey=key=>key?.startsWith('group:')||key?.startsWith('demo-group-');
function widgetView(key){
  const saved=config.widgets[key];
  if(['compact','stages','full'].includes(saved?.view))return saved.view;
  if(typeof saved?.compact==='boolean')return saved.compact?'compact':'full';
  return isGroupKey(key)?'stages':'full';
}
const isCompact=key=>widgetView(key)!=='full';
const widgetMinHeight=(key,view)=>isGroupKey(key)?(view==='compact'?110:150):view==='compact'?84:view==='stages'?140:230;
function widgetHeight(key,view){
  if(!isGroupKey(key))return {compact:84,stages:158,full:280}[view];
  const group=config.groups.find(g=>g.key===key),count=group?groupProjectKeys(group).length:2;
  return view==='full'?620:Math.max(widgetMinHeight(key,view),Math.min(600,66+count*(view==='compact'?38:104)));
}
async function persist(next = config) {
  if(!store)throw new Error('Локальное хранилище недоступно.');
  store.save(next);
}
function snapshot() {
  return {desktop:true,platform:process.platform,connected:!!token,host:config.host,username:config.username,interval:config.interval,updating:!!refreshing,lastUpdate,error:startupError,netrcAvailable:!!config.netrcPath,netrcFailed:!!config.netrcFailed,
    projects:config.projects.map(p => ({...p,...data.get(p.key),pinned:widgets.has(p.key)})),groups:config.groups.map(g=>({...g,memberKeys:groupProjectKeys(g),pinned:widgets.has(g.key),error:g.sources.find(s=>s.error)?.error||null})),widgets:[...widgets.keys()],widgetOptions:Object.fromEntries([...widgets.keys()].map(key=>[key,{compact:isCompact(key),view:widgetView(key)}]))};
}
function broadcast() { for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send('desk:update',snapshot()); }
function schedule(delay = config.interval) { clearTimeout(timer); if(token && !quitting) timer = setTimeout(refresh,delay); }
function refresh(forceGroups=false) {
  if (refreshing) return refreshing;
  if (!token) return Promise.resolve(snapshot());
  clearTimeout(timer);
  const generation = epoch, client = createClient(config.host,token,undefined,config.authMode);
  let delay = config.interval;
  refreshing = (async () => {
    await groupService.sync(forceGroups);
    if(generation!==epoch)return;
    const pending=[...config.projects];
    async function worker() {
      while(pending.length) {
        const p = pending.shift();
        try { const result = await client.pipeline(p); if (generation===epoch) data.set(p.key,{...result,error:null,fetchedAt:new Date().toISOString()}); }
        catch(e) { delay = Math.max(delay,e.retryAfter || 0); if(generation===epoch) data.set(p.key,{...data.get(p.key),error:e.message}); }
      }
    }
    await Promise.all(Array.from({length:Math.min(3,pending.length)},worker));
    if(generation===epoch) lastUpdate = new Date().toISOString();
  })().finally(() => {refreshing=null;broadcast();schedule(delay);});
  broadcast();
  return refreshing.then(snapshot);
}
function visibleBounds(saved,width,height) {
  if(saved && screen.getAllDisplays().some(d => saved.x+saved.width>d.workArea.x+40 && saved.x<d.workArea.x+d.workArea.width-40 && saved.y+saved.height>d.workArea.y+40 && saved.y<d.workArea.y+d.workArea.height-40)) return saved;
  return {width,height};
}
function createWindow(key) {
  const widget = !!key;
  const group=isGroupKey(key),view=widgetView(key);
  const w = new BrowserWindow({...visibleBounds(widget?config.widgets[key]?.bounds:config.bounds,widget?(group?440:388):1100,widget?widgetHeight(key,view):790),minWidth:widget?330:660,minHeight:widget?widgetMinHeight(key,view):500,show:false,frame:false,backgroundColor:'#141619',title:widget?'Pipeline Desk · Widget':'Pipeline Desk',icon:windowIcon(__dirname),alwaysOnTop:widget?config.widgets[key]?.pinned!==false:false,autoHideMenuBar:true,
    webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
  w.webContents.setWindowOpenHandler(() => ({action:'deny'}));
  w.webContents.on('will-navigate',e => e.preventDefault());
  w.webContents.session.setPermissionRequestHandler((_,__,callback) => callback(false));
  w.loadFile(pagePath,{query:widget?{widget:key}:{}});
  w.once('ready-to-show',() => {if(!process.env.PIPELINE_DESK_TEST)w.show();});
  let saveTimer;
  const saveBounds = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      if(w.isDestroyed()) return;
      if(widget) config.widgets[key]={...config.widgets[key],bounds:w.getBounds(),viewHeights:{...config.widgets[key]?.viewHeights,[widgetView(key)]:w.getBounds().height},pinned:w.isAlwaysOnTop()};
      else config.bounds=w.getNormalBounds();
      persist().catch(() => {});
    },250);
  };
  w.on('move',saveBounds);w.on('resize',saveBounds);
  w.on('closed',() => {clearTimeout(saveTimer);if(widget){widgets.delete(key);broadcast();}});
  w.on('close',event => {
    if(quitting)return;
    if(widget){config.widgets[key]={...config.widgets[key],open:false};persist().catch(()=>{});}
    else{event.preventDefault();dismissOverview(w);}
  });
  return w;
}
function showOverview() { if(!overview || overview.isDestroyed()) overview=createWindow(); restoreOverview(overview); }
function openWidget(key) {
  if(!config.projects.some(p => p.key===key)&&!config.groups.some(g=>g.key===key) && !(key?.startsWith('demo-') && !token)) throw new Error('Проект или группа не найдены.');
  if(widgets.has(key)){widgets.get(key).show();widgets.get(key).focus();return;}
  config.widgets[key]={...config.widgets[key],open:true};
  const w = createWindow(key);widgets.set(key,w);broadcast();persist().catch(() => {});
}
async function closeWidget(key) {
  config.widgets[key]={...config.widgets[key],open:false};
  await persist();
  widgets.get(key)?.destroy();widgets.delete(key);broadcast();
}
function register(name, handler) {
  ipcMain.handle(`desk:${name}`,async (event,payload) => {
    try {
      if(event.senderFrame!==event.sender.mainFrame || event.senderFrame.url.split('?')[0]!==pageUrl) throw new Error('Недопустимый источник запроса.');
      return {ok:true,value:await handler(payload,event)};
    } catch(error) {return {ok:false,error:error.message || 'Не удалось выполнить действие.'};}
  });
}
register('snapshot',(_,event)=>({...snapshot(),windowPinned:BrowserWindow.fromWebContents(event.sender).isAlwaysOnTop()}));
async function connect(input,authMode='private') {
  const host=normalizeHost(input.host), secret=String(input.token || '').trim();
  if(!secret) throw new Error('Введите токен с правом read_api.');
  const user=await createClient(host,secret,undefined,authMode).user();
  const encrypted=await tokenVault.encrypt(secret);
  const sameHost = config.host===host;
  const next = {...config,host,token:encrypted,authMode,username:user.username,projects:sameHost?config.projects:[],groups:sameHost?config.groups:[],widgets:sameHost?config.widgets:{}};
  await persist(next);
  epoch++;config=next;token=secret;startupError='';
  if(!sameHost) data.clear();
  for(const [key,w] of widgets) if(!config.projects.some(p=>p.key===key)&&!config.groups.some(g=>g.key===key)) {w.destroy();widgets.delete(key);}
  broadcast();await refresh();return snapshot();
}
register('connect',input=>connect(input));
async function connectNetrc(){
  try{
    const credentials=await readNetrc(config.netrcPath,config.host);
    await connect({host:config.host,token:credentials.password},credentials.login==='oauth2'?'bearer':'private');
    config.netrcFailed=false;config.netrcAuto=true;await persist();broadcast();return snapshot();
  }catch(error){
    config.netrcFailed=true;await persist();broadcast();
    if(error.status===401||error.status===403)throw new Error('Данные .netrc не подошли. Создайте токен read_api и вставьте его ниже.');
    throw error;
  }
}
register('connectNetrc',connectNetrc);
register('createToken',async value=>{
  const host=normalizeHost(value||config.host);
  const url=new URL(`${host}/-/user_settings/personal_access_tokens`);
  url.searchParams.set('name','Pipeline Desk');url.searchParams.set('scopes','read_api');
  await shell.openExternal(url.href);
});
register('listProjects',async(input={})=>{
  if(!token)throw new Error('Сначала подключите GitLab.');
  const page=Number(input.page||1),search=String(input.search||'').trim();
  if(!Number.isInteger(page)||page<1||page>10000||search.length>200)throw new Error('Некорректный запрос проектов.');
  const generation=epoch;
  const result=await createClient(config.host,token,undefined,config.authMode).projects(search,page);
  if(generation!==epoch)throw new Error('Подключение изменилось. Откройте список ещё раз.');
  return result;
});
register('addProjects',async ids=>{
  if(!token)throw new Error('Сначала подключите GitLab.');
  if(!Array.isArray(ids)||!ids.length||ids.length>100||ids.some(id=>!Number.isSafeInteger(id)||id<1))throw new Error('Выберите проекты из списка.');
  const generation=epoch,client=createClient(config.host,token,undefined,config.authMode),pending=[...new Set(ids)],found=[];
  async function worker(){while(pending.length){const p=await client.project(pending.shift());found.push({key:`${p.id}:`,id:p.id,name:p.path,namespace:p.namespace.full_path,webUrl:p.web_url,branch:''});}}
  await Promise.all(Array.from({length:Math.min(3,pending.length)},worker));
  if(generation!==epoch)throw new Error('Подключение изменилось. Выберите проекты ещё раз.');
  const next={...config,projects:[...config.projects,...found.filter(p=>!config.projects.some(old=>old.key===p.key)).sort((a,b)=>ids.indexOf(a.id)-ids.indexOf(b.id))]};
  await persist(next);config=next;broadcast();if(refreshing)await refreshing;await refresh();return snapshot();
});
register('listGroups',async(input={})=>{
  if(!token)throw new Error('Сначала подключите GitLab.');
  const page=Number(input.page||1),search=String(input.search||'').trim(),generation=epoch;
  if(!Number.isInteger(page)||page<1||page>10000||search.length>200)throw new Error('Некорректный запрос групп.');
  const result=await createClient(config.host,token,undefined,config.authMode).groups(search,page);
  if(generation!==epoch)throw new Error('Подключение изменилось. Откройте список ещё раз.');
  return result;
});
register('saveGroup',async input=>{
  if(refreshing)await refreshing;
  const key=await groupService.save(input);await refresh();return {key,state:snapshot()};
});
register('removeGroup',async key=>{
  const next={...config,groups:config.groups.filter(g=>g.key!==key),widgets:{...config.widgets}};
  delete next.widgets[key];await persist(next);config=next;widgets.get(key)?.destroy();widgets.delete(key);broadcast();return snapshot();
});
register('disconnect',async () => {
  const next={...config,token:'',username:'',projects:[],groups:[],widgets:{},netrcAuto:false};
  await persist(next);epoch++;config=next;token='';data.clear();lastUpdate=null;clearTimeout(timer);
  for(const w of widgets.values())w.destroy();widgets.clear();broadcast();return snapshot();
});
register('addProject',async input => {
  if(!token) throw new Error('Сначала подключите GitLab.');
  const generation=epoch;
  const p=await createClient(config.host,token,undefined,config.authMode).project(parseProject(input.path,config.host));
  const branch=String(input.branch || '').trim();
  if(branch.length>250) throw new Error('Слишком длинное имя ветки.');
  if(generation!==epoch) throw new Error('Подключение изменилось. Добавьте проект ещё раз.');
  const key=`${p.id}:${branch}`;
  if(config.projects.some(p=>p.key===key)) throw new Error('Этот проект и ветка уже добавлены.');
  const project={key,id:p.id,name:p.path,namespace:p.namespace.full_path,webUrl:p.web_url,branch};
  const next={...config,projects:[...config.projects,project]};
  await persist(next);config=next;broadcast();await refresh();return snapshot();
});
register('removeProject',async key => {
  if(config.groups.some(g=>groupProjectKeys(g).includes(key)))throw new Error('Проект входит в группу. Измените её состав перед удалением.');
  const next={...config,projects:config.projects.filter(p=>p.key!==key),widgets:{...config.widgets}};
  delete next.widgets[key];await persist(next);config=next;widgets.get(key)?.destroy();widgets.delete(key);data.delete(key);broadcast();return snapshot();
});
register('settings',async input => {
  if(![15000,30000,60000].includes(input.interval)) throw new Error('Недопустимый интервал.');
  const next={...config,interval:input.interval};await persist(next);config=next;schedule();broadcast();return snapshot();
});
register('refresh',()=>refresh(true));
register('openWidget',openWidget);
register('closeWidget',closeWidget);
async function setWidgetView(view,event){
  if(!['compact','stages','full'].includes(view))throw new Error('Неизвестный вид виджета.');
  const w=BrowserWindow.fromWebContents(event.sender),entry=[...widgets].find(([,win])=>win===w);
  if(!entry)throw new Error('Откройте отдельный виджет.');
  const key=entry[0],previous=widgetView(key),bounds=w.getBounds();
  const saved={...config.widgets[key],view,compact:view!=='full',viewHeights:{...config.widgets[key]?.viewHeights,[previous]:bounds.height}};
  const height=saved.viewHeights[view]??widgetHeight(key,view);
  config.widgets[key]=saved;w.setMinimumSize(330,widgetMinHeight(key,view));
  w.setBounds({height:Math.min(height,screen.getDisplayMatching(bounds).workArea.height)});
  config.widgets[key].bounds=w.getBounds();await persist();broadcast();return view;
}
register('setWidgetView',setWidgetView);
register('windowAction',async (action,event) => {
  const w=BrowserWindow.fromWebContents(event.sender);
  if(action==='compact'){
    const entry=[...widgets].find(([,win])=>win===w);if(!entry)return;
    return (await setWidgetView(isCompact(entry[0])?'full':'compact',event))!=='full';
  }
  if(action==='minimize') w.minimize();
  if(action==='quit') app.quit();
  if(action==='overview') showOverview();
  if(action==='close') {
    const entry=[...widgets].find(([,win])=>win===w);
    if(entry)await closeWidget(entry[0]);else w.close();
  }
  if(action==='pin') {w.setAlwaysOnTop(!w.isAlwaysOnTop());const entry=[...widgets].find(([,win])=>win===w);if(entry){config.widgets[entry[0]]={...config.widgets[entry[0]],pinned:w.isAlwaysOnTop()};await persist();}return w.isAlwaysOnTop();}
});
register('openExternal',async raw => {
  const url=new URL(raw),base=new URL(config.host || 'https://gitlab.com');
  if(url.protocol!=='https:' || url.origin!==base.origin || url.username || url.password) throw new Error('Разрешены только ссылки подключённого GitLab.');
  await shell.openExternal(url.href);
});

if(single) app.whenReady().then(async () => {
  app.setAppUserModelId('local.pipeline-desk');
  Menu.setApplicationMenu(null);
  try {
    store=openConfigStore(app.getPath('userData'));
    const stored=store.load();
    config={...config,...stored};
    if(![15000,30000,60000].includes(config.interval)) config.interval=15000;
    if(!stored)await persist();
  } catch {
    store?.close();store=null;
    dialog.showErrorBox('Pipeline Desk','Не удалось открыть локальную базу настроек. Данные сохранены. Проверьте доступ к папке данных приложения и повторите запуск.');
    app.quit();return;
  }
  try{if(config.token)token=await tokenVault.decrypt(config.token);}
  catch{startupError=process.platform==='linux'?'Не удалось расшифровать токен. Разблокируйте хранилище секретов и перезапустите приложение или подключите GitLab заново.':'Не удалось расшифровать токен. Подключите GitLab заново.';}
  overview=createWindow();
  try{
    tray=new Tray(nativeImage.createFromPath(path.join(__dirname,'../assets/icon.png')).resize({width:20,height:20}));
    tray.setToolTip('Pipeline Desk');
    tray.setContextMenu(Menu.buildFromTemplate([{label:'Открыть Pipeline Desk',click:showOverview},{label:'Обновить',click:()=>refresh().catch(()=>{})},{type:'separator'},{label:'Выйти',click:()=>app.quit()}]));
    tray.on(process.platform==='linux'?'click':'double-click',showOverview);
  }catch(error){
    if(process.platform!=='linux')throw error;
    console.warn('System tray unavailable; use the overview window.');
  }
  for(const [key,value]of Object.entries(config.widgets))if(value.open)try{openWidget(key);}catch{}
  if(!token&&config.netrcPath&&config.netrcAuto&&!config.netrcFailed){
    connectNetrc().catch(error=>{startupError=error.message;broadcast();});
  }else refresh();
});
app.on('second-instance',showOverview);
app.on('activate',showOverview);
app.on('before-quit',()=>{
  quitting=true;clearTimeout(timer);
  if(!store)return;
  for(const [key,w]of widgets)if(!w.isDestroyed()){
    const bounds=w.getBounds();
    config.widgets[key]={...config.widgets[key],bounds,viewHeights:{...config.widgets[key]?.viewHeights,[widgetView(key)]:bounds.height},pinned:w.isAlwaysOnTop()};
  }
  if(overview&&!overview.isDestroyed())config.bounds=overview.getNormalBounds();
  try{store.save(config);}catch{dialog.showErrorBox('Pipeline Desk','Не удалось сохранить последние настройки окна. Предыдущие данные в базе сохранены.');}
});
app.on('will-quit',()=>{store?.close();store=null;});
app.on('window-all-closed',()=>{});
