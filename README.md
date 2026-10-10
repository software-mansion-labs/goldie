# Goldie: App Store screenshot generator for coding agents (and humans)

goldie makes App Store and Google Play screenshots, and App Store preview
videos, for a mobile app.
[argent](https://github.com/software-mansion/argent) replays flows on an iOS
simulator or an Android emulator. goldie frames the captures with a device
bezel, a background and a headline. It joins the clips into a preview video.
It checks the result against the upload rules of the stores.

goldie is framework agnostic. It drives the app through the simulator or the
emulator. It works the same for SwiftUI, UIKit, Jetpack Compose, Flutter,
React Native and Kotlin Multiplatform apps.

## Install

You need Node 20 or newer and ffmpeg on the PATH. App Store screenshots need
macOS with iOS simulators (Xcode). Google Play screenshots need an Android
emulator, which works on macOS, Linux and Windows. On Linux, argent needs
[a few extra packages](https://github.com/software-mansion/argent#linux-host-extra-prerequisites-for-android-emulators)
for Android emulators. On a Linux or Windows machine keep only `pixel-10-pro`
in `devices`; `goldie doctor` says so when an iOS device is configured on a
host that cannot run it.

Install the CLI:

```
npm i -g goldie
```

Add the skill to your coding agent:

```
npx skills add kacperkapusciak/goldie            # Cursor, Codex, any agent

/plugin marketplace add kacperkapusciak/goldie   # Claude Code
/plugin install goldie@goldie
```

The skill works with all agents that support the skills format.

## Use with a coding agent

Ask from your app repo:

```
create app store screenshots using goldie
```

The agent asks which stores to target. It explores the app, writes the flows
and the config, and opens the studio. Follow-ups such as `use a dark
background` edit the same files.

## Use by hand

Copy `goldie.config.example.ts` to `goldie.config.ts`. Point its scenes at
argent flows in `.argent/flows`. Then run:

```
goldie doctor     Check tools, simulators and flows
goldie all        Capture, frame, render the preview and verify
goldie studio     Preview and tweak the assets in the browser
```

The output goes to `out/screenshots/<device>/<locale>/` and
`out/previews/<device>/<locale>/`. The iPhone gets 1320 x 2868 screenshots
and an 886 x 1920 H.264 preview. Google Play gets 1080 x 1920 screenshots.
A preview must run 15 to 30 seconds. Add `"ipad-13"` to `devices` for
13" iPad screenshots (2064 x 2752) and a 1200 x 1600 preview from the same
flows, each device with its own bezels, captures and output folder.

Every locale renders from one capture run in the first locale, which suits
apps whose screens look the same in every language. Set
`localizedCaptures: true` to capture each locale in its own language instead:
`capture` replays the flows once per locale with the simulator pinned to it,
into `out/raw/<device>/<locale>/`, and each locale's screenshots, preview and
studio view use its own captures. It applies to iOS devices; Android emulators
keep one shared capture.

## Google Play

The `pixel-10-pro` device key renders Google Play phone screenshots
(1080 x 1920) from the same scenes. The example config already lists this
key. Remove it from `devices` for an iOS-only run. Argent flows also replay
on Android, so the scene flows are shared. A flow works on both platforms
when its selectors match. The captures come from an Android emulator. Its
AVD must use the Pixel 10 Pro or the Pixel 9 Pro hardware profile (both have
a 1280 x 2856 screen). goldie reuses a running emulator that matches, or
boots the AVD itself. Create the AVD from either device definition
(Android Studio > Device Manager). Then add the build to the config:

```ts
devices: ["iphone-6.9", "pixel-10-pro"],
android: {
  appPath: "/path/to/app-release.apk",
  applicationId: "com.example.app",
},
```

goldie frames Android tiles with the bundled Pixel 10 Pro bezel. The `frame`
variant is iPhone art, so it does not apply to them. `android.frame` swaps
in your own art and its geometry. The Play Store promo video is a YouTube
link, so `preview` and `all` record the preview scene on the emulator and
render a portrait video for you to post on YouTube yourself. Apple's 15-30
second window does not apply to it.

## Design

https://github.com/user-attachments/assets/d6171a90-8fc1-437b-a574-5a8547068a3c

The studio switches devices, backgrounds, templates, bezel, fonts and
per-tile copy. It saves the choices to `goldie.design.json`, so the CLI
renders the same result. The config also takes:

- `frame`: `17-pro-blue`, `17-pro-silver`, `17-pro-orange` for the iPhone,
  `ipad-pro-13-silver`, `ipad-pro-13-space-gray` for the iPad (one variant,
  or one per device key), or a custom bezel image; `theme.screenOnly: true`
  removes it.
- `theme.template`: `editorial`, `showcase`, `magazine`, `storyboard`,
  `dynamic`, or your own layout sequence from `classic`, `copy-below`, `hero`,
  `offset`, `tilt`, `tilt-right`, `duo`, `duo-tilt`, `panorama`,
  `panorama-duo`, `minimal`.
- `theme.fontFamily`: a CSS font stack. Merriweather, DM Mono, Lato, DM Sans,
  Montserrat, Noto Sans SC (Simplified Chinese) and Noto Sans Arabic are
  bundled; the two Noto faces are also appended to every stack as a per-glyph
  fallback, so Chinese and Arabic copy draws whatever font you name.
- `theme.fontFiles`: typefaces of your own, registered alongside the bundled
  ones so `fontFamily` can name them. Needed for a brand font, and for any
  script the bundled families do not cover - the copy is drawn with skia, not a
  browser, so an unregistered family exports as tofu boxes rather than falling
  back. Paths are relative to the config.

  ```ts
  fontFiles: [
    { family: "Zain", files: { 400: "../assets/fonts/Zain-Regular.ttf",
                               700: "../assets/fonts/Zain-Bold.ttf" } },
  ],
  fontFamily: "Zain",
  ```
- `decorations`: badges or images layered behind the device.

## Remarks

- goldie picks the simulator named after the device ("iPhone 17 Pro Max",
  "iPad Pro 13-inch (M4)"). To use another simulator of the same screen size,
  for example one leased from a shared pool, set `GOLDIE_UDID_IPHONE_6_9` or
  `GOLDIE_UDID_IPAD_13` to its UDID.

- Use a Release build. Debug builds paint LogBox banners into the captures.
- Flows fail when the app changes. Ask the coding agent to repair them, or
  re-record them with argent.

## Sponsored by Software Mansion

goldie is sponsored by [Software Mansion](https://swmansion.com), the
software agency that created [Argent](https://github.com/software-mansion/argent).
You can [hire Software Mansion](https://swmansion.com/contact) for your next project.

<a href="https://swmansion.com"><img src="assets/software-mansion-logo-positive-s-left-top@1x.png" alt="Software Mansion" width="200" /></a>
