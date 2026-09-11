import { mkdir, writeFile } from 'node:fs/promises';
const sources = {
  '365': 'https://365obrador.com/es/encuentranos/',
  fornet: 'https://elfornet.com/tiendas',
  granier: 'https://pansgranier.com/donde-estamos/',
  sandwichez: 'https://www.sandwichez.com/locales',
  migas: 'https://www.buenasmigas.com/',
  vivari: 'https://vivari.es/',
  santagloria: 'https://www.santagloria.com/',
};
await mkdir('tmp/audit', { recursive: true });
await Promise.all(Object.entries(sources).map(async ([key, url]) => {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(45000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const html = await response.text();
    await writeFile(`tmp/audit/${key}.html`, html);
    console.log(key, html.length);
  } catch (error) { console.error(key, error.message); process.exitCode = 1; }
}));
