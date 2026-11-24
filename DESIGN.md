---
name: JobLens · 职镜
description: A quiet, dense Chrome side panel and options page for drafting truthful recruiter greetings with visible evidence.
colors:
  primary: "#0f766e"
  primary-hover: "#115e59"
  primary-soft: "#f0fdfa"
  primary-border: "#99f6e4"
  primary-ring: "rgba(15, 118, 110, 0.18)"
  on-primary: "#ffffff"
  selection: "#ccfbf1"
  canvas: "#f6f7f9"
  surface: "#ffffff"
  surface-subtle: "#f9fafb"
  surface-hover: "#f3f4f6"
  header-glass: "rgba(255, 255, 255, 0.92)"
  fg: "#111827"
  fg-secondary: "#374151"
  muted: "#5f6773"
  muted-light: "#9ca3af"
  placeholder: "#5f6773"
  border: "#e5e7eb"
  border-strong: "#d1d5db"
  control-border: "#8a919c"
  switch-off: "#8a919c"
  switch-thumb: "#ffffff"
  ok: "#15803d"
  ok-soft: "#f0fdf4"
  ok-border: "#bbf7d0"
  warn: "#b45309"
  warn-soft: "#fffbeb"
  warn-border: "#fde68a"
  warn-mark: "#d97706"
  danger: "#b91c1c"
  danger-soft: "#fef2f2"
  danger-border: "#fecaca"
  danger-border-strong: "#fca5a5"
  info: "#1d4ed8"
  info-soft: "#eff6ff"
  info-border: "#bfdbfe"
typography:
  display:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'PingFang SC', 'Microsoft YaHei', sans-serif"
    fontSize: "28px"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "-0.02em"
    fontFeature: "tnum"
  headline:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'PingFang SC', 'Microsoft YaHei', sans-serif"
    fontSize: "18px"
    fontWeight: 650
    letterSpacing: "-0.01em"
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'PingFang SC', 'Microsoft YaHei', sans-serif"
    fontSize: "15px"
    fontWeight: 600
    letterSpacing: "-0.01em"
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'PingFang SC', 'Microsoft YaHei', sans-serif"
    fontSize: "13.5px"
    fontWeight: 400
    lineHeight: 1.5
  body-sm:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'PingFang SC', 'Microsoft YaHei', sans-serif"
    fontSize: "12.5px"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'PingFang SC', 'Microsoft YaHei', sans-serif"
    fontSize: "12px"
    fontWeight: 500
  caption:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'PingFang SC', 'Microsoft YaHei', sans-serif"
    fontSize: "11.5px"
    fontWeight: 500
rounded:
  tab: "4px"
  sm: "6px"
  md: "10px"
  lg: "12px"
  pill: "999px"
spacing:
  hairline: "4px"
  stack-sm: "6px"
  row: "8px"
  stack: "10px"
  gutter: "12px"
  stack-lg: "16px"
  page: "24px"
