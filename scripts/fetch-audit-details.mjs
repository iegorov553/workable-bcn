import { writeFile } from 'node:fs/promises';
const sources = {
  '365-locator': 'https://365obrador.com/wp-content/plugins/wp-store-locator/js/wpsl-gmap.min.js?ver=2.3.22',
  'granier-shops': 'https://pansgranier.com/wp-content/themes/granier/shopsArray.json',
  'migas-map': 'https://www.buenasmigas.com/mapa',
};
await Promise.all(Object.entries(sources).map(async ([key, url]) => {
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`${key}: ${response.status}`);
  const body = await response.text();
  await writeFile(`tmp/audit/${key}.txt`, body);
  console.log(key, body.length);
}));
