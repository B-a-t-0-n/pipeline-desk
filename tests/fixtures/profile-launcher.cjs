// Emulate two launcher AppData roots while retaining the same Windows user home.
const {app}=require('electron');
app.setPath('home',process.env.PIPELINE_DESK_FIXTURE_HOME);
app.setPath('appData',process.env.PIPELINE_DESK_FIXTURE_APPDATA);
require('../../electron/main.cjs');
