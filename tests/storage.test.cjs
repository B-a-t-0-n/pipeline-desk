const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const {openConfigStore,readConfig,DATABASE_NAME}=require('../electron/storage.cjs');
const profile=()=>fs.mkdtempSync(path.join(os.tmpdir(),'pipeline-desk-storage-'));
const fixture=()=>({host:'https://git.fixture.invalid',token:Buffer.from('encrypted-fixture-bytes').toString('base64'),projects:[{id:42,key:'42:'}],groups:[{key:'group:one',name:'Работа',projectKeys:['42:'],sources:[]}],widgets:{'group:one':{open:true,pinned:true,view:'stages',bounds:{x:10,y:20,width:440,height:380}}},interval:30000,netrcAuto:false});

test('SQLite persists all config fields and stores the encrypted token separately as a BLOB',()=>{
  const dir=profile(),store=openConfigStore(dir),config=fixture();
  assert.equal(store.load(),null);store.save(config);store.close();
  assert.deepEqual(readConfig(dir),config);
  const db=new DatabaseSync(path.join(dir,DATABASE_NAME),{readOnly:true});
  assert.equal(db.prepare("SELECT count(*) AS n FROM settings WHERE key = 'token'").get().n,0);
  assert.equal(db.prepare("SELECT typeof(ciphertext) AS type FROM credentials WHERE name = 'gitlab'").get().type,'blob');
  assert.equal(db.prepare('PRAGMA user_version').get().user_version,2);
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');db.close();
  assert.equal(fs.existsSync(path.join(dir,'settings.json')),false);
});

test('a reset startup profile recovers the saved connection and configuration',()=>{
  const dir=profile(),config={...fixture(),notifications:{'group:one':true}};
  let store=openConfigStore(dir);store.save(config);store.close();
  const db=new DatabaseSync(path.join(dir,DATABASE_NAME));
  db.exec('DELETE FROM settings; DELETE FROM credentials;');
  const insert=db.prepare('INSERT INTO settings(key,value) VALUES (?,?)');
  for(const [key,value]of Object.entries({host:'',projects:[],groups:[],widgets:{},interval:15000}))insert.run(key,JSON.stringify(value));
  db.close();
  store=openConfigStore(dir);
  try{assert.deepEqual(store.load(),config);}finally{store.close();}
});

test('a v1 profile upgrades and seeds recovery before any preferences are changed',()=>{
  const dir=profile(),config=fixture();let store=openConfigStore(dir);store.save(config);store.close();
  const old=new DatabaseSync(path.join(dir,DATABASE_NAME));old.exec('DROP TABLE profile_recovery; PRAGMA user_version=1;');old.close();
  store=openConfigStore(dir);assert.deepEqual(store.load(),config);store.close();
  const db=new DatabaseSync(path.join(dir,DATABASE_NAME));
  assert.equal(db.prepare('PRAGMA user_version').get().user_version,2);
  const recovery=db.prepare('SELECT settings,ciphertext FROM profile_recovery').get();
  assert.equal('token' in JSON.parse(recovery.settings),false);
  assert.equal(Buffer.from(recovery.ciphertext).toString('base64'),config.token);
  db.exec('DELETE FROM credentials');db.close();
  store=openConfigStore(dir);try{assert.deepEqual(store.load(),config);}finally{store.close();}
});

test('ordinary preference saves cannot erase credentials; explicit logout remains final',()=>{
  const dir=profile(),config=fixture();let store=openConfigStore(dir);store.save(config);
  const disconnected={...config,token:'',projects:[],groups:[],widgets:{},netrcAuto:false};
  assert.throws(()=>store.save(disconnected),/выход/i);
  assert.deepEqual(store.load(),config);
  store.save(disconnected,{disconnect:true});store.close();
  // Even missing primary rows must not resurrect the last connected profile or legacy JSON.
  fs.writeFileSync(path.join(dir,'settings.json'),JSON.stringify(config));
  const db=new DatabaseSync(path.join(dir,DATABASE_NAME));db.exec('DELETE FROM settings; DELETE FROM credentials;');db.close();
  store=openConfigStore(dir);try{assert.deepEqual(store.load(),disconnected);}finally{store.close();}
});

