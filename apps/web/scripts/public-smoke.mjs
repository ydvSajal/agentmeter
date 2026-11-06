import assert from 'node:assert/strict';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { mkdirSync } from 'node:fs';
const driverPath=process.env.BROWSER_DRIVER_MODULE ?? join(process.env.USERPROFILE ?? process.env.HOME,'.agents/skills/design-taste-frontend/scripts/lib/cdp.mjs');
const { Browser,sleep }=await import(pathToFileURL(driverPath).href);
const base=process.env.WEB_URL ?? 'http://127.0.0.1:3000';
const browser=await Browser.launch();
try {
  const page=await browser.newPage();
  const consoleErrors=[];
  browser.on(page.sessionId,'Runtime.consoleAPICalled',event=>{if(event.type==='error')consoleErrors.push(event.args.map(arg=>arg.value??arg.description??'').join(' '));});
  await page.goto(base);
  assert.match(await page.eval(()=>document.querySelector('h1').textContent),/Agents, meet/);
  await page.eval(()=>[...document.querySelectorAll('.folder-tabs button')].find(button=>button.textContent.includes('Agents')).click());
  await sleep(200);
  assert.match(await page.eval(()=>document.querySelector('.folder-screen img').getAttribute('src')),/agents/);
  await page.eval(()=>{const input=document.querySelector('#demo-minutes');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'20');input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));});
  await sleep(200);
  assert.match(await page.eval(()=>document.querySelector('.receipt-amount').textContent),/0.20 HBAR/);
  await page.eval(()=>[...document.querySelectorAll('.stage-controls button')].find(button=>button.textContent==='Access').click());
  await sleep(200);
  assert.ok(await page.eval(()=>Boolean(document.querySelector('.relay-preview-on'))));
  await page.goto(base+'/docs');
  const routes=await page.eval(()=>[...new Set([...document.querySelectorAll('.docs-nav-group a')].map(link=>new URL(link.href).pathname))]);
  assert.ok(routes.length>=11);
  for(const route of routes) {
    const response=await fetch(base+route);assert.equal(response.status,200,route);assert.ok((await response.text()).includes('Public guide'));
    const raw=await fetch(base+route+'/raw');assert.equal(raw.status,200);assert.ok((await raw.text()).length>100);
  }
  assert.equal((await fetch(base+'/docs/does-not-exist')).status,404);
  await page.eval(()=>{const input=document.querySelector('.docs-search input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'architecture');input.dispatchEvent(new Event('input',{bubbles:true}));});
  await sleep(200);
  assert.equal(await page.eval(()=>document.querySelectorAll('.docs-nav-group a').length),2);
  mkdirSync('.taste-skill/public/screens',{recursive:true});
  for(const width of [1440,768,390]){
    await page.setViewport({width,height:width===390?844:900,mobile:width===390});
    for(const [name,route] of [['landing','/'],['docs','/docs'],['architecture','/docs/architecture'],['api','/docs/api']]){
      await page.goto(base+route,{settleMs:600});
      assert.ok(await page.eval(()=>document.documentElement.scrollWidth<=innerWidth+1),`${name} overflow at ${width}`);
      await page.screenshot({path:`.taste-skill/public/screens/${name}-${width}.jpg`,fullPage:true});
    }
  }
  await page.goto(base+'/devices');
  assert.equal(await page.eval(()=>document.querySelector('h1').textContent.trim()),'Devices4');
  assert.deepEqual(page.consoleErrors,[]);
  assert.deepEqual(consoleErrors,[]);
  console.log(`PASS: landing tabs, receipt calculator, flow stages; ${routes.length} public guides and raw downloads without auth; docs search, 404, dashboard link; 1440/768/390 no overflow; no browser exceptions.`);
} finally {await browser.close();}
