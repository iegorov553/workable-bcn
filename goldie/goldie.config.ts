import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { GoldieConfig } from "goldie";

const rootDir = fileURLToPath(new URL("..", import.meta.url));

const config: GoldieConfig = {
  appRoot: rootDir,
  appPath: "",
  bundleId: "com.barnacafemap",
  devices: ["pixel-10-pro", "iphone-6.9"],
  locales: ["en"],
  appearance: "light",

  frame: {
    variant: "17-pro-silver",
  },

  theme: {
    background: "linear-gradient(160deg, #F5F7F5 0%, #E7EFE8 55%, #D6E4D8 100%)",
    headlineColor: "#142D24",
    subheadColor: "#3B5247",
    fontFamily: '-apple-system, "SF Pro Display", "Segoe UI", Roboto, system-ui, sans-serif',
    copyHeightRatio: 0.22,
    deviceWidthRatio: 0.84,
    layout: "classic",
  },

  store: {
    name: "Workable BCN",
    subtitle: {
      en: "Cafés with Wi-Fi in Barcelona",
    },
    developer: "Workable BCN",
    category: "Food & Drink",
    rating: 4.9,
    ratingCount: "250+ reviews",
    ageRating: "4+",
    price: "Free",
    description: {
      en: "Find laptop-friendly cafés with power outlets and reliable Wi-Fi across Barcelona. Save favorites offline and navigate with ease.",
    },
  },

  scenes: [
    {
      kind: "screenshot",
      id: "map",
      flow: "store-01-map",
      headline: {
        en: "Coffee. City. Your places.",
      },
      subhead: {
        en: "Find work-friendly coffee spots across Barcelona.",
      },
    },
    {
      kind: "screenshot",
      id: "list",
      flow: "store-02-list",
      headline: {
        en: "Curated café directory",
      },
      subhead: {
        en: "Browse spots by chain, distance, and workspace amenities.",
      },
    },
    {
      kind: "screenshot",
      id: "saved",
      flow: "store-03-saved",
      headline: {
        en: "Save your favorites",
      },
      subhead: {
        en: "Keep your go-to places offline and always accessible.",
      },
    },
    {
      kind: "screenshot",
      id: "selected-place",
      flow: "store-04-selected-place",
      headline: {
        en: "Clear place details",
      },
      subhead: {
        en: "Addresses, directions, and workspace notes at a glance.",
      },
    },
    {
      kind: "screenshot",
      id: "about",
      flow: "store-05-about",
      headline: {
        en: "Simple and transparent",
      },
      subhead: {
        en: "Direct privacy policy and support contact right in the app.",
      },
    },
  ],
};

export default config;