test('legacy JSON migrates once, remains unchanged, and cannot restore a disconnected token',()=>{
  const dir=profile(),legacy=path.join(dir,'settings.json'),config=fixture(),original=JSON.stringify(config,null,2);
  fs.writeFileSync(legacy,original);let store=openConfigStore(dir);
  assert.deepEqual(store.load(),config);
  const disconnected={...config,token:'',projects:[],groups:[],widgets:{},interval:60000};
  store.save(disconnected,{disconnect:true});store.close();store=openConfigStore(dir);
  assert.deepEqual(store.load(),disconnected);store.close();
  assert.equal(fs.readFileSync(legacy,'utf8'),original);
  const db=new DatabaseSync(path.join(dir,DATABASE_NAME),{readOnly:true});
  assert.equal(db.prepare('SELECT count(*) AS n FROM credentials').get().n,0);db.close();
});

test('a failed credential write rolls back settings and the previous token together',()=>{
  const dir=profile(),store=openConfigStore(dir),config=fixture();store.save(config);
  const db=new DatabaseSync(path.join(dir,DATABASE_NAME));
  db.exec("CREATE TRIGGER fail_credential BEFORE INSERT ON credentials BEGIN SELECT RAISE(ABORT, 'fixture write failure'); END;");
  assert.throws(()=>store.save({...config,interval:60000,token:Buffer.from('replacement-encrypted-bytes').toString('base64')}),/fixture write failure/);
  assert.deepEqual(store.load(),config);db.close();store.close();
});

test('an empty startup snapshot cannot overwrite a configured profile, including from a second writer',()=>{
  const dir=profile(),store=openConfigStore(dir),other=openConfigStore(dir),config=fixture();
  store.save(config);
  const empty={host:'',token:'',username:'',projects:[],groups:[],widgets:{},interval:15000,netrcAuto:true};
  try{
    assert.throws(()=>other.save(empty),/пустыми/);
    assert.deepEqual(store.load(),config);
    const disconnected={...config,token:'',projects:[],groups:[],widgets:{},netrcAuto:false};
    store.save(disconnected,{disconnect:true});assert.deepEqual(store.load(),disconnected);
  }finally{other.close();store.close();}
});

test('malformed legacy data is preserved and does not produce a partial migration',()=>{
  const dir=profile(),file=path.join(dir,'settings.json');fs.writeFileSync(file,'{"projects":');
  assert.throws(()=>openConfigStore(dir));assert.equal(fs.readFileSync(file,'utf8'),'{"projects":');
  assert.equal(readConfig(dir),null);
  fs.writeFileSync(file,JSON.stringify(fixture()));const store=openConfigStore(dir);
  assert.deepEqual(store.load(),fixture());store.close();
});

test('a newer schema and a damaged SQLite file are not overwritten from legacy JSON',()=>{
  const dir=profile(),file=path.join(dir,DATABASE_NAME),db=new DatabaseSync(file);
  db.exec('PRAGMA user_version=3');db.close();
  fs.writeFileSync(path.join(dir,'settings.json'),JSON.stringify(fixture()));
  const before=fs.readFileSync(file);assert.throws(()=>openConfigStore(dir),/новой версией/);assert.deepEqual(fs.readFileSync(file),before);
  const damagedDir=profile(),damagedFile=path.join(damagedDir,DATABASE_NAME);fs.writeFileSync(damagedFile,'broken database');
  fs.writeFileSync(path.join(damagedDir,'settings.json'),JSON.stringify(fixture()));
  assert.throws(()=>openConfigStore(damagedDir));assert.equal(fs.readFileSync(damagedFile,'utf8'),'broken database');
});
