---
name: Office Ledger
description: A confident, modern operations workspace for a multi-organisation HRMS.
colors:
  mist: "#f6f5f2"
  paper: "#ffffff"
  white-raised: "#ffffff"
  mist-sunken: "#f0efeb"
  hairline: "#e6e4de"
  hairline-strong: "#aaa79f"
  ink: "#111111"
  ink-muted: "#57554f"
  ink-subtle: "#74726b"
  ink-action: "#111111"
  ink-action-hover: "#2b2b2a"
  ink-soft: "#ebe9e4"
  warm-rail: "#fbfaf8"
  success: "#12794d"
  success-soft: "#e3f4eb"
  warning: "#b25e09"
  warning-soft: "#fdf0dc"
  danger: "#c4314b"
  danger-soft: "#fde8ec"
  info: "#1f7ac9"
  info-soft: "#e5f1fb"
typography:
  body:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  title:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: 1.25
  label:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: 1.4
  mono:
    fontFamily: "Roboto Mono, ui-monospace, monospace"
    fontSize: "0.875rem"
rounded:
  control: "0.7rem"
  card: "1rem"
  capsule: "9999px"
components:
  button-primary:
    backgroundColor: "{colors.ink-action}"
    textColor: "{colors.white-raised}"
    rounded: "{rounded.control}"
    height: "40px"
  button-primary-hover:
    backgroundColor: "{colors.ink-action-hover}"
  button-secondary:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
  card:
    backgroundColor: "{colors.paper}"
    rounded: "{rounded.card}"
    padding: "20px"
  rail:
    backgroundColor: "{colors.warm-rail}"
    textColor: "{colors.white-raised}"
    rounded: "{rounded.card}"
    padding: "12px"
  rail-item-active:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.capsule}"
---

# Design System: Office Ledger

## Overview

**Creative North Star: "The Modern Operations Desk"**

Office Ledger reads like a decisive operations desk: a light warm rail establishes orientation, a white workspace on warm paper keeps long sessions calm, and black marks the next action. The interface should feel like a product people trust to run a working day, with high-contrast hierarchy, compact controls, and calm status colour. Colour is flat and functional, with one exception: the hero card at the top of a dashboard fades from warm paper into a soft blue corner. There is no grain or glass.

The world lends type, palette, density and the capsule/chip signature only. Navigation, tables, forms and dialogs stay standard so work is never harder to do. The system is for long daytime sessions on bright office screens; it is light-only.

**Key Characteristics:**
- Flat, high-contrast colour; depth comes from tonal surface steps and restrained soft shadows on navigation.
- One light rail owns navigation; black marks primary action and focus.
- Compact rounded controls, clear card edges, and larger type at page boundaries.
- Tabular figures everywhere numbers are compared.

## Colors

A warm paper workspace with one light navigation region and black as the action colour; state colours sit on top only where they carry meaning.

### Primary
- **Ink Action** (#111111): the primary action, focus ring, count badges. Hover is #2b2b2a; its soft tint (#ebe9e4) marks selected rows. A soft sky blue (#4aa3e8) appears only as the corner of the hero card gradient.

### Secondary
- **Warm Rail** (#fbfaf8): the navigation rail, a light panel with a hairline border. Text on it is ink, with muted secondary text.

### Neutral
- **Mist** (#f6f5f2): page background.
- **Paper** (#ffffff): cards and inputs.
- **Mist Sunken** (#f0efeb): hover fills, progress tracks, disabled fields.
- **Hairline** (#e6e4de) and **Hairline Strong** (#aaa79f): dividers and control borders.
- **Ink** (#111111), **Ink Muted** (#57554f), **Ink Subtle** (#74726b): text tiers.

### State
- Success (#087f5b), Warning (#b7791f), Danger (#c2413a), Info (#2563eb), each with a soft fill for chips and banners.

### Named Rules
**The One Region Rule.** Warm Rail is the navigation rail and nothing else; it never fills content.
**The One Action Rule.** Black marks something that can be done; it is never decoration or a state.

## Typography

**Display and Body Font:** Geist (with ui-sans-serif, system-ui)
**Mono Font:** Roboto Mono, for code and identifiers only.

**Character:** One friendly grotesk in a few weights; hierarchy comes from size and weight, not a second family.

### Hierarchy
- **Title** (700, 1.5rem, 1.25): page headings.
- **Body** (400, 1rem, 1.5): default text; base size is 106.25% of 16px.
- **Label** (500, 0.875rem): controls, table headers, nav items.
- **Caption** (400, 0.75–0.8125rem): helper text and timestamps.

### Named Rules
**The Tabular Rule.** Numbers use tabular figures globally so columns of counts, dates and durations align.

## Layout

A fixed left rail (15rem, collapsible to 4rem) beside a generous single content column; below the lg breakpoint the rail becomes a drawer opened from the top bar. Spacing follows Tailwind's 4px scale; cards pad 20px and controls are at least 40px tall.

## Elevation & Depth

Surfaces separate by tonal step (ground, surface, sunken) and 1px hairlines. A restrained soft shadow (`0 18px 45px rgb(15 41 49 / 0.18)`) is reserved for the rail, menus, popovers and dialogs. The active rail item carries a subtle `shadow-sm`.

## Shapes

Compact rounded controls use 0.7rem; pills remain reserved for badges, statuses, nav items and switches. Cards and the rail use 1rem. Checkboxes stay soft squares so they never read as radios.

## Components

### Buttons
- **Shape:** compact rounded control, min height 40px.
- **Primary:** Ink fill, white text; hover lightens to #2b2b2a.
- **Secondary:** paper surface with a strong hairline; ghost is transparent with a sunken hover.
- **Focus:** 2px ink outline, 2px offset.

### Badges and chips
- **Style:** capsule with a 1px border and a soft state fill; 0.75rem text.

### Cards
- **Corner Style:** 1rem; paper surface, 1px hairline, 20px padding.

### Inputs
- **Style:** paper surface, 1px hairline, 0.7rem radius, min height 40px; placeholder in Ink Subtle.
- **Disabled:** Mist Sunken fill with subtle text.

### Navigation
- **Style:** a light rail panel under an organisation card. Group labels are small sentence-case muted text. The active item is a white pill with a hairline border; hover is a sunken fill. Count badges are ink.

## Do's and Don'ts

### Do:
- **Do** keep one black primary action per work area.
- **Do** carry state in a label or shape as well as colour.
- **Do** use tabular figures for all comparable numbers.

### Don't:
- **Don't** use gradients, blur or glass on surfaces.
- **Don't** fill content regions with Warm Rail or use black as decoration.
- **Don't** build dark-mode variants without revisiting contrast on the rail and black.
