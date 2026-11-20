import { CheckIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Design, LayoutEntry } from "../manifest";
import { FontPicker } from "./FontPicker";
import { Field, Select } from "./Sidebar";
import { TemplatePicker } from "./TemplatePicker";

/**
 * The design controls: background, font, template, fallback layout, and
 * whether the captures sit in a bezel (and which one). All are plain React
 * state owned by the App - the strip composites them in the browser, so
 * every change repaints instantly. Nothing runs until Export.
 */

/** The background value that exports with an alpha channel instead of a fill. */
export const TRANSPARENT = "transparent";

/** A checkerboard standing in for a transparent background in the UI. */
export const CHECKERBOARD = "repeating-conic-gradient(#c8c8c8 0 25%, #f4f4f4 0 50%) 0 0/12px 12px";

const GRADIENTS: Array<{ name: string; css: string }> = [
  { name: "Arctic", css: "linear-gradient(160deg, #E8F1FF 0%, #F7FAFF 55%, #FFFFFF 100%)" },
  { name: "Peach", css: "linear-gradient(160deg, #FFE8D6 0%, #FFF7F0 55%, #FFFFFF 100%)" },
  { name: "Mint", css: "linear-gradient(160deg, #D9F9EF 0%, #F2FDF9 55%, #FFFFFF 100%)" },
  { name: "Lavender", css: "linear-gradient(160deg, #E9E4FF 0%, #F7F5FF 55%, #FFFFFF 100%)" },
  { name: "Sand", css: "linear-gradient(160deg, #F7ECDD 0%, #FCF7F0 55%, #FFFFFF 100%)" },
  { name: "Blush", css: "linear-gradient(160deg, #FFE0E9 0%, #FFF5F8 55%, #FFFFFF 100%)" },
  { name: "Lemon", css: "linear-gradient(160deg, #FFF3C4 0%, #FFFBEB 55%, #FFFFFF 100%)" },
  { name: "Silver", css: "linear-gradient(160deg, #E2E8F0 0%, #F1F5F9 55%, #FFFFFF 100%)" },
  { name: "Ocean", css: "linear-gradient(160deg, #0EA5E9 0%, #2563EB 100%)" },
  { name: "Ember", css: "linear-gradient(160deg, #F97316 0%, #DC2626 100%)" },
  { name: "Forest", css: "linear-gradient(160deg, #059669 0%, #065F46 100%)" },
  { name: "Midnight", css: "linear-gradient(160deg, #1E293B 0%, #0F172A 100%)" },
  { name: "Grape", css: "linear-gradient(160deg, #8B5CF6 0%, #4C1D95 100%)" },
  { name: "Berry", css: "linear-gradient(160deg, #EC4899 0%, #831843 100%)" },
  { name: "Aurora", css: "linear-gradient(160deg, #0D9488 0%, #1E3A8A 100%)" },
  { name: "Graphite", css: "linear-gradient(160deg, #3F3F46 0%, #18181B 100%)" },
  { name: "Sky", css: "linear-gradient(160deg, #BAE6FD 0%, #E0F2FE 55%, #FFFFFF 100%)" },
  { name: "Rose", css: "linear-gradient(160deg, #FDA4AF 0%, #FFE4E6 60%, #FFFFFF 100%)" },
  { name: "Sunset", css: "linear-gradient(160deg, #F59E0B 0%, #EF4444 55%, #7C3AED 100%)" },
  { name: "Coral", css: "linear-gradient(160deg, #FB7185 0%, #F97316 100%)" },
  { name: "Teal", css: "linear-gradient(160deg, #2DD4BF 0%, #0F766E 100%)" },
  { name: "Cobalt", css: "linear-gradient(160deg, #3B82F6 0%, #1E1B4B 100%)" },
];

/** Shade labels matching the Tailwind scales below, lightest first. */
const SHADE_STEPS = ["50", "100", "200", "300", "400", "500", "600", "700", "800", "900", "950"];

