const started = Date.now();
export function demoProjects() {
  const fixtures = [
    ['supply-demand-backend','supply-demand-platform',8553,'running','main',['success','running','pending','pending'],222,'feat(import): preserve upload identity'],
    ['supply-demand-frontend','supply-demand-platform',8552,'success','main',['success','success','success','success'],168,'fix: update dashboard filters'],
    ['platform-infra','infrastructure',8549,'failed','main',['success','success','failed','skipped'],94,'chore: update production config'],
    ['notification-service','services',8554,'running','feat/email-templates',['success','success','running','pending'],87,'feat: add email templates'],
    ['design-system','shared',8547,'success','main',['success','success','success'],56,'feat: add compact table'],
    ['api-gateway','services',8544,'success','release/2.4',['success','success','success','success'],132,'chore: release 2.4.0'],
  ];
  return fixtures.map(([name,group,id,status,ref,statuses,duration,commit],index) => ({
    key:`demo-${index}`,id:index+1,name,namespace:`AEDON / ${group}`,branch:ref,commit,demo:true,
    pipeline:{id,status,ref,sha:['c3e4db5e','7f2a910b','a4d921c8','e8b51d02','f132a9c0','09bdce74'][index],duration,startedAt:new Date(started-duration*1000).toISOString()},
    stages:statuses.map((s,i) => ({name:((index===2)?['validate','build','plan','apply']:(index===4)?['lint','test','publish']:['quality','build','migrations','deploy'])[i],status:s,jobs:[{id:id*10+i,name:['quality','docker-build','migrate-prod','deploy-prod'][i],status:s}]})),
    history:[status,'success','success',index===2?'failed':'success','success','success',index===0?'failed':'success','success','success','success','success','success'].map((s,i)=>({id:id-i,status:s})),
  }));
}
