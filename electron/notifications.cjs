const {groupProjectKeys}=require('./groups.cjs');
const terminalLabels={success:'Успешно',failed:'Ошибка',canceled:'Отменён'};

function watchedProjects(config){
  const settings=config.notifications||{},keys=new Set();
  for(const group of config.groups)if(settings[group.key])for(const key of groupProjectKeys(group))keys.add(key);
  return config.projects.filter(p=>settings[p.key]||keys.has(p.key));
}
function pipelines(result){
  const items=new Map((result.history||[]).map(p=>[String(p.id),p]));
  if(result.pipeline)items.set(String(result.pipeline.id),result.pipeline);
  return [...items.values()];
}
function statuses(result){return Object.fromEntries(pipelines(result).map(p=>[p.id,p.status]));}

function setSubscription(config,key,enabled,data){
  if(typeof enabled!=='boolean'||typeof key!=='string'||![...config.projects,...config.groups].some(p=>p.key===key))throw new Error('Проект или группа не найдены.');
  const notifications={...config.notifications};
  if(enabled)notifications[key]=true;else delete notifications[key];
  const next={...config,notifications},seen={};
  for(const project of watchedProjects(next)){
    const previous=config.notificationState?.seen?.[project.key],result=data.get(project.key);
    if(previous)seen[project.key]=previous;
    else if(result&&!result.error)seen[project.key]=statuses(result);
  }
  next.notificationState={seen,delivered:config.notificationState?.delivered||{}};
  return next;
}

// Observe a complete polling batch. First observations establish a quiet baseline;
// persisted observations let a completion during an app restart be detected once.
function planNotifications(config,data){
  const previous=config.notificationState||{},seen={},delivered={...previous.delivered},events=[];
  for(const project of watchedProjects(config)){
    const before=previous.seen?.[project.key],result=data.get(project.key);
    if(!result||result.error){if(before)seen[project.key]=before;continue;}
    seen[project.key]=statuses(result);
    if(!before)continue;
    const latest=Math.max(0,...Object.keys(before).map(Number));
    for(const pipeline of pipelines(result).sort((a,b)=>a.id-b.id)){
      const label=terminalLabels[pipeline.status],eventKey=`${project.id}:${pipeline.id}`;
      if(!label||before[pipeline.id]===pipeline.status||(!Object.hasOwn(before,pipeline.id)&&pipeline.id<=latest)||delivered[eventKey]===pipeline.status)continue;
      delivered[eventKey]=pipeline.status;
      const group=config.groups.find(g=>config.notifications?.[g.key]&&groupProjectKeys(g).includes(project.key));
      events.push({title:`${project.name} · ${label}`,body:[group?.name,`#${pipeline.id}`,pipeline.ref||project.branch].filter(Boolean).join(' · '),url:pipeline.webUrl||project.webUrl});
    }
  }
  // Bound history independently of how long the application stays open.
  return {state:{seen,delivered:Object.fromEntries(Object.entries(delivered).slice(-1000))},events};
}

module.exports={watchedProjects,setSubscription,planNotifications};
