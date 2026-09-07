import {_electron as electron} from 'playwright';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const env={...process.env,PIPELINE_DESK_PROFILE:await fs.mkdtemp(path.join(os.tmpdir(),'pipeline-desk-widget-')),PIPELINE_DESK_TEST:'1'};delete env.ELECTRON_RUN_AS_NODE;
const app=await electron.launch({args:[path.resolve('.')],env});
try{
  const page=await app.firstWindow();await page.locator('.pipeline-card').first().waitFor();
  const opened=app.waitForEvent('window');await page.getByRole('button',{name:'Закрепить виджет supply-demand-backend',exact:true}).click();
  const widget=await opened;await widget.locator('.pipeline-card').waitFor();
  const regions=await widget.evaluate(()=>({title:getComputedStyle(document.querySelector('.widget-bar')).getPropertyValue('-webkit-app-region'),pin:getComputedStyle(document.querySelector('[data-action="window-pin"]')).getPropertyValue('-webkit-app-region'),close:getComputedStyle(document.querySelector('[data-action="window-close"]')).getPropertyValue('-webkit-app-region')}));
  assert.deepEqual(regions,{title:'drag',pin:'no-drag',close:'no-drag'});
  await widget.getByRole('button',{name:'Открепить',exact:true}).click();
  assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('widget=')).isAlwaysOnTop()),false);
  await widget.getByRole('button',{name:'Поверх окон',exact:true}).click();
  await widget.screenshot({path:'.impeccable/review/widget.png'});
  console.log(JSON.stringify({regions,appName:await app.evaluate(({app})=>app.getName())}));
}finally{await app.close();}
