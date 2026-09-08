import {launchBrowser} from './browser.mjs';
import fs from 'node:fs/promises';
const browser=await launchBrowser();
try{
  const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1});
  await page.goto('http://127.0.0.1:4317/ui/index.html');
  await page.locator('.pipeline-card').first().waitFor();
  const metrics=await page.evaluate(()=>({innerWidth,clientWidth:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth,bodyWidth:document.body.getBoundingClientRect().width,card:[...document.querySelectorAll('.pipeline-card')].map(e=>({left:e.getBoundingClientRect().left,right:e.getBoundingClientRect().right,width:e.getBoundingClientRect().width}))}));
  console.log(JSON.stringify(metrics));
  await fs.writeFile('.impeccable/review/mobile-metrics.json',JSON.stringify(metrics,null,2));
  await page.screenshot({path:'.impeccable/review/mobile.png',fullPage:true});
}finally{await browser.close();}
