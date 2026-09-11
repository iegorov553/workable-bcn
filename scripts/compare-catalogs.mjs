import { readFile, writeFile } from 'node:fs/promises';
const baselinePath = 'docs/data/original-places.json';
const baseline = JSON.parse(await readFile(baselinePath,'utf8').catch(async () => {const t=await readFile('src/data/places.json','utf8');await writeFile(baselinePath,t);return t;}));
const official = JSON.parse(await readFile('docs/data/official-catalogs.json','utf8'));
const norm = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[’'`´]/g,' ').replace(/\b(compte|conde)\b/g,'comte').replace(/\b(trav|travessera)\b/g,'travessera').replace(/\b(pg|paseo|passeig)\b/g,'passeig').replace(/\b(st|san|sant)\b/g,'sant').replace(/\bplaza\b/g,'placa').replace(/\breina elisenda de montcada\b/g,'reina elisenda').replace(/\brepublica argentina\b/g,'argentina').replace(/\bgran via de les corts catalanes\b/g,'gran via').replace(/\b(universidad|univ)\b/g,'universitat').replace(/\btravesera\b/g,'travessera').replace(/\bguipuzcoa\b/g,'guipuscoa').replace(/\blepanto\b/g,'lepant').replace(/\blayetana\b/g,'laietana').replace(/\bparallel\b/g,'paral lel').replace(/\bpl\b/g,'placa').replace(/\brda\b/g,'ronda').replace(/(\d+)bis/g,'$1 bis').replace(/\bconsejo\b/g,'consell').replace(/\bpi y margall\b/g,'pi i margall').replace(/[^a-z0-9]+/g,' ').trim();
const stop=new Set('c carrer calle de del dels den d l la les el els c av avd avda avenida avinguda barcelona espana spain fornet migas buenas granier sandwichez santagloria cafe local baixos bajos'.split(' '));
const tokens=s=>norm(s).split(' ').filter(t=>!stop.has(t)&&!/^\d/.test(t));
const numbers=s=>(norm(s).match(/\b\d{1,4}\b/g)??[]).map(Number);
const km=(a,b)=>Math.hypot((a.latitude-b.latitude)*111,(a.longitude-b.longitude)*84);
function score(old,r) {
 if(old.chain!==r.chain) return 0;
 const a=tokens(old.address.split(/\d/)[0]),b=tokens(r.address.split(/\d/)[0]);
 const shared=[...new Set(b)].filter(t=>a.includes(t));
 const na=numbers(old.address),nb=numbers(r.address);
 const number=na.some(n=>nb.includes(n));
 const street=shared.length>=Math.min(new Set(a).size,new Set(b).size) && shared.length>0;
 const distance=Number.isFinite(r.latitude)?km(old,r):Infinity;
 if(street&&number && distance<2) return 5;
 if(street&&number && !Number.isFinite(r.latitude)) return 4;
 if(distance<0.09&&shared.length>0) return 3;
 // Reviewed corner-frontage aliases: same chain within 25 m, different street entrance.
 if(distance<0.025) return 2;
 return 0;
}
const used=new Set(),rows=[];
for(const original of baseline) {
 // Reviewed address aliases/corner entrances, plus a wrong chain in the import.
 const old = {...original};
 if(old.id==='el-fornet-41.390993-2.131984') old.address='Numància 180, Barcelona';
 if(old.id==='el-fornet-41.401456-2.124519') old.address='Anglí 43, Barcelona';
 if(old.chain==='El Fornet' && old.address.includes('Santa Fe de Nou Mèxic')) old.address='Santa Fe De Nuevo Méjico 1, Barcelona';
 if(old.chain==='Sandwichez' && old.address.includes('Gignàs, 25')) old.chain='Buenas Migas';
 const candidates=official.records.map((r,i)=>({r,i,score:score(old,r)})).filter(c=>c.score>0&&!used.has(c.i)).sort((a,b)=>b.score-a.score);
 const best=candidates[0];
 if(best && (candidates.length===1 || best.score>candidates[1].score)) {
  used.add(best.i); rows.push({id:old.id,chain:old.chain,oldAddress:original.address,status:'listed',official:best.r,matchScore:best.score,coordinateDiscrepancyKm: best.r.latitude ? +km(original,best.r).toFixed(3) : null});
 } else rows.push({id:old.id,chain:old.chain,oldAddress:old.address,status:'unverified',reason:candidates.length?'ambiguous-match':old.chain==='Vivari'?'official-site-certificate-expired; no public store directory verified':'not-matched-in-official-catalog',candidates:candidates.map(c=>c.r.address)});
}
const additions=official.records.filter((_,i)=>!used.has(i));
await writeFile('docs/data/catalog-comparison.json',JSON.stringify({checkedAt:official.checkedAt,rows,additions},null,2)+'\n');
console.log('Listed',rows.filter(r=>r.status==='listed').length,'Unverified',rows.filter(r=>r.status==='unverified').length,'unmatched official',additions.length);
console.log('Unmatched with no coordinates:',additions.filter(r=>!r.latitude).map(r=>`${r.chain}: ${r.address}`).join('\n'));