/** The Tailwind color scales behind the solid swatches' shade popunders. */
const TAILWIND: Record<string, string[]> = {
  // biome-ignore format: one scale per line reads better
  slate: ["#F8FAFC", "#F1F5F9", "#E2E8F0", "#CBD5E1", "#94A3B8", "#64748B", "#475569", "#334155", "#1E293B", "#0F172A", "#020617"],
  // biome-ignore format: one scale per line reads better
  zinc: ["#FAFAFA", "#F4F4F5", "#E4E4E7", "#D4D4D8", "#A1A1AA", "#71717A", "#52525B", "#3F3F46", "#27272A", "#18181B", "#09090B"],
  // biome-ignore format: one scale per line reads better
  red: ["#FEF2F2", "#FEE2E2", "#FECACA", "#FCA5A5", "#F87171", "#EF4444", "#DC2626", "#B91C1C", "#991B1B", "#7F1D1D", "#450A0A"],
  // biome-ignore format: one scale per line reads better
  orange: ["#FFF7ED", "#FFEDD5", "#FED7AA", "#FDBA74", "#FB923C", "#F97316", "#EA580C", "#C2410C", "#9A3412", "#7C2D12", "#431407"],
  // biome-ignore format: one scale per line reads better
  amber: ["#FFFBEB", "#FEF3C7", "#FDE68A", "#FCD34D", "#FBBF24", "#F59E0B", "#D97706", "#B45309", "#92400E", "#78350F", "#451A03"],
  // biome-ignore format: one scale per line reads better
  lime: ["#F7FEE7", "#ECFCCB", "#D9F99D", "#BEF264", "#A3E635", "#84CC16", "#65A30D", "#4D7C0F", "#3F6212", "#365314", "#1A2E05"],
  // biome-ignore format: one scale per line reads better
  emerald: ["#ECFDF5", "#D1FAE5", "#A7F3D0", "#6EE7B7", "#34D399", "#10B981", "#059669", "#047857", "#065F46", "#064E3B", "#022C22"],
  // biome-ignore format: one scale per line reads better
  cyan: ["#ECFEFF", "#CFFAFE", "#A5F3FC", "#67E8F9", "#22D3EE", "#06B6D4", "#0891B2", "#0E7490", "#155E75", "#164E63", "#083344"],
  // biome-ignore format: one scale per line reads better
  blue: ["#EFF6FF", "#DBEAFE", "#BFDBFE", "#93C5FD", "#60A5FA", "#3B82F6", "#2563EB", "#1D4ED8", "#1E40AF", "#1E3A8A", "#172554"],
  // biome-ignore format: one scale per line reads better
  violet: ["#F5F3FF", "#EDE9FE", "#DDD6FE", "#C4B5FD", "#A78BFA", "#8B5CF6", "#7C3AED", "#6D28D9", "#5B21B6", "#4C1D95", "#2E1065"],
  // biome-ignore format: one scale per line reads better
  fuchsia: ["#FDF4FF", "#FAE8FF", "#F5D0FE", "#F0ABFC", "#E879F9", "#D946EF", "#C026D3", "#A21CAF", "#86198F", "#701A75", "#4A044E"],
};

const SOLIDS: Array<{ name: string; css: string; family?: string }> = [
  { name: "White", css: "#FFFFFF" },
  { name: "Cream", css: "#FAF6EE" },
  { name: "Ash", css: "#E2E8F0", family: "slate" },
  { name: "Slate", css: "#64748B", family: "slate" },
  { name: "Charcoal", css: "#27272A", family: "zinc" },
  { name: "Black", css: "#000000" },
  { name: "Navy", css: "#1E3A8A", family: "blue" },
  { name: "Blue", css: "#2563EB", family: "blue" },
  { name: "Cyan", css: "#06B6D4", family: "cyan" },
  { name: "Emerald", css: "#10B981", family: "emerald" },
  { name: "Lime", css: "#84CC16", family: "lime" },
  { name: "Amber", css: "#F59E0B", family: "amber" },
  { name: "Tangerine", css: "#EA580C", family: "orange" },
  { name: "Crimson", css: "#DC2626", family: "red" },
  { name: "Fuchsia", css: "#D946EF", family: "fuchsia" },
  { name: "Violet", css: "#7C3AED", family: "violet" },
];

/**
 * The display name for a background: a preset's name, a Tailwind shade like
 * "Blue 400" when it came from a shade popunder, else undefined (custom).
 */
