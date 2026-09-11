import { mkdirSync, copyFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import sharp from "sharp";

const projectRoot = resolve(".");
const storeScreenshotsDir = join(projectRoot, "store-assets", "screenshots");
const backupDir = join(storeScreenshotsDir, "raw-backup");
const goldieOutRaw = join(projectRoot, "goldie", "out", "raw");

if (!existsSync(backupDir)) {
  mkdirSync(backupDir, { recursive: true });
}

const scenes = [
  { sceneId: "map", file: "01-map.png" },
  { sceneId: "list", file: "02-list.png" },
  { sceneId: "saved", file: "03-saved.png" },
  { sceneId: "selected-place", file: "04-selected-place.png" },
  { sceneId: "about", file: "05-about.png" },
];

const devices = ["pixel-10-pro", "iphone-6.9"];
const TOP_PADDING = 115; // pixels to clear camera cutout / dynamic island
const BG_COLOR = { r: 244, g: 245, b: 239 }; // #F4F5EF matching app header

// 1. Ensure untouched backups exist, and generate padded screenshots in storeScreenshotsDir
for (const { file } of scenes) {
  const currentPath = join(storeScreenshotsDir, file);
  const backupPath = join(backupDir, file);

  if (!existsSync(backupPath)) {
    copyFileSync(currentPath, backupPath);
  }

  // Extend untouched backup with TOP_PADDING
  await sharp(backupPath)
    .extend({
      top: TOP_PADDING,
      bottom: 0,
      left: 0,
      right: 0,
      background: BG_COLOR,
    })
    .toFile(currentPath);
}

// 2. Populate raw capture directory and manifest for each device
for (const device of devices) {
  const deviceDir = join(goldieOutRaw, device);
  mkdirSync(deviceDir, { recursive: true });

  const screenshots = scenes.map(({ sceneId, file }) => {
    const src = join(storeScreenshotsDir, file);
    const dest = join(deviceDir, file);
    copyFileSync(src, dest);
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

console.log(`Successfully padded all ${scenes.length} screenshots by +${TOP_PADDING}px!`);
