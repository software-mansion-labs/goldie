import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { CustomFont } from "./fonts.ts";
import { ANDROID_FRAME, FRAMES, type FrameGeometry } from "./frame.ts";
import {
  isLayoutKey,
  isTemplateKey,
  LAYOUT_KEYS,
  type LayoutKey,
  needsSecondCapture,
  resolveScenes,
  TEMPLATE_KEYS,
  type TemplateChoice,
} from "./layouts.ts";
import { DEVICE_KEYS, DEVICES, type DeviceKey, isDeviceKey } from "./specs.ts";

/** Bezel art bundled in goldie's own assets/, one PNG per variant, each drawn for one device. */
export const FRAME_VARIANTS = [
  "17-pro-silver",
  "17-pro-blue",
  "17-pro-orange",
  "ipad-pro-13-silver",
  "ipad-pro-13-space-gray",
] as const;
export type FrameVariant = (typeof FRAME_VARIANTS)[number];

export const VARIANT_DEVICE: Record<FrameVariant, DeviceKey> = {
  "17-pro-silver": "iphone-6.9",
  "17-pro-blue": "iphone-6.9",
  "17-pro-orange": "iphone-6.9",
  "ipad-pro-13-silver": "ipad-13",
  "ipad-pro-13-space-gray": "ipad-13",
};

/** The variants drawn for a device, the first one its default. */
function deviceVariants(device: DeviceKey): FrameVariant[] {
  return FRAME_VARIANTS.filter((v) => VARIANT_DEVICE[v] === device);
}

export function isFrameVariant(key: string): key is FrameVariant {
  return (FRAME_VARIANTS as readonly string[]).includes(key);
}

export type Locale = string;

/** One still screenshot: a flow that navigates somewhere, plus the marketing copy around it. */
export type ScreenshotScene = {
  kind: "screenshot";
  id: string;
  /** Flow in the app's `.argent/flows`: a name ("home") or a path under it ("goldie/home.yaml"). Its final step captures the screenshot. */
  flow: string;
  /** Headline per locale. */
  headline: Record<Locale, string>;
  subhead?: Record<Locale, string>;
  /** Overrides the theme background for this scene. */
  background?: string;
  /** Overrides theme.layout for this scene; a key from src/layouts.ts. */
  layout?: LayoutKey;
  /**
   * Id of another screenshot scene whose capture fills the second device in
   * the duo and panorama-duo layouts. Defaults to the next scene.
   */
  secondScene?: string;
  /** Badge and image layers drawn over the background, under the device, in addition to theme.decorations. */
  decorations?: Decoration[];
};

/**
 * A layer drawn over the background and under the device. A badge is a text
 * pill in a corner; an image is any PNG placed by fractions of the tile.
 */
export type Decoration =
  | {
      kind: "badge";
      text: Record<Locale, string>;
      position: "top-left" | "top-right" | "bottom-left" | "bottom-right";
      /** Pill fill and text color; default to the headline color on a translucent white. */
      background?: string;
      color?: string;
    }
  | {
      kind: "image";
      /** PNG relative to the config file. */
      src: string;
      /** Left and top as fractions of the tile width and height. */
      x: number;
      y: number;
      /** Width as a fraction of the tile width; the height keeps the image's aspect. */
      width: number;
      /** Degrees, clockwise, around the image centre. */
      rotate?: number;
    };

/**
 * The app preview video, built from short segments.
 *
 * Apple requires a preview to be a plain recording of the device screen, so
 * the segments are joined as captured: no bezel, background or captions.
 * Each segment is its own flow recorded into its own clip, which keeps a
 * single broken step from forcing a re-record of the whole story.
 */
export type PreviewScene = {
  kind: "preview";
  id: string;
  segments: Array<{
    id: string;
    /** Flow in the app's `.argent/flows`, same forms as a screenshot scene's. */
    flow: string;
    /** Hold the last frame this long after the flow ends, in seconds. */
    holdSeconds?: number;
  }>;
  /** Optional audio bed relative to the config file. A silent AAC track is written when absent. */
  audio?: string;
};

export type Scene = ScreenshotScene | PreviewScene;

