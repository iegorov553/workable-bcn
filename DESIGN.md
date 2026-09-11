# Workable BCN — visual direction

The owner's original mobile screenshot is the visual reference. Restore its warm, editorial appearance: cream header (#FFF9EB), sand list background (#E5DFCC), ivory cards (#FFFEF8), ink text (#17211B), yellow actions (#F4C344), and small terracotta accents. The previous neutral green redesign was rejected.

Use locally bundled Fraunces SemiBold (600) for the app and banner titles and Fraunces Bold for café names. Use bundled Roboto for controls, addresses, section headings, and the banner subtitle. The owner found the Black (900) title too heavy. Use weight 600 for the eyebrow and count. Font files and their licenses are in assets/fonts. Keep the playful yellow place-count badge and coloured left edge on cards.

Cards contain the chain and optional distance, the full short branch name, its address, a heart, and a yellow Directions button. Do not display verification status, audit dates, directory links, or generic location filler in cards. Audit metadata belongs in project data and documentation. Keep the original branch names and format new names as Chain - Street Number. Keep original IDs for saved places.

Keep all app copy in English. Navigation is Map / List / Favourites, with a small favourites-count badge. Preserve the working WebView map, geolocation fixes, safe areas, and local favourites. Keep support and privacy links in About. The count badge opens About.

The assistant created the logo; the owner supplied its cleaned vector, preserved in `assets/brand/user-logo-original.svg`. Derived assets retain its geometry and use the app palette: yellow #F4C344, ink #17211B, and cream #FFF9EB. The original green source remains unchanged. Build the icon and English banner from SVG and local fonts with `npm run assets:build`, without image generation. App export: `assets/workable-icon.png`; Play Store exports: `store-assets/play-icon.png` and `store-assets/feature-graphic.png`. The adaptive foreground is transparent.
