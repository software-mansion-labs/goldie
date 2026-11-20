import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { FRAME_VARIANTS, variantFramePath } from "./config.ts";
import { FRAMES } from "./frame.ts";
import { compose, LAYOUTS } from "./layouts.ts";
import { DEVICE_KEYS, DEVICES } from "./specs.ts";

describe("SVG Device Mockups", () => {
  test("every device variant points to an existing asset file", () => {
    for (const variant of FRAME_VARIANTS) {
      const file = variantFramePath(variant);
      expect(existsSync(file)).toBe(true);
    }
  });

  test("all SVG variant assets load and render with valid dimensions", async () => {
    const svgVariants = FRAME_VARIANTS.filter((v) => variantFramePath(v).endsWith(".svg"));
    expect(svgVariants.length).toBeGreaterThan(0);

    for (const variant of svgVariants) {
      const file = variantFramePath(variant);
      const img = await loadImage(file);
      expect(img.width).toBeGreaterThan(0);
      expect(img.height).toBeGreaterThan(0);

      const canvas = createCanvas(100, 100);
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, 100, 100);
    }
  });

  test("tablet models are present in specs and frames", () => {
    const tabletKeys = DEVICE_KEYS.filter((k) => DEVICES[k].type === "tablet");
    expect(tabletKeys).toContain("ipad-air-11");
    expect(tabletKeys).toContain("android-tablet-11");
    expect(tabletKeys).toContain("galaxy-tab-s11-ultra");

    for (const key of tabletKeys) {
      const spec = DEVICES[key];
      const geom = FRAMES[key];
      expect(geom).toBeDefined();
      expect(geom.width).toBeGreaterThan(0);
      expect(geom.height).toBeGreaterThan(0);
      expect(geom.screen.width).toBe(spec.screenshot.width);
      expect(geom.screen.height).toBe(spec.screenshot.height);
    }
  });

  test("laptop and browser models compose cleanly", () => {
    const theme = {
      background: "#fff",
      headlineColor: "#000",
      subheadColor: "#666",
      fontFamily: "sans-serif",
      copyHeightRatio: 0.2,
      deviceWidthRatio: 0.85,
    };

    for (const key of ["macbook-pro-16", "browser-window"] as const) {
      const spec = DEVICES[key];
      const geom = FRAMES[key];
      const c = compose(LAYOUTS.classic, spec.screenshot, theme, { geom });
      expect(c.devices.length).toBe(1);
      expect(c.devices[0]!.frame.width).toBeGreaterThan(0);
      expect(c.devices[0]!.screen.width).toBeGreaterThan(0);
    }
  });
});
