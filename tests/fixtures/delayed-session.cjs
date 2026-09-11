const {app,safeStorage}=require('electron');
app.setName('Pipeline Desk');
const decrypt=safeStorage.decryptStringAsync.bind(safeStorage);
const gate=new Promise(resolve=>{globalThis.releaseSession=resolve;});
safeStorage.decryptStringAsync=async(...args)=>{globalThis.restoringSession=true;await gate;return decrypt(...args);};
require('../../electron/main.cjs');
