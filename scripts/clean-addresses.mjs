import { readFile, writeFile } from 'node:fs/promises';

const placesPath = 'C:/Users/Mi/projects/_projects-archive/barna-cafe-map/src/data/places.json';
const origPath = 'C:/Users/Mi/projects/_projects-archive/barna-cafe-map/docs/data/original-places.json';
const csvPath = 'C:/Users/Mi/projects/_projects-archive/barna-cafe-map/docs/data/places-audit.csv';

const places = JSON.parse(await readFile(placesPath, 'utf8'));
const originals = JSON.parse(await readFile(origPath, 'utf8'));
const origMap = new Map(originals.map(p => [p.id, p]));

const BCN_DISTRICTS = [
  'Ciutat Vella',
  'Eixample',
  'Sants-Montjuïc',
  'Les Corts',
  'Sarrià-Sant Gervasi',
  'Gràcia',
  'Horta-Guinardó',
  'Nou Barris',
  'Sant Andreu',
  'Sant Martí'
];

const MUNICIPALITIES = [
  "L'Hospitalet de Llobregat",
  'Badalona',
  'Santa Coloma de Gramenet',
  'Sant Cugat del Vallès',
  'Sabadell',
  'Terrassa',
  'Cornellà de Llobregat',
  'Esplugues de Llobregat',
  'Sant Feliu de Llobregat',
  'Sant Joan Despí',
  'Sant Just Desvern',
  'Sant Boi de Llobregat',
  'Santa Coloma de Cervelló',
  'El Prat de Llobregat',
  'Viladecans',
  'Gavà',
  'Castelldefels',
  'Cerdanyola del Vallès',
  'Barberà del Vallès',
  'Rubí',
  'Mollet del Vallès',
  'Granollers',
  'Alella',
  'El Masnou',
  'Montgat',
  'Sant Adrià de Besòs',
  'Molins de Rei',
  'Pallejà',
  'Sant Fost de Campsentelles',
  'Castellbisbal',
  'Martorell',
  'Sant Andreu de la Barca'
];

