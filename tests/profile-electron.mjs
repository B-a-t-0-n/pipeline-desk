import {_electron as electron} from 'playwright';
import electronPath from 'electron';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {openConfigStore,readConfig} from '../electron/storage.cjs';

const root=path.resolve('.'),home=await fs.mkdtemp(path.join(os.tmpdir(),'pipeline-desk-launchers-'));
const normal=path.join(home,'AppData/Roaming');
const redirected=path.join(home,'AppData/Local/Packages/launcher.fixture/LocalCache/Roaming');
const legacy=path.join(redirected,'Pipeline Desk'),shared=path.join(home,'.pipeline-desk');
await fs.mkdir(legacy,{recursive:true});await fs.mkdir(normal,{recursive:true});
const env={...process.env,PIPELINE_DESK_TEST:'1',PIPELINE_DESK_FIXTURE_HOME:home};
delete env.ELECTRON_RUN_AS_NODE;delete env.PIPELINE_DESK_PROFILE;
await promisify(execFile)(electronPath,[path.join(root,'tests/fixtures/seed-legacy.cjs')],{env:{...env,PIPELINE_DESK_PROFILE:legacy},windowsHide:true,timeout:20000});
const legacyStore=openConfigStore(legacy),expected=legacyStore.load();
legacyStore.save({...expected,notifications:{'group:migration':true}});legacyStore.close();
const empty=openConfigStore(path.join(normal,'Pipeline Desk'));
empty.save({host:'',token:'',projects:[],groups:[],widgets:{}});empty.close();
let app,firstInode;
try{
  for(const appData of [normal,redirected,normal]){
    app=await electron.launch({args:[path.join(root,'tests/fixtures/profile-launcher.cjs')],env:{...env,PIPELINE_DESK_FIXTURE_APPDATA:appData}});
    const page=await app.firstWindow();await page.waitForFunction(()=>!!window.desk);
    const snapshot=await page.evaluate(()=>window.desk.snapshot());
    assert.equal(snapshot.connected,true);assert.equal(snapshot.projects[0].id,42);
    assert.equal(snapshot.groups[0].name,'Работа');assert.equal(snapshot.notifications['group:migration'],true);
    const actual=await app.evaluate(async({app,safeStorage})=>{
      const directory=app.getPath('userData');
      const file=process.getBuiltinModule('node:path').join(directory,'config.sqlite');
      const db=new (process.getBuiltinModule('node:sqlite').DatabaseSync)(file,{readOnly:true});
      const secret=Buffer.from(db.prepare("SELECT ciphertext FROM credentials WHERE name='gitlab'").get().ciphertext);db.close();
      return {directory,inode:process.getBuiltinModule('node:fs').statSync(file).ino,valid:(await safeStorage.decryptStringAsync(secret)).result==='migration-fixture-token'};
    });
    assert.equal(actual.directory,shared);assert.equal(actual.valid,true);
    firstInode??=actual.inode;assert.equal(actual.inode,firstInode);
    assert.equal(readConfig(shared).token,expected.token);
    await app.close();app=null;
  }
  assert.equal(readConfig(path.join(normal,'Pipeline Desk')).host,'');
  assert.equal(readConfig(legacy).token,expected.token);
  console.log('PASS: automatic migration carries the Windows encryption key, token, projects, groups and notifications into one physical profile across three launches with different AppData roots.');
}finally{if(app)await app.close().catch(()=>{});}
