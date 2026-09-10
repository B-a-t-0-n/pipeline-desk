const {test}=require('node:test');
const assert=require('node:assert/strict');
const {setSubscription,planNotifications,watchedProjects}=require('../electron/notifications.cjs');
const project={key:'42:',id:42,name:'backend',branch:'',webUrl:'https://git.example/team/backend'};
const group={key:'group:work',name:'Работа',projectKeys:['42:'],sources:[]};
const base=()=>({projects:[project],groups:[group],notifications:{},notificationState:{seen:{},delivered:{}}});
const result=(id,status)=>({pipeline:{id,status,ref:'main',webUrl:`${project.webUrl}/-/pipelines/${id}`},history:[]});
const data=(id,status)=>new Map([['42:',result(id,status)]]);
function poll(config,rows){const plan=planNotifications(config,rows);config.notificationState=plan.state;return plan.events;}

test('notifications are opt-in; enabling an already completed pipeline stays quiet',()=>{
  const config=base();assert.deepEqual(poll(config,data(1,'failed')),[]);
  const enabled=setSubscription(config,'42:',true,data(1,'failed'));
  assert.deepEqual(poll(enabled,data(1,'failed')),[]);
  assert.equal(enabled.notifications['42:'],true);
});
test('active pipeline completion is delivered once, including after restart',()=>{
  let config=setSubscription(base(),'42:',true,data(1,'running'));
  config=JSON.parse(JSON.stringify(config));
  assert.equal(poll(config,data(1,'success')).length,1);
  assert.deepEqual(poll(JSON.parse(JSON.stringify(config)),data(1,'success')),[]);
});
test('new terminal pipelines, failure then recovery, and cancellation are reported',()=>{
  const config=setSubscription(base(),'42:',true,data(1,'success'));
  assert.match(poll(config,data(2,'failed'))[0].title,/Ошибка/);
  assert.match(poll(config,data(2,'success'))[0].title,/Успешно/);
  assert.match(poll(config,data(3,'canceled'))[0].title,/Отменён/);
  assert.deepEqual(poll(config,data(4,'manual')),[]);
});
test('first startup baseline, empty projects and temporary network errors',()=>{
  const config=setSubscription(base(),'42:',true,new Map());
  assert.deepEqual(poll(config,data(9,'success')),[]);
  poll(config,data(10,'running'));
  assert.deepEqual(poll(config,new Map([['42:',{...result(10,'failed'),error:'offline'}]])),[]);
  assert.equal(poll(config,data(10,'failed')).length,1);
  const empty=setSubscription(base(),'42:',true,new Map([['42:',{pipeline:null,history:[]}]]));
  assert.equal(poll(empty,data(1,'success')).length,1);
});
test('group, GitLab subgroup and individual subscriptions deduplicate',()=>{
  const initial=base();initial.groups.push({key:'group:gitlab',name:'GitLab',projectKeys:[],sources:[{projectKeys:['42:']} ]});
  let config=setSubscription(initial,group.key,true,data(1,'running'));
  config=setSubscription(config,'group:gitlab',true,data(1,'running'));
  config=setSubscription(config,'42:',true,data(1,'running'));
  assert.equal(watchedProjects(config).length,1);
  const events=poll(config,data(1,'success'));assert.equal(events.length,1);
  assert.equal(events[0].body,'Работа · #1 · main');
  assert.equal(events[0].url,`${project.webUrl}/-/pipelines/1`);
});
test('unsubscribing a project keeps group coverage; removing all coverage stops delivery',()=>{
  let config=setSubscription(base(),group.key,true,data(1,'running'));
  config=setSubscription(config,'42:',true,data(1,'running'));
  config=setSubscription(config,'42:',false,data(1,'running'));
  assert.equal(poll(config,data(1,'success')).length,1);
  config=setSubscription(config,group.key,false,data(1,'success'));
  assert.deepEqual(poll(config,data(2,'failed')),[]);
  config=setSubscription(config,'42:',true,data(2,'failed'));
  assert.deepEqual(poll(config,data(2,'failed')),[]);
});
test('changing group membership establishes a quiet baseline for added projects',()=>{
  const config=setSubscription(base(),group.key,true,data(1,'running'));
  config.projects.push({...project,id:43,key:'43:',name:'frontend'});
  config.groups=[{...group,projectKeys:['43:']}];
  const rows=new Map([['42:',result(1,'failed')],['43:',result(5,'success')]]);
  assert.deepEqual(poll(config,rows),[]);
  rows.set('43:',result(6,'failed'));assert.equal(poll(config,rows).length,1);
  assert.deepEqual(Object.keys(config.notificationState.seen),['43:']);
});
test('a superseded running pipeline still completes through recent history',()=>{
  const config=setSubscription(base(),'42:',true,data(1,'running'));
  const current=result(2,'running');current.history=[{...result(1,'failed').pipeline,ref:'release'}];
  assert.match(poll(config,new Map([['42:',current]]))[0].body,/#1 · release/);
  assert.deepEqual(poll(config,new Map([['42:',current]])),[]);
});
test('overlapping branch trackers do not duplicate the same pipeline across polls',()=>{
  const initial=base();initial.projects.push({...project,key:'42:main',branch:'main'});
  const rows=data(1,'running');rows.set('42:main',result(1,'running'));
  let config=setSubscription(initial,'42:',true,rows);config=setSubscription(config,'42:main',true,rows);
  rows.set('42:',result(1,'success'));assert.equal(poll(config,rows).length,1);
  rows.set('42:main',result(1,'success'));assert.deepEqual(poll(config,rows),[]);
});
test('subscription input rejects unknown keys and invalid state',()=>{
  for(const key of ['missing','__proto__',null])assert.throws(()=>setSubscription(base(),key,true,new Map()));
  assert.throws(()=>setSubscription(base(),'42:','yes',new Map()));
});
