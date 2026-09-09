const started = Date.now();
export function demoProjects() {
  const fixtures = [
    ['web-app-backend','web-app',1042,'running','main',['success','running','pending','pending'],222,'feat: add sample endpoint'],
    ['web-app-frontend','web-app',1041,'success','main',['success','success','success','success'],168,'fix: update dashboard filters'],
    ['platform-infra','infrastructure',1038,'failed','main',['success','success','failed','skipped'],94,'chore: update production config'],
    ['notification-service','services',1043,'running','feat/email-templates',['success','success','running','pending'],87,'feat: add email templates'],
    ['design-system','shared',1036,'success','main',['success','success','success'],56,'feat: add compact table'],
    ['api-gateway','services',1033,'success','release/2.4',['success','success','success','success'],132,'chore: release 2.4.0'],
  ];
  return fixtures.map(([name,group,id,status,ref,statuses,duration,commit],index) => ({
    key:`demo-${index}`,id:index+1,name,namespace:`Demo / ${group}`,branch:ref,commit,demo:true,
    pipeline:{id,status,ref,sha:(index+1).toString(16).repeat(8),duration,startedAt:new Date(started-duration*1000).toISOString()},
    stages:statuses.map((s,i) => ({name:((index===2)?['validate','build','plan','apply']:(index===4)?['lint','test','publish']:['quality','build','migrations','deploy'])[i],status:s,jobs:[{id:id*10+i,name:['quality','docker-build','migrate-prod','deploy-prod'][i],status:s}]})),
    history:[status,'success','success',index===2?'failed':'success','success','success',index===0?'failed':'success','success','success','success','success','success'].map((s,i)=>({id:id-i,status:s})),
  }));
}
