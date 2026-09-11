import { readFile, writeFile } from 'node:fs/promises';
const h = await readFile('tmp/audit/migas.html', 'utf8');
const menu = h.slice(h.indexOf('href="/mapa"'), h.indexOf('href="/blog"'));
const urls = [...new Set([...menu.matchAll(/href="(\/[^"#]+)"/g)].map(m => `https://www.buenasmigas.com${m[1]}`))].filter(u => !u.endsWith('/mapa'));
const requests = [
  ['365-shops', 'https://365obrador.com/wp-admin/admin-ajax.php?action=store_search&lat=41.389&lng=2.169&max_results=100&search_radius=25'],
  ['365-north', 'https://365obrador.com/wp-admin/admin-ajax.php?action=store_search&lat=41.46&lng=2.20&max_results=100&search_radius=25'],
  ['365-west', 'https://365obrador.com/wp-admin/admin-ajax.php?action=store_search&lat=41.50&lng=2.04&max_results=100&search_radius=25'],
  ...urls.map((url, i) => [`migas-${i}`, url]),
];
await writeFile('tmp/audit/migas-urls.json', JSON.stringify(urls));
for (let i=0; i<requests.length; i+=4) {
  await Promise.all(requests.slice(i,i+4).map(async ([key,url]) => {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const body = await r.text();
      await writeFile(`tmp/audit/${key}.txt`,body);
      console.log(key, body.length);
    } catch(e) { console.error(key, e.message); }
  }));
}
try { await fetch('https://vivari.es/', {signal: AbortSignal.timeout(20000)}).then(async r => {await writeFile('tmp/audit/vivari.html',await r.text());console.log('vivari',r.status);}); } catch(e) { console.log('vivari', e.cause?.code, e.message); }

