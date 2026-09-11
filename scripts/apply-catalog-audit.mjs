import {readFile,writeFile} from 'node:fs/promises';
const original=JSON.parse(await readFile('docs/data/original-places.json','utf8'));
const audit=JSON.parse(await readFile('docs/data/catalog-comparison.json','utf8'));
const {sourceUrls}=JSON.parse(await readFile('docs/data/official-catalogs.json','utf8'));
const changes=[];
const places=original.map(p=>{
 const row=audit.rows.find(r=>r.id===p.id);
 const verification={status:row.status,checkedAt:audit.checkedAt,sourceUrl:row.official?.sourceUrl??sourceUrls[p.chain]};
 if(row.status!=='listed') {
  verification.note=row.reason;
  return {...p,verification};
 }
 const r=row.official;
 const moved=!!r.latitude && row.coordinateDiscrepancyKm<=0.15;
 if(row.coordinateDiscrepancyKm>0.15) verification.note='Address listed by the chain; official coordinates differ from the original map. Original coordinates retained.';
 const address=r.address;
 const name=`${r.chain} - ${address.split(/,?\s+0\d{4}| - 0\d{4}|, Barcelona|, barcelona/)[0]}`;
 const updated={...p,chain:r.chain,name,address,latitude:moved?r.latitude:p.latitude,longitude:moved?r.longitude:p.longitude,verification};
 if(updated.chain!==p.chain||updated.address!==p.address) changes.push({id:p.id,oldChain:p.chain,chain:updated.chain,oldAddress:p.address,address});
 return updated;
});
const held=[];
for(const r of audit.additions) {
 if(!Number.isFinite(r.latitude)||!Number.isFinite(r.longitude)) {held.push({...r,reason:'missing-exact-coordinates'});continue;}
 // Do not silently add a second marker for the same network within one shop frontage.
 const nearby=places.find(p=>p.chain===r.chain&&Math.hypot((p.latitude-r.latitude)*111,(p.longitude-r.longitude)*84)<0.025);
 if(nearby) {held.push({...r,reason:'near-existing-marker',existingId:nearby.id});continue;}
 const id=`${r.chain.toLowerCase().replace(/[^a-z0-9]+/g,'-')}-${r.latitude.toFixed(6)}-${r.longitude.toFixed(6)}`;
 places.push({id,chain:r.chain,name:`${r.chain} - ${r.address.split(/,?\s+0\d{4}| - 0\d{4}|, Barcelona/)[0]}`,address:r.address,latitude:r.latitude,longitude:r.longitude,verification:{status:'listed',checkedAt:audit.checkedAt,sourceUrl:r.sourceUrl}});
}
places.sort((a,b)=>a.chain.localeCompare(b.chain)||a.name.localeCompare(b.name));
await writeFile('src/data/places.json',JSON.stringify(places,null,2)+'\n');
const summary={checkedAt:audit.checkedAt,original:original.length,total:places.length,added:places.length-original.length,listed:places.filter(p=>p.verification.status==='listed').length,unverified:places.filter(p=>p.verification.status==='unverified').length,byChain:Object.fromEntries(Object.entries(Object.groupBy(places,p=>p.chain)).map(([k,v])=>[k,{total:v.length,listed:v.filter(p=>p.verification.status==='listed').length,unverified:v.filter(p=>p.verification.status==='unverified').length}])),held,changes};
await writeFile('docs/data/update-summary.json',JSON.stringify(summary,null,2)+'\n');
const csv=['id,chain,address,status,checkedAt,sourceUrl,note',...places.map(p=>[p.id,p.chain,p.address,p.verification.status,p.verification.checkedAt,p.verification.sourceUrl,p.verification.note??''].map(v=>'"'+String(v).replaceAll('"','""')+'"').join(','))].join('\n');
await writeFile('docs/data/places-audit.csv','\uFEFF'+csv+'\n');
console.log(JSON.stringify({...summary,changes:changes.length,held:held.map(r=>({address:r.address,reason:r.reason}))},null,2));
