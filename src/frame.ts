import type { DeviceKey } from "./specs.ts";

/**
 * Geometry of a device's bezel PNGs in assets/: the image and the transparent
 * screen cutout inside it, both in the source PNG's own pixels. Every variant
 * of a device shares its geometry, and every PNG is trimmed to the device
 * itself, so a layout's `widthRatio` means the same size on every device.
 * Measured from the alpha channel; re-measure if custom bezel art is used
 * instead. Layouts built on it live in layouts.ts.
 */
export type FrameGeometry = {
  width: number;
  height: number;
  screen: { x: number; y: number; width: number; height: number };
  /**
   * Corner radius of the screen cutout. The bezel ring is thinner than this
   * radius, so square screen content would poke past the device's outer corner;
   * the compositor clips the content with the scaled radius instead.
   */
  screenRadius: number;
};

/** The 17-pro-* variants. */
const IPHONE_FRAME: FrameGeometry = {
  width: 606,
  height: 1252,
  screen: { x: 24, y: 21, width: 557, height: 1210 },
  screenRadius: 82,
};

/**
 * The android device's bundled bezel art and its geometry: the Pixel 10 Pro
 * emulator skin's `back.webp` from the Android SDK, with the display punched
 * transparent. The image box and screen cutout come from the skin's own
 * `layout` file (display 1280x2856 at 59,60); the cutout radius is measured
 * from the punched alpha. A config's `android.frame` overrides it.
 */
export const ANDROID_FRAME = {
  /** The art's file name in goldie's own assets/. */
  file: "pixel-10-pro.webp",
  geom: {
    width: 1410,
    height: 2968,
    screen: { x: 59, y: 60, width: 1280, height: 2856 },
    screenRadius: 178,
  },
} as const;

export const FRAMES: Record<DeviceKey, FrameGeometry> = {
  "iphone-6.9": IPHONE_FRAME,
  /** The ipad-pro-13-* variants. */
  "ipad-13": {
    width: 2264,
    height: 2952,
    screen: { x: 100, y: 100, width: 2064, height: 2752 },
    screenRadius: 36,
  },
  "pixel-10-pro": ANDROID_FRAME.geom,
  "iphone-16-pro": {
    width: 1520,
    height: 3068,
    screen: { x: 100, y: 251, width: 1320, height: 2717 },
    screenRadius: 100,
  },
  "ipad-air-11": {
    width: 1880,
    height: 2600,
    screen: { x: 120, y: 120, width: 1640, height: 2360 },
    screenRadius: 40,
  },
  "android-tablet-11": {
    width: 3147,
    height: 2131,
    screen: { x: 200, y: 200, width: 2747, height: 1731 },
    screenRadius: 48,
  },
  "galaxy-tab-s11-ultra": {
    width: 3360,
    height: 2248,
    screen: { x: 200, y: 229, width: 2960, height: 1821 },
    screenRadius: 36,
  },
  "pixel-9-pro": {
    width: 1620,
    height: 3136,
    screen: { x: 170, y: 290, width: 1280, height: 2708 },
    screenRadius: 96,
  },
  "macbook-pro-16": {
    width: 3450,
    height: 2260,
    screen: { x: 189, y: 70, width: 3072, height: 1920 },
    screenRadius: 16,
  },
  "browser-window": {
    width: 1928,
    height: 1164,
    screen: { x: 4, y: 80, width: 1920, height: 1080 },
    screenRadius: 4,
  },
};

/** The iPhone geometry, which compose() uses when no device is given. */
export const FRAME = FRAMES["iphone-6.9"];
