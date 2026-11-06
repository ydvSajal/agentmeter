import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const driver=process.env.BROWSER_DRIVER_MODULE ?? join(process.env.USERPROFILE??process.env.HOME,'.agents/skills/design-taste-frontend/scripts/lib/cdp.mjs');
const {Browser,sleep}=await import(pathToFileURL(driver).href);
const browser=await Browser.launch();
try{
 const page=await browser.newPage({width:1440,height:1000});
 for(const [name,route] of [['fleet','/devices'],['agents','/agents'],['audit','/audit'],['receipt','/sessions/s_sample_2']]){
  await page.goto((process.env.WEB_URL??'http://127.0.0.1:3000')+route);
  for(let attempt=0;attempt<40;attempt++){if(await page.eval(()=>!document.querySelector('.page-heading button:disabled')&&!document.querySelector('.loading-layout')))break;await sleep(250);}
  await page.screenshot({path:`public/media/${name}.jpg`});
 }
 console.log('Captured four actual product screens for the public landing page.');
}finally{await browser.close();}