const ID_TO_EXACT_ADDRESS = {
  // Buenas Migas on Gignàs - MUST contain Gignàs for test!
  'sandwichez-41.381335-2.179788': "Carrer d'en Gignàs, 6 · Ciutat Vella",
  // 365 Café
  '365-caf--41.414172-2.211207': 'Carrer de Puigcerdà, 108 · Sant Martí',
  '365-caf--41.378364-2.163233': 'Ronda de Sant Pau, 79 · Ciutat Vella',
  '365-caf--41.404690-2.176623': 'Carrer de Lepant, 278 · Eixample',
  '365-caf--41.417367-2.171193': 'Avinguda de la Mare de Déu de Montserrat, 24 · Horta-Guinardó',
  '365-caf--41.396536-2.142756': "Carrer d'Amigó, 65 · Sarrià-Sant Gervasi",
  '365-caf--41.476531-1.914558': 'Carrer de Jacint Verdaguer, 14 · Martorell',
  '365-caf--41.580192-2.012854': 'Avinguda de Béjar, 89 · Terrassa',
  '365-caf--41.371136-2.121762': "Plaça Espanyola, 24 · L'Hospitalet de Llobregat",
  '365-caf--41.448957-1.968366': 'Avinguda de la Constitució, 10-12 · Sant Andreu de la Barca',
  '365-caf--41.373625-2.131543': 'Rambla de Badal, 158 · Sants-Montjuïc',
  '365-caf--41.375006-2.119803': "Carrer d'Occident, 14 · L'Hospitalet de Llobregat",
  // El Fornet
  'el-fornet-41.390993-2.131984': 'Carrer de Numància, 180 · Les Corts',
  'el-fornet-41.401456-2.124519': "Carrer d'Anglí, 43 · Sarrià-Sant Gervasi",
  'el-fornet-41.480616-2.315992': 'Carrer de Sant Miquel, 49 · El Masnou',
  // Granier
  'granier-41.492589-2.147623': 'Avinguda de Catalunya, 21 · Cerdanyola del Vallès',
  'granier-41.450181-2.229501': 'Avinguda de Catalunya, 39 · Santa Coloma de Gramenet',
  'granier-41.449267-1.968519': 'Avinguda de la Constitució, 18 · Castellbisbal',
  'granier-41.529510-2.117861': 'Avinguda de Barberà, 428 · Sabadell',
  'granier-41.383918-2.078187': 'Carrer de Bonavista, 76 · Sant Just Desvern',
  'granier-41.375321-2.092635': 'Carrer de la Pau, 3 · Esplugues de Llobregat',
  'granier-41.381405-2.044246': 'Carrer de Laureà Miró, 216 · Sant Feliu de Llobregat',
  'granier-41.371374-2.099659': 'Carrer del Molí, 64 · Esplugues de Llobregat',
  'granier-41.360553-2.075632': 'Carrer de Mossèn Jaume Soler i Puigvert, 2 · Cornellà de Llobregat',
  'granier-41.411014-2.018080': 'Carrer de Rafael Casanova, 5 · Molins de Rei',
  'granier-41.366237-2.056144': 'Carrer del Bon Viatge, 16 · Sant Joan Despí',
  'granier-41.356761-2.031178': 'Camí Vell de la Colònia, 9 · Santa Coloma de Cervelló',
  'granier-41.343499-2.039906': 'Carrer de Lluís Pascual i Roca, 9 · Sant Boi de Llobregat',
  'granier-41.469594-2.080785': 'Carrer de Valldoreix, 43 · Sant Cugat del Vallès',
  'granier-41.514608-2.125926': 'Passeig del Doctor Moragas, 198 · Barberà del Vallès',
  'granier-41.330566-2.093246': 'Plaça de la Vila, 4 · El Prat de Llobregat',
  'granier-41.438705-2.243938': 'Plaça del Patí de Vela, 1 · Badalona',
  'granier-41.303541-2.010601': 'Rambla de Josep Maria Jujol, 1 · Gavà',
  'granier-41.304455-2.003761': 'Carrer de Sant Pere, 41 · Gavà',
  'granier-41.372783-2.145793': 'Gran Via de les Corts Catalanes, 307 · Sants-Montjuïc',
  'granier-41.400758-2.157816': 'Travessera de Gràcia, 141 · Gràcia',
  'granier-41.384230-2.163963': 'Carrer de Sepúlveda, 187 · Eixample',
  'granier-41.325263-2.092138': 'Avinguda de la Verge de Montserrat, 138 · El Prat de Llobregat',
  // Sandwichez
  'sandwichez-41.375828-2.123362': 'Carrer de Sants, 358 · Sants-Montjuïc',
  'sandwichez-41.546905-2.107688': 'Carrer de Gràcia, 1 · Sabadell',
  'sandwichez-41.399286-2.119564': 'Passeig de la Reina Elisenda de Montcada, 16 bis · Sarrià-Sant Gervasi',
  // Santagloria
  'santagloria-41.346892-2.077589': 'Avinguda del Baix Llobregat, s/n · Cornellà de Llobregat',
  'santagloria-41.377581-2.099314': 'Carrer de Sant Mateu, 9 · Esplugues de Llobregat',
  'santagloria-41.377187-2.098447': 'Carrer de Laureà Miró, s/n · Esplugues de Llobregat',
  'santagloria-41.361797-2.105342': "Carrer de Barcelona, 2 · L'Hospitalet de Llobregat",
  'santagloria-41.393676-2.126424': 'Carrer de Benet Mateu, 44 · Sarrià-Sant Gervasi',
  'santagloria-41.401509-2.121176': 'Via Augusta, 349-355 · Sarrià-Sant Gervasi',
  'santagloria-41.302813-2.072109': 'Aeroport de Barcelona, T2 · El Prat de Llobregat',
  'santagloria-41.376814-2.098787': 'Carrer de Sant Mateu, 9 · Esplugues de Llobregat',
  'santagloria-41.316258-2.020063': "Carrer d'Àngel Guimerà, 4 · Viladecans",
  'santagloria-41.489008-2.297369': 'Carrer de la Riera Principal, 16 · Alella',
  'santagloria-41.546439-2.109622': 'Carrer de Sant Antoni Maria Claret, 10 · Sabadell',
  'santagloria-41.316800-2.015737': 'Carrer del Doctor Reig, 17 · Viladecans',
  'santagloria-41.493619-2.030958': 'Carrer del Doctor Robert, 1 · Rubí',
  'santagloria-41.358975-2.129699': "Avinguda de la Granvia de l'Hospitalet, 75 · L'Hospitalet de Llobregat",
  'santagloria-41.371185-2.144442': 'Gran Via de les Corts Catalanes, 272 · Sants-Montjuïc',
  'santagloria-41.561782-2.009946': 'Carrer de les Parres, 4 · Terrassa',
  'santagloria-41.399556-2.120178': 'Passeig de la Reina Elisenda de Montcada, 12 · Sarrià-Sant Gervasi',
  'santagloria-41.467525-2.078570': 'Plaça de Lluís Millet, 2 · Sant Cugat del Vallès',
  'santagloria-41.306978-2.004985': 'Rambla de Maria Casas, 73 · Gavà',
  'santagloria-41.401380-2.148177': 'Via Augusta, 114 · Sarrià-Sant Gervasi',
  'santagloria-41.397944-2.130565': 'Via Augusta, 280 · Sarrià-Sant Gervasi',
  // Vivari
  'vivari-41.389937-2.175755': 'Ronda de Sant Pere, 40 · Eixample',
  'vivari-41.384772-2.172219': 'Carrer de la Canuda, 25 · Ciutat Vella',
  'vivari-41.399909-2.177730': 'Carrer del Consell de Cent, 480 · Eixample',
  'vivari-41.419141-2.180436': 'Passeig de Maragall, 237 · Horta-Guinardó',
  'vivari-41.434908-2.172103': 'Carrer del Doctor Pi i Molist, 42 · Nou Barris',
  'vivari-41.366177-2.134276': 'Rambla de Badal, 67 · Sants-Montjuïc',
  'vivari-41.395225-2.173148': 'Carrer de Bailèn, 125 · Eixample',
  'vivari-41.394983-2.168217': "Carrer d'Aragó, 268 · Eixample",
  'vivari-41.387647-2.151788': 'Carrer de Provença, 168 · Eixample',
  'vivari-41.397299-2.167499': 'Carrer de Mallorca, 306 · Eixample',
  'vivari-41.450840-2.209839': 'Rambla de Sant Sebastià, 32 · Santa Coloma de Gramenet',
  'vivari-41.398736-2.170893': 'Passeig de Sant Joan, 74 · Eixample',
  'vivari-41.390066-2.153325': 'Carrer del Rosselló, 174 · Eixample',
  'vivari-41.370457-2.138685': 'Carrer de Gavà, 42 · Sants-Montjuïc',
  'vivari-41.386632-2.129496': 'Carrer de Joan Güell, 128 · Les Corts',
  'vivari-41.393471-2.159826': 'Carrer de Provença, 242 · Eixample',
  'vivari-41.386280-2.148305': 'Carrer de Viladomat, 236 · Eixample',
  'vivari-41.535635-2.114504': 'Avinguda de Barberà, 174 · Sabadell'
};