export type Theme = {
  background: string;
  headlineColor: string;
  subheadColor: string;
  fontFamily: string;
  /**
   * Extra typefaces to register alongside the bundled ones, so `fontFamily` can
   * name a face this machine does not have installed - a brand font, or a script
   * the bundled families do not cover (they are latin plus one CJK fallback, so
   * arabic, hebrew, thai and the rest export as tofu without this).
   *
   * Paths are relative to the config file, like every other path in it.
   */
  fontFiles?: CustomFont[];
  /** Fraction of the screenshot height reserved for copy above the device. */
  copyHeightRatio: number;
  /** Fraction of the screenshot width the device bezel occupies. */
  deviceWidthRatio: number;
  /**
   * The strip's rhythm: a built-in template key from src/layouts.ts, or a
   * custom sequence of layout keys applied to the scenes in order (repeating
   * when shorter). Scenes with their own `layout` are left alone.
   */
  template?: TemplateChoice;
  /** Layout for scenes the template does not cover; a key from src/layouts.ts. Defaults to "classic". */
  layout?: LayoutKey;
  /** Drop the bezel and show the bare screen with a soft shadow. */
  screenOnly?: boolean;
  /** Decoration layers added to every screenshot scene. */
  decorations?: Decoration[];
};

/**
 * How the app presents itself on the App Store. Used by the studio to
 * render a realistic product page around the generated assets - it is the
 * surrounding chrome that tells you whether a headline still reads at
 * gallery size.
 */
export type StoreListing = {
  name: string;
  subtitle: Record<Locale, string>;
  developer: string;
  category: string;
  /** Shown in the ratings row; purely cosmetic. */
  rating: number;
  ratingCount: string;
  ageRating: string;
  price: string;
  description: Record<Locale, string>;
};

export type GoldieConfig = {
  /** Absolute path to the app repo. Holds `.argent/flows`; also used for messages and for locating the build. */
  appRoot: string;
  /**
   * Where the scene flows live. Defaults to `.argent/flows` inside `appRoot`,
   * so goldie and argent share one flow store: anything recorded with
   * `argent flow record` is replayable here by name, and vice versa. An
   * absolute path or a path relative to the config file overrides it.
   */
  flowsDir?: string;
  /** Simulator .app bundle to install. */
  appPath: string;
  bundleId: string;
  /** The .apk to install and its applicationId. Required when `devices` names an android key. */
  android?: {
    appPath: string;
    applicationId: string;
    /**
     * Bezel art for the android device, replacing the bundled Pixel 10 Pro
     * art, with its own geometry: the image (relative to the config), its
     * pixel size, the transparent screen cutout inside it, and the cutout's
     * corner radius. Android SDK emulator skins
     * (`$ANDROID_HOME/skins/<device>/`) carry exactly this: `back.webp` is the
     * frame and the `layout` file states the display rect and corner_radius;
     * punch the display rect transparent and point this at the result.
     */
    frame?: {
      image: string;
      width: number;
      height: number;
      screen: { x: number; y: number; width: number; height: number };
      screenRadius: number;
    };
  };
  devices: DeviceKey[];
  locales: Locale[];
  /**
   * Capture each locale in its own language. By default `capture` replays the
   * flows once, with the simulator pinned to the first locale, and every
   * locale renders those captures - fine when only the copy is translated.
   * With this on, iOS devices replay the flows once per locale, pinned to it,
   * into out/raw/<device>/<locale>/, and each locale renders its own captures,
   * so the app on screen speaks the headline's language. Android emulators are
   * not locale-pinned, so they keep one shared capture.
   */
  localizedCaptures?: boolean;
  /** Simulator appearance for every capture. */
  appearance: "light" | "dark";
  /**
   * Device bezel art for the screenshots: one bundled variant from assets/,
   * which applies to the device it is drawn for while the others keep their
   * default, or one per device key, or a custom PNG with a transparent screen
   * cutout relative to the config file. Custom art means re-measuring the
   * geometry in src/frame.ts.
   */
  frame: { variant: FrameVariant | Partial<Record<DeviceKey, FrameVariant>> } | { image: string };
  theme: Theme;
  store: StoreListing;
  scenes: Scene[];
};

