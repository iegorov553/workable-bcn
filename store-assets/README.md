# Workable BCN brand assets

The source of truth is `../assets/brand/user-logo-original.svg`, supplied by the owner as `image (7).svg`. It is preserved byte-for-byte, including its metadata. The previous hand-drawn replacement is no longer used.

Derived assets use the supplied vector paths without reshaping or retracing them. Their palette matches the app: yellow #F4C344, ink #17211B and cream #FFF9EB. The separate background path is omitted from the adaptive foreground and banner mark. Metadata is omitted only from derived files; the original remains intact with its original green palette.

- `../assets/brand/cup-pin.svg` — the supplied mark on a transparent background.
- `../assets/brand/app-icon.svg` — complete vector app icon.
- `../assets/brand/adaptive-foreground.svg` — Android foreground layer.
- `feature-graphic.svg` — vector mark and outlined text for portable rendering.
- `feature-graphic-editable.svg` — the same banner with editable English text and embedded fonts: **Coffee. City. Your places.**

Rebuild the PNG exports with:

```sh
npm run assets:build
```

Outputs: app icon 1024×1024, adaptive foreground 1024×1024 with alpha, favicon 64×64, `play-icon.png` 512×512, and `feature-graphic.png` 1024×500. Expo and Google Play consume PNG files exported from these vectors. No image generation is used in this build step.

The banner uses the same local Fraunces SemiBold and Roboto Regular font files as the app. The export converts text to vector outlines, so rendering does not depend on fonts installed on the build machine. Dependencies are pinned through package-lock.json.

Screenshots are in `screenshots/`. They are captures of the live mobile web app in a 430×932 viewport, not captures from an installed Android binary. Take native screenshots after testing the APK before final Play Store submission.
