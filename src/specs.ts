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
  | "iphone-duo-outer"
  | "iphone-duo-inner";

/**
 * The studio's device-type tabs. Finer than the platform: iPhones and iPads
 * share the App Store pipeline but are shown apart.
 */
export type DeviceType = "iphone" | "ipad" | "android";

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
  /**
   * Foldable iOS simulators only: the hinge posture and device orientation
   * capture sets before installing the app, after any reboot. `closed` shows
   * the cover panel, `open` the inner one. On the iPhone Duo the unfolded
   * panel shows a portrait UI only with the device turned to LandscapeLeft;
   * in Portrait the capture is the landscape UI turned 90 degrees.
   */
  fold?: {
    posture: "closed" | "open";
    orientation: "Portrait" | "LandscapeLeft" | "LandscapeRight" | "PortraitUpsideDown";
  };
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
  // The iPhone Duo's two panels, as App Store Connect sizes them. Both run on
  // the one "iPhone Duo" simulator; `fold` picks the panel. No bezel art is
  // bundled for the Duo, so both render screen-only. No preview pipeline yet.
  "iphone-duo-outer": {
    label: "Duo outer",
    platform: "ios",
    type: "iphone",
    simulatorName: "iPhone Duo",
    native: { width: 1398, height: 2034 },
    screenshot: { width: 1398, height: 2034 },
    preview: null,
    screenOnly: true,
    copyScale: 1.2,
    fold: { posture: "closed", orientation: "Portrait" },
  },
  "iphone-duo-inner": {
    label: "Duo inner",
    platform: "ios",
    type: "iphone",
    simulatorName: "iPhone Duo",
    native: { width: 2007, height: 2853 },
    screenshot: { width: 2007, height: 2853 },
    preview: null,
    screenOnly: true,
    copyScale: 1.2,
    fold: { posture: "open", orientation: "LandscapeLeft" },
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
