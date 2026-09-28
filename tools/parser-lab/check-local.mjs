import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const modulePath=process.env.FOLIODUET_PLAYWRIGHT_MODULE;
assert(modulePath,'Set FOLIODUET_PLAYWRIGHT_MODULE');
const { chromium }=await import(pathToFileURL(resolve(modulePath)).href);
const origin=process.env.FOLIODUET_QA_ORIGIN||'http://127.0.0.1:5198';
assert(['localhost','127.0.0.1'].includes(new URL(origin).hostname));
const out=resolve(process.env.FOLIODUET_LAB_OUTPUT||'local-evals/parser-lab/baseline');
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,...(process.env.FOLIODUET_CHROME_BIN?{executablePath:process.env.FOLIODUET_CHROME_BIN}:{})});
try{
  const context=await browser.newContext({viewport:{width:1600,height:1100},acceptDownloads:true});
  await context.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
  const page=await context.newPage(); page.setDefaultTimeout(15000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+'/parser-lab.html');
  await page.waitForFunction(()=>document.querySelector('select')?.options.length>1);
  const cases=await page.getByLabel('Reference set').locator('option').evaluateAll(nodes=>nodes.map(n=>n.value).filter(Boolean));
  const summaries=[];
  for(const id of cases){
    await page.getByLabel('Reference set').selectOption(id);
    for(const engine of (process.env.FOLIODUET_FULL_CONTEXT ? ['pageecho'] : ['pageecho','anydoc'])){
      await page.getByLabel('PDF engine').selectOption(engine);
      if(process.env.FOLIODUET_FULL_CONTEXT)await page.getByRole('checkbox').check();
      await page.getByRole('button',{name:'Run comparison'}).click();
      await page.getByRole('button',{name:'Save review'}).waitFor();
      await page.waitForFunction(()=>!Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Save review').disabled,{},{timeout:60000});
      const downloadPromise=page.waitForEvent('download');
      await page.getByRole('button',{name:'Save review'}).click();
      const download=await downloadPromise;
      await download.saveAs(out+'/'+id+'-'+engine+'.json');
      const metrics=await page.locator('.metrics').innerText();
      const status=await page.getByRole('status').innerText();
      summaries.push({id,engine,metrics,status});console.log(id,engine,metrics.replace(/\n/g,' '));
      if(engine==='pageecho')await page.screenshot({path:out+'/'+id+'.png',fullPage:true});
    }
  }
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:out+'/mobile.png',fullPage:true});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'Mobile overflow');
  assert.equal(errors.length,0,errors.join('\n'));
  await writeFile(out+'/summary.json',JSON.stringify({checkedAt:new Date().toISOString(),summaries,errors},null,2));
}finally{await browser.close();}
