const {randomUUID}=require('node:crypto');
const sourceKey=s=>`${s.id}:${s.includeSubgroups!==false}`;
const groupProjectKeys=g=>[...new Set([...(g.projectKeys||[]),...(g.sources||[]).flatMap(s=>s.projectKeys||[])])];
const projectRecord=p=>({key:`${p.id}:`,id:p.id,name:p.path,namespace:p.namespace?.full_path||'',webUrl:p.web_url,branch:''});
async function mapLimited(items,fn){
  const results=new Array(items.length);let index=0;
  async function worker(){while(index<items.length){const i=index++;results[i]=await fn(items[i]);}}
  await Promise.all(Array.from({length:Math.min(3,items.length)},worker));return results;
}
function createGroupService({getConfig,commit,getClient,getEpoch}){
  const assertEpoch=generation=>{if(generation!==getEpoch())throw new Error('Подключение изменилось. Повторите действие.');};
  async function save(input){
    const initial=getConfig(),generation=getEpoch(),client=getClient();
    const old=input.key?initial.groups.find(g=>g.key===input.key):null;
    if(input.key&&!old)throw new Error('Группа удалена.');
    const name=String(input.name||'').trim();
    if(name.length>100)throw new Error('Название группы — до 100 символов.');
    const keys=input.projectKeys||[],projectIds=input.projectIds||[],ids=input.sourceIds||[],mergeKeys=input.mergeKeys||[];
    if(!Array.isArray(keys)||!Array.isArray(projectIds)||!Array.isArray(ids)||!Array.isArray(mergeKeys)||keys.length>10000||projectIds.length>100||ids.length>100||mergeKeys.length>100)throw new Error('Некорректный состав группы.');
    if(keys.some(k=>typeof k!=='string'||!initial.projects.some(p=>p.key===k))||[...ids,...projectIds].some(id=>!Number.isSafeInteger(id)||id<1))throw new Error('Выберите доступные проекты и группы.');
    const merged=mergeKeys.map(key=>initial.groups.find(g=>g.key===key));
    if(merged.some(g=>!g)||mergeKeys.includes(input.key))throw new Error('Не удалось найти объединяемую группу.');
    const projectKeys=[...new Set([...keys,...merged.flatMap(g=>g.projectKeys)])];
    const sources=new Map();
    for(const id of ids){const s={id,includeSubgroups:input.includeSubgroups!==false};sources.set(sourceKey(s),s);}
    for(const g of merged)for(const s of g.sources)sources.set(sourceKey(s),s);
    if(!projectKeys.length&&!projectIds.length&&!sources.size)throw new Error('Выберите проекты или группы.');
    if(sources.size>100)throw new Error('Выберите не больше 100 групп GitLab.');
    const records=new Map();
    await mapLimited([...new Set(projectIds)],async id=>{const record=projectRecord(await client.project(id));records.set(record.key,record);if(!projectKeys.includes(record.key))projectKeys.push(record.key);});
    const resolved=await mapLimited([...sources.values()],async s=>{
      const [meta,projects]=await Promise.all([client.group(s.id),client.groupProjects(s.id,s.includeSubgroups)]);
      for(const p of projects){const record=projectRecord(p);records.set(record.key,record);}
      return {...meta,includeSubgroups:s.includeSubgroups!==false,projectKeys:projects.map(p=>`${p.id}:`),syncedAt:Date.now(),error:null};
    });
    assertEpoch(generation);
    const group={key:old?.key||`group:${randomUUID()}`,name:name||(resolved.length===1&&!projectKeys.length?resolved[0].name:`Группа ${initial.groups.length+1}`),projectKeys,sources:resolved};
    await commit(current=>{
      if(old&&!current.groups.some(g=>g.key===old.key))throw new Error('Группа удалена.');
      const known=new Set(current.projects.map(p=>p.key));
      return {...current,projects:[...current.projects,...[...records.values()].filter(p=>!known.has(p.key))],groups:old?current.groups.map(g=>g.key===old.key?group:g):[...current.groups,group]};
    });
    return group.key;
  }
  async function sync(force=false){
    const generation=getEpoch(),client=getClient(),sources=new Map(),records=new Map();
    for(const g of getConfig().groups)for(const s of g.sources)if(force||Date.now()-(s.syncedAt||0)>=60000)sources.set(sourceKey(s),s);
    if(!sources.size)return;
    const results=await mapLimited([...sources.values()],async s=>{
      try{
        const projects=await client.groupProjects(s.id,s.includeSubgroups!==false);
        for(const p of projects){const record=projectRecord(p);records.set(record.key,record);}
        return {...s,projectKeys:projects.map(p=>`${p.id}:`),syncedAt:Date.now(),error:null};
      }catch(error){return {...s,syncedAt:Date.now(),error:error.message};}
    });
    if(generation!==getEpoch())return;
    const resolved=new Map(results.map(s=>[sourceKey(s),s]));
    await commit(current=>{
      const known=new Set(current.projects.map(p=>p.key));
      return {...current,projects:[...current.projects,...[...records.values()].filter(p=>!known.has(p.key))],groups:current.groups.map(g=>({...g,sources:g.sources.map(s=>resolved.get(sourceKey(s))||s)}))};
    });
  }
  return {save,sync};
}
module.exports={createGroupService,groupProjectKeys,projectRecord};
