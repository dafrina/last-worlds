import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
const label = process.argv[2] ?? 'refined';
mkdirSync(`lookdev/${label}`, {recursive:true});
const browser = await chromium.launch({args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page = await browser.newPage({viewport:{width:430,height:932},deviceScaleFactor:1,hasTouch:true});
const errors=[]; page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
const shots=process.argv[3] === 'all' ? ['nacre','khepri','vesper','veil','nacre-low','vesper-low','nacre-facility','khepri-facility','vesper-facility'] : process.argv[3]?.split(',') ?? ['nacre','khepri','vesper','veil'];
const results=[];
try {
for(const name of shots){
 const low=name.endsWith('-low'), planet=name.replace('-low','').replace('-facility','').replace('-large','').replace('-small','');
 const sector={warden:1,bastion:4,ark:7,veil:10}[planet];
 const url=sector ? `/tests/fixtures/endless-arena.html?sector=${sector}` : `/tests/fixtures/nacre-world.html?planet=${planet}&distance=${planet==='vesper' && name.includes('facility')?695:210}&x=-3`;
 await page.goto(`http://127.0.0.1:4173${url}&inspect=1&quality=${low?'low':'high'}${name.includes('-facility')?`&facility=${name.includes('-large')?'large':'small'}`:''}`);
 await page.waitForFunction(boss => { const raw = document.querySelector('canvas.flight-canvas')?.getAttribute('data-render-stats'); if (!raw) return false; const data=JSON.parse(raw); return data.terrain.kit === 'glb' && data.terrain.shared === 'glb' && data.heroModel==='glb' && data.facilities.loaded && (!boss || data[boss]?.model==='glb'); }, sector?planet:null, {timeout:90000});
 await page.waitForTimeout(3000);
 await page.screenshot({path:`lookdev/${label}/${name}.png`,timeout:90000});
 results.push({name,stats:await page.locator('canvas.flight-canvas').getAttribute('data-render-stats')});
 console.log(`Captured ${name}`);
}
} finally {
writeFileSync(`lookdev/${label}/stats.json`,JSON.stringify({results,errors},null,2));
await browser.close();
}
console.log(JSON.stringify({captures:results.length,errors}));
if(errors.length)process.exitCode=1;