export type LoadedConfig = GoldieConfig & {
  /** Directory the config file lives in; every relative path resolves against it. */
  root: string;
  /** Absolute path of the config file itself. */
  configPath: string;
  /** Absolute directory the scene flows resolve against. */
  flowsDir: string;
  outDir: string;
  /**
   * The studio's per-scene layout overrides (goldie.design.json). Kept apart
   * from the scenes so the manifest reports only the config's own layouts;
   * baked into `scene.layout` they would outrank every later template choice.
   */
  sceneLayouts?: Record<string, LayoutKey>;
};

/**
 * Default config path: the GOLDIE_CONFIG env var when set, else
 * ./goldie.config.ts. The env var lets a config live in the app's own repo
 * while goldie and its studio run from this checkout.
 */
export function defaultConfigPath(): string {
  return process.env.GOLDIE_CONFIG
    ? resolve(process.env.GOLDIE_CONFIG)
    : resolve(process.cwd(), "goldie.config.ts");
}

/**
 * The config is TypeScript. Bun and Node >= 22.18 import it natively; older
 * Node lacks type stripping, so fall back to jiti, which transpiles on the fly.
 */
async function importConfig(path: string): Promise<any> {
  try {
    return await import(pathToFileURL(path).href);
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (
      code !== "ERR_UNKNOWN_FILE_EXTENSION" &&
      code !== "ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING"
    )
      throw err;
    const { createJiti } = await import("jiti");
    return createJiti(import.meta.url).import(path);
  }
}

export async function loadConfig(path = defaultConfigPath()): Promise<LoadedConfig> {
  if (!existsSync(path)) throw new Error(`No config at ${path}`);
  const mod = await importConfig(path);
  const cfg: GoldieConfig = mod.default ?? mod.config;
  if (!cfg) throw new Error(`${path} has no default export`);
  const root = dirname(path);
  const loaded: LoadedConfig = {
    ...cfg,
    root,
    configPath: path,
    flowsDir: cfg.flowsDir ? resolve(root, cfg.flowsDir) : resolve(cfg.appRoot, ".argent/flows"),
    outDir: resolve(root, "out"),
  };
  for (const key of loaded.devices) {
    if (!isDeviceKey(key)) {
      throw new Error(`Unknown device "${key}". Available: ${DEVICE_KEYS.join(", ")}`);
    }
  }
  resolveFontFiles(loaded); // config-relative font paths -> absolute, once
  applyDesign(loaded, readDesign(path));
  // Fail at load time on a bad variant or missing bezel PNG; android devices
  // never load one from cfg.frame (drawn generic bezel or cfg.android.frame).
  for (const d of loaded.devices) if (usesBezelVariant(d)) framePath(loaded, d);
  validateLayouts(loaded);
  return loaded;
}

/**
 * Rewrites `theme.fontFiles` paths to absolute, resolved against the config's
 * directory, and fails here rather than at draw time on a missing file - a font
 * that never registers shows up as tofu in the export, which nothing else
 * catches.
 */
function resolveFontFiles(cfg: LoadedConfig): void {
  const fonts = cfg.theme.fontFiles;
  if (!fonts) return;
  cfg.theme.fontFiles = fonts.map((font) => {
    const files: Record<number, string> = {};
    for (const [weight, file] of Object.entries(font.files)) {
      const abs = resolve(cfg.root, file);
      if (!existsSync(abs)) {
        throw new Error(
          `theme.fontFiles: no font file at ${abs} (for "${font.family}" weight ${weight}).`,
        );
      }
      files[Number(weight)] = abs;
    }
    return { ...font, files };
  });
}

/**
 * Design choices made in the studio, kept next to the config as
 * goldie.design.json so they survive a reload and apply to CLI runs too.
 * Every field is optional; a missing one leaves the config's value alone.
 */