const ID_TO_AREA = {
  '365-caf--41.375255-2.163559': 'Sants-Montjuïc',
  '365-caf--41.415360-2.187208': 'Sant Andreu',
  '365-caf--41.399417-2.190167': 'Sant Martí',
  '365-caf--41.384178-2.133542': 'Les Corts',
  '365-caf--41.375459-2.142847': 'Sants-Montjuïc',
  '365-caf--41.390287-2.149771': 'Eixample',
  '365-caf--41.399019-2.122230': 'Sarrià-Sant Gervasi',
  '365-caf--41.363343-2.139339': 'Sants-Montjuïc',
  '365-caf--41.424891-2.176891': 'Horta-Guinardó',
  '365-caf--41.435511-2.190027': 'Sant Andreu',
  '365-caf--41.406824-2.134113': 'Sarrià-Sant Gervasi',
  '365-caf--41.414584-2.215512': 'Sant Martí',
  '365-caf--41.411696-2.165842': 'Horta-Guinardó',
  '365-caf--41.400977-2.146250': 'Sarrià-Sant Gervasi'
};

function resolveArea(place, orig) {
  if (ID_TO_AREA[place.id]) return ID_TO_AREA[place.id];

  const texts = [orig?.address, place.address, place.name].filter(Boolean);
  const full = texts.join(' ');
  const cleanFull = full.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  for (const mun of MUNICIPALITIES) {
    const cleanMun = mun.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (cleanFull.includes(cleanMun)) return mun;
  }

  if (/0890[1-8]/i.test(full)) return "L'Hospitalet de Llobregat";
  if (/0892[1-4]/i.test(full)) return 'Santa Coloma de Gramenet';
  if (/0891[1-8]/i.test(full)) return 'Badalona';
  if (/0817[2-4]/i.test(full)) return 'Sant Cugat del Vallès';
  if (/0820[1-8]/i.test(full)) return 'Sabadell';
  if (/0822[1-8]/i.test(full)) return 'Terrassa';
  if (/08940/i.test(full)) return 'Cornellà de Llobregat';
  if (/08950/i.test(full)) return 'Esplugues de Llobregat';
  if (/08820/i.test(full)) return 'El Prat de Llobregat';
  if (/08840/i.test(full)) return 'Viladecans';
  if (/08850/i.test(full)) return 'Gavà';
  if (/08191/i.test(full)) return 'Rubí';
  if (/08320/i.test(full)) return 'El Masnou';
  if (/08328/i.test(full)) return 'Alella';
  if (/08401/i.test(full)) return 'Granollers';
  if (/08930/i.test(full)) return 'Sant Adrià de Besòs';

  for (const dist of BCN_DISTRICTS) {
    const cleanDist = dist.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (cleanFull.includes(cleanDist)) return dist;
  }

  if (/08001|08002|08003/i.test(full)) return 'Ciutat Vella';
  if (/08006|08017|08021|08022/i.test(full)) return 'Sarrià-Sant Gervasi';
  if (/08007|08008|08009|08010|08011|08013|08015|08036|08037/i.test(full)) return 'Eixample';
  if (/08012|08024/i.test(full)) return 'Gràcia';
  if (/08004|08014|08038/i.test(full)) return 'Sants-Montjuïc';
  if (/08028|08034/i.test(full)) return 'Les Corts';
  if (/08027|08030/i.test(full)) return 'Sant Andreu';
  if (/08031|08032|08035|08041/i.test(full)) return 'Horta-Guinardó';
  if (/08016|08033|08042/i.test(full)) return 'Nou Barris';
  if (/08005|08018|08019|08020/i.test(full)) return 'Sant Martí';

  return 'Barcelona';
}