function backgroundName(background: string): string | undefined {
  const preset = PRESETS.find((p) => p.css === background);
  if (preset) return preset.name;
  const hex = background.toUpperCase();
  for (const [family, shades] of Object.entries(TAILWIND)) {
    const i = shades.indexOf(hex);
    if (i !== -1) return `${family[0].toUpperCase()}${family.slice(1)} ${SHADE_STEPS[i]}`;
  }
  return undefined;
}

const PRESETS: Array<{ name: string; css: string }> = [
  ...GRADIENTS,
  ...SOLIDS,
  { name: "Transparent", css: TRANSPARENT },
];

/** Display names and bezel tints for the bundled variants; unknown slugs fall back to the slug. */
const FRAME_META: Record<string, { label: string; tint: string }> = {
  "17-pro-silver": { label: "Silver", tint: "#D8D9DD" },
  "17-pro-blue": { label: "Deep Blue", tint: "#2B3A5C" },
  "17-pro-orange": { label: "Cosmic Orange", tint: "#E0662F" },
  "ipad-pro-13-silver": { label: "Silver", tint: "#D8D9DD" },
  "ipad-pro-13-space-gray": { label: "Space Gray", tint: "#53565A" },
  "ipad-pro-13-space-black": { label: "Space Black", tint: "#28292C" },

  // iPad Air 11 (Tablet)
  "ipad-air-11-space-gray": { label: "Space Gray", tint: "#44464A" },
  "ipad-air-11-starlight": { label: "Starlight", tint: "#EBE6DB" },
  "ipad-air-11-blue": { label: "Sky Blue", tint: "#98B7C7" },
  "ipad-air-11-purple": { label: "Light Purple", tint: "#B5AFC9" },

  // Android Tablet 11 (Tablet)
  "android-tablet-porcelain": { label: "Porcelain White", tint: "#F2F0EB" },
  "android-tablet-hazel": { label: "Hazel Green", tint: "#575E58" },
  "galaxy-tab-s11-ultra": { label: "Graphite Black", tint: "#2B2C30" },

  // iPhone 16 Pro (Phone)
  "iphone-16-pro-natural": { label: "Natural Titanium", tint: "#98948D" },
  "iphone-16-pro-desert": { label: "Desert Titanium", tint: "#C2AB95" },
  "iphone-16-pro-black": { label: "Black Titanium", tint: "#323335" },
  "iphone-16-pro-white": { label: "White Titanium", tint: "#F2F2F4" },

  // Pixel 9 Pro (Phone)
  "pixel-9-pro-obsidian": { label: "Obsidian Black", tint: "#323438" },
  "pixel-9-pro-porcelain": { label: "Porcelain", tint: "#EAE8E3" },
  "pixel-9-pro-hazel": { label: "Hazel", tint: "#697268" },

  // MacBook Pro 16 (Laptop)
  "macbook-pro-16-space-black": { label: "Space Black", tint: "#28292D" },
  "macbook-pro-16-silver": { label: "Silver", tint: "#E4E5E9" },

  // Browser Window
  "browser-light": { label: "Clean Window (Light)", tint: "#F1F2F5" },
  "browser-dark": { label: "Clean Window (Dark)", tint: "#1E1E22" },
};

/** The studio's "System" font choice; mirrors SYSTEM_FONT in src/fonts.ts. */
const SYSTEM_FONT = '-apple-system, "SF Pro Display", system-ui, sans-serif';

