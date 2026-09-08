import {launchElectron,overviewPage} from './electron.mjs';
import electronPath from 'electron';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readConfig,DATABASE_NAME} from '../electron/storage.cjs';

const root=path.resolve('.'),profile=await fs.mkdtemp(path.join(os.tmpdir(),'pipeline-desk-migration-'));
const env={...process.env,PIPELINE_DESK_PROFILE:profile,PIPELINE_DESK_TEST:'1'};delete env.ELECTRON_RUN_AS_NODE;
await promisify(execFile)(electronPath,[...(process.platform==='linux'?['--ozone-platform=x11']:[]),path.join(root,'tests/fixtures/seed-legacy.cjs')],{env,windowsHide:true,timeout:20000});
const legacy=await fs.readFile(path.join(profile,'settings.json'),'utf8');
let app;
async function launch(){
  app=await launchElectron({args:[root],env});
  const page=await overviewPage(app);await page.locator('.pipeline-card,.empty-state').first().waitFor();return page;
}
try{
  const page=await launch();
  const snapshot=await page.evaluate(()=>window.desk.snapshot());
  assert.equal(snapshot.connected,true);assert.equal(snapshot.username,'migration-user');
  assert.equal(snapshot.groups[0].name,'Работа');assert.equal(snapshot.projects[0].id,42);
  assert.equal(snapshot.widgetOptions['group:migration'].view,'stages');
  assert.equal('token' in snapshot,false);
  assert.equal(JSON.stringify(snapshot).includes('migration-fixture-token'),false);
  assert.equal(readConfig(profile).token,JSON.parse(legacy).token);
  assert.equal(await app.evaluate(async({safeStorage})=>{
    const {DatabaseSync}=process.getBuiltinModule('node:sqlite');
    const db=new DatabaseSync(process.getBuiltinModule('node:path').join(process.env.PIPELINE_DESK_PROFILE,'config.sqlite'),{readOnly:true});
    const encrypted=Buffer.from(db.prepare("SELECT ciphertext FROM credentials WHERE name='gitlab'").get().ciphertext);db.close();
    return (process.platform==='linux'?safeStorage.decryptString(encrypted):(await safeStorage.decryptStringAsync(encrypted)).result)==='migration-fixture-token';
  }),true);
  const widget=(await app.windows()).find(w=>w.url().includes('widget='));assert.ok(widget);
  await widget.locator('.widget-view-select').waitFor();
  await page.evaluate(()=>window.desk.settings({interval:60000}));
  await widget.getByLabel('Вид виджета').selectOption('compact');
  await widget.getByRole('button',{name:'Открепить',exact:true}).click();
  await app.close();app=null;
  const stored=readConfig(profile);
  assert.equal(stored.interval,60000);assert.equal(stored.widgets['group:migration'].view,'compact');
  assert.equal(stored.widgets['group:migration'].pinned,false);assert.ok(stored.widgets['group:migration'].bounds.height<200);
  assert.equal(await fs.readFile(path.join(profile,'settings.json'),'utf8'),legacy);
  const restored=await launch();const next=await restored.evaluate(()=>window.desk.snapshot());
  assert.equal(next.connected,true);assert.equal(next.interval,60000);assert.equal(next.widgetOptions['group:migration'].view,'compact');
  await restored.evaluate(()=>window.desk.disconnect());
  assert.equal(readConfig(profile).token,'');
  const db=new DatabaseSync(path.join(profile,DATABASE_NAME),{readOnly:true});
  assert.equal(db.prepare('SELECT count(*) AS n FROM credentials').get().n,0);db.close();
  await app.close();app=null;
  const disconnected=await launch();assert.equal((await disconnected.evaluate(()=>window.desk.snapshot())).connected,false);
  for(const file of await fs.readdir(profile))if(file.startsWith(DATABASE_NAME))assert.equal((await fs.readFile(path.join(profile,file))).includes(Buffer.from('migration-fixture-token')),false);
  console.log('PASS: platform-encrypted token migrates unchanged into SQLite, decrypts after restart, restores groups/windows/views, saves changes, and stays disconnected despite legacy JSON.');
}finally{if(app)await app.close().catch(()=>{});}
