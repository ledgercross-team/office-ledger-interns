---
name: LedgerCross
description: A flat, friendly guide-map interface for a multi-organisation HRMS.
colors:
  sage-mist: "#eef1ea"
  paper: "#fbfcf9"
  white-raised: "#ffffff"
  sage-sunken: "#e2e7dc"
  hairline: "#d5dbcc"
  hairline-strong: "#7b8571"
  ink: "#2a3027"
  ink-muted: "#5d6657"
  ink-subtle: "#646e5e"
  clay: "#b5532f"
  clay-hover: "#98421f"
  clay-soft: "#f0ddd2"
  sage: "#8fa886"
  success: "#2e7d1e"
  success-soft: "#ddf2c8"
  warning: "#9a6a00"
  warning-soft: "#fdf3a8"
  danger: "#b3261e"
  danger-soft: "#ffdad4"
  info: "#1b76c9"
  info-soft: "#d5ecff"
typography:
  body:
    fontFamily: "Rubik, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  title:
    fontFamily: "Rubik, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: 1.25
  label:
    fontFamily: "Rubik, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: 1.4
  mono:
    fontFamily: "Roboto Mono, ui-monospace, monospace"
    fontSize: "0.875rem"
rounded:
  control: "0.75rem"
  card: "1.25rem"
  capsule: "9999px"
components:
  button-primary:
    backgroundColor: "{colors.clay}"
    textColor: "{colors.white-raised}"
    rounded: "{rounded.capsule}"
    height: "40px"
  button-primary-hover:
    backgroundColor: "{colors.clay-hover}"
  button-secondary:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.capsule}"
  card:
    backgroundColor: "{colors.paper}"
    rounded: "{rounded.card}"
    padding: "20px"
  rail:
    backgroundColor: "{colors.sage}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "12px"
  rail-item-active:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.capsule}"
---

# Design System: LedgerCross

## Overview

**Creative North Star: "The Guide Map"**

LedgerCross reads like a printed visitor's map: flat regions of colour do the dividing, and capsules do the acting. A person finds their module on the sage rail, reads what needs them on a paper ground, and acts through one clay capsule. There are no gradients, grain or glass; colour is applied flat and its job is always functional.

The world lends type, palette, density and the capsule/chip signature only. Navigation, tables, forms and dialogs stay standard so work is never harder to do. The system is for long daytime sessions on bright office screens; it is light-only.

**Key Characteristics:**
- Flat unmodulated colour; depth comes from tonal surface steps, not shadows.
- One sage rail owns navigation; one clay capsule per area owns the primary action.
- Rounded forms throughout: capsules for actions and state, large radii for containers.
- Tabular figures everywhere numbers are compared.

## Colors

A warm paper ground with one saturated green region and one clay action colour; state colours sit on top only where they carry meaning.

### Primary
- **Clay** (#b5532f): the primary action capsule, links, focus ring, count badges. Hover is #98421f; its soft tint (#f0ddd2) marks selected rows.

### Secondary
- **Sage Rail** (#8fa886): the navigation rail and text selection. Text on it is Ink.

### Neutral
- **Sage Mist** (#eef1ea): page background.
- **Paper** (#fbfcf9): cards and inputs. **White** (#ffffff) is raised overlays.
- **Sage Sunken** (#e2e7dc): hover fills, progress tracks, disabled fields.
- **Hairline** (#d5dbcc) and **Hairline Strong** (#7b8571): dividers and control borders.
- **Ink** (#2a3027), **Ink Muted** (#5d6657), **Ink Subtle** (#646e5e): text tiers.

### State
- Success (#2e7d1e), Warning (#9a6a00), Danger (#b3261e), Info (#1b76c9), each with a soft fill for chips and banners.

### Named Rules
**The One Region Rule.** Sage Rail is the navigation rail and nothing else; it never fills content.
**The One Action Rule.** Clay marks something that can be done; it is never decoration or a state.

## Typography

**Display and Body Font:** Rubik (with ui-sans-serif, system-ui)
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

A fixed left rail (15rem, collapsible to 4rem) beside a single content column; below the lg breakpoint the rail becomes a drawer opened from the top bar. Spacing follows Tailwind's 4px scale; cards pad 20px and controls are at least 40px tall.

## Elevation & Depth

Flat by default. Surfaces separate by tonal step (ground, surface, sunken) and 1px hairlines. A single soft float shadow (`0 12px 32px rgb(44 46 42 / 0.16)`) is reserved for menus, popovers and dialogs. The active rail item carries a subtle `shadow-sm`.

## Shapes

Capsule (fully rounded) for buttons, chips, badges, nav items and switches. Controls such as inputs use 0.75rem; cards and the rail use 1.25rem. Checkboxes stay soft squares so they never read as radios.

## Components

### Buttons
- **Shape:** capsule, min height 40px.
- **Primary:** Clay fill, white text; hover darkens to #98421f.
- **Secondary:** paper surface with a strong hairline; ghost is transparent with a sunken hover.
- **Focus:** 2px clay outline, 2px offset.

### Badges and chips
- **Style:** capsule with a 1px border and a soft state fill; 0.75rem text.

### Cards
- **Corner Style:** 1.25rem; paper surface, 1px hairline, 20px padding.

### Inputs
- **Style:** paper surface, 1px hairline, 0.75rem radius, min height 40px; placeholder in Ink Subtle.
- **Disabled:** Sage Sunken fill with subtle text.

### Navigation
- **Style:** sage rail panel; items are capsules with Ink text. The active item is a paper capsule with bold text; hover is a half-opacity paper capsule. Count badges use clay.

## Do's and Don'ts

### Do:
- **Do** keep one clay capsule per work area for the primary action.
- **Do** carry state in a label or shape as well as colour.
- **Do** use tabular figures for all comparable numbers.

### Don't:
- **Don't** use gradients, blur or glass on surfaces.
- **Don't** fill content regions with Sage Rail or use clay as decoration.
- **Don't** build dark-mode variants without revisiting contrast on the rail and clay.