export function DesignPanel({
  design,
  device,
  deviceFrame,
  background,
  frame,
  fontFamily,
  template,
  layout,
  screenOnly,
  onBackground,
  onFrame,
  onFontFamily,
  onTemplate,
  onLayout,
  onScreenOnly,
}: {
  design: Design;
  /** The device on show; the frame choices are the variants drawn for it. */
  device: string;
  /** The shown device brings its own bezel art (android), so the frame picker does not apply. */
  deviceFrame: boolean;
  background: string;
  frame: string;
  fontFamily: string;
  template: string;
  layout: string;
  screenOnly: boolean;
  onBackground: (v: string) => void;
  onFrame: (v: string) => void;
  onFontFamily: (v: string) => void;
  onTemplate: (v: string) => void;
  onLayout: (v: string) => void;
  onScreenOnly: (v: boolean) => void;
}) {
  // Each choice is a full CSS font stack, so the Strip can use it as-is. A
  // config stack that matches none of them shows as "custom (from config)".
  const fontOptions: Array<[string, string]> = [
    [SYSTEM_FONT, "System (SF Pro)"],
    ...design.fonts.map((f): [string, string] => [`"${f.family}", ${f.fallback}`, f.family]),
  ];
  if (!fontOptions.some(([css]) => css === fontFamily)) {
    fontOptions.push([fontFamily, "custom (from config)"]);
  }

  const bgName = backgroundName(background);
  // The tab only tracks which palette the user is browsing; a hex background
  // starts on the solids tab, everything else (gradients, custom) on gradients.
  const [backgroundTab, setBackgroundTab] = useState(
    background.startsWith("#") ? "solids" : "gradients",
  );
  const swatches: Array<{ name: string; css: string; family?: string }> =
    backgroundTab === "solids" ? SOLIDS : GRADIENTS;
  const variants = design.frameVariants.filter((v) => v.device === device).map((v) => v.key);
  const custom = design.frames[device] === null;
  const frameChoices: Array<[string, string]> = [
    ...variants.map((v): [string, string] => [v, FRAME_META[v]?.label ?? v]),
    ...(custom ? [["", "Custom (from config)"] as [string, string]] : []),
  ];
  const showFrames = !screenOnly && !deviceFrame && (variants.length > 1 || custom);

  return (
    <div className="flex flex-col gap-5 px-5 py-5">
      <Field label="Background" hint={bgName ?? "Custom"}>
        <Tabs value={backgroundTab} onValueChange={setBackgroundTab}>
          <TabsList className="w-full">
            <TabsTrigger value="gradients">Gradients</TabsTrigger>
            <TabsTrigger value="solids">Solid colors</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="grid grid-cols-6 gap-1.5">
          {swatches.map((p) =>
            p.family ? (
              <ShadeSwatch
                key={p.name}
                name={p.name}
                css={p.css}
                family={p.family}
                background={background}
                onChange={onBackground}
              />
            ) : (
              <Swatch
                key={p.name}
                name={p.name}
                css={p.css}
                selected={background === p.css}
                onClick={() => onBackground(p.css)}
              />
            ),
          )}
          <Swatch
            name="Transparent"
            css={TRANSPARENT}
            selected={background === TRANSPARENT}
            onClick={() => onBackground(TRANSPARENT)}
          />
          <CustomBackground
            background={background}
            solid={backgroundTab === "solids"}
            selected={!bgName}
            onChange={onBackground}
          />
        </div>
      </Field>

      <Field label="Font">
        <FontPicker value={fontFamily} onChange={onFontFamily} options={fontOptions} />
      </Field>

      <Field label="Template">
        <TemplatePicker design={design} value={template} layout={layout} onChange={onTemplate} />
      </Field>

      {template === "" ? (
        <Field label="Tile layout">
          <Select value={layout} onChange={onLayout} options={layoutOptions(design.layouts)} />
        </Field>
      ) : null}

      <Field label="Frame">
        <Tabs
          value={screenOnly ? "screen" : "bezel"}
          onValueChange={(v) => onScreenOnly(v === "screen")}
        >
          <TabsList className="w-full">
            <TabsTrigger value="bezel">Bezel</TabsTrigger>
            <TabsTrigger value="screen">Screen only</TabsTrigger>
          </TabsList>
        </Tabs>
        {showFrames ? (
          <div className="mt-1 flex flex-col gap-1">
            {frameChoices.map(([key, label]) => (
              <FrameOption
                key={key || "custom"}
                label={label}
                tint={FRAME_META[key]?.tint}
                selected={frame === key}
                onClick={() => onFrame(key)}
              />
            ))}
          </div>
        ) : null}
      </Field>
    </div>
  );
}

/** Select options for the layouts; a two-tile layout says so. */
export function layoutOptions(layouts: LayoutEntry[]): Array<[string, string]> {
  return layouts.map((l) => [l.key, l.span > 1 ? `${l.label} · 2 tiles` : l.label]);
}

const swatchClass =
  "swatch-edge relative aspect-square w-full rounded-lg transition-[transform,box-shadow] duration-150 hover:scale-[1.04] focus-visible:outline-none";

