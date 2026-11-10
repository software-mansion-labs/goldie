import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deviceFrame, frameVariantFor, type LoadedConfig, localeFlowPath } from "./config.ts";
import { DEVICES } from "./specs.ts";

describe("iPhone Duo", () => {
  test("each panel captures at App Store Connect's iPhone Duo size", () => {
    expect(DEVICES["iphone-duo-outer"].screenshot).toEqual({ width: 1398, height: 2034 });
    expect(DEVICES["iphone-duo-inner"].screenshot).toEqual({ width: 2007, height: 2853 });
    expect(DEVICES["iphone-duo-outer"].fold).toEqual({
      posture: "closed",
      orientation: "Portrait",
    });
    expect(DEVICES["iphone-duo-inner"].fold).toEqual({
      posture: "open",
      orientation: "LandscapeLeft",
    });
  });

  test("renders screen-only: no bezel variant, no bezel image", () => {
    const cfg = { frame: { variant: "17-pro-silver" } } as unknown as LoadedConfig;
    expect(frameVariantFor(cfg, "iphone-duo-inner")).toBeNull();
    expect(deviceFrame(cfg, "iphone-duo-outer").image).toBeNull();
    expect(deviceFrame(cfg, "iphone-duo-outer").geom.screen.width).toBe(1398);
  });
});

describe("localeFlowPath", () => {
  const flowsDir = mkdtempSync(join(tmpdir(), "goldie-flows-"));
  writeFileSync(join(flowsDir, "add.yaml"), "steps: []\n");
  writeFileSync(join(flowsDir, "add_es-MX.yaml"), "steps: []\n");
  const cfg = { flowsDir } as LoadedConfig;

  test("uses <flow>_<locale>.yaml when it exists", () => {
    expect(localeFlowPath(cfg, "add", "es-MX")).toBe(join(flowsDir, "add_es-MX.yaml"));
  });

  test("falls back to the flow itself", () => {
    expect(localeFlowPath(cfg, "add", "en-US")).toBe(join(flowsDir, "add.yaml"));
    expect(localeFlowPath(cfg, "add.yaml", "de-DE")).toBe(join(flowsDir, "add.yaml"));
  });
});
