import { describe, expect, test } from "bun:test";
import { udidEnvVar } from "./device.ts";

describe("udidEnvVar", () => {
  test("names one variable per device key", () => {
    expect(udidEnvVar("iphone-6.9")).toBe("GOLDIE_UDID_IPHONE_6_9");
    expect(udidEnvVar("ipad-13")).toBe("GOLDIE_UDID_IPAD_13");
  });
});
