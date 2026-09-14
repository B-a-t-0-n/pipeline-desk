const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {createWindowsIntegration}=require('../electron/windows.cjs');

function fixture(packaged=true){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'pipeline-desk-windows-'));
  const programs=path.join(root,'Microsoft/Windows/Start Menu/Programs');fs.mkdirSync(programs,{recursive:true});
  const app={isPackaged:packaged,getPath:()=>root,getAppPath:()=>path.join(root,'Source with spaces'),setName:value=>app.name=value,setAppUserModelId:value=>app.id=value,setToastActivatorCLSID:value=>app.clsid=value};
  const shell={readShortcutLink:link=>JSON.parse(fs.readFileSync(link,'utf8')),writeShortcutLink:(link,operation,details)=>{fs.writeFileSync(link,JSON.stringify(details));return true;}};
  const execPath=path.join(root,packaged?'Release with spaces/PipelineDesk.exe':'node_modules/electron/dist/electron.exe');
  const integration=createWindowsIntegration({app,shell,execPath});
  return {root,programs,app,shell,execPath,integration};
}
test('development notifications cannot claim the production taskbar or toast identity',()=>{
  const prod=fixture(),dev=fixture(false);prod.integration.initialize();dev.integration.initialize();
  assert.notEqual(prod.app.id,dev.app.id);assert.notEqual(prod.app.clsid,dev.app.clsid);
  dev.integration.ensureShortcut();assert.deepEqual(fs.readdirSync(dev.programs),[]);
});
test('startup repairs the production shortcut and removes the conflicting Electron shortcut',()=>{
  const f=fixture(),id='local.pipeline-desk';
  f.shell.writeShortcutLink(path.join(f.programs,'Electron.lnk'),'create',{target:path.join(f.root,'node_modules/electron/dist/electron.exe'),appUserModelId:id});
  f.shell.writeShortcutLink(path.join(f.programs,'PipelineDesk.lnk'),'create',{target:f.execPath,appUserModelId:id});
  f.shell.writeShortcutLink(path.join(f.root,'Pipeline Desk.lnk'),'create',{target:f.execPath});
  f.integration.initialize();f.integration.ensureShortcut();
  const link=f.shell.readShortcutLink(path.join(f.programs,'Pipeline Desk.lnk'));
  assert.equal(link.target,f.execPath);assert.equal(link.args,'');assert.equal(link.appUserModelId,f.app.id);assert.equal(link.toastActivatorClsid,f.app.clsid);assert.equal(link.icon,f.execPath);
  assert.deepEqual(fs.readdirSync(f.programs),['Pipeline Desk.lnk']);
  assert.deepEqual(f.shell.readShortcutLink(path.join(f.root,'Pipeline Desk.lnk')),link);
});
test('cleanup preserves shortcuts belonging to other applications',()=>{
  const f=fixture(),link=path.join(f.programs,'Electron.lnk'),other={target:f.execPath,appUserModelId:'another.application'};
  f.shell.writeShortcutLink(link,'create',other);f.integration.ensureShortcut();assert.deepEqual(f.shell.readShortcutLink(link),other);
});
test('a legacy development shortcut cannot restore the production toast CLSID',()=>{
  for(const packaged of [true,false]){
    const f=fixture(packaged),link=path.join(f.programs,'Electron.lnk');
    f.shell.writeShortcutLink(link,'create',{target:path.join(f.root,'node_modules/electron/dist/electron.exe'),appUserModelId:'local.pipeline-desk.development',toastActivatorClsid:'{65638BD9-7A4A-489B-B1EE-91CF760D8B52}'});
    f.integration.initialize();f.integration.ensureShortcut();
    const repaired=f.shell.readShortcutLink(link);
    assert.equal(repaired.appUserModelId,'local.pipeline-desk.development');
    assert.equal(repaired.toastActivatorClsid,'{E3E47DD5-8855-4DBE-8E38-8450D07766F9}');
  }
});
test('taskbar relaunch metadata quotes paths and includes the app entry point only in development',()=>{
  for(const packaged of [true,false]){
    const f=fixture(packaged);let properties;f.integration.initialize();f.integration.configureWindow({setAppDetails:value=>properties=value});
    assert.equal(properties.appId,f.app.id);assert.equal(properties.relaunchDisplayName,f.app.name);
    assert.equal(properties.relaunchCommand,`"${f.execPath}"${packaged?'':` "${f.app.getAppPath()}"`}`);
    assert.equal(properties.appIconPath,packaged?f.execPath:path.join(f.app.getAppPath(),'assets/icon.ico'));
  }
});
