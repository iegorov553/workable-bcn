import { readFile, writeFile, mkdir } from 'node:fs/promises';
const read = name => readFile(`tmp/audit/${name}`, 'utf8');
const clean = s => s.replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/\\?&#0*39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
const records = [];
const sourceUrls = {
 '365 Café': 'https://365obrador.com/es/encuentranos/',
 'Granier': 'https://pansgranier.com/donde-estamos/',
 'Santagloria': 'https://www.santagloria.com/nuestros-locales',
 'El Fornet': 'https://elfornet.com/tiendas',
 'Sandwichez': 'https://www.sandwichez.com/locales',
 'Buenas Migas': 'https://www.buenasmigas.com/',
 'Vivari': 'https://vivari.es/',
};
const region = p => p.latitude >= 41.30 && p.latitude <= 41.60 && p.longitude >= 1.90 && p.longitude <= 2.30;
const seen365 = new Set();
for (const file of ['365-shops.txt','365-north.txt','365-west.txt', ...JSON.parse(await read('365-extra-files.json').catch(() => '[]'))]) {
 for (const p of JSON.parse(await read(file))) {
  if (seen365.has(p.id)) continue;
  seen365.add(p.id);
  const r = { chain:'365 Café', name:`365 Café - ${clean(p.address)}`, address:clean(`${p.address}, ${p.zip} ${p.city}`), latitude:+p.lat, longitude:+p.lng, sourceUrl:sourceUrls['365 Café'], officialId:p.id };
  if (region(r)) records.push(r);
 }
}
for (const p of JSON.parse(await read('granier-shops.txt'))) {
 const r = { chain:'Granier', name:`Granier - ${p.name}`, address:clean(`${p.name}, ${p.province}`), latitude:p.lat, longitude:p.lng, sourceUrl:sourceUrls.Granier };
 if (region(r)) records.push(r);
}
const santa = await read('santagloria.html');
for(const m of santa.matchAll(/infowindow_\d+= new google.maps.InfoWindow\(\{([\s\S]*?)position: \{ lat: ([\d.-]+), lng: ([\d.-]+) \}/g)) {
 const name=clean(m[1].match(/<b[^>]*>(.*?)<\/b>/)?.[1]??'');
 const address=clean(m[1].match(/<p[^>]*>(.*?)<\/p>/)?.[1]??'');
 const sourceUrl=m[1].match(/https:\/\/www.santagloria.com\/nuestros-locales\/[^']+/)?.[0];
 const r={chain:'Santagloria',name,address,latitude:+m[2],longitude:+m[3],sourceUrl};
 if(region(r)) records.push(r);
}
for (const m of (await read('fornet.html')).matchAll(/<article class="ef-store-card"([\s\S]*?)<\/article>/g)) {
 const name=clean(m[1].match(/<h3>(.*?)<\/h3>/)[1]);
 const address=clean(m[1].match(/class="ef-address">(.*?)<\/div>/)[1]);
 const path=m[1].match(/data-store-path="([^"]+)"/)?.[1];
 const zone=m[1].match(/data-zone="([^"]+)"/)?.[1];
 records.push({chain:'El Fornet',name,address,zone,sourceUrl:path ? `https://elfornet.com${path}`:sourceUrls['El Fornet']});
}
for (const m of (await read('sandwichez.html')).matchAll(/<h3[^>]*>([\s\S]*?)<\/h3>/g)) {
 const address=clean(m[1]);
 if (address==='OFICINA CENTRAL') continue;
 records.push({chain:'Sandwichez',name:`Sandwichez - ${address}`,address:address.includes('SABADELL')?address:`${address}, Barcelona`,sourceUrl:sourceUrls.Sandwichez,mapUrl:m[1].match(/href="([^"]+)"/)?.[1]});
}
const migasUrls=JSON.parse(await read('migas-urls.json'));
for (let i=0;i<migasUrls.length;i++) {
 const h=await read(`migas-${i}.txt`);
 const block=h.match(/<div class="sqs-html-content"[^>]*>([\s\S]*?)<\/div>/)?.[1]??'';
 const address=clean(block).split(/Tlfn:|Telf:|Tlf:|Tel:/)[0].trim();
 records.push({chain:'Buenas Migas',name:`Buenas Migas - ${address.split(/080\d\d/)[0].trim()}`,address,sourceUrl:migasUrls[i]});
}
await mkdir('docs/data', {recursive:true});
// The 365 locator publishes duplicate IDs for some physical shops.
const unique = records.filter((r,i) => !records.slice(0,i).some(p => p.chain===r.chain && r.latitude && p.latitude && Math.hypot((r.latitude-p.latitude)*111,(r.longitude-p.longitude)*84)<0.02));
await writeFile('docs/data/official-catalogs.json',JSON.stringify({checkedAt:'2026-09-11',region:{south:41.30,north:41.60,west:1.90,east:2.30},sourceUrls,records:unique},null,2)+'\n');
console.log(Object.groupBy(records,r=>r.chain) && Object.fromEntries(Object.entries(Object.groupBy(records,r=>r.chain)).map(([k,v])=>[k,v.length])));
