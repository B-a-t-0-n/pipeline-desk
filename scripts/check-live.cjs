// Explicit, read-only smoke check using the current Windows user's saved connection.
const {app,safeStorage}=require('electron');
const {resolveProfileDirectory}=require('../electron/profile.cjs');
const {readConfig}=require('../electron/storage.cjs');
const {createClient,normalizeHost}=require('../electron/gitlab.cjs');
app.setName('Pipeline Desk');
app.setPath('userData',resolveProfileDirectory({home:app.getPath('home'),override:process.env.PIPELINE_DESK_PROFILE}));
app.whenReady().then(async()=>{
  let step='settings';
  try{
    const config=readConfig(app.getPath('userData'));
    const host=normalizeHost(config.host);
    if(!config.token)throw new Error('No saved connection');
    step='decrypt';const secret=(await safeStorage.decryptStringAsync(Buffer.from(config.token,'base64'))).result;
    const client=createClient(host,secret,undefined,config.authMode);
    step='user';await client.user();step='groups';const groups=await client.groups();
    step='group-projects';const projects=groups.items.length?await client.groupProjects(groups.items[0].id,true):[];
    process.stdout.write(JSON.stringify({authenticated:true,groupsOnFirstPage:groups.items.length,moreGroups:!!groups.nextPage,projectsInFirstGroupWithSubgroups:projects.length})+'\n');
    app.exit(0);
  }catch(error){process.stdout.write(JSON.stringify({failedAt:step,status:error.status||null,code:error.code||null})+'\n');app.exit(1);}
});