export type DesignOverrides = {
  background?: string;
  frame?: FrameVariant;
  /** A variant per device key, as the studio's frame picker saves them. */
  frames?: Partial<Record<DeviceKey, FrameVariant>>;
  /** A full CSS font stack, as the studio's font picker produces. */
  fontFamily?: string;
  /** Copy edited in the studio, per screenshot scene id, then locale. */
  copy?: Record<string, SceneCopy>;
  /** Screenshot scene ids in the order the studio arranged them. */
  order?: string[];
  /** A built-in template key; "" means none (the layout below applies to every scene). */
  template?: string;
  /** Default layout for scenes the template does not cover. */
  layout?: LayoutKey;
  screenOnly?: boolean;
  /** Layout overrides per screenshot scene id. */
  sceneLayouts?: Record<string, LayoutKey>;
};

export type SceneCopy = {
  headline?: Record<string, string>;
  subhead?: Record<string, string>;
};

/** Path of the design sidecar for a config file. */
export function designPath(configPath: string): string {
  return resolve(dirname(configPath), "goldie.design.json");
}

export function readDesign(configPath: string): DesignOverrides {
  const file = designPath(configPath);
  if (!existsSync(file)) return {};
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8"));
    return parsed && typeof parsed === "object" ? (parsed as DesignOverrides) : {};
  } catch (err) {
    throw new Error(`Unreadable ${file}: ${err instanceof Error ? err.message : err}`);
  }
}

/** Layers design overrides (the sidecar, or CLI flags) onto a loaded config. */
export function applyDesign(cfg: LoadedConfig, design: DesignOverrides): void {
  if (design.background) {
    cfg.theme.background = design.background;
    for (const scene of cfg.scenes) if (isScreenshot(scene)) scene.background = undefined;
    // The config's copy colors assume its own background; a dark override
    // would render near-black headlines on a near-black gradient, and a
    // light override under light copy colors is just as unreadable.
    const lum = backgroundLuminance(design.background);
    if (lum !== null && lum < 0.5) {
      cfg.theme.headlineColor = "#FFFFFF";
      cfg.theme.subheadColor = "#D9E1EA";
    } else if (lum !== null) {
      if ((backgroundLuminance(cfg.theme.headlineColor) ?? 0) > 0.5) {
        cfg.theme.headlineColor = "#0E1B2A";
      }
      if ((backgroundLuminance(cfg.theme.subheadColor) ?? 0) > 0.5) {
        cfg.theme.subheadColor = "#5A6A7D";
      }
    }
  }
  const frames: Partial<Record<DeviceKey, FrameVariant>> = { ...design.frames };
  if (design.frame) {
    if (!isFrameVariant(design.frame)) {
      throw new Error(
        `Unknown frame variant "${design.frame}". Available: ${FRAME_VARIANTS.join(", ")}`,
      );
    }
    frames[VARIANT_DEVICE[design.frame]] = design.frame;
  }
  if (Object.keys(frames).length > 0) {
    cfg.frame = { variant: { ...configVariants(cfg), ...frames } };
    for (const d of cfg.devices) if (usesBezelVariant(d)) framePath(cfg, d); // throws on an unknown variant
  }
  if (design.fontFamily) cfg.theme.fontFamily = design.fontFamily;
  if (design.copy) {
    for (const scene of cfg.scenes) {
      const copy = design.copy[scene.id];
      if (!isScreenshot(scene) || !copy) continue;
      if (copy.headline) scene.headline = { ...scene.headline, ...copy.headline };
      if (copy.subhead) scene.subhead = { ...scene.subhead, ...copy.subhead };
    }
  }
  if (design.order) cfg.scenes = reorderScenes(cfg.scenes, design.order);
  if (design.template !== undefined) {
    cfg.theme.template = design.template ? checkedTemplate(design.template) : undefined;
  }
  if (design.layout) cfg.theme.layout = checkedLayout(design.layout);
  if (design.screenOnly !== undefined) cfg.theme.screenOnly = design.screenOnly;
  if (design.sceneLayouts) {
    const overrides: Record<string, LayoutKey> = {};
    for (const scene of cfg.scenes) {
      const key = design.sceneLayouts[scene.id];
      if (isScreenshot(scene) && key) overrides[scene.id] = checkedLayout(key);
    }
    cfg.sceneLayouts = { ...cfg.sceneLayouts, ...overrides };
  }
}

