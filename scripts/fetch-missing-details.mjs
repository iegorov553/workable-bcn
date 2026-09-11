import { readFile, writeFile } from 'node:fs/promises';
const {additions} = JSON.parse(await readFile('docs/data/catalog-comparison.json','utf8'));
for(const [i,r] of additions.filter(r=>!r.latitude).entries()) {
  const url=r.mapUrl??r.sourceUrl;
  try {
    const response=await fetch(url,{signal:AbortSignal.timeout(15000)});
    const body=await response.text();
    await writeFile(`tmp/audit/missing-${i}.txt`,body);
    console.log(i,r.chain,r.address,response.status,response.url);
    const snippets=[...body.matchAll(/.{0,70}(?:!3d|!4d|@41\.|latitude|longitude|maps\/embed|maps.google|google.com\/maps).{0,180}/g)].slice(0,3).map(m=>m[0]);
    console.log(snippets.join('\n'));
  } catch(e){console.log(r.address,e.message);}
}
