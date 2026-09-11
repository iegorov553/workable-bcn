import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';
import opentype from 'opentype.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const file = name => path.join(root, name);
// Keep the supplied file byte-for-byte; omit metadata only from derived assets.
const source = await readFile(file('assets/brand/user-logo-original.svg'), 'utf8');
const artwork = source.replace(/<metadata[\s\S]*?<\/metadata>/g, '').replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '')
  .replaceAll('#205343', '#F4C344').replaceAll('#FEFEFE', '#17211B').replaceAll('#D9953C', '#FFF9EB');
const mark = artwork.replace(/<path\b[^>]*d="M0 0L1254 0L1254 1254L0 1254L0 0Z"[^>]*\/>/, '');
if (mark === artwork || /<(?:image|script)\b/i.test(mark)) throw new Error('Unexpected source SVG: expected vector paths and a separate background.');
const svg = (width, height, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>\n`;
const background = (width, height) => `<path fill="#F4C344" d="M0 0H${width}V${height}H0Z"/>`;
const icon = svg(1024, 1024, artwork);
const foreground = svg(1024, 1024, mark);
const [titleBytes, bodyBytes] = await Promise.all([
  readFile(file('assets/fonts/Fraunces-SemiBold.ttf')), readFile(file('assets/fonts/Roboto-Regular.ttf')),
]);
const parseFont = bytes => opentype.parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
const titleFont = parseFont(titleBytes);
const bodyFont = parseFont(bodyBytes);
// These fixed Latin labels need glyph outlines and kerning, not complex-script shaping.
const textPath = (font, text, x, y, size) => {
  const outline = new opentype.Path();
  const scale = size / font.unitsPerEm;
  let previous;
  for (const character of text) {
    const glyph = font.charToGlyph(character);
    if (previous) x += font.getKerningValue(previous, glyph) * scale;
    outline.extend(glyph.getPath(x, y, size));
    x += glyph.advanceWidth * scale;
    previous = glyph;
  }
  const fields = { M: ['x', 'y'], L: ['x', 'y'], Q: ['x1', 'y1', 'x', 'y'], C: ['x1', 'y1', 'x2', 'y2', 'x', 'y'], Z: [] };
  return outline.commands.map(command => command.type + fields[command.type].map(key => {
    if (!Number.isFinite(command[key])) throw new Error('Invalid font outline coordinate');
    return command[key].toFixed(2);
  }).join(' ')).join(' ');
};
const titlePath = textPath(titleFont, 'Workable BCN', 397, 235, 60);
const subtitlePath = textPath(bodyFont, 'Coffee. City. Your places.', 400, 286, 27);
const banner = svg(1024, 500, `${background(1024, 500)}
  <g transform="translate(-27 -3) scale(.47)">${mark}</g>
  <g fill="#17211B" aria-label="Workable BCN. Coffee. City. Your places.">
    <path d="${titlePath}"/>
    <path d="${subtitlePath}"/>
  </g>`);
const editableBanner = svg(1024, 500, `<style>
  @font-face { font-family: BrandTitle; src: url(data:font/ttf;base64,${titleBytes.toString('base64')}); }
  @font-face { font-family: BrandBody; src: url(data:font/ttf;base64,${bodyBytes.toString('base64')}); }
  </style>${background(1024, 500)}<g transform="translate(-27 -3) scale(.47)">${mark}</g>
  <text x="397" y="235" font-family="BrandTitle" font-size="60" fill="#17211B">Workable BCN</text>
  <text x="400" y="286" font-family="BrandBody" font-size="27" fill="#17211B">Coffee. City. Your places.</text>`);

await mkdir(file('store-assets'), { recursive: true });
await writeFile(file('assets/brand/cup-pin.svg'), foreground);
await writeFile(file('assets/brand/app-icon.svg'), icon);
await writeFile(file('assets/brand/adaptive-foreground.svg'), foreground);
await writeFile(file('store-assets/feature-graphic.svg'), banner);
await writeFile(file('store-assets/feature-graphic-editable.svg'), editableBanner);
for (const [name, content, width, height] of [
  ['assets/workable-icon.png', icon, 1024, 1024],
  ['assets/workable-adaptive-foreground.png', foreground, 1024, 1024],
  ['assets/workable-favicon.png', icon, 64, 64],
  ['store-assets/play-icon.png', icon, 512, 512],
  ['store-assets/feature-graphic.png', banner, 1024, 500],
]) {
  const pipeline = sharp(Buffer.from(content)).resize(width, height);
  if (!name.includes('adaptive-foreground')) pipeline.removeAlpha();
  await pipeline.png().toFile(file(name));
  console.log(`${name}: ${width} × ${height}`);
}
