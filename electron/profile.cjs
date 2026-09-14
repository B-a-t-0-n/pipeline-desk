const fs=require('node:fs');
const path=require('node:path');
const {openConfigStore,readConfig,DATABASE_NAME}=require('./storage.cjs');

function resolveProfileDirectory({home,override}){
  if(override){
    if(!path.isAbsolute(override))throw new Error('Profile override must be an absolute path.');
    return path.normalize(override);
  }
  // AppData may resolve to a launcher's MSIX LocalCache instead of the user's real
  // roaming directory. A home directory outside AppData is shared by both launches.
  return path.join(home,'.pipeline-desk');
}
function migrateProfile(directory,{legacyDirectory,packagesDirectory}){
  // Once migrated, even an intentionally disconnected profile is authoritative.
  if(fs.existsSync(path.join(directory,DATABASE_NAME))||fs.existsSync(path.join(directory,'settings.json')))return null;
  const sources=[{directory:legacyDirectory,kind:'appdata'}];
  if(fs.existsSync(packagesDirectory))for(const entry of fs.readdirSync(packagesDirectory,{withFileTypes:true})){
    if(entry.isDirectory())sources.push({directory:path.join(packagesDirectory,entry.name,'LocalCache/Roaming/Pipeline Desk'),kind:'packaged-launcher'});
  }
  const candidates=[];let failed=false;
  for(const source of sources){
    if(path.resolve(source.directory)===path.resolve(directory))continue;
    const sqlite=path.join(source.directory,DATABASE_NAME),json=path.join(source.directory,'settings.json');
    const file=fs.existsSync(sqlite)?sqlite:fs.existsSync(json)?json:null;
    if(!file)continue;
    try{
      const wal=file===sqlite&&fs.existsSync(sqlite+'-wal')?fs.statSync(sqlite+'-wal'):null;
      const modified=Math.max(fs.statSync(file).mtimeMs,wal?.size?wal.mtimeMs:0);
      // A read transaction includes committed WAL changes without copying an active
      // database file. Read-only recovery also preserves the original profile.
      const config=file===sqlite?readConfig(source.directory,{recover:true}):JSON.parse(fs.readFileSync(file,'utf8'));
      if(!config)continue;
      if(!Array.isArray(config.projects)||!config.widgets)throw new Error('Invalid profile');
      const stateFile=path.join(source.directory,'Local State');
      const localState=fs.existsSync(stateFile)?fs.readFileSync(stateFile):null;
      if(config.token&&!localState)throw new Error('Missing profile encryption key');
      if(localState)JSON.parse(localState.toString('utf8'));
      candidates.push({...source,config,localState,modified,configured:!!(config.host||config.token||config.projects.length)});
    }catch{failed=true;}
  }
  candidates.sort((a,b)=>Number(b.configured)-Number(a.configured)||b.modified-a.modified);
  const source=candidates[0];
  if(failed&&!source?.configured)throw new Error('Unable to migrate saved profile. Original files are preserved.');
  if(!source)return null;
  fs.mkdirSync(directory,{recursive:true});
  const staging=fs.mkdtempSync(path.join(directory,'.migrate-'));
  try{
    const store=openConfigStore(staging);
    try{store.save(source.config);}finally{store.close();}
    // This must run synchronously before Electron ready / safeStorage initialization.
    // The encryption key and ciphertext must come from the same physical profile.
    if(source.localState)fs.writeFileSync(path.join(directory,'Local State'),source.localState);
    for(const name of ['Preferences','Local Storage']){
      const from=path.join(source.directory,name),to=path.join(directory,name);
      // Appearance settings are optional; a LevelDB lock must not block the account.
      try{if(fs.existsSync(from))fs.cpSync(from,to,{recursive:true,filter:file=>path.basename(file)!=='LOCK'&&!fs.lstatSync(file).isSymbolicLink()});}catch{}
    }
    // Install the database last. An interrupted migration can retry on next launch.
    fs.renameSync(path.join(staging,DATABASE_NAME),path.join(directory,DATABASE_NAME));
    return {sourceKind:source.kind};
  }finally{
    for(const name of [DATABASE_NAME,DATABASE_NAME+'-wal',DATABASE_NAME+'-shm']){
      try{fs.unlinkSync(path.join(staging,name));}catch{}
    }
    try{fs.rmdirSync(staging);}catch{}
  }
}
module.exports={resolveProfileDirectory,migrateProfile};
