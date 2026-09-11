import {_electron as electron} from 'playwright';
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
await promisify(execFile)(electronPath,[path.join(root,'tests/fixtures/seed-legacy.cjs')],{env,windowsHide:true,timeout:20000});
const legacy=await fs.readFile(path.join(profile,'settings.json'),'utf8');
let app;
async function launch(){
  const packaged=process.env.PIPELINE_DESK_PACKAGED==='1';
  app=await electron.launch({executablePath:packaged?path.join(root,'release/PipelineDesk-win32-x64/PipelineDesk.exe'):undefined,args:packaged?[]:[root],env});
  const page=await app.firstWindow();await page.locator('.pipeline-card,.empty-state').first().waitFor();return page;
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
    return (await safeStorage.decryptStringAsync(encrypted)).result==='migration-fixture-token';
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
  let restored=await launch();const next=await restored.evaluate(()=>window.desk.snapshot());
  assert.equal(next.connected,true);assert.equal(next.interval,60000);assert.equal(next.widgetOptions['group:migration'].view,'compact');
  // Simulate abrupt process termination without before-quit or a database checkpoint.
  const child=app.process(),exited=new Promise(resolve=>child.once('exit',resolve));
  await promisify(execFile)('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,timeout:10000});
  await exited;app=null;
  restored=await launch();
  const afterCrash=await restored.evaluate(()=>window.desk.snapshot());
  assert.equal(afterCrash.connected,true);assert.equal(afterCrash.interval,60000);
  assert.equal(afterCrash.widgetOptions['group:migration'].view,'compact');
  // Windows shutdown can skip app.before-quit. Capture the final window change synchronously.
  const endingBounds=await app.evaluate(({BrowserWindow})=>{
    const w=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('widget='));
    w.setBounds({width:452,height:181});const bounds=w.getBounds();
    w.emit('session-end',{reasons:['shutdown']});return bounds;
  });
  assert.deepEqual(readConfig(profile).widgets['group:migration'].bounds,endingBounds);
  await app.close();app=null;
  // Reproduce the lost-session symptom after primary settings/credentials were reset.
  const reset=new DatabaseSync(path.join(profile,DATABASE_NAME));reset.exec('DELETE FROM settings; DELETE FROM credentials;');reset.close();
  restored=await launch();
  const recovered=await restored.evaluate(()=>window.desk.snapshot());
  assert.equal(recovered.connected,true);assert.equal(recovered.groups[0].name,'Работа');
  assert.equal(recovered.widgetOptions['group:migration'].view,'compact');
  await restored.evaluate(()=>window.desk.disconnect());
  assert.equal(readConfig(profile).token,'');
  const db=new DatabaseSync(path.join(profile,DATABASE_NAME),{readOnly:true});
  assert.equal(db.prepare('SELECT count(*) AS n FROM credentials').get().n,0);
  assert.equal(db.prepare('SELECT ciphertext FROM profile_recovery WHERE id=1').get().ciphertext,null);db.close();
  await app.close();app=null;
  const disconnected=await launch();assert.equal((await disconnected.evaluate(()=>window.desk.snapshot())).connected,false);
  for(const file of await fs.readdir(profile))if(file.startsWith(DATABASE_NAME))assert.equal((await fs.readFile(path.join(profile,file))).includes(Buffer.from('migration-fixture-token')),false);
  console.log('PASS: Windows-encrypted token survives restart, abrupt termination, session-end and reset primary records; groups/windows/views recover; explicit logout clears active and recovery credentials.');
}finally{if(app)await app.close().catch(()=>{});}