function checkedLayout(key: string): LayoutKey {
  if (!isLayoutKey(key)) {
    throw new Error(`Unknown layout "${key}". Available: ${LAYOUT_KEYS.join(", ")}`);
  }
  return key;
}

function checkedTemplate(key: string): TemplateChoice {
  if (!isTemplateKey(key)) {
    throw new Error(`Unknown template "${key}". Available: ${TEMPLATE_KEYS.join(", ")}`);
  }
  return key;
}

/** Every screenshot scene with the layout and second capture it renders with, in strip order. */
export function resolvedScenes(cfg: LoadedConfig) {
  return resolveScenes(cfg.scenes.filter(isScreenshot), {
    template: cfg.theme.template,
    layout: cfg.theme.layout,
    sceneLayouts: cfg.sceneLayouts,
  });
}

/**
 * Fails early on a layout or template key the config misspelt, or a
 * two-device layout whose scene has no usable second capture.
 */
export function validateLayouts(cfg: LoadedConfig): void {
  if (cfg.theme.layout) checkedLayout(cfg.theme.layout);
  const template = cfg.theme.template;
  if (Array.isArray(template)) for (const key of template) checkedLayout(key);
  else if (template) checkedTemplate(template);
  const shots = cfg.scenes.filter(isScreenshot);
  for (const { scene, layout, secondScene } of resolvedScenes(cfg)) {
    if (scene.layout) checkedLayout(scene.layout);
    if (!needsSecondCapture(layout)) continue;
    if (!secondScene) {
      throw new Error(
        `Scene "${scene.id}" uses the "${layout.key}" layout, which shows two screens, but there is no other scene to borrow from.`,
      );
    }
    if (secondScene === scene.id || !shots.some((s) => s.id === secondScene)) {
      throw new Error(
        `Scene "${scene.id}": secondScene "${secondScene}" is not another screenshot scene.`,
      );
    }
  }
}

/**
 * The locales a command runs for: all of the config's, or the one --locale
 * asks for. A locale names output and capture directories, so a value outside
 * the config (a typo, or a path like "../x") is rejected rather than joined
 * into a path that could point anywhere on disk.
 */
export function selectLocales(locales: string[], requested?: string): string[] {
  if (requested === undefined) return locales;
  if (!locales.includes(requested)) {
    throw new Error(`Unknown locale "${requested}". Configured: ${locales.join(", ")}`);
  }
  return [requested];
}

/**
 * Puts the screenshot scenes in the saved order. Ids missing from the order
 * (scenes added to the config since) keep their config position relative to
 * each other and follow the ordered ones; unknown ids are ignored. Other
 * scenes (the preview) stay where they are.
 */
export function reorderScenes(scenes: Scene[], order: string[]): Scene[] {
  const shots = scenes.filter(isScreenshot);
  const rank = new Map(order.map((id, i) => [id, i]));
  const sorted = [...shots].sort((a, b) => {
    const ra = rank.get(a.id) ?? Number.POSITIVE_INFINITY;
    const rb = rank.get(b.id) ?? Number.POSITIVE_INFINITY;
    return ra === rb ? shots.indexOf(a) - shots.indexOf(b) : ra - rb;
  });
  let i = 0;
  return scenes.map((s) => (isScreenshot(s) ? sorted[i++]! : s));
}

/**
 * Mean relative luminance of the value's six-digit hex colors, or null when
 * it has none (keep the config's copy colors then).
 */