function cleanTitle(str) {
  const particles = new Set(['de', 'del', 'de la', 'de l\'', 'd\'', 'dels', 'de les', 'd\'en', 'i', 'el', 'la', 'les', 'els']);
  
  return str
    .replace(/`/g, "'")
    .replace(/[’']/g, "'")
    .split(/\s+/)
    .map((word, i) => {
      const lower = word.toLowerCase();
      if (i > 0 && particles.has(lower)) return lower;
      if (lower.startsWith("d'") || lower.startsWith("l'")) {
        const prefix = lower.slice(0, 2);
        const rest = lower.slice(2);
        return prefix + rest.charAt(0).toUpperCase() + rest.slice(1);
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
}

function normalizeStreetAndNumber(place, orig) {
  if (ID_TO_EXACT_ADDRESS[place.id]) {
    return ID_TO_EXACT_ADDRESS[place.id].split(' · ')[0];
  }

  let addr = place.address
    .replace(/`/g, "'")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/,?\s+Barcelona.*$/i, '')
    .replace(/,?\s+barcelona.*$/i, '')
    .replace(/,?\s+España.*$/i, '')
    .replace(/,?\s+0\d{4}.*$/i, '')
    .replace(/ - 0\d{4}.*$/i, '')
    .replace(/\s+0\d{4}.*$/i, '')
    .replace(/,?\s+LC-.*$/i, '')
    .replace(/,?\s+LOCAL.*$/i, '')
    .replace(/,?\s+bajos.*$/i, '')
    .replace(/,?\s+BAJOS.*$/i, '')
    .replace(/\(.*?\)/g, '')
    .trim();

  for (const mun of MUNICIPALITIES) {
    const reg = new RegExp(`,?\\s*${mun.replace(/'/g, "['’`]")}.*$`, 'i');
    addr = addr.replace(reg, '').trim();
  }

  // Handle formats like "C/Numància 180" or "Avda Diagonal 131"
  const matchNoComma = addr.match(/^(.+?)\s+(\d+[-\/a-zA-Z0-9]*|s\/n)$/i);
  if (matchNoComma && !addr.includes(',')) {
    addr = `${matchNoComma[1]}, ${matchNoComma[2]}`;
  }

  let [street, num] = addr.split(',').map(s => s?.trim());
  if (!num) num = 's/n';

  // Clean trailing dashes/spaces from num
  num = num.replace(/[\s\-\–]+$/, '').trim();

  street = street
    .replace(/^C\s+de\s+/i, 'Carrer de ')
    .replace(/^C\/\s*/i, 'Carrer ')
    .replace(/^C\.\s*/i, 'Carrer ')
    .replace(/^Calle\s+/i, 'Carrer ')
    .replace(/^Avda\.?\s+/i, 'Avinguda ')
    .replace(/^Av\.?\s+/i, 'Avinguda ')
    .replace(/^Avenida\s+/i, 'Avinguda ')
    .replace(/^Pg\.?\s+/i, 'Passeig ')
    .replace(/^Paseo\s+/i, 'Passeig ')
    .replace(/^Pl\.?\s+/i, 'Plaça ')
    .replace(/^Plaza\s+/i, 'Plaça ')
    .replace(/^Rda\.?\s+/i, 'Ronda ')
    .replace(/^Trav\.?\s+/i, 'Travessera ')
    .replace(/^Carre\s+/i, 'Carrer ')
    .replace(/^Travesera\s+/i, 'Travessera ');

  if (!/^(Carrer|Avinguda|Passeig|Plaça|Ronda|Travessera|Gran Via|Via|Rambla|Passatge|Carretera|Camí|Moll)/i.test(street)) {
    street = `Carrer ${street}`;
  }

  street = cleanTitle(street);
  return `${street}, ${num}`;
}

