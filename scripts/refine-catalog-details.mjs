import { readFile,writeFile } from 'node:fs/promises';
const file='docs/data/official-catalogs.json';
const data=JSON.parse(await readFile(file,'utf8'));
const fornet=['pau-claris','av-sarria-1','llacuna-124','pallars-193','rambla-80','francesc-moragas-21','santa-esperanza-11'];
for(let i=0;i<fornet.length;i++) {
 const r=data.records.find(r=>r.sourceUrl===`https://elfornet.com/es/tiendas/${fornet[i]}`);
 const h=await readFile(`tmp/audit/missing-${i}.txt`,'utf8');
 const dest=h.match(/maps\/dir\/\?api=1&amp;destination=([^"&]+)/)?.[1];
 if(r&&dest) { r.catalogAddress=r.address; r.address=decodeURIComponent(dest); r.name=`El Fornet - ${r.address.split(/, 0\d{4}/)[0]}`; }
}
const sand=[['GRÀCIA, 1 | SABADELL',41.5469053,2.1076882],['SANTS, 358, Barcelona',41.375828,2.1233623]];
for(const [address,latitude,longitude] of sand) {
 const r=data.records.find(r=>r.chain==='Sandwichez'&&r.address===address);
 Object.assign(r,{latitude,longitude,coordinateSource:r.mapUrl});
}
await writeFile(file,JSON.stringify(data,null,2)+'\n');
const fornetCoords = [
 ['av-sarria-1',41.389793,2.147619,'https://maps.app.goo.gl/aiLNLjYCjdxn5Mrm9'],
 ['pallars-193',41.401449,2.197578],
 ['rambla-80',41.5441106,2.1100764],
 ['francesc-moragas-21',41.469926,2.082761],
 ['santa-esperanza-11',41.607656,2.288507],
];
for(const [slug,latitude,longitude,source] of fornetCoords) {
 const r=data.records.find(r=>r.sourceUrl===`https://elfornet.com/es/tiendas/${slug}`);
 Object.assign(r,{latitude,longitude,coordinateSource:source??r.sourceUrl});
}
await writeFile(file,JSON.stringify(data,null,2)+'\n');
