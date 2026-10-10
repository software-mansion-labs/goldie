import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import * as argent from "./argent.ts";
import { exec, execOrThrow } from "./exec.ts";
import { DEVICES, type DeviceKey } from "./specs.ts";

type SimDevice = { udid: string; name: string; state: string; isAvailable?: boolean };

async function simctlDevices(): Promise<Record<string, SimDevice[]>> {
  const r = await execOrThrow("xcrun", ["simctl", "list", "devices", "available", "--json"]);
  return JSON.parse(r.stdout).devices as Record<string, SimDevice[]>;
}

const isAndroid = (key: DeviceKey) => DEVICES[key].platform === "android";

async function adbShell(serial: string, args: string[]): Promise<void> {
  await execOrThrow("adb", ["-s", serial, "shell", ...args]);
}

/** Serials of connected android devices in "device" state (booted, adb-ready). */
async function adbSerials(): Promise<string[]> {
  const r = await execOrThrow("adb", ["devices"]);
  return r.stdout
    .split("\n")
    .slice(1)
    .map((line) => line.trim().split(/\s+/))
    .filter((parts) => parts[1] === "device")
    .map((parts) => parts[0]!);
}

/**
 * SystemUI demo mode is the android equivalent of `simctl status_bar`: 9:41,
 * full battery, full signal, no notification icons. The broadcasts are
 * idempotent, so re-sending them is how the bar gets re-pinned mid-capture.
 */
async function sendDemoCommands(serial: string): Promise<void> {
  const demo = (args: string[]) =>
    adbShell(serial, ["am", "broadcast", "-a", "com.android.systemui.demo", ...args]);
  await adbShell(serial, ["settings", "put", "global", "sysui_demo_allowed", "1"]);
  await demo(["-e", "command", "enter"]);
  await demo(["-e", "command", "clock", "-e", "hhmm", "0941"]);
  await demo(["-e", "command", "battery", "-e", "level", "100", "-e", "plugged", "false"]);
  await demo([
    "-e",
    "command",
    "network",
    "-e",
    "wifi",
    "show",
    "-e",
    "level",
    "4",
    "-e",
    "fully",
    "true",
  ]);
  // Demo-mode mobile overrides are ignored on recent SystemUI when the
  // emulator reports its virtual radio, so a stray "3G" glyph survives
  // `datatype`. Hiding the mobile icon entirely matches Play screenshot
  // conventions (wifi + battery only).
  await demo(["-e", "command", "network", "-e", "mobile", "hide"]);
  await demo(["-e", "command", "notifications", "-e", "visible", "false"]);
}

/**
 * The AVD hardware profile (`hw.device.name` in config.ini) behind a running
 * emulator, or null when it cannot be read. `adb emu avd path` answers only on
 * emulator serials, which is part of the guard: a physical phone never has one.
 */
async function avdDeviceName(serial: string): Promise<string | null> {
  const r = await exec("adb", ["-s", serial, "emu", "avd", "path"], { quiet: true });
  if (r.code !== 0) return null;
  const avdPath = r.stdout.split("\n")[0]?.trim();
  if (!avdPath) return null;
  const ini = await readFile(join(avdPath, "config.ini"), "utf8").catch(() => null);
  return ini?.match(/^hw\.device\.name\s*=\s*(.+)$/m)?.[1]?.trim() ?? null;
}

/** Directory holding AVDs: $ANDROID_AVD_HOME, else ~/.android/avd. */
function avdHome(): string {
  return process.env.ANDROID_AVD_HOME || join(homedir(), ".android", "avd");
}

/**
 * Names of the local AVDs whose config.ini hardware profile is in the wanted
 * list, ordered by the list (boot preference) and then by name. The AVD name
 * is the `<name>.avd` directory basename.
 */
export async function findAvdsForProfiles(wanted: string[]): Promise<string[]> {
  const entries = await readdir(avdHome(), { withFileTypes: true }).catch(() => []);
  const byProfile = new Map<string, string[]>(wanted.map((p) => [p, []]));
  for (const entry of entries) {
    if (!entry.name.endsWith(".avd")) continue;
    const ini = await readFile(join(avdHome(), entry.name, "config.ini"), "utf8").catch(() => null);
    const profile = ini?.match(/^hw\.device\.name\s*=\s*(.+)$/m)?.[1]?.trim();
    if (profile) byProfile.get(profile)?.push(basename(entry.name, ".avd"));
  }
  return wanted.flatMap((p) => byProfile.get(p)!.sort());
}

