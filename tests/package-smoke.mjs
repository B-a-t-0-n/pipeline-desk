import {_electron as electron} from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
const env={...process.env,PIPELINE_DESK_PROFILE:await fs.mkdtemp(path.join(os.tmpdir(),'pipeline-desk-packaged-')),PIPELINE_DESK_TEST:'1'};
delete env.ELECTRON_RUN_AS_NODE;
const app=await electron.launch({executablePath:path.resolve('release/PipelineDesk-win32-x64/PipelineDesk.exe'),args:[],env});
try{
  const page=await app.firstWindow();
  await page.locator('.pipeline-card').first().waitFor();
  assert.equal(await page.locator('.pipeline-card').count(),6);
  assert.equal(await app.evaluate(({app})=>app.isPackaged),true);
  assert.equal(await page.evaluate(async()=> (await window.desk.snapshot()).desktop),true);
  const opened=app.waitForEvent('window');
  await page.getByRole('button',{name:'Закрепить виджет supply-demand-backend',exact:true}).click();
  const widget=await opened;await widget.locator('.pipeline-card').waitFor();
  assert.equal(await widget.evaluate(()=>document.documentElement.scrollHeight<=innerHeight),true);
  await widget.getByLabel('Вид виджета').selectOption('stages');await widget.locator('.solo-summary').waitFor();
  assert.equal(await widget.locator('.stage').count(),4);
  await widget.getByLabel('Вид виджета').selectOption('compact');
  await widget.waitForFunction(()=>document.body.dataset.widgetView==='compact');
  assert.equal(await widget.locator('.stage,.branch-label,.namespace').count(),0);
  const groupOpened=app.waitForEvent('window');await page.evaluate(()=>window.desk.openWidget('demo-group-platform'));
  const group=await groupOpened;await group.locator('.pipeline-stage-block').first().waitFor();
  assert.equal(await group.locator('.stage').count(),8);
  console.log('PASS: packaged Windows EXE, sandboxed preload, demo overview, native widget, three views, default group stages.');
}finally{await app.close();}
