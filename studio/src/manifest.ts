/** Mirrors the StoreManifest that `goldie manifest` writes to out/store.json. */

export type Theme = {
  background: string;
  headlineColor: string;
  subheadColor: string;
  fontFamily: string;
  /** Fraction of the frame height reserved for copy above the device. */
  copyHeightRatio: number;
  /** Fraction of the frame width the device bezel occupies. */
  deviceWidthRatio: number;
};

/** Mirrors Decoration in src/config.ts; image `src` values are urls under out/web. */
export type Decoration =
  | {
      kind: "badge";
      text: Record<string, string>;
      position: "top-left" | "top-right" | "bottom-left" | "bottom-right";
      background?: string;
      color?: string;
    }
  | { kind: "image"; src: string; x: number; y: number; width: number; rotate?: number };

export type LayoutEntry = { key: string; label: string; description: string; span: number };
export type TemplateEntry = { key: string; label: string; description: string; sequence: string[] };

/** Mirrors FrameGeometry in src/frame.ts: a bezel image's box and the screen cutout inside it. */
export type FrameGeometry = {
  width: number;
  height: number;
  screen: { x: number; y: number; width: number; height: number };
  screenRadius: number;
};

/** Mirrors DeviceType in src/specs.ts: the sidebar's device-type tabs. */
export type DeviceType = "iphone" | "ipad" | "android" | "tablet" | "laptop" | "browser";

export type DeviceEntry = {
  key: string;
  label: string;
  platform: "ios" | "android";
  type: DeviceType;
  /** Copy size relative to the reference column's type; see DeviceSpec in src/specs.ts. */
  copyScale: number;
  simulatorName: string | null;
  screenshot: { width: number; height: number };
  preview: { width: number; height: number } | null;
  /** Bezel art fixed to this device (android), null when the frame picker applies. */
  frame: { url: string; geom: FrameGeometry } | null;
};

export type DesignScene = {
  id: string;
  headline: Record<string, string>;
  subhead?: Record<string, string>;
  layout?: string;
  secondScene?: string;
  decorations?: Decoration[];
};

export type BundledFont = {
  key: string;
  family: string;
  fallback: string;
  faces: Array<{ weight: number; url: string }>;
};

export type DeviceCaptures = {
  screenshots: Array<{ sceneId: string; url: string }>;
  clips: Array<{ segmentId: string; url: string; durationSeconds: number }> | null;
  /** Each locale's own captures when the config sets localizedCaptures. */
  byLocale?: Record<string, Omit<DeviceCaptures, "byLocale">>;
};

export type Design = {
  theme: Theme;
  /** The bundled variant each device renders with; null when the config points at custom bezel art. */
  frames: Record<string, string | null>;
  /** Every bundled variant and the device it is drawn for. */
  frameVariants: Array<{ key: string; device: string; url?: string }>;
  customFrameUrl: string | null;
  /** Bundled typefaces with the @font-face sources to declare. */
  fonts: BundledFont[];
  layouts: LayoutEntry[];
  templates: TemplateEntry[];
  /** The theme's template: a built-in key, null for none, or the config's custom sequence. */
  template: string | string[] | null;
  /** The theme's default layout key. */
  layout: string;
  screenOnly: boolean;
  decorations: Decoration[];
  scenes: DesignScene[];
  preview: {
    sceneId: string;
    segments: Array<{ id: string }>;
  } | null;
  /** Raw capture urls per device key; a device is absent until `goldie capture` ran. */
  captures: Record<string, DeviceCaptures>;
};

export type StoreManifest = {
  generatedAt: string;
  app: {
    name: string;
    subtitle: Record<string, string>;
    developer: string;
    category: string;
    rating: number;
    ratingCount: string;
    ageRating: string;
    price: string;
    description: Record<string, string>;
  };
  devices: DeviceEntry[];
  locales: string[];
  design: Design;
};

/** A load failure with the CLI command that fixes it, for the empty state. */
export class ManifestError extends Error {
  constructor(
    message: string,
    readonly command: string,
  ) {
    super(message);
  }
}

export async function loadManifest(): Promise<StoreManifest> {
  const res = await fetch("/store.json", { cache: "no-store" });
  if (!res.ok) {
    throw new ManifestError(
      "There is no out/store.json yet. Generate the assets first.",
      "goldie all",
    );
  }
  const manifest: StoreManifest = await res.json();
  if (!manifest.design?.fonts || !manifest.design.layouts || !manifest.design.frames) {
    throw new ManifestError(
      "out/store.json predates browser-side composition. Regenerate it.",
      "goldie manifest",
    );
  }
  // Manifests written before the device type and copy scale existed: the key
  // tells iPads apart, and the copy keeps the reference size.
  for (const d of manifest.devices) {
    d.copyScale ??= 1;
    d.type ??= d.platform === "android" ? "android" : d.key.startsWith("ipad") ? "ipad" : "iphone";
  }

  // Raw captures keep their names across a re-capture, so the manifest's
  // timestamp becomes a cache-buster - a capture followed by a manifest
  // reload shows new pixels.
  const v = `?v=${Date.parse(manifest.generatedAt) || 0}`;
  for (const device of Object.values(manifest.design.captures)) {
    for (const captures of [device, ...Object.values(device.byLocale ?? {})]) {
      for (const shot of captures.screenshots) shot.url += v;
      for (const clip of captures.clips ?? []) clip.url += v;
    }
  }
  return manifest;
}

/** The design choices saved on disk next to the config; see src/studio-server.ts. */
export type SavedDesign = {
  background?: string;
  /** One variant for the device it is drawn for; written by older studios. */
  frame?: string;
  /** A bezel variant per device key. */
  frames?: Record<string, string>;
  fontFamily?: string;
  /** Copy edited in the lightbox, per screenshot scene id, then locale. */
  copy?: Record<string, SceneCopy>;
  /** Screenshot scene ids in the order the tiles were dragged into. */
  order?: string[];
  /** A built-in template key, or "" for none. */
  template?: string;
  /** Default layout key for scenes the template does not cover. */
  layout?: string;
  screenOnly?: boolean;
  /** Layout overrides per screenshot scene id. */
  sceneLayouts?: Record<string, string>;
};

export type SceneCopy = {
  headline?: Record<string, string>;
  subhead?: Record<string, string>;
};

export async function loadDesign(): Promise<SavedDesign> {
  try {
    const res = await fetch("/api/design", { cache: "no-store" });
    if (!res.ok) return {};
    const parsed = await res.json();
    return parsed && typeof parsed === "object" ? (parsed as SavedDesign) : {};
  } catch {
    return {}; // a static build has no API; the config's values stand
  }
}

export async function saveDesign(design: SavedDesign): Promise<void> {
  const res = await fetch("/api/design", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(design),
  });
  if (!res.ok) throw new Error(`Saving goldie.design.json failed: ${await res.text()}`);
}