/** AVD names matching the device's hardware profiles (doctor uses this). */
export async function matchingAvds(key: DeviceKey): Promise<string[]> {
  return findAvdsForProfiles(DEVICES[key].avdDeviceNames!);
}

/** Where Android Studio installs the SDK by default on each host. */
function defaultSdkRoot(): string {
  switch (process.platform) {
    case "darwin":
      return join(homedir(), "Library", "Android", "sdk");
    case "win32":
      return join(
        process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local"),
        "Android",
        "Sdk",
      );
    default:
      return join(homedir(), "Android", "Sdk");
  }
}

/** The emulator launcher inside the Android SDK, or null when no SDK is found. */
function emulatorBinary(): string | null {
  const roots = [process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT, defaultSdkRoot()];
  const name = process.platform === "win32" ? "emulator.exe" : "emulator";
  for (const root of roots) {
    if (!root) continue;
    const bin = join(root, "emulator", name);
    if (existsSync(bin)) return bin;
  }
  return null;
}

const BOOT_DEADLINE_MS = 180_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Serial of the running emulator whose AVD profile is in the wanted list, or null. */
async function runningSerialForProfile(wanted: string[]): Promise<string | null> {
  const emulators = (await adbSerials().catch(() => [])).filter((s) => s.startsWith("emulator-"));
  for (const serial of emulators) {
    const profile = await avdDeviceName(serial);
    if (profile && wanted.includes(profile)) return serial;
  }
  return null;
}

/**
 * Launch the AVD detached (it outlives the CLI) and wait until an emulator
 * with the wanted hardware profile is adb-ready and fully booted. Matching by
 * profile rather than tracking the spawned process keeps this idempotent when
 * a matching emulator appears by other means mid-wait.
 */
async function bootEmulator(bin: string, avdName: string, wanted: string[]): Promise<string> {
  spawn(bin, ["-avd", avdName], { detached: true, stdio: "ignore" }).unref();
  const deadline = Date.now() + BOOT_DEADLINE_MS;
  let serial: string | null = null;
  while (!serial) {
    if (Date.now() > deadline) {
      throw new Error(`Emulator "${avdName}" did not reach "device" state within 180s.`);
    }
    await sleep(2000);
    serial = await runningSerialForProfile(wanted);
  }
  while (true) {
    const r = await exec("adb", ["-s", serial, "shell", "getprop", "sys.boot_completed"], {
      quiet: true,
    });
    if (r.code === 0 && r.stdout.trim() === "1") return serial;
    if (Date.now() > deadline) {
      throw new Error(`Emulator "${avdName}" did not finish booting within 180s.`);
    }
    await sleep(2000);
  }
}

const profileList = (wanted: string[]) => wanted.map((p) => `"${p}"`).join(" or ");

/**
 * Serial of the running emulator whose AVD uses one of the spec's hardware
 * profiles. When none is running and autoBoot is on, the first matching AVD
 * is booted automatically. Physical devices are never eligible: `adb devices`
 * lists phones plugged in over USB in the same "device" state, and picking one
 * would reinstall the app over its data and rewrite its system UI.
 */
async function resolveSerial(key: DeviceKey, opts: { autoBoot?: boolean } = {}): Promise<string> {
  const wanted = DEVICES[key].avdDeviceNames!;
  const running = await runningSerialForProfile(wanted);
  if (running) return running;
  if (!(opts.autoBoot ?? true)) {
    throw new Error(
      `No running emulator uses the ${profileList(wanted)} hardware profile. ` +
        "Start one: emulator -avd <name>  (list with: emulator -list-avds)",
    );
  }
  const avds = await findAvdsForProfiles(wanted);
  if (avds.length === 0) {
    throw new Error(
      `No AVD uses the ${profileList(wanted)} hardware profile. Create one from the ` +
        `matching device definition (Android Studio > Device Manager, or ` +
        `avdmanager create avd --device ${wanted[0]}) and re-run.`,
    );
  }
  const bin = emulatorBinary();
  if (!bin) {
    throw new Error(
      "Cannot find the emulator binary. Set ANDROID_HOME (looked in $ANDROID_HOME, " +
        "$ANDROID_SDK_ROOT, ~/Library/Android/sdk).",
    );
  }
  console.log(`  booting AVD "${avds[0]}"…`);
  return bootEmulator(bin, avds[0]!, wanted);
}