components:
  button-default:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.fg-secondary}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "7px 12px"
  button-default-hover:
    backgroundColor: "{colors.surface-hover}"
    textColor: "{colors.fg}"
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.sm}"
    padding: "7px 12px"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
    textColor: "{colors.on-primary}"
  button-primary-block:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.sm}"
    padding: "9px 14px"
    width: "100%"
  button-ghost:
    textColor: "{colors.muted}"
    rounded: "{rounded.sm}"
    padding: "7px 12px"
  button-ghost-hover:
    backgroundColor: "{colors.surface-hover}"
    textColor: "{colors.fg}"
  button-danger:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.danger}"
    rounded: "{rounded.sm}"
    padding: "7px 12px"
  button-danger-hover:
    backgroundColor: "{colors.danger-soft}"
    textColor: "{colors.danger}"
  button-link:
    textColor: "{colors.primary}"
    padding: "2px 4px"
  button-icon:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.fg-secondary}"
    rounded: "{rounded.sm}"
    padding: "6px"
    size: "30px"
  chip:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.fg-secondary}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "4px 10px"
  chip-active:
    backgroundColor: "{colors.primary-soft}"
    textColor: "{colors.primary-hover}"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.fg}"
    rounded: "{rounded.sm}"
    padding: "7px 10px"
    width: "100%"
  input-disabled:
    backgroundColor: "{colors.surface-subtle}"
    textColor: "{colors.muted}"
  panel-card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.md}"
    padding: "12px 14px"
  panel-card-subtle:
    backgroundColor: "{colors.surface-subtle}"
    rounded: "{rounded.md}"
    padding: "12px 14px"
  badge:
    backgroundColor: "{colors.surface-hover}"
    textColor: "{colors.fg-secondary}"
    typography: "{typography.caption}"
    rounded: "{rounded.pill}"
    padding: "2px 8px"
  badge-ok:
    backgroundColor: "{colors.ok-soft}"
    textColor: "{colors.ok}"
  badge-warn:
    backgroundColor: "{colors.warn-soft}"
    textColor: "{colors.warn}"
  badge-err:
    backgroundColor: "{colors.danger-soft}"
    textColor: "{colors.danger}"
  badge-info:
    backgroundColor: "{colors.info-soft}"
    textColor: "{colors.info}"
  badge-primary:
    backgroundColor: "{colors.primary-soft}"
    textColor: "{colors.primary-hover}"
  notice:
    backgroundColor: "{colors.surface-subtle}"
    textColor: "{colors.fg-secondary}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.sm}"
    padding: "9px 11px"
  segmented:
    backgroundColor: "{colors.surface-hover}"
    rounded: "{rounded.sm}"
    padding: "3px"
  seg-tab:
    textColor: "{colors.muted}"
    rounded: "{rounded.tab}"
    padding: "5px 10px"
  seg-tab-active:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.fg}"
  nav-item:
    textColor: "{colors.fg-secondary}"
    rounded: "{rounded.sm}"
    padding: "9px 11px"
  nav-item-active:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.primary-hover}"
  composer-box:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.md}"
  composer-toolbar:
    backgroundColor: "{colors.surface-subtle}"
    padding: "7px 10px"
  score-num:
    textColor: "{colors.primary}"
    typography: "{typography.display}"
---

# Design System: JobLens · 职镜

## Overview

**Creative North Star: "The Quiet Instrument"**

JobLens is a precision instrument that sits beside a job listing. A good gauge is mostly quiet: neutral housing, legible scales, and one colored needle where the reading happens. The side panel stays out of the way of the BOSS 直聘 page it reads. It is dense enough to show a score, a draft greeting, and the evidence behind both in a single narrow column. Color is reserved for the action that matters and for state: verified, needs review, conflict.

Overall it should feel calm, trustworthy, and efficient. Calm because the user is in the middle of a stressful job search and the tool should not add noise. Trustworthy because the product's promise is truthfulness: evidence is shown openly, scores stay modest, and nothing glows. Efficient because the side panel is narrow and the user is working through many postings: 13.5px base text, 6–10px gaps, compact controls.

The rejected direction is the generic "AI product" look: purple-to-blue gradients, glows, sparkle effects, and shimmering placeholders. JobLens drafts text a person will sign their name to; it should look like a careful tool, not a magic trick.

**Key Characteristics:**
- Cool grey canvas, white cards, one teal accent.
- Hairline borders carry structure; shadows are barely there.
- System Chinese UI font, 13.5px base, high information density.
- Four status hues (green, amber, red, blue), each with a soft background and saturated text pair.
- Small, consistent corners: 6px controls, 10px cards, full pills for badges and chips.

## Colors

A neutral cool-grey system with a single teal accent and four semantic status pairs. The values are Tailwind-family, stored as CSS custom properties on `:root` in `components/styles.css`. The frontmatter holds the light theme; the dark theme remaps the same roles (see Dark Theme below).

