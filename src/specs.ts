/**
 * Store asset specifications.
 * iOS: App Store Connect, developer.apple.com/help/app-store-connect/reference/
 *   screenshot-specifications | app-preview-specifications. Verified 2026-08-24.
 * Android: Play Console help, "Add preview assets". Phone screenshots are
 *   PNG/JPEG, 16:9 or 9:16, each side 320-3840px for promotional eligibility.
 *   Play accepts no video uploads: the promo video is a YouTube link, so the
 *   android preview renders at a YouTube-friendly size for the user to post
 *   themselves, with no store constraints enforced.
 */

export type DeviceKey =
  | "iphone-6.9"
  | "ipad-13"
  | "pixel-10-pro"
  | "iphone-16-pro"
  | "ipad-air-11"
  | "android-tablet-11"
  | "galaxy-tab-s11-ultra"
  | "pixel-9-pro"
  | "macbook-pro-16"
  | "browser-window";

/**
 * The studio's device-type tabs. Finer than the platform: iPhones, iPads,
 * Tablets, Laptops and Browser windows can be browsed separately.
 */
export type DeviceType = "iphone" | "ipad" | "android" | "tablet" | "laptop" | "browser";

export type DeviceSpec = {
  /**
   * Display label for the studio and logs. Output paths use the DeviceKey,
   * so raw/, screenshots/ and previews/ all share one naming scheme.
   */
  label: string;
  platform: "ios" | "android";
  type: DeviceType;
  /**
   * `xcrun simctl` device type name; the toolkit picks the newest runtime that
   * has it. iOS only - android resolves a running emulator's adb serial instead.
   */
  simulatorName?: string;
  /**
   * Accepted AVD hardware profiles (`hw.device.name` in the AVD's config.ini),
   * in boot-preference order. Android only - a running emulator qualifies only
   * when its profile is listed, so captures always come from the intended
   * screen geometry. Every profile in the list must share that geometry.
   */
  avdDeviceNames?: string[];
  /**
   * Native capture resolution, portrait. null accepts the device's native
   * capture size as-is (Android emulators vary).
   */
  native: { width: number; height: number } | null;
  /** Required screenshot upload size, portrait. */
  screenshot: { width: number; height: number };
  /**
   * Preview video render size, portrait. On iOS this is the upload size Apple
   * requires; on android it is the size of the YouTube video the user posts
   * themselves (Play takes no video uploads). null: no preview pipeline.
   */
  preview: { width: number; height: number } | null;
  /** Render bare screens with the drop shadow instead of a bezel. */
  screenOnly?: true;
  /**
   * Headline and subhead size relative to the reference column's type. A tile
   * much wider than the 6.9" reference composes in a narrow column, whose type
   * reads small across the full tile. Default 1.
   */
  copyScale?: number;
};

export const DEVICES: Record<DeviceKey, DeviceSpec> = {
  "iphone-6.9": {
    label: "6.9",
    platform: "ios",
    type: "iphone",
    simulatorName: "iPhone 17 Pro Max",
    native: { width: 1320, height: 2868 },
    screenshot: { width: 1320, height: 2868 },
    preview: { width: 886, height: 1920 },
  },
  "ipad-13": {
    label: "13",
    platform: "ios",
    type: "ipad",
    simulatorName: "iPad Pro 13-inch (M4)",
    copyScale: 1.3,
    native: { width: 2064, height: 2752 },
    screenshot: { width: 2064, height: 2752 },
    preview: { width: 1200, height: 1600 },
  },
  // Framed with the bundled Pixel 10 Pro art (src/frame.ts), not the config's
  // frame variant, which is iPhone art with iPhone geometry. The Pixel 9 Pro
  // shares the 1280x2856 screen, so its emulator captures compose identically.
  "pixel-10-pro": {
    label: "Play phone",
    platform: "android",
    type: "android",
    avdDeviceNames: ["pixel_10_pro", "pixel_9_pro"],
    native: null,
    screenshot: { width: 1080, height: 1920 },
    // Near the 1280x2856 Pixel screen's aspect, so the cover-crop trims only a
    // sliver; YouTube accepts any portrait size.
    preview: { width: 1080, height: 2400 },
  },
  "iphone-16-pro": {
    label: "iPhone 16 Pro",
    platform: "ios",
    type: "iphone",
    simulatorName: "iPhone 16 Pro Max",
    native: { width: 1320, height: 2717 },
    screenshot: { width: 1320, height: 2717 },
    preview: { width: 886, height: 1920 },
  },
  "ipad-air-11": {
    label: 'iPad Air 11"',
    platform: "ios",
    type: "tablet",
    simulatorName: "iPad Air 11-inch (M2)",
    copyScale: 1.2,
    native: { width: 1640, height: 2360 },
    screenshot: { width: 1640, height: 2360 },
    preview: { width: 1116, height: 1600 },
  },
  "android-tablet-11": {
    label: 'Android Tablet 11"',
    platform: "android",
    type: "tablet",
    copyScale: 1.2,
    native: null,
    screenshot: { width: 2747, height: 1731 },
    preview: { width: 1080, height: 1728 },
  },
  "galaxy-tab-s11-ultra": {
    label: "Galaxy Tab S11 Ultra",
    platform: "android",
    type: "tablet",
    copyScale: 1.3,
    native: null,
    screenshot: { width: 2960, height: 1821 },
    preview: { width: 1080, height: 1728 },
  },
  "pixel-9-pro": {
    label: "Pixel 9 Pro",
    platform: "android",
    type: "android",
    avdDeviceNames: ["pixel_9_pro"],
    native: null,
    screenshot: { width: 1280, height: 2708 },
    preview: { width: 1080, height: 2400 },
  },
  "macbook-pro-16": {
    label: 'MacBook Pro 16"',
    platform: "ios",
    type: "laptop",
    copyScale: 1.35,
    native: { width: 3072, height: 1920 },
    screenshot: { width: 3072, height: 1920 },
    preview: null,
  },
  "browser-window": {
    label: "Browser Window",
    platform: "ios",
    type: "browser",
    copyScale: 1.2,
    native: { width: 1920, height: 1080 },
    screenshot: { width: 1920, height: 1080 },
    preview: null,
  },
};

export const DEVICE_KEYS = Object.keys(DEVICES) as DeviceKey[];

export function isDeviceKey(key: string): key is DeviceKey {
  return key in DEVICES;
}

/**
 * Preview constraints Apple enforces at upload time. Both platforms encode
 * with these settings; the duration and file-size bounds apply on iOS only
 * (the android video goes to YouTube, which imposes none that matter here).
 */
export const PREVIEW = {
  fps: 30,
  minSeconds: 15,
  maxSeconds: 30,
  /** Apple asks for 10-12 Mbps VBR on H.264. */
  videoBitrate: "11M",
  audioBitrate: "256k",
  audioSampleRate: 48000,
  maxBytes: 500 * 1024 * 1024,
} as const;

/** Screenshots may not carry an alpha channel. */
export const SCREENSHOT_PIXEL_FORMAT = "rgb24";