/**
 * Device identifier the argent tools take in place of a UDID: a simulator
 * UDID on iOS, a running emulator's adb serial on android.
 */
export async function resolveUdid(
  key: DeviceKey,
  opts: { autoBoot?: boolean } = {},
): Promise<string> {
  if (isAndroid(key)) return resolveSerial(key, opts);
  const spec = DEVICES[key];
  const byRuntime = await simctlDevices();
  const pinned = process.env[udidEnvVar(key)];
  if (pinned) {
    const known = Object.values(byRuntime).some((devices) =>
      devices?.some((d) => d.udid === pinned),
    );
    if (!known)
      throw new Error(
        `${udidEnvVar(key)}=${pinned} is not an installed simulator (xcrun simctl list devices).`,
      );
    return pinned;
  }
  const runtimes = Object.keys(byRuntime)
    .filter((r) => r.includes("iOS"))
    .sort(compareRuntime);
  for (const runtime of runtimes) {
    const hit = byRuntime[runtime]?.find((d) => d.name === spec.simulatorName);
    if (hit) return hit.udid;
  }
  throw new Error(
    `No "${spec.simulatorName}" simulator installed. Add one in Xcode > Settings > Components, ` +
      `or run: xcrun simctl create "${spec.simulatorName}" "${spec.simulatorName}"`,
  );
}

/**
 * Env var that pins a device key to one simulator, e.g. GOLDIE_UDID_IPHONE_6_9 for "iphone-6.9". For hosts where
 * simulators are leased from a shared pool under other names, so goldie never looks one up by its model name.
 */
export function udidEnvVar(key: DeviceKey): string {
  return `GOLDIE_UDID_${key.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`;
}

