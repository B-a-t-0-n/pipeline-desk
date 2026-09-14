const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const {openConfigStore,readConfig,DATABASE_NAME}=require('../electron/storage.cjs');
const {resolveProfileDirectory,migrateProfile}=require('../electron/profile.cjs');

function fixture(){
  const home=fs.mkdtempSync(path.join(os.tmpdir(),'pipeline-desk-profile-'));
  const legacyDirectory=path.join(home,'AppData/Roaming/Pipeline Desk');
  const packagesDirectory=path.join(home,'AppData/Local/Packages');
  const redirected=path.join(packagesDirectory,'launcher.fixture/LocalCache/Roaming/Pipeline Desk');
  return {home,legacyDirectory,packagesDirectory,redirected,directory:resolveProfileDirectory({home})};
}
const config=()=>({host:'https://git.fixture.invalid',token:Buffer.from('encrypted-fixture').toString('base64'),projects:[{id:42}],groups:[{key:'group:work'}],widgets:{},notifications:{'group:work':true},interval:30000});
function seed(directory,value){
  const store=openConfigStore(directory);store.save(value);store.close();
  fs.writeFileSync(path.join(directory,'Local State'),JSON.stringify({os_crypt:{encrypted_key:'fixture-key'}}));
}

test('the default profile depends on the user home, never launcher AppData; explicit test profiles stay isolated',()=>{
  const f=fixture();
  assert.equal(f.directory,path.join(f.home,'.pipeline-desk'));
  assert.equal(resolveProfileDirectory({home:f.home,appData:f.legacyDirectory}),resolveProfileDirectory({home:f.home,appData:f.redirected}));
  assert.equal(resolveProfileDirectory({home:f.home,override:f.legacyDirectory}),f.legacyDirectory);
  assert.throws(()=>resolveProfileDirectory({home:f.home,override:'relative-profile'}),/absolute/i);
});

test('migration selects a configured redirected profile over a newer empty normal profile, including WAL data',()=>{
  const f=fixture(),value=config();seed(f.redirected,value);
  seed(f.legacyDirectory,{host:'',token:'',projects:[],groups:[],widgets:{}});
  fs.writeFileSync(path.join(f.redirected,'Preferences'),'{"fixture":true}');
  const writer=openConfigStore(f.redirected);writer.save({...value,interval:60000});
  try{
    assert.equal(migrateProfile(f.directory,f).sourceKind,'packaged-launcher');
    assert.deepEqual(readConfig(f.directory),{...value,interval:60000});
    assert.equal(fs.readFileSync(path.join(f.directory,'Local State'),'utf8'),fs.readFileSync(path.join(f.redirected,'Local State'),'utf8'));
    assert.equal(fs.readFileSync(path.join(f.directory,'Preferences'),'utf8'),'{"fixture":true}');
    assert.deepEqual(writer.load(),readConfig(f.directory));
  }finally{writer.close();}
});

test('the newest configured profile wins; an explicit logout in it is not reversed by an older token',()=>{
  const f=fixture();seed(f.redirected,config());
  seed(f.legacyDirectory,{...config(),token:'',projects:[],groups:[],netrcAuto:false});
  fs.utimesSync(path.join(f.redirected,DATABASE_NAME),new Date(1000),new Date(1000));
  assert.equal(migrateProfile(f.directory,f).sourceKind,'appdata');
  assert.equal(readConfig(f.directory).token,'');
  assert.equal(readConfig(f.directory).netrcAuto,false);
});

test('an existing canonical profile, including logout, remains authoritative',()=>{
  const f=fixture();seed(f.redirected,config());
  seed(f.directory,{...config(),token:'',projects:[],groups:[],netrcAuto:false});
  assert.equal(migrateProfile(f.directory,f),null);
  assert.equal(readConfig(f.directory).token,'');
});

test('a reset SQLite source migrates its recovery record without modifying the source',()=>{
  const f=fixture();seed(f.redirected,config());
  const db=new DatabaseSync(path.join(f.redirected,DATABASE_NAME));db.exec('DELETE FROM settings; DELETE FROM credentials;');db.close();
  assert.equal(readConfig(f.redirected),null);
  migrateProfile(f.directory,f);
  assert.deepEqual(readConfig(f.directory),config());
  assert.equal(readConfig(f.redirected),null);
});

test('missing encryption key or a damaged database cannot silently initialize a demo profile',()=>{
  const f=fixture();seed(f.redirected,config());fs.unlinkSync(path.join(f.redirected,'Local State'));
  seed(f.legacyDirectory,{host:'',token:'',projects:[],widgets:{}});
  assert.throws(()=>migrateProfile(f.directory,f),/profile/i);
  assert.equal(fs.existsSync(path.join(f.directory,DATABASE_NAME)),false);
  assert.deepEqual(readConfig(f.redirected),config());
  const broken=fixture();fs.mkdirSync(broken.legacyDirectory,{recursive:true});
  fs.writeFileSync(path.join(broken.legacyDirectory,DATABASE_NAME),'broken database');
  assert.throws(()=>migrateProfile(broken.directory,broken),/profile/i);
  assert.equal(fs.existsSync(path.join(broken.directory,DATABASE_NAME)),false);
  assert.equal(fs.readFileSync(path.join(broken.legacyDirectory,DATABASE_NAME),'utf8'),'broken database');
});

test('old JSON migrates with its key; later source changes never replace the shared profile',()=>{
  const f=fixture();fs.mkdirSync(f.legacyDirectory,{recursive:true});
  const original=JSON.stringify(config());fs.writeFileSync(path.join(f.legacyDirectory,'settings.json'),original);
  fs.writeFileSync(path.join(f.legacyDirectory,'Local State'),'{}');
  migrateProfile(f.directory,f);assert.deepEqual(readConfig(f.directory),config());
  assert.equal(fs.readFileSync(path.join(f.legacyDirectory,'settings.json'),'utf8'),original);
  fs.writeFileSync(path.join(f.legacyDirectory,'settings.json'),JSON.stringify({...config(),interval:5000}));
  assert.equal(migrateProfile(f.directory,f),null);assert.equal(readConfig(f.directory).interval,30000);
});
