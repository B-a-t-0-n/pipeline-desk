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
    if(version>1)throw new Error('База настроек создана более новой версией приложения.');
    db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA secure_delete=ON;
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY NOT NULL CHECK (key <> 'token'),
        value TEXT NOT NULL CHECK (json_valid(value))
      ) STRICT;
      CREATE TABLE IF NOT EXISTS credentials (
        name TEXT PRIMARY KEY NOT NULL,
        ciphertext BLOB NOT NULL CHECK (length(ciphertext) > 0)
      ) STRICT;
      PRAGMA user_version=1;`);
    const insert=db.prepare('INSERT INTO settings (key,value) VALUES (?,?)');
    const putSecret=db.prepare("INSERT INTO credentials (name,ciphertext) VALUES ('gitlab',?)");
    const savedHost=db.prepare("SELECT value FROM settings WHERE key = 'host'");
    function save(config){
      validate(config);
      const {token='',...settings}=config;
      // Only the main process supplies an already encrypted safeStorage token.
      const ciphertext=token?Buffer.from(token,'base64'):null;
      if(token&&(!ciphertext.length||ciphertext.toString('base64')!==token))throw new Error('Некорректный формат защищённого токена.');
      const rows=Object.entries(settings).filter(([,value])=>value!==undefined).map(([key,value])=>[key,JSON.stringify(value)]);
      db.exec('BEGIN IMMEDIATE');
      try{
        // Disconnect keeps the server. A blank startup snapshot must never reset an existing profile.
        const previousHost=savedHost.get();
        if(!settings.host&&previousHost&&JSON.parse(previousHost.value)){
          throw new Error('Сохранение отменено: нельзя заменить настроенный профиль пустыми данными. Перезапустите приложение.');
        }
        db.exec('DELETE FROM settings; DELETE FROM credentials;');
        for(const [key,value]of rows)insert.run(key,value);
        if(ciphertext)putSecret.run(ciphertext);
        db.exec('COMMIT');
      }catch(error){db.exec('ROLLBACK');throw error;}
    }
    if(!db.prepare('SELECT 1 FROM settings LIMIT 1').get()){
      const legacy=path.join(directory,'settings.json');
      if(fs.existsSync(legacy))save(JSON.parse(fs.readFileSync(legacy,'utf8')));
    }
    // Validate before returning a writable store; damaged data must not be reset.
    read(db);
    return {load:()=>read(db),save,close:()=>db.close()};
  }catch(error){db.close();throw error;}
}
function readConfig(directory){
  const db=new DatabaseSync(path.join(directory,DATABASE_NAME),{readOnly:true,timeout:3000});
  try{return read(db);}finally{db.close();}
}
module.exports={openConfigStore,readConfig,DATABASE_NAME};