/** Sorts iOS runtime identifiers newest-first ("...iOS-18-5" before "...iOS-18-3"). */
function compareRuntime(a: string, b: string): number {
  const nums = (s: string) => (s.match(/\d+/g) ?? []).map(Number);
  const [an, bn] = [nums(a), nums(b)];
  for (let i = 0; i < Math.max(an.length, bn.length); i++) {
    const d = (bn[i] ?? 0) - (an[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

export async function boot(udid: string): Promise<void> {
  await argent.run("boot-device", { udid });
}

export async function shutdown(key: DeviceKey, udid: string): Promise<void> {
  if (isAndroid(key)) {
    await exec("adb", ["-s", udid, "emu", "kill"], { quiet: true });
    return;
  }
  await exec("xcrun", ["simctl", "shutdown", udid], { quiet: true });
}

/**
 * iOS only. Autocorrect pinning has no android equivalent yet - there is no
 * per-device preference store to rewrite from the host - so typed-copy flows
 * on android should be verified by eye.
 *
 * Autocorrect and predictive text rewrite typed strings mid-flow - a title
 * typed as "Sync conflicts when editing offline" came back as
 * "Synu cofnelibysmy when emitent offline" on a simulator with a non-English
 * keyboard. Pinning the language and turning both off makes typed copy exact.
 *
 * Written straight into the shut-down device's preference store rather than
 * via `simctl spawn defaults`: preferences are read at process start, so the
 * booted-write path needs a reboot, and rebooting mid-session leaves argent's
 * transport pointed at a simulator that no longer exists (every later launch
 * then fails its native-devtools handshake).
 */
/*
 * Values are written and read back via plutil rather than through `defaults`,
 * which cannot address a simulator's global-preferences file at all: `defaults`
 * resolves ".GlobalPreferences" to NSGlobalDomain and discards the directory in
 * front of it, so the write lands on the *host* account. See
 * pinKeyboardAndLocale.
 *
 * Every value is read back with `plutil -extract <path> raw`. "json" looks
 * like the natural format for the AppleLanguages array, but plutil converts
 * the whole file before extracting, and once iOS has booted it keeps data
 * blobs in .GlobalPreferences that JSON cannot hold. The extract then exits 1,
 * the device reads as unpinned forever, and every capture rebooted it. `raw`
 * reads a scalar, so the array is checked through its first element
 * (`readPath`), which is the language iOS resolves against.
 */
type Pref = {
  domain: string;
  key: string;
  write: string[];
  /** The keypath read back, when it differs from `key`. */
  readPath?: string;
  expect: string;
};

function keyboardAndLocalePrefs(locale: string): Pref[] {
  // The whole tag, region included. Dropping the region leaves iOS to choose
  // between an app's regional variants on its own, and for Spanish it chooses
  // by preference order rather than by AppleLocale: AppleLanguages ("es") with
  // AppleLocale es_MX resolved to es-ES.lproj, so a capture requested as es-MX
  // came back saying "ITV" - Spain's roadworthiness test - in an app whose
  // Mexican strings say "verificación vehicular".
  //
  // A tag with no region, like "ru", is unchanged by this. A tag whose region
  // the app does not carry, like "de-DE" against a bundle holding only
  // de.lproj, still falls back to the language - that fallback is what
  // resolution is for, and it is why the region was safe to include.
  const language = locale;
  const off = (domain: string, key: string): Pref => ({
    domain,
    key,
    write: ["-bool", "false"],
    expect: "false",
  });
  return [
    off("com.apple.Preferences", "KeyboardAutocorrection"),
    off("com.apple.Preferences", "KeyboardPrediction"),
    off("com.apple.Preferences", "KeyboardAutocapitalization"),
    off("com.apple.keyboard.preferences", "KeyboardAutocorrection"),
    off("com.apple.keyboard.preferences", "KeyboardPrediction"),
    {
      domain: ".GlobalPreferences",
      key: "AppleLocale",
      write: ["-string", locale.replace("-", "_")],
      expect: locale.replace("-", "_"),
    },
    {
      domain: ".GlobalPreferences",
      key: "AppleLanguages",
      write: ["-json", JSON.stringify([language])],
      readPath: "AppleLanguages.0",
      expect: language,
    },
  ];
}

function prefsDir(udid: string): string {
  return join(
    homedir(),
    "Library/Developer/CoreSimulator/Devices",
    udid,
    "data/Library/Preferences",
  );
}

function plistPath(udid: string, domain: string): string {
  return join(prefsDir(udid), `${domain}.plist`);
}

/**
 * `plutil` rather than `defaults`, because `defaults` cannot address this file.
 *
 * `defaults write <dir>/.GlobalPreferences AppleLanguages ...` reads like a
 * path, but ".GlobalPreferences" is one of the domain names `defaults`
 * recognises specially: it resolves to NSGlobalDomain, the directory in front
 * of it is discarded, and the write lands on the *host* account. Asking goldie
 * for de-DE therefore set the developer's own Mac to German and left the
 * simulator in whatever language it already had.
 *
 * keyboardAndLocalePinned then read the value back through the same broken
 * path, found the one it had just written to the host, and reported the device
 * as pinned. Both halves agreed, so the run went green and the screenshots came
 * out in the wrong language - with the host's language settings changed as a
 * side effect, which is the part worth fixing quickly.
 *
 * plutil takes a file and only a file, so there is no domain for it to be
 * confused with.
 */
export async function pinKeyboardAndLocale(udid: string, locale: string): Promise<void> {
  // A simulator that has never been booted has no Preferences directory, and
  // plutil -create does not make missing parents.
  await mkdir(prefsDir(udid), { recursive: true });
  for (const pref of keyboardAndLocalePrefs(locale)) {
    const path = plistPath(udid, pref.domain);
    // -replace needs a plist to replace into, and a simulator that has never
    // had this domain written has no file for it.
    if (!existsSync(path)) await execOrThrow("plutil", ["-create", "xml1", path]);
    await execOrThrow("plutil", ["-replace", pref.key, ...pref.write, path]);
  }
}

/** Does the device's preference store already hold every pinned value? */
async function keyboardAndLocalePinned(udid: string, locale: string): Promise<boolean> {
  for (const pref of keyboardAndLocalePrefs(locale)) {
    const path = plistPath(udid, pref.domain);
    if (!existsSync(path)) return false;
    const r = await exec(
      "plutil",
      ["-extract", pref.readPath ?? pref.key, "raw", "-o", "-", path],
      {
        quiet: true,
      },
    );
    if (r.code !== 0) return false;
    if (r.stdout.trim() !== pref.expect) return false;
  }
  return true;
}

/**
 * Pin the status bar to the marketing state: 9:41, full battery, full signal.
 * argent pins it only during snapshot runs and exposes no tool for it, so this
 * shells out to simctl (iOS) or SystemUI demo mode (android) directly. Must
 * run after boot. Idempotent on both platforms.
 */
export async function pinStatusBar(key: DeviceKey, udid: string): Promise<void> {
  if (isAndroid(key)) return sendDemoCommands(udid);
  await execOrThrow("xcrun", [
    "simctl",
    "status_bar",
    udid,
    "override",
    "--time",
    "9:41",
    "--batteryState",
    "charged",
    "--batteryLevel",
    "100",
    "--wifiMode",
    "active",
    "--wifiBars",
    "3",
    "--cellularMode",
    "active",
    "--cellularBars",
    "4",
    "--dataNetwork",
    "5g",
  ]);
}

export async function clearStatusBar(key: DeviceKey, udid: string): Promise<void> {
  if (isAndroid(key)) {
    await exec(
      "adb",
      [
        "-s",
        udid,
        "shell",
        "am",
        "broadcast",
        "-a",
        "com.android.systemui.demo",
        "-e",
        "command",
        "exit",
      ],
      { quiet: true },
    );
    return;
  }
  await exec("xcrun", ["simctl", "status_bar", udid, "clear"], { quiet: true });
}

export async function setAppearance(
  key: DeviceKey,
  udid: string,
  appearance: "light" | "dark",
): Promise<void> {
  if (isAndroid(key)) {
    await adbShell(udid, ["cmd", "uimode", "night", appearance === "dark" ? "yes" : "no"]);
    return;
  }
  await execOrThrow("xcrun", ["simctl", "ui", udid, "appearance", appearance]);
}

/** Is the device booted right now? */
async function isBooted(key: DeviceKey, udid: string): Promise<boolean> {
  if (isAndroid(key)) return (await adbSerials().catch(() => [] as string[])).includes(udid);
  const byRuntime = await simctlDevices();
  for (const list of Object.values(byRuntime)) {
    const hit = list.find((d) => d.udid === udid);
    if (hit) return hit.state === "Booted";
  }
  return false;
}

/**
 * Bring the device to a known state, reusing the running simulator when it is
 * already in one. A reboot is only worth its cost when the preference store
 * needs rewriting: preferences are read at process start, so a booted device
 * whose keyboard and locale are already pinned needs nothing but the appearance
 * and status bar applied. Rebooting also drops argent's transport session, so
 * an unnecessary one costs a tool-server restart on top of the boot itself.
 */
export async function prepare(
  key: DeviceKey,
  udid: string,
  locale: string,
  appearance: "light" | "dark",
): Promise<void> {
  if (isAndroid(key)) {
    // No keyboard/locale pinning here (see keyboardAndLocalePrefs); the
    // emulator just gets the appearance and the demo-mode status bar.
    if (!(await isBooted(key, udid)))
      throw new Error(`Emulator ${udid} is no longer in "device" state.`);
    await setAppearance(key, udid, appearance);
    await pinStatusBar(key, udid);
    return;
  }
  const booted = await isBooted(key, udid);
  if (!booted || !(await keyboardAndLocalePinned(udid, locale))) {
    if (booted) console.log("  rebooting to pin the keyboard and locale");
    await argent.run("stop-simulator-server", { udid }).catch(() => {});
    await shutdown(key, udid);
    await pinKeyboardAndLocale(udid, locale);
    await boot(udid);
    await argent.restartServer();
  }
  await setAppearance(key, udid, appearance);
  await pinStatusBar(key, udid);
}

export async function warmUp(udid: string, bundleId: string): Promise<void> {
  await argent.run("launch-app", { udid, bundleId }).catch(() => {});
  await argent.run("await-screen-idle", { udid, timeoutMs: 60000 }).catch(() => {});
}

export async function installApp(udid: string, appPath: string, bundleId: string): Promise<void> {
  await argent.run("reinstall-app", { udid, bundleId, appPath });
}
