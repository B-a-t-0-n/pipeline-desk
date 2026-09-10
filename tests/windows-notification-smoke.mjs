// Optional Windows smoke check: briefly displays a real toast from an isolated profile.
import {_electron as electron} from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
const env={...process.env,PIPELINE_DESK_PROFILE:await fs.mkdtemp(path.join(os.tmpdir(),'pipeline-desk-toast-')),PIPELINE_DESK_TEST:'1'};
delete env.ELECTRON_RUN_AS_NODE;
const app=await electron.launch({executablePath:path.resolve('release/PipelineDesk-win32-x64/PipelineDesk.exe'),args:[],env});
try{
  const page=await app.firstWindow();await page.waitForFunction(()=>!!window.desk);
  await app.evaluate(({Notification,shell})=>{
    // Windows identity/shortcut registration must run normally for this check.
    delete process.env.PIPELINE_DESK_TEST;
    globalThis.fixtureStatus='running';globalThis.delivery=null;
    const show=Notification.prototype.show;
    Notification.prototype.show=function(){
      globalThis.testToast=this;
      this.once('show',()=>{globalThis.delivery={shown:true};});
      this.once('failed',(_,error)=>{globalThis.delivery={shown:false,error};});
      show.call(this);
    };
    shell.openExternal=async()=>{};
    globalThis.fetch=async raw=>{
      const route=new URL(raw).pathname;let body;
      if(route.endsWith('/user'))body={username:'fixture'};
      else if(route.endsWith('/projects/42'))body={id:42,path:'Проверка уведомлений',namespace:{full_path:'Pipeline Desk'},web_url:'https://git.toast.invalid/team/test'};
      else if(route.endsWith('/pipelines'))body=[{id:1,status:globalThis.fixtureStatus,ref:'main'}];
      else if(route.endsWith('/pipelines/1'))body={id:1,status:globalThis.fixtureStatus,ref:'main',web_url:'https://git.toast.invalid/team/test/-/pipelines/1'};
      else body=[];
      return new Response(JSON.stringify(body),{status:200});
    };
  });
  await page.evaluate(()=>window.desk.connect({host:'https://git.toast.invalid',token:'toast-fixture-token'}));
  await page.evaluate(()=>window.desk.addProjects([42]));
  await page.evaluate(()=>window.desk.setNotifications({key:'42:',enabled:true}));
  const registered=await app.evaluate(({app,shell})=>{
    const link=process.getBuiltinModule('node:path').join(app.getPath('appData'),'Microsoft/Windows/Start Menu/Programs/Pipeline Desk.lnk');
    const details=shell.readShortcutLink(link);
    return details.appUserModelId==='local.pipeline-desk'&&details.target===process.execPath&&details.toastActivatorClsid?.toLowerCase()===app.toastActivatorCLSID.toLowerCase();
  });
  assert.equal(registered,true);
  await app.evaluate(()=>{globalThis.fixtureStatus='success';});await page.evaluate(()=>window.desk.refresh());
  const deadline=Date.now()+10000;let delivery;
  do{delivery=await app.evaluate(()=>globalThis.delivery);if(delivery)break;await new Promise(resolve=>setTimeout(resolve,150));}while(Date.now()<deadline);
  assert.equal(delivery?.shown,true,JSON.stringify(delivery)||'No native notification event');
  console.log('PASS: packaged app registers Windows shortcut/AUMID/CLSID and Windows emits the native toast show event.');
}finally{await app.evaluate(()=>globalThis.testToast?.close()).catch(()=>{});await app.close();}
