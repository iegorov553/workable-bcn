import {readFile,writeFile} from 'node:fs/promises';
for(const i of [1,3,4,5,6]) {
 const html=await readFile(`tmp/audit/missing-${i}.txt`,'utf8');
 const url= i===1 ? 'https://maps.app.goo.gl/aiLNLjYCjdxn5Mrm9' : [...html.matchAll(/<iframe[^>]*src="([^"]+)"/g)].map(m=>m[1].replace(/&amp;/g,'&')).find(u=>u.includes('google.com/maps'));
 try {
 const r=await fetch(url,{signal:AbortSignal.timeout(20000)});
 const h=await r.text();
 await writeFile(`tmp/audit/fornet-map-${i}.txt`,h);
 console.log(i,r.url,[...h.matchAll(/.{0,120}(?:!3d|!4d|\[41\.\d+,[ ]?2\.\d+\]).{0,150}/g)].slice(-4).map(m=>m[0]).join('\n'));
 }catch(e){console.log(i,e.message);}
}