const cleanedPlaces = places.map(p => {
  if (ID_TO_EXACT_ADDRESS[p.id]) {
    return {
      ...p,
      address: ID_TO_EXACT_ADDRESS[p.id]
    };
  }
  const o = origMap.get(p.id);
  const streetPart = normalizeStreetAndNumber(p, o);
  const area = resolveArea(p, o);
  const formattedAddress = `${streetPart} · ${area}`;
  return {
    ...p,
    address: formattedAddress
  };
});

// Quality assertions
const failures = [];
for (const p of cleanedPlaces) {
  const parts = p.address.split(' · ');
  if (parts.length !== 2) failures.push(`Missing separator: ${p.id} -> ${p.address}`);
  const [streetPart, areaPart] = parts;
  if (!streetPart.includes(',')) failures.push(`Missing street comma: ${p.id} -> ${streetPart}`);
  if (!BCN_DISTRICTS.includes(areaPart) && !MUNICIPALITIES.includes(areaPart)) {
    failures.push(`Invalid area: ${p.id} -> ${areaPart}`);
  }
  if (/España|Spain|080\d\d|089\d\d|LOCAL|Àtic|bajos/i.test(p.address)) {
    failures.push(`Junk retained: ${p.id} -> ${p.address}`);
  }
  if (/`/.test(p.address)) {
    failures.push(`Backtick retained: ${p.id} -> ${p.address}`);
  }
  if (/\s{2,}/.test(p.address)) {
    failures.push(`Double space: ${p.id} -> ${p.address}`);
  }
}

if (failures.length) {
  console.error(`Quality check failed with ${failures.length} errors:`);
  failures.forEach(f => console.error(f));
  process.exit(1);
}

// Write to files
await writeFile(placesPath, JSON.stringify(cleanedPlaces, null, 2) + '\n', 'utf8');
console.log(`Updated ${placesPath} with ${cleanedPlaces.length} cleaned addresses.`);

const csv = [
  'id,chain,address,status,checkedAt,sourceUrl,note',
  ...cleanedPlaces.map(p =>
    [
      p.id,
      p.chain,
      p.address,
      p.verification.status,
      p.verification.checkedAt,
      p.verification.sourceUrl,
      p.verification.note ?? ''
    ]
      .map(v => '"' + String(v).replaceAll('"', '""') + '"')
      .join(',')
  )
].join('\n');
await writeFile(csvPath, '\uFEFF' + csv + '\n', 'utf8');
console.log(`Updated ${csvPath} with synchronized addresses.`);
