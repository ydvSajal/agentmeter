import assert from 'node:assert/strict';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { mkdirSync } from 'node:fs';
const driverPath = process.env.BROWSER_DRIVER_MODULE ?? join(process.env.USERPROFILE ?? process.env.HOME, '.agents/skills/design-taste-frontend/scripts/lib/cdp.mjs');
const { Browser, sleep } = await import(pathToFileURL(driverPath).href);
const base = process.env.WEB_URL ?? 'http://127.0.0.1:3000';
const live = process.argv.includes('--live');
const gateway = process.env.TEST_GATEWAY_URL ?? 'http://127.0.0.1:8788';
async function control(body) { const response = await fetch(gateway + '/__test',{method:'POST',body:JSON.stringify(body)}); assert.ok(response.ok); }
const browser = await Browser.launch();
try {
  if (live) await control({reset:true});
  const page = await browser.newPage();
  await page.goto(base + '/devices');
  assert.equal(await page.eval(() => document.querySelectorAll('.device').length),4);
  await page.eval(() => [...document.querySelectorAll('.tabs button')].find(b => b.textContent === 'Offline').click());
  await sleep(200);
  assert.equal(await page.eval(() => document.querySelectorAll('.device').length),1);
  assert.match(await page.eval(() => document.querySelector('.device').textContent),/Ventilation/);
  await page.eval(() => [...document.querySelectorAll('.tabs button')].find(b => b.textContent === 'All devices').click());
  await sleep(100);
  await page.eval(() => { const input = document.querySelector('input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'not-a-device'); input.dispatchEvent(new Event('input',{bubbles:true})); });
  await sleep(200);
  assert.equal(await page.eval(() => document.querySelectorAll('.device').length),0);
  assert.match(await page.eval(() => document.body.innerText),/No devices match/);
  await page.goto(base + '/agents');
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('.agent-row progress')].map(p => p.value)),[42,17.5,85]);
  await page.goto(base + '/audit');
  assert.equal(await page.eval(() => document.querySelectorAll('tbody tr').length),5);
  for (const [id,state] of [['s_sample_2','SAFE STOP'],['s_sample_3','CANCELLED']]) {
    await page.goto(base + '/sessions/' + id);
    assert.match(await page.eval(() => document.querySelector('.session-banner').textContent),new RegExp(state));
    assert.match(await page.eval(() => document.querySelector('.gate-label').textContent),/Access locked/);
  }
  await page.goto(base + '/sessions/s_expired');
  assert.match(await page.eval(() => document.querySelector('.gate-label').textContent),/Access locked/);
  await page.goto(base + '/step-up/s_stepup');
  assert.match(await page.eval(() => document.body.innerText),/20 minutes/);
  assert.match(await page.eval(() => document.body.innerText),/0.40 HBAR/);
  if (!live) {
    for (const outcome of ['APPROVED','DENIED','EXPIRED']) {
      await page.goto(base + '/demo/approval/' + outcome + '?sessionId=s_stepup');
      assert.equal(await page.eval(() => document.querySelector('h1').textContent),outcome);
      assert.match(await page.eval(() => document.body.innerText),/Demo preview/);
    }
  } else {
    for (const outcome of ['APPROVED','DENIED','EXPIRED']) {
      const response = await fetch(base + '/api/world/callback?code=' + outcome.toLowerCase() + '&state=contract-demo');
      assert.equal(response.status,200); assert.match(await response.text(),new RegExp(outcome));
    }
    await page.goto(base + '/sessions/s_workshop');
    assert.match(await page.eval(() => document.querySelector('.gate-label').textContent),/Access unlocked/);
    await control({session:{id:'s_workshop',state:'SAFE_STOP'}});
    await sleep(1000);
    assert.match(await page.eval(() => document.querySelector('.gate-label').textContent),/Access locked/);
    assert.match(await page.eval(() => document.querySelector('.session-banner').textContent),/SAFE STOP/);
    await control({reset:true});
    await page.goto(base + '/devices');
    await control({fail:['/agents']});
    await page.eval(() => [...document.querySelectorAll('button')].find(b => b.textContent.includes('Refresh')).click());
    await sleep(1000);
    assert.equal(await page.eval(() => document.querySelectorAll('.device').length),4);
    assert.match(await page.eval(() => document.querySelector('[role=alert]').textContent),/Agents unavailable/);
    await control({reset:true,empty:true});
    await page.eval(() => [...document.querySelectorAll('button')].find(b => b.textContent.includes('Refresh')).click());
    await sleep(1000);
    assert.match(await page.eval(() => document.body.innerText),/No devices match/);
  }
  await page.goto(base + '/sessions/missing');
  assert.ok(await page.eval(() => Boolean(document.querySelector('[role=alert]'))));
  const shotDir = '.taste-skill/screens';
  mkdirSync(shotDir,{recursive:true});
  if (live) await control({reset:true});
  for (const width of [1440,390]) {
    await page.setViewport({width,height:width === 390 ? 844 : 900,mobile:width === 390});
    for (const [name,route] of [['agents','/agents'],['audit','/audit'],['receipt','/sessions/s_sample_2'],['approval','/step-up/s_stepup']]) {
      await page.goto(base + route,{settleMs:400});
      for (let attempt = 0; attempt < 40; attempt++) {
        const ready = await page.eval(() => !document.querySelector('.loading-layout') && !document.querySelector('.page-heading button:disabled') && !document.body.innerText.includes('Loading requested action'));
        if (ready) break;
        await sleep(250);
      }
      if (name === 'audit') assert.equal(await page.eval(() => document.querySelectorAll('tbody tr').length),5);
      if (name === 'agents') assert.equal(await page.eval(() => document.querySelectorAll('.agent-row').length),3);
      assert.ok(await page.eval(() => document.documentElement.scrollWidth <= innerWidth + 1),name + ' has page overflow at ' + width);
      await page.screenshot({path:shotDir + '/' + name + '-' + width + '.jpg',fullPage:true});
    }
  }
  assert.deepEqual(page.consoleErrors,[]);
  console.log('PASS: ' + (live ? 'HTTP gateway, callback results, live SSE safe-stop, partial failure, empty data' : 'fixtures, outcome previews') + '; filters, precise budget ratios, stopped gates, missing session; no browser exceptions.');
} finally { if (live) await control({reset:true}); await browser.close(); }