export function backgroundLuminance(css: string): number | null {
  const hexes = css.match(/#[0-9a-fA-F]{6}/g);
  if (!hexes || hexes.length === 0) return null;
  const luminance = (hex: string) => {
    const channel = (offset: number) => {
      const c = parseInt(hex.slice(offset, offset + 2), 16) / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
  };
  return hexes.reduce((sum, hex) => sum + luminance(hex), 0) / hexes.length;
}

const GOLDIE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Absolute path to a bundled bezel variant's PNG. */
export function variantFramePath(variant: FrameVariant): string {
  return resolve(GOLDIE_ROOT, "assets", `${variant}.png`);
}

/** The config's bundled variants by device; empty for custom art. */
function configVariants(cfg: LoadedConfig): Partial<Record<DeviceKey, FrameVariant>> {
  if (!("variant" in cfg.frame)) return {};
  const v = cfg.frame.variant;
  if (typeof v !== "string") return { ...v };
  if (!isFrameVariant(v)) {
    throw new Error(`Unknown frame variant "${v}". Available: ${FRAME_VARIANTS.join(", ")}`);
  }
  return { [VARIANT_DEVICE[v]]: v };
}

/** The variant a device renders with; null when the config points at custom art. */
export function frameVariantFor(cfg: LoadedConfig, device: DeviceKey): FrameVariant | null {
  if (!("variant" in cfg.frame)) return null;
  const chosen = configVariants(cfg)[device];
  if (chosen !== undefined) {
    if (!isFrameVariant(chosen)) {
      throw new Error(`Unknown frame variant "${chosen}". Available: ${FRAME_VARIANTS.join(", ")}`);
    }
    if (VARIANT_DEVICE[chosen] !== device) {
      throw new Error(
        `Frame variant "${chosen}" is drawn for ${VARIANT_DEVICE[chosen]}, not ${device}.`,
      );
    }
    return chosen;
  }
  return deviceVariants(device)[0] ?? null;
}

/** Whether a device renders with a bundled iOS bezel variant (not android art, not screen-only). */
function usesBezelVariant(device: DeviceKey): boolean {
  return DEVICES[device].platform !== "android" && !DEVICES[device].screenOnly;
}

/** Absolute path to the bezel PNG the config selects for a device. */
export function framePath(cfg: LoadedConfig, device: DeviceKey = "iphone-6.9"): string {
  const variant = frameVariantFor(cfg, device);
  const file = variant
    ? variantFramePath(variant)
    : resolve(cfg.root, (cfg.frame as { image: string }).image);
  if (!existsSync(file)) {
    throw new Error(`Frame image not found: ${file}`);
  }
  return file;
}

/**
 * Bezel art a device renders with: the config's `frame` on iOS, and on
 * android the bundled Pixel 10 Pro art unless the config supplies its own
 * `android.frame`. The geometry travels with the image, since the android art
 * has a different image box and cutout than the iOS variants.
 */
export function deviceFrame(
  cfg: LoadedConfig,
  deviceKey: DeviceKey,
): { image: string | null; geom: FrameGeometry } {
  // A screen-only device has no bezel art; its geometry still sizes the screen.
  if (DEVICES[deviceKey].screenOnly) return { image: null, geom: FRAMES[deviceKey] };
  if (DEVICES[deviceKey].platform !== "android")
    return { image: framePath(cfg, deviceKey), geom: FRAMES[deviceKey] };
  const custom = cfg.android?.frame;
  if (custom) {
    const image = resolve(cfg.root, custom.image);
    if (!existsSync(image)) throw new Error(`Frame image not found: ${image}`);
    return { image, geom: custom };
  }
  return { image: resolve(GOLDIE_ROOT, "assets", ANDROID_FRAME.file), geom: ANDROID_FRAME.geom };
}

/**
 * Absolute path to a scene's flow YAML. A name or a relative path resolves
 * against `flowsDir`; `.yaml` is added when the value has no extension.
 */
export function flowPath(cfg: LoadedConfig, flow: string): string {
  const file = flow.endsWith(".yaml") || flow.endsWith(".yml") ? flow : `${flow}.yaml`;
  return resolve(cfg.flowsDir, file);
}

/**
 * A scene's flow for one locale: `<flow>_<locale>.yaml` when it exists, else
 * the flow itself. For screens that differ by language, such as a menu sorted
 * by localized name, where the same coordinates land on a different item.
 */
export function localeFlowPath(cfg: LoadedConfig, flow: string, locale: string): string {
  const base = flowPath(cfg, flow);
  const localized = base.replace(/\.ya?ml$/, (ext) => `_${locale}${ext}`);
  return existsSync(localized) ? localized : base;
}

export const isPreview = (s: Scene): s is PreviewScene => s.kind === "preview";
export const isScreenshot = (s: Scene): s is ScreenshotScene => s.kind === "screenshot";
