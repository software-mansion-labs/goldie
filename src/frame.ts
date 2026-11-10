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
    width: 2247,
    height: 2932,
    screen: { x: 98, y: 104, width: 2046, height: 2730 },
    screenRadius: 36,
  },
  "pixel-10-pro": ANDROID_FRAME.geom,
  // Screen-only devices: only the screen box and corner radius are used.
  "iphone-duo-outer": {
    width: 1398,
    height: 2034,
    screen: { x: 0, y: 0, width: 1398, height: 2034 },
    screenRadius: 150,
  },
  "iphone-duo-inner": {
    width: 2007,
    height: 2853,
    screen: { x: 0, y: 0, width: 2007, height: 2853 },
    screenRadius: 120,
  },
};

/** The iPhone geometry, which compose() uses when no device is given. */
export const FRAME = FRAMES["iphone-6.9"];
