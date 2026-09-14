const fs=require('node:fs');
const path=require('node:path');
const DEVELOPMENT_ID='local.pipeline-desk.development';
const PRODUCTION_CLSID='{65638BD9-7A4A-489B-B1EE-91CF760D8B52}';
const DEVELOPMENT_CLSID='{E3E47DD5-8855-4DBE-8E38-8450D07766F9}';

function createWindowsIntegration({app,shell,execPath=process.execPath}){
  const packaged=app.isPackaged;
  const appId=packaged?'local.pipeline-desk':DEVELOPMENT_ID;
  const name=packaged?'Pipeline Desk':'Pipeline Desk (Development)';
  const clsid=packaged?PRODUCTION_CLSID:DEVELOPMENT_CLSID;
  const icon=packaged?execPath:path.join(app.getAppPath(),'assets/icon.ico');
  const args=packaged?'':`"${app.getAppPath()}"`;
  const details={target:execPath,cwd:path.dirname(execPath),args,appUserModelId:appId,toastActivatorClsid:clsid,description:name,icon,iconIndex:0};
  const samePath=(a,b)=>!!a&&path.resolve(a).toLowerCase()===path.resolve(b).toLowerCase();
  function read(link){try{return shell.readShortcutLink(link);}catch{return null;}}
  function write(link){
    const current=read(link);
    if(current&&Object.entries(details).every(([key,value])=>current[key]===value))return;
    if(!shell.writeShortcutLink(link,'create',details))throw new Error('Не удалось обновить ярлык Pipeline Desk.');
  }
  function repairDevelopmentShortcut(link,current=read(link)){
    // Electron adopts a CLSID from an existing notification shortcut, even after
    // setToastActivatorCLSID. Migrate the old link before it can reclaim the live app's COM registration.
    if(!current||!['local.pipeline-desk',DEVELOPMENT_ID].includes(current.appUserModelId)||path.basename(current.target).toLowerCase()!=='electron.exe')return;
    if(current.appUserModelId!==DEVELOPMENT_ID||current.toastActivatorClsid?.toUpperCase()!==DEVELOPMENT_CLSID){
      if(!shell.writeShortcutLink(link,'create',{...current,appUserModelId:DEVELOPMENT_ID,toastActivatorClsid:DEVELOPMENT_CLSID}))throw new Error('Не удалось обновить служебный ярлык Electron.');
    }
  }
  function ensureShortcut(){
    if(!packaged)return;
    const programs=path.join(app.getPath('appData'),'Microsoft/Windows/Start Menu/Programs');
    fs.mkdirSync(programs,{recursive:true});
    write(path.join(programs,'Pipeline Desk.lnk'));
    // Earlier notification tests registered Electron under the production AUMID.
    // Remove only known duplicate shortcuts owned by this application.
    for(const name of ['Electron.lnk','PipelineDesk.lnk']){
      const link=path.join(programs,name),current=read(link);
      if(current?.appUserModelId===appId&&(samePath(current.target,execPath)||path.basename(current.target).toLowerCase()==='electron.exe'))fs.unlinkSync(link);
      else if(name==='Electron.lnk')repairDevelopmentShortcut(link,current);
    }
    const desktopLink=path.join(app.getPath('desktop'),'Pipeline Desk.lnk');
    if(samePath(read(desktopLink)?.target,execPath))write(desktopLink);
  }
  return {
    appId,name,
    initialize(){
      app.setName(name);app.setAppUserModelId(appId);app.setToastActivatorCLSID(clsid);
      if(!packaged)repairDevelopmentShortcut(path.join(app.getPath('appData'),'Microsoft/Windows/Start Menu/Programs/Electron.lnk'));
    },
    ensureShortcut,
    configureWindow(window){window.setAppDetails({appId,appIconPath:icon,appIconIndex:0,relaunchCommand:`"${execPath}"${args?' '+args:''}`,relaunchDisplayName:name});}
  };
}
module.exports={createWindowsIntegration};