function Swatch({
  name,
  css,
  selected,
  onClick,
}: {
  name: string;
  css: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={name}
      aria-label={name}
      aria-pressed={selected}
      onClick={onClick}
      style={{ background: css === TRANSPARENT ? CHECKERBOARD : css }}
      className={`${swatchClass} ${selected ? "ring-2 ring-primary ring-offset-2 ring-offset-sidebar" : "focus-visible:ring-2 focus-visible:ring-ring"}`}
    >
      {selected ? <SelectedMark dark={isLight(css)} /> : null}
    </button>
  );
}

/**
 * A solid swatch backed by a Tailwind color: clicking picks its default hex,
 * and the family's full 50-950 shade strip opens in a rectangular popunder.
 * Radix's HoverCard supplies the hover-intent behavior - an open delay so a
 * pass-through never flashes the strip, a close delay that tolerates the gap
 * between swatch and strip, and hover/focus handling on both sides. It stays
 * controlled so a press on the already-selected swatch also opens the strip,
 * which is the only way in on touch (HoverCard ignores touch pointers).
 */
function ShadeSwatch({
  name,
  css,
  family,
  background,
  onChange,
}: {
  name: string;
  css: string;
  family: string;
  background: string;
  onChange: (css: string) => void;
}) {
  const shades = TAILWIND[family] ?? [];
  const [open, setOpen] = useState(false);
  const selected = background === css;
  const familyLabel = `${family[0].toUpperCase()}${family.slice(1)}`;

  return (
    <HoverCard open={open} onOpenChange={setOpen} openDelay={350} closeDelay={200}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          title={name}
          aria-label={name}
          aria-pressed={selected}
          onClick={() => (selected ? setOpen(true) : onChange(css))}
          style={{ background: css }}
          className={`${swatchClass} ${selected ? "ring-2 ring-primary ring-offset-2 ring-offset-sidebar" : "focus-visible:ring-2 focus-visible:ring-ring"}`}
        >
          {selected ? <SelectedMark dark={isLight(css)} /> : null}
        </button>
      </HoverCardTrigger>
      <HoverCardContent
        side="bottom"
        align="center"
        sideOffset={4}
        collisionPadding={12}
        className="w-auto rounded-lg p-1"
      >
        <div className="flex overflow-hidden rounded-md">
          {shades.map((hex, i) => {
            const label = `${familyLabel} ${SHADE_STEPS[i]}`;
            const on = background.toUpperCase() === hex;
            return (
              <button
                key={hex}
                type="button"
                title={label}
                aria-label={label}
                aria-pressed={on}
                onClick={() => onChange(hex)}
                style={{ background: hex }}
                className="grid h-7 w-6 place-items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {on ? (
                  <span
                    className={`size-1.5 rounded-full ${isLight(hex) ? "bg-black/70" : "bg-white/90"}`}
                  />
                ) : null}
              </button>
            );
          })}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

function SelectedMark({ dark }: { dark: boolean }) {
  return (
    <span
      className={`absolute right-1 bottom-1 grid size-3.5 place-items-center rounded-full ${
        dark ? "bg-black/70 text-white" : "bg-white/90 text-black"
      }`}
    >
      <CheckIcon className="size-2.5" strokeWidth={3} />
    </span>
  );
}

/**
 * The custom background swatch. On the gradients tab the popover holds two
 * colors, an angle slider and a live preview bar (equal colors render as a
 * solid); on the solids tab it is a single color picker.
 */
