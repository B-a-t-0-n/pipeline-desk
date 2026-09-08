// Creates an old-format profile with a real platform-encrypted test credential.
const {app,safeStorage}=require('electron');
const {configurePlatform}=require('../../electron/platform.cjs');
const {createTokenVault}=require('../../electron/credentials.cjs');
configurePlatform(app);
const fs=require('node:fs');
const path=require('node:path');
app.setName('Pipeline Desk');app.setPath('userData',process.env.PIPELINE_DESK_PROFILE);
app.whenReady().then(async()=>{
  const token=await createTokenVault(safeStorage).encrypt('migration-fixture-token');
  const config={host:'https://git.migration.invalid',token,username:'migration-user',interval:30000,
    projects:[{id:42,key:'42:',name:'backend',namespace:'team',branch:'main',webUrl:'https://git.migration.invalid/team/backend'}],
    groups:[{key:'group:migration',name:'Работа',projectKeys:['42:'],sources:[]}],
    widgets:{'group:migration':{open:true,pinned:true,view:'stages',bounds:{x:80,y:80,width:440,height:380},viewHeights:{stages:380}}},
    bounds:{x:100,y:100,width:1100,height:790},netrcAuto:false,netrcFailed:false,netrcPath:'',authMode:'private'};
  fs.writeFileSync(path.join(app.getPath('userData'),'settings.json'),JSON.stringify(config,null,2));app.quit();
}).catch(()=>app.exit(1));
