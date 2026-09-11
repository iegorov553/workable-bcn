# Screenshots

Captured from the live English mobile web app using Chrome at a 430×932 viewport on 11 September 2026. These are unmodified screenshots of the running app. No mock device frame or fabricated content was added.

- 01-map.png — default map, all chains.
- 02-list.png — default café list, all chains.
- 03-saved.png — Buenas Migas, Ronda Sant Pere 27; El Fornet, Avda Diagonal 411.
- 04-selected-place.png — Buenas Migas at Ronda Sant Pere 27 selected on the map.
- 05-about.png — English About screen with the published privacy policy and support contact.

Open `index.html` to browse the interactive screenshot carousel, with tabs for Google Play (Pixel 10 Pro), App Store (iPhone 17 Pro), and raw mobile web captures.

## Goldie Store Screenshot Pipeline

Goldie (`kacperkapusciak/goldie`) frames captures with device bezels, branding background, and store headlines:

- Configuration: `../../goldie/goldie.config.ts`
- Generated Play Store screenshots (1080×1920): `../../goldie/out/screenshots/pixel-10-pro/en/`
- Generated App Store screenshots (1320×2868): `../../goldie/out/screenshots/iphone-6.9/en/`

### Commands

```sh
# Re-frame screenshots from raw captures
npm run goldie:frame

# Generate studio web manifest
npm run goldie:manifest

# Launch live Goldie Studio on http://localhost:4321
npm run goldie:studio
```