function CustomBackground({
  background,
  solid,
  selected,
  onChange,
}: {
  background: string;
  solid: boolean;
  selected: boolean;
  onChange: (css: string) => void;
}) {
  const hexes = background.match(/#[0-9a-fA-F]{6}/g) ?? [];
  const [from, setFrom] = useState(hexes[0] ?? "#E8F1FF");
  const [to, setTo] = useState(hexes[hexes.length - 1] ?? "#FFFFFF");
  const [angle, setAngle] = useState(Number(background.match(/(\d+)deg/)?.[1] ?? 160));
  const css = (f: string, t: string, a: number) =>
    f.toLowerCase() === t.toLowerCase() ? f : `linear-gradient(${a}deg, ${f} 0%, ${t} 100%)`;
  const apply = (f: string, t: string, a: number) => {
    setFrom(f);
    setTo(t);
    setAngle(a);
    onChange(solid ? f : css(f, t, a));
  };
  const preview = solid ? from : css(from, to, angle);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          title="Custom"
          aria-label="Custom background"
          aria-pressed={selected}
          style={{ background: selected ? background : preview }}
          className={`${swatchClass} ${selected ? "ring-2 ring-primary ring-offset-2 ring-offset-sidebar" : "focus-visible:ring-2 focus-visible:ring-ring"}`}
        >
          <span className="absolute inset-0 grid place-items-center rounded-lg bg-[conic-gradient(from_180deg,#f87171,#fbbf24,#34d399,#60a5fa,#a78bfa,#f87171)] opacity-90 [mask:radial-gradient(circle,transparent_38%,black_40%)]" />
          {selected ? <SelectedMark dark={isLight(background)} /> : null}
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="right"
        align="center"
        sideOffset={12}
        collisionPadding={12}
        className="w-60"
      >
        <div className="flex flex-col gap-3">
          <div
            className="swatch-edge h-12 w-full rounded-lg"
            style={{ background: preview }}
            aria-hidden
          />
          {solid ? (
            <ColorField label="Color" value={from} onChange={(c) => apply(c, to, angle)} />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2">
                <ColorField label="From" value={from} onChange={(c) => apply(c, to, angle)} />
                <ColorField label="To" value={to} onChange={(c) => apply(from, c, angle)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between text-xs">
                  <span className="text-muted-foreground">Angle</span>
                  <span className="tabular-nums">{angle}°</span>
                </div>
                <Slider
                  aria-label="Gradient angle"
                  min={0}
                  max={360}
                  value={[angle]}
                  onValueChange={([a]) => apply(from, to, a ?? angle)}
                />
              </div>
            </>
          )}
          {!selected ? (
            <button
              type="button"
              onClick={() => onChange(preview)}
              className="h-8 rounded-md bg-primary text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Use this background
            </button>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** A color: a native picker behind a swatch, with the hex editable beside it. */
function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const [text, setText] = useState(value);
  // Keep the text in step when the picker changes the value.
  useEffect(() => setText(value), [value]);
  const commit = (raw: string) => {
    const hex = raw.startsWith("#") ? raw : `#${raw}`;
    if (/^#[0-9a-fA-F]{6}$/.test(hex)) onChange(hex.toUpperCase());
    else setText(value);
  };
  return (
    <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
      {label}
      <span className="flex items-center gap-1.5">
        <span className="relative size-8 shrink-0 overflow-hidden rounded-md swatch-edge">
          <span className="absolute inset-0" style={{ background: value }} />
          <input
            type="color"
            aria-label={`${label} color`}
            value={value}
            onChange={(e) => {
              setText(e.target.value.toUpperCase());
              onChange(e.target.value.toUpperCase());
            }}
            className="absolute inset-0 size-full cursor-pointer opacity-0"
          />
        </span>
        <Input
          value={text}
          spellCheck={false}
          onChange={(e) => setText(e.target.value)}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
          className="h-8 font-mono text-xs uppercase"
        />
      </span>
    </label>
  );
}

/** A bezel variant: a tinted disc for the finish, its name, and a check when chosen. */
function FrameOption({
  label,
  tint,
  selected,
  onClick,
}: {
  label: string;
  tint?: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`flex h-8 items-center gap-2.5 rounded-md px-2 text-left text-sm transition-colors ${
        selected ? "bg-accent text-foreground" : "text-foreground/80 hover:bg-accent/60"
      }`}
    >
      <span
        aria-hidden
        className="swatch-edge size-4 shrink-0 rounded-full"
        style={{
          background: tint ?? "repeating-conic-gradient(#999 0 25%, #ddd 0 50%) 0 0/6px 6px",
        }}
      />
      <span className="flex-1 truncate">{label}</span>
      {selected ? <CheckIcon className="size-4 text-primary" /> : null}
    </button>
  );
}

/** Whether a background's stops are light on average, to pick a legible check color. */
function isLight(css: string): boolean {
  const hexes = css.match(/#[0-9a-fA-F]{6}/g);
  if (!hexes || hexes.length === 0) return true;
  const lum = hexes.reduce((sum, hex) => {
    const c = (o: number) => parseInt(hex.slice(o, o + 2), 16) / 255;
    return sum + 0.2126 * c(1) + 0.7152 * c(3) + 0.0722 * c(5);
  }, 0);
  return lum / hexes.length > 0.6;
}
