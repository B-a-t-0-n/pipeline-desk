const {DatabaseSync}=require('node:sqlite');
const fs=require('node:fs');
const path=require('node:path');

const DATABASE_NAME='config.sqlite';
function validate(config){
  if(!config||!Array.isArray(config.projects)||!config.widgets||typeof config.widgets!=='object'||Array.isArray(config.widgets)||
    (config.groups!==undefined&&!Array.isArray(config.groups))||(config.token!==undefined&&typeof config.token!=='string')){
    throw new Error('Некорректный формат сохранённых настроек.');
  }
}
function read(db){
  const rows=db.prepare('SELECT key, value FROM settings').all();
  if(!rows.length)return null;
  const config=Object.fromEntries(rows.map(row=>[row.key,JSON.parse(row.value)]));
  const secret=db.prepare("SELECT ciphertext FROM credentials WHERE name = 'gitlab'").get();
  config.token=secret?Buffer.from(secret.ciphertext).toString('base64'):'';
  validate(config);return config;
}
function openConfigStore(directory){
  fs.mkdirSync(directory,{recursive:true});
  const db=new DatabaseSync(path.join(directory,DATABASE_NAME),{timeout:3000});
  try{
    const version=db.prepare('PRAGMA user_version').get().user_version;
    if(version>2)throw new Error('База настроек создана более новой версией приложения.');
    db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA secure_delete=ON;
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY NOT NULL CHECK (key <> 'token'),
        value TEXT NOT NULL CHECK (json_valid(value))
      ) STRICT;
      CREATE TABLE IF NOT EXISTS credentials (
        name TEXT PRIMARY KEY NOT NULL,
        ciphertext BLOB NOT NULL CHECK (length(ciphertext) > 0)
      ) STRICT;
      CREATE TABLE IF NOT EXISTS profile_recovery (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        settings TEXT NOT NULL CHECK (json_valid(settings)),
        ciphertext BLOB
      ) STRICT;
      PRAGMA user_version=2;`);
    const insert=db.prepare('INSERT INTO settings (key,value) VALUES (?,?)');
    const putSecret=db.prepare("INSERT INTO credentials (name,ciphertext) VALUES ('gitlab',?)");
    const savedHost=db.prepare("SELECT value FROM settings WHERE key = 'host'");
    const savedSecret=db.prepare("SELECT 1 FROM credentials WHERE name = 'gitlab'");
    const recoveryRecord=db.prepare('SELECT settings,ciphertext FROM profile_recovery WHERE id = 1');
    const putRecovery=db.prepare('INSERT INTO profile_recovery(id,settings,ciphertext) VALUES (1,?,?) ON CONFLICT(id) DO UPDATE SET settings=excluded.settings,ciphertext=excluded.ciphertext');
    function recovery(){
      const row=recoveryRecord.get();if(!row)return null;
      const config={...JSON.parse(row.settings),token:row.ciphertext?Buffer.from(row.ciphertext).toString('base64'):''};
      validate(config);return config;
    }
    function save(config,{disconnect=false}={}){
      validate(config);
      const {token='',...settings}=config;
      // Only the main process supplies an already encrypted safeStorage token.
      const ciphertext=token?Buffer.from(token,'base64'):null;
      if(token&&(!ciphertext.length||ciphertext.toString('base64')!==token))throw new Error('Некорректный формат защищённого токена.');
      const rows=Object.entries(settings).filter(([,value])=>value!==undefined).map(([key,value])=>[key,JSON.stringify(value)]);
      db.exec('BEGIN IMMEDIATE');
      try{
        // Disconnect keeps the server. A blank startup snapshot must never reset an existing profile.
        const previousHost=savedHost.get(),fallback=recovery();
        if(!settings.host&&((previousHost&&JSON.parse(previousHost.value))||fallback?.host)){
          throw new Error('Сохранение отменено: нельзя заменить настроенный профиль пустыми данными. Перезапустите приложение.');
        }
        if(!ciphertext&&(savedSecret.get()||fallback?.token)&&!disconnect)throw new Error('Удалить сохранённый токен можно только через выход из аккаунта.');
        db.exec('DELETE FROM settings; DELETE FROM credentials;');
        for(const [key,value]of rows)insert.run(key,value);
        if(ciphertext)putSecret.run(ciphertext);
        // Keep an independent record of the last valid profile, including explicit logout.
        // No secret is ever included in the JSON: the recovery token is still encrypted.
        putRecovery.run(JSON.stringify(settings),ciphertext);
        db.exec('COMMIT');
      }catch(error){db.exec('ROLLBACK');throw error;}
    }
    const fallback=recovery();
    let stored;
    try{stored=read(db);}catch(error){if(!fallback)throw error;}
    const recovered=!!fallback&&(!stored||(!stored.host&&fallback.host)||(!stored.token&&fallback.token));
    if(recovered){save(fallback);stored=fallback;}
    if(!stored){
      const legacy=path.join(directory,'settings.json');
      if(fs.existsSync(legacy)){stored=JSON.parse(fs.readFileSync(legacy,'utf8'));save(stored);}
    }
    // Seed recovery while upgrading an existing SQLite profile, before creating windows.
    if(stored&&!fallback)save(stored);
    // Validate before returning a writable store; damaged data must not be reset.
    read(db);
    return {load:()=>read(db),save,recovered,close:()=>db.close()};
  }catch(error){db.close();throw error;}
}
function readConfig(directory){
  const db=new DatabaseSync(path.join(directory,DATABASE_NAME),{readOnly:true,timeout:3000});
  try{return read(db);}finally{db.close();}
}
module.exports={openConfigStore,readConfig,DATABASE_NAME};
