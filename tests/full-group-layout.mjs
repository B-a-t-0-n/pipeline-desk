import {launchBrowser} from './browser.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {demoProjects} from '../ui/demo.js';

const key='group:layout-fixture',projects=demoProjects().map(p=>({...p,demo:false}));
const state={connected:true,host:'https://git.fixture.invalid',projects,groups:[{key,name:'Мои проекты',memberKeys:projects.map(p=>p.key),sources:[]}],widgets:[key],widgetOptions:{[key]:{view:'full'}},interval:15000};
const browser=await launchBrowser();
try{
  const page=await browser.newPage({viewport:{width:475,height:612}});
  await page.addInitScript(snapshot=>{
    localStorage.setItem('desk-theme','light');
    window.layoutFixture=snapshot;
    window.desk={snapshot:async()=>snapshot,onUpdate:fn=>{window.updateLayoutFixture=fn;}};
  },state);
  await page.goto('http://127.0.0.1:4317/ui/index.html?widget='+encodeURIComponent(key));
  await page.locator('.pipeline-card').first().waitFor();
  await fs.mkdir('.impeccable/review',{recursive:true});
  await page.screenshot({path:'.impeccable/review/full-group-layout.png',animations:'disabled'});
  const measurements=await page.locator('.pipeline-card').evaluateAll(cards=>cards.map(card=>{
    const bounds=card.getBoundingClientRect();
    const clipped=[...card.querySelectorAll('.status-row,.pipeline-meta,.stages,.card-bottom')].filter(el=>{const r=el.getBoundingClientRect();return r.top<bounds.top-1||r.bottom>bounds.bottom+1;}).map(el=>el.className);
    return {project:card.dataset.project,height:bounds.height,clipped};
  }));
  console.log(JSON.stringify(measurements));
  assert.ok(measurements.every(card=>card.clipped.length===0),'Every detailed card must contain its status, stages and footer without clipping');
  assert.equal(await page.locator('.group-body').evaluate(el=>el.scrollHeight>el.clientHeight),true);
  const last=page.locator('.pipeline-card').last();await last.locator('.card-bottom').scrollIntoViewIfNeeded();
  assert.equal(await last.locator('.card-bottom').evaluate(el=>{const r=el.getBoundingClientRect(),panel=el.closest('.group-body').getBoundingClientRect();return r.top>=panel.top&&r.bottom<=panel.bottom+1;}),true);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&document.documentElement.scrollHeight<=innerHeight),true);
  await page.screenshot({path:'.impeccable/review/full-group-layout-scrolled.png',animations:'disabled'});
  await page.setViewportSize({width:330,height:350});
  await page.evaluate(()=>{
    const p=window.layoutFixture.projects[0];
    p.stages.push(...['integration-tests','production_database_migration','smoke tests after deployment','cleanup'].map(name=>({name,status:'success',jobs:[]})));
    p.error='GitLab недоступен. Сохранены данные последнего обновления.';
    window.updateLayoutFixture(window.layoutFixture);
    document.querySelector('.group-body').scrollTop=0;
    document.documentElement.dataset.theme='dark';
  });
  assert.equal(await page.locator('.pipeline-card').evaluateAll(cards=>cards.every(card=>{
    const box=card.getBoundingClientRect();
    return [...card.querySelectorAll('.status-row,.stages,.card-error,.card-bottom')].every(el=>{const r=el.getBoundingClientRect();return r.top>=box.top-1&&r.bottom<=box.bottom+1;});
  })),true,'Long stage lists and errors must increase card height in a narrow window');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:'.impeccable/review/full-group-layout-narrow.png',animations:'disabled'});
  console.log('PASS: six detailed group cards preserve content height; status, stages and footer remain reachable by scrolling, including long stage lists and errors at 330px.');
}finally{await browser.close();}
