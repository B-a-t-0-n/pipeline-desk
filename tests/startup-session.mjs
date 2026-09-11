import {_electron as electron} from 'playwright';
import electronPath from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import assert from 'node:assert/strict';
const root=path.resolve('.'),profile=await fs.mkdtemp(path.join(os.tmpdir(),'pipeline-desk-startup-'));
const env={...process.env,PIPELINE_DESK_PROFILE:profile,PIPELINE_DESK_TEST:'1'};delete env.ELECTRON_RUN_AS_NODE;
await promisify(execFile)(electronPath,[path.join(root,'tests/fixtures/seed-legacy.cjs')],{env,windowsHide:true});
const app=await electron.launch({args:[path.join(root,'tests/fixtures/delayed-session.cjs')],env});
try{
  assert.equal(await app.evaluate(async()=>{for(let i=0;i<100&&!globalThis.restoringSession;i++)await new Promise(resolve=>setTimeout(resolve,20));return !!globalThis.restoringSession;}),true);
  await app.evaluate(({app})=>app.emit('second-instance'));
  assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().length),0,'A second launch must wait for the saved session, never open a default/demo profile');
  await app.evaluate(()=>globalThis.releaseSession());
  const page=await app.firstWindow();await page.waitForFunction(()=>!!window.desk);
  const s=await page.evaluate(()=>window.desk.snapshot());assert.equal(s.connected,true);assert.equal(s.projects.length,1);
  console.log('PASS: repeated launch waits for Windows credential restoration and opens the saved GitLab profile.');
}finally{await app.evaluate(()=>globalThis.releaseSession()).catch(()=>{});await app.close();}
