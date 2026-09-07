const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createGroupService,groupProjectKeys,projectRecord}=require('../electron/groups.cjs');
const {createClient}=require('../electron/gitlab.cjs');
const project=id=>({id,path:`repo-${id}`,namespace:{full_path:'team/sub'},web_url:`https://git.example/team/sub/repo-${id}`});
function fixture(){
  let config={groups:[],projects:[projectRecord(project(1))]},epoch=0;
  const members=new Map([[10,[project(1),project(2)]],[11,[project(2),project(3)]]]);
  const calls=[];
  const service=createGroupService({getConfig:()=>config,getEpoch:()=>epoch,commit:async fn=>{config=fn(config);},getClient:()=>({
    project:async id=>project(id),group:async id=>({id,name:`Group ${id}`,fullPath:`team/${id}`,webUrl:`https://git.example/groups/team/${id}`}),
    groupProjects:async(id,sub)=>{calls.push({id,sub});if(members.get(id) instanceof Error)throw members.get(id);return members.get(id)||[];}
  })});
  return {service,members,calls,get config(){return config;},setEpoch:()=>epoch++};
}
test('group and subgroup discovery is read-only, paginated and trims sensitive group metadata',async()=>{
  const calls=[];
  const client=createClient('https://git.example','fixture',async url=>{
    calls.push(url);const route=url.pathname;let body,headers={};
    if(route.endsWith('/groups')){body=[{id:10,name:'Team',full_path:'team',parent_id:null,runners_token:'must-not-leak'}];headers={'x-next-page':'2'};}
    else if(route.endsWith('/projects')){body=[project(url.searchParams.get('page')==='1'?1:2)];if(url.searchParams.get('page')==='1')headers={'x-next-page':'2'};}
    else body={id:10,name:'Team',full_path:'team',runners_token:'must-not-leak'};
    return new Response(JSON.stringify(body),{headers});
  });
  assert.equal((await client.groups('team',1)).nextPage,2);
  assert.equal(calls[0].searchParams.get('top_level_only'),'false');
  assert.equal(calls[0].searchParams.get('search'),'team');
  assert.equal(JSON.stringify(await client.group(10)).includes('must-not-leak'),false);
  assert.deepEqual((await client.groupProjects(10,true)).map(p=>p.id),[1,2]);
  assert.equal(calls.at(-1).searchParams.get('include_subgroups'),'true');
  assert.equal(calls.at(-1).searchParams.get('with_shared'),'false');
});
test('manual projects and overlapping GitLab groups form one deduplicated widget',async()=>{
  const f=fixture();
  const key=await f.service.save({projectKeys:['1:'],projectIds:[4],sourceIds:[10,11],name:'Delivery'});
  const group=f.config.groups.find(g=>g.key===key);
  assert.deepEqual(groupProjectKeys(group).sort(),['1:','2:','3:','4:']);
  assert.equal(f.config.projects.length,4);
  assert.ok(f.calls.every(c=>c.sub===true));
});
test('merging local groups preserves branches and dynamic sources without nested dependencies',async()=>{
  const f=fixture();
  const a=await f.service.save({name:'A',projectKeys:['1:'],sourceIds:[10],includeSubgroups:false});
  const b=await f.service.save({name:'B',sourceIds:[11]});
  const merged=await f.service.save({name:'Merged',mergeKeys:[a,b]});
  const group=f.config.groups.find(g=>g.key===merged);
  assert.deepEqual(groupProjectKeys(group),['1:','2:','3:']);
  assert.equal(group.sources[0].includeSubgroups,false);
  assert.equal(f.config.groups.length,3);
  assert.equal('mergeKeys' in group,false);
  await assert.rejects(()=>f.service.save({key:a,mergeKeys:[a]}),/объединяемую/);
});
test('group sync adds and removes members, caches successful lists and retains them on network failure',async()=>{
  const f=fixture();await f.service.save({sourceIds:[10]});
  f.calls.length=0;await f.service.sync();assert.equal(f.calls.length,0);
  f.members.set(10,[project(3)]);await f.service.sync(true);
  assert.deepEqual(groupProjectKeys(f.config.groups[0]),['3:']);
  assert.ok(f.config.projects.some(p=>p.id===3));
  f.members.set(10,new Error('Offline'));await f.service.sync(true);
  assert.deepEqual(groupProjectKeys(f.config.groups[0]),['3:']);
  assert.equal(f.config.groups[0].sources[0].error,'Offline');
});
test('invalid composition is rejected before changing saved data',async()=>{
  const f=fixture();
  for(const input of [{},{sourceIds:['10']},{projectKeys:['missing']},{mergeKeys:['missing']}])await assert.rejects(()=>f.service.save(input));
  assert.equal(f.config.groups.length,0);assert.equal(f.calls.length,0);
});