### Primary
- **Lens Teal** (#0f766e): the needle of the instrument. Used for the primary action (generate, copy, save), checked switches, active borders, focus rings, link buttons, and the match score number. White text on it measures 5.47:1.
- **Deep Lens Teal** (#115e59): hover and pressed state of primary actions. Also the text color of anything sitting on Lens Wash: active chips, active nav items, expanded toggles, the primary badge, the compare-box title, and the active preset title.
- **Lens Wash** (#f0fdfa): tinted background for selected chips, expanded toggles, active preset cards, the dropzone on hover, and the greeting comparison box.
- **Lens Rim** (#99f6e4): border of Lens Wash surfaces (compare box, expanded toggles).
- **Lens Halo** (rgba(15, 118, 110, 0.18)): the 3px focus ring and active-card outline. It is never used as a fill.
- **On Lens** (#ffffff): text and icons on a Lens Teal fill.
- **Lens Selection** (#ccfbf1): text selection highlight.

### Neutral
- **Desk Grey** (#f6f7f9): the page canvas behind the side panel and options page.
- **Paper** (#ffffff): cards, inputs, default buttons, and the composer.
- **Paper Shade** (#f9fafb): recessed surfaces such as subtle cards, toolbars, disabled inputs, the JD preview, and the refine bar at rest.
- **Paper Press** (#f3f4f6): hover fill for buttons and the track of segmented controls.
- **Ink** (#111827): primary text and headings.
- **Ink Secondary** (#374151): body copy inside controls, labels, and default button text.
- **Graphite** (#5f6773): muted metadata, helper text, ghost buttons, inactive tabs, and placeholders. It clears 4.5:1 on every light surface, including Paper Press.
- **Faint Graphite** (#9ca3af): decorative separators only, never text.
- **Hairline** (#e5e7eb): the default border for cards, buttons, and dividers.
- **Hairline Strong** (#d1d5db): hover borders and the dashed dropzone edge.
- **Control Edge** (#8a919c): the boundary of anything you type into or switch: inputs, selects, textareas, the profile selector, the composer, the refine bar, and the unchecked switch track. It clears the 3:1 non-text minimum.
- **Header Glass** (rgba(255, 255, 255, 0.92)): the translucent fill of sticky bars.

### Status

Each status hue has a saturated text color and a soft background. Badges and notices always use the pair together.

- **Verified Green** (#15803d on #f0fdf4, rim #bbf7d0): evidence present, check passed, connection ok.
- **Review Amber** (#b45309 on #fffbeb, rim #fde68a; mark #d97706 for gap dots and the warn status dot): partial match, stale cache, items to confirm.
- **Conflict Red** (#b91c1c on #fef2f2, rim #fecaca, hover rim #fca5a5): explicit conflict, failure, destructive actions.
- **Reference Blue** (#1d4ed8 on #eff6ff, rim #bfdbfe): neutral information and "needs your confirmation" points.

### Dark Theme

`@media (prefers-color-scheme: dark)` remaps every role in one override block and sets `color-scheme: dark` so native controls follow. It is composed, not inverted: surfaces step lighter as they rise, and the accent flips to a light teal with dark text on fills.

| Role | Dark value |
|---|---|
| canvas / surface / surface-subtle / surface-hover | #111418 / #181c21 / #1d2228 / #262c33 |
| fg / fg-secondary / muted (and placeholder) / muted-light | #e7e9ec / #c4c9d0 / #9ba3ae / #6b7480 |
| border / border-strong / control-border (and switch-off) | #2c333b / #3a424c / #6f7884 |
| primary / primary-hover / primary-soft / primary-border | #2dd4bf / #5eead4 / #0f2f2c / #115e59 |
| on-primary / primary-ring / selection | #042f2e / rgba(45, 212, 191, 0.3) / #134e4a |
| ok text / soft / rim | #4ade80 / #0e2a1a / #14532d |
| warn text / soft / rim / mark | #fbbf24 / #2a2009 / #713f12 / #f59e0b |
| danger text / soft / rim / hover rim | #f87171 / #2c1517 / #7f1d1d / #991b1b |
| info text / soft / rim | #60a5fa / #0f1e36 / #1e3a8a |
| header-glass / switch-thumb | rgba(17, 20, 24, 0.9) / #e7e9ec |

Shadows deepen to black at 0.3–0.4 alpha so they stay visible on dark surfaces.

### Named Rules

**The One Needle Rule.** Lens Teal marks the single thing to do or read next. A screen has at most one filled primary button in view. Everything else uses neutral buttons and only gains teal on focus or selection.

**The Token-Only Rule.** Every color comes from a `:root` custom property, and the dark theme is the single override block that remaps them. No component carries a literal hex or rgba value.

**The Status Pair Rule.** Status color is never the only carrier of meaning. Every badge and notice also has a text label, so the soft-background and saturated-text pair is reinforcement, not the signal itself.

## Typography

**UI Font:** the system stack: -apple-system / SF Pro Text, then PingFang SC, then Microsoft YaHei.

**Character:** the platform's own Chinese UI font, so the tool reads like part of the browser rather than a branded app. Hierarchy comes from weight and small size steps, not from a second typeface.

### Hierarchy
- **Display** (700, 28px, line-height 1, tabular numerals): only the match score number.
- **Headline** (650, 18px): page titles on the options page.
- **Title** (600, 15px): card and section titles.
- **Body** (400, 13.5px, 1.5): the base for everything, set on `:root`. Card titles (the side panel's "打招呼语" h2) use the same size at weight 600.
- **Body Small** (400, 12.5px, 1.55): notices, JD preview, evidence requirement lines, refine input.
- **Label** (500, 12px): button text at small size, chips, field labels (12.5px variant), drawer summaries, muted helper text.
- **Caption** (500, 11.5px): badges and the rule-priority strip. Preset descriptions drop to 11px.

In the side panel, semantic heading levels are decoupled from visual size: the "当前职位" h2 is a 12px Graphite label, the job title h3 is Title-sized (15px, 600, line-height 1.35), and sub-headings inside cards are 12px weight 600. A visually hidden h1 and section h2s complete the outline for screen readers.

The greeting composer uses body size with a looser line height (1.65), because it holds prose the user will send.

### Named Rules

**The Weight-Not-Size Rule.** Hierarchy steps are small (11.5 → 12 → 12.5 → 13.5 → 15 → 18px). Emphasis comes from weight (500/600/650), not from jumping sizes. The 28px score is the only exception.

**The Tabular Rule.** Scores, counts, and percentages use `font-variant-numeric: tabular-nums` so numbers don't shift when they update.

## Layout

There are two shells with the same tokens:

- **Side panel** (`.sp-shell`): a single column at the width Chrome gives it. It has a sticky translucent header (profile selector and settings), a body with 12px side gutters and 10px vertical rhythm, and a footer for diagnostics. Content stacks vertically and never goes multi-column.
- **Options page** (`.opt-shell`): a centered container up to 1020px wide, with a 216px sticky left nav and a fluid main column, separated by a 24px gap. Below 760px the nav becomes a horizontally scrolling row above the content.

Spacing rhythm: 6px between closely related items, 8px between row items, 10px between blocks, 16px between sections, 24px for page-level separation. Two-column and four-column field grids collapse to one column below 640px.

**The Narrow Column Rule.** Every side-panel component must work at the panel's narrowest width and at browser zoom. Long values wrap (`overflow-wrap: anywhere`) or truncate with an ellipsis; action rows (composer toolbar, refine bar, history header, diagnostics) use `flex-wrap: wrap`; nothing scrolls horizontally.

## Elevation & Depth

The system is essentially flat with tonal layering. Depth comes from three surface tones (Desk Grey canvas, Paper card, Paper Shade recess) and 1px hairlines. Shadows are faint enough that removing them would barely change the screen. Translucency with an 8px backdrop blur appears only on sticky bars (the side-panel header and the options editor bar), so content scrolling underneath stays legible.

### Shadow Vocabulary
- **Resting** (`box-shadow: 0 1px 2px rgba(17, 24, 39, 0.04)`): default cards, the active segmented tab, the active nav item.
- **Lifted** (`box-shadow: 0 1px 3px rgba(17, 24, 39, 0.06), 0 1px 2px rgba(17, 24, 39, 0.03)`): sticky editor bar and brand mark.
- **Focus Halo** (`box-shadow: 0 0 0 3px var(--primary-ring)`): keyboard focus on all controls, and the focus-within state of the composer, refine bar, and profile selector. Drawer summaries use a 2px Lens Teal outline with a 2px offset instead.

### Named Rules

**The Hairline First Rule.** Separation comes from borders and surface tone, not shadow. A new container gets a 1px Hairline border before it gets a shadow, and never a shadow stronger than Lifted.

## Shapes

Corners are small and consistent. Controls, inputs, notices, and nav items use 6px. Cards, the composer, and the dropzone use 10px; 12px is reserved for larger containers. Badges, chips, switches, and status dots are full pills or circles. Segmented tabs use 4px inside a 6px track. Borders are 1px solid everywhere; the only dashed edge is the file dropzone (1.5px dashed). Icons are 24-unit outline glyphs with a 1.75 stroke and round caps and joins, drawn in `currentColor` at 16px by default.

## Components

### Buttons
Quiet by default; the primary action is the only filled one.
- **Shape:** gently squared (6px radius), 1px border, 7px 12px padding, 13px weight-500 text, 5px icon gap.
- **Default:** Paper background, Hairline border, Ink Secondary text. Hover moves to Paper Press with Hairline Strong and Ink.
- **Primary:** Lens Teal fill and border, On Lens text; hover deepens to Deep Lens Teal. The block variant is full width with 9px 14px padding and weight 600, used for the main "生成打招呼语" action.
- **Ghost:** transparent and borderless, Graphite text; gains a Paper Press fill on hover.
- **Danger:** Paper background, Conflict Red text and a red-tinted border; hover fills with the danger soft background.
- **Link:** borderless Lens Teal text, 2px 4px padding; hover shows a Lens Wash fill.
- **Icon:** square at least 30px (26px small), 6px padding. Icon-only buttons always carry an `aria-label`.
- **Expanded toggle:** any non-link button with `aria-expanded="true"` (依据, 上一版, sample options) takes Lens Wash, a Lens Rim border, and Deep Lens Teal text. State is driven by the attribute, never by stacking `primary` on `ghost`.
- **Focus / Disabled:** focus turns the border Lens Teal and adds the Focus Halo. Disabled sets opacity to 0.48 with a not-allowed cursor. Transitions run 0.15s ease on color, border, and shadow.

### Chips
- **Style:** pill (999px), 4px 10px padding, 12px text, Paper background with Hairline border.
- **Selected:** Lens Wash background, Lens Teal border, Deep Lens Teal weight-600 text. Used for tag-style filters and options.

### Cards / Containers
- **Corner Style:** 10px.
- **Background:** Paper; the subtle variant uses Paper Shade and drops the shadow.
- **Shadow Strategy:** Resting only.
- **Border:** 1px Hairline. When active, the border turns Lens Teal with a 1px Lens Halo outline.
- **Internal Padding:** 12px 14px.

### Inputs / Fields
- **Style:** full width, Paper background, 1px Control Edge border, 6px radius, 7px 10px padding, 13px text. Placeholder uses Graphite. Textareas resize vertically at line height 1.55; autosize textareas grow from 6.5em up to 55vh.
- **Focus:** Lens Teal border plus Focus Halo.
- **Disabled:** Paper Shade background, Graphite text.
- **Field label:** a stacked 12.5px weight-500 Ink Secondary label with a 5px gap above the control.
- **Embedded inputs** (the profile selector, refine bar, composer textarea): the input loses its own border and shadow, and the wrapping container takes the Control Edge border and the focus-within halo.

### Badges & Notices
- **Badge:** pill, 2px 8px, 11.5px weight 500. Neutral by default; ok, warn, err, info, and primary variants use the status pairs.
- **Notice:** 6px radius, 9px 11px padding, 12.5px text, a Paper Shade background with a Hairline border at rest, and a status soft background with a tinted border in variants. It stacks vertically by default, or runs as a row with an action on the right.

### Navigation
- **Options nav:** vertical list of full-width items, 9px 11px padding, 13px weight 500, Ink Secondary. Hover adds a Paper fill and Hairline border. Active items add Deep Lens Teal weight-600 text and Resting shadow, which reads as a card lifted out of the canvas. An optional status dot (7px, ok or warn) sits on the right. Below 760px the list becomes a horizontally scrolling row.
- **Segmented control:** a Paper Press track with a 3px inset and 4px-radius tabs. Inactive tabs use Graphite text; the active tab becomes a Paper chip with Ink weight-600 text and a Resting shadow.

### Switch
A 34×19px pill track (Control Edge) with a 15px thumb (white in light, near-white in dark). When checked, the track turns Lens Teal and the thumb slides 15px; transitions take 0.18s. Focus applies the Focus Halo to the track. The real checkbox (`role="switch"`) stays in the DOM, visually hidden, so keyboard and screen readers still work.

### Drawer (details)
Native `<details>` with the default marker removed. The summary is a 12px Graphite row with a chevron on the right that rotates 180° when open (0.16s). Used for the "查看逐项分析" match details, which opens with a visible plain-language explanation of the score and evidence coverage. Explanations never live only in `title` tooltips.

### Greeting Composer (signature)
This is the core workspace. A 10px-radius Paper box with a Control Edge border holds a borderless textarea (10px 12px padding, 1.65 line height) above a Paper Shade toolbar with a hairline top border, containing copy, rewrite, basis, and save actions. The whole box takes the Lens Teal border and Focus Halo when anything inside it has focus. Below it, the refine bar is a single-line Paper Shade field with an inline action; it turns Paper with a halo on focus. A regenerated draft never overwrites user edits. It appears in a Lens Wash compare box instead. Progress, copy results, staleness, and new drafts are announced through visually hidden `role="status"` regions; analysis failures use `role="alert"`.

### Score & Evidence List (signature)
The match score is the only Display-size element: Lens Teal, 28px weight 700, tabular, on a baseline row with its badges. Evidence below is a dot list: a 6px colored dot (green for strengths, Review Amber mark for gaps, blue for points to confirm, Graphite for hard requirements), a 12.5px weight-600 requirement line, and a 12px Graphite evidence line beneath it. A badge renders only when it has a label.

### Dropzone
A 1.5px dashed Hairline Strong box with a 10px radius on Paper Shade. The full surface is the file input, which is invisible but clickable. On hover the border turns Lens Teal and the background Lens Wash.

### Motion
Motion is limited to 0.15–0.18s color, border, and transform transitions and the loading spinner. Under `prefers-reduced-motion: reduce`, the spinner's rotation becomes a 1.6s opacity pulse; the stage text ("1/2 …", "2/2 …") keeps carrying progress.

## Do's and Don'ts

### Do:
- **Do** keep one filled Lens Teal button per view; everything else stays a neutral, ghost, or link button.
- **Do** take every color from a `:root` custom property, so dark mode can be a single override block.
- **Do** pair every status color with a text label (badge text, notice copy), never color alone.
- **Do** give every interactive element the shared focus treatment: Lens Teal border plus a 3px Lens Halo.
- **Do** separate with 1px Hairline borders and surface tone first. Use the Resting shadow only on cards and active tabs, and the Lifted shadow only on sticky bars.
- **Do** use `tabular-nums` for scores, counts, and percentages.
- **Do** design side-panel components for the narrowest panel width and browser zoom, with wrapping or ellipsis, never horizontal scroll.
- **Do** keep WCAG 2.2 AA in both themes: 4.5:1 for text under 18.66px bold or 24px regular, and 3:1 for large text, control boundaries, and focus indicators. Check any new token pair in light and dark before shipping it.

### Don't:
- **Don't** use purple or blue-violet gradients, glows, sparkle or shimmer effects, or other "AI magic" decoration. The sparkles icon may label an AI action; it is never ornament.
- **Don't** add literal hex or rgba values in components; add or reuse a token and give it a dark value.
- **Don't** add shadows heavier than Lifted (`0 1px 3px rgba(17, 24, 39, 0.06), 0 1px 2px rgba(17, 24, 39, 0.03)`) or use shadow as the main way to separate content.
- **Don't** introduce a second typeface or a web font; the system Chinese UI stack is the voice.
- **Don't** jump type sizes for emphasis; step weight instead. The 28px score is the only Display element.
- **Don't** use Lens Halo as a fill or Lens Teal as a large background area; teal is a needle, not a wash. Lens Wash is the only tinted fill.
