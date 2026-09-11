import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import sharp from "sharp";

const projectRoot = resolve(".");
const newScreenshotsDir = join(projectRoot, "store-assets", "screenshots", "new");
const storeScreenshotsDir = join(projectRoot, "store-assets", "screenshots");
const goldieOutRaw = join(projectRoot, "goldie", "out", "raw");

const sceneFiles = [
  { sceneId: "map", srcFile: "photo_2026-09-11_03-42-44.jpg", targetFile: "01-map.png" },
  { sceneId: "list", srcFile: "photo_2026-09-11_03-42-44 (2).jpg", targetFile: "02-list.png" },
  { sceneId: "saved", srcFile: "photo_2026-09-11_03-42-44 (3).jpg", targetFile: "03-saved.png" },
  { sceneId: "selected-place", srcFile: "photo_2026-09-11_03-42-44 (4).jpg", targetFile: "04-selected-place.png" },
];

const devices = ["pixel-10-pro", "iphone-6.9"];

// 1. Convert new JPG screenshots to PNG buffers
const pngBuffers = {};
for (const { srcFile, targetFile } of sceneFiles) {
  const srcPath = join(newScreenshotsDir, srcFile);
  if (!existsSync(srcPath)) {
    throw new Error(`Source screenshot not found: ${srcPath}`);
  }
  const buf = await sharp(srcPath).png({ quality: 100 }).toBuffer();
  pngBuffers[targetFile] = buf;
  
  const destPath = join(storeScreenshotsDir, targetFile);
  writeFileSync(destPath, buf);
  console.log(`Saved PNG: ${destPath}`);
}

// 2. Populate raw capture directory and manifest for each device
for (const device of devices) {
  const deviceDir = join(goldieOutRaw, device);
  mkdirSync(deviceDir, { recursive: true });

  const screenshots = sceneFiles.map(({ sceneId, targetFile }) => {
    const dest = join(deviceDir, targetFile);
    writeFileSync(dest, pngBuffers[targetFile]);
    return {
      sceneId,
      file: dest.replace(/\\/g, "/"),
    };
  });

  const manifest = {
    device,
    udid: "manual-export",
    capturedAt: new Date().toISOString(),
    screenshots,
    preview: null,
  };

  const manifestPath = join(deviceDir, "manifest.json");
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
  console.log(`Generated manifest at ${manifestPath}`);
}

console.log(`Successfully prepared all ${sceneFiles.length} screenshots for Goldie!`);
