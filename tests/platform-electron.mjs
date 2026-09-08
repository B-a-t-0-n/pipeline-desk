import {launchElectron,overviewPage} from './electron.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {readConfig} from '../electron/storage.cjs';

const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'pipeline-desk-platform-'));
const env = {...process.env, PIPELINE_DESK_PROFILE:profile, PIPELINE_DESK_TEST:'1'};
delete env.ELECTRON_RUN_AS_NODE;
let app;
async function launch(useBasicKeyring = false) {
  app = await launchElectron({args:[path.resolve('.')], env:{...env,PIPELINE_DESK_TEST_KEYRING:useBasicKeyring?'basic':'system'}});
  const page = await overviewPage(app);
  await page.locator('.pipeline-card').first().waitFor();
  return page;
}
async function waitForMinimized(expected) {
  for (let attempt=0; attempt<50; attempt++) {
    if (await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isMinimized()) === expected) return;
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  assert.fail(`Overview minimized state did not become ${expected}`);
}
try {
  let page = await launch();
  assert.equal((await page.evaluate(() => window.desk.snapshot())).platform, process.platform);
  if (process.platform === 'linux') {
    assert.equal(await app.evaluate(({app}) => app.commandLine.getSwitchValue('ozone-platform')), 'x11');
    await page.getByRole('button', {name:'Свернуть в панель задач', exact:true}).waitFor();
    await app.evaluate(({BrowserWindow}) => BrowserWindow.getAllWindows()[0].show());
    await page.getByRole('button', {name:'Свернуть в панель задач', exact:true}).click();
    await waitForMinimized(true);
    await app.evaluate(({app}) => app.emit('activate'));
    await waitForMinimized(false);
  }
  const opened = app.waitForEvent('window');
  await page.evaluate(() => window.desk.openWidget('demo-0'));
  const widget = await opened;
  await widget.locator('.widget-view-select').waitFor();
  await app.evaluate(({BrowserWindow}) => BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('widget=')).close());
  assert.equal(readConfig(profile).widgets['demo-0'].open, false);
  await app.close(); app=null;
  page = await launch();
  assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().length), 1);
  if (process.platform === 'linux') {
    await app.close(); app=null;
    page = await launch(true);
    await app.evaluate(() => {globalThis.fetch=async()=>new Response(JSON.stringify({username:'fixture-user'}));});
    const failure = await page.evaluate(async () => {
      try {await window.desk.connect({host:'https://fixture.invalid',token:'must-not-be-stored'});}
      catch (error) {return error.message;}
    });
    assert.match(failure, /GNOME Keyring/);
    assert.equal(readConfig(profile).token, '');
    assert.equal((await page.evaluate(()=>window.desk.snapshot())).connected, false);
  }
  const closed = app.waitForEvent('close');
  await page.getByRole('button', {name:'Выйти', exact:true}).click();
  await closed; app=null;
  console.log('PASS: platform setup, overview recovery, native widget close persistence, and tray-independent quit.');
} finally {
  if (app) await app.close().catch(()=>{});
  await fs.rm(profile, {recursive:true, force:true});
}
