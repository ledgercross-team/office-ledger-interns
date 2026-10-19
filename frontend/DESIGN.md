---
name: Office Ledger
description: A confident, modern operations workspace for a multi-organisation HRMS.
colors:
  mist: "#f3f6f8"
  paper: "#ffffff"
  white-raised: "#ffffff"
  mist-sunken: "#e8eef1"
  hairline: "#d7e0e5"
  hairline-strong: "#91a2ab"
  ink: "#14232b"
  ink-muted: "#52636d"
  ink-subtle: "#687982"
  teal: "#087f7b"
  teal-hover: "#06635f"
  teal-soft: "#d9f1ef"
  navy-rail: "#102d36"
  success: "#087f5b"
  success-soft: "#dff5ed"
  warning: "#b7791f"
  warning-soft: "#fff2cc"
  danger: "#c2413a"
  danger-soft: "#fde2df"
  info: "#2563eb"
  info-soft: "#e0ecff"
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
  control: "0.7rem"
  card: "1rem"
  capsule: "9999px"
components:
  button-primary:
    backgroundColor: "{colors.teal}"
    textColor: "{colors.white-raised}"
    rounded: "{rounded.control}"
    height: "40px"
  button-primary-hover:
    backgroundColor: "{colors.teal-hover}"
  button-secondary:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
  card:
    backgroundColor: "{colors.paper}"
    rounded: "{rounded.card}"
    padding: "20px"
  rail:
    backgroundColor: "{colors.navy-rail}"
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

Office Ledger reads like a decisive operations desk: a deep navy rail establishes orientation, a cool white workspace keeps long sessions calm, and teal marks the next action. The interface should feel like a product people trust to run a working day, with high-contrast hierarchy, compact controls, and calm status colour. There are no gradients, grain or glass; colour is applied flat and its job is always functional.

The world lends type, palette, density and the capsule/chip signature only. Navigation, tables, forms and dialogs stay standard so work is never harder to do. The system is for long daytime sessions on bright office screens; it is light-only.

**Key Characteristics:**
- Flat, high-contrast colour; depth comes from tonal surface steps and restrained soft shadows on navigation.
- One navy rail owns navigation; teal marks primary action and focus.
- Compact rounded controls, clear card edges, and larger type at page boundaries.
- Tabular figures everywhere numbers are compared.

## Colors

A cool workspace with one deep navigation region and one teal action colour; state colours sit on top only where they carry meaning.

### Primary
- **Teal** (#087f7b): the primary action, links, focus ring, count badges. Hover is #06635f; its soft tint (#d9f1ef) marks selected rows.

### Secondary
- **Navy Rail** (#102d36): the navigation rail. Text on it is white-raised with muted secondary text.

### Neutral
- **Mist** (#f3f6f8): page background.
- **Paper** (#ffffff): cards and inputs.
- **Mist Sunken** (#e8eef1): hover fills, progress tracks, disabled fields.
- **Hairline** (#d7e0e5) and **Hairline Strong** (#91a2ab): dividers and control borders.
- **Ink** (#14232b), **Ink Muted** (#52636d), **Ink Subtle** (#687982): text tiers.

### State
- Success (#087f5b), Warning (#b7791f), Danger (#c2413a), Info (#2563eb), each with a soft fill for chips and banners.

### Named Rules
**The One Region Rule.** Navy Rail is the navigation rail and nothing else; it never fills content.
**The One Action Rule.** Teal marks something that can be done; it is never decoration or a state.

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

A fixed left rail (15rem, collapsible to 4rem) beside a generous single content column; below the lg breakpoint the rail becomes a drawer opened from the top bar. Spacing follows Tailwind's 4px scale; cards pad 20px and controls are at least 40px tall.

## Elevation & Depth

Surfaces separate by tonal step (ground, surface, sunken) and 1px hairlines. A restrained soft shadow (`0 18px 45px rgb(15 41 49 / 0.18)`) is reserved for the rail, menus, popovers and dialogs. The active rail item carries a subtle `shadow-sm`.

## Shapes

Compact rounded controls use 0.7rem; pills remain reserved for badges, statuses, nav items and switches. Cards and the rail use 1rem. Checkboxes stay soft squares so they never read as radios.

## Components

### Buttons
- **Shape:** compact rounded control, min height 40px.
- **Primary:** Teal fill, white text; hover darkens to #06635f.
- **Secondary:** paper surface with a strong hairline; ghost is transparent with a sunken hover.
- **Focus:** 2px teal outline, 2px offset.

### Badges and chips
- **Style:** capsule with a 1px border and a soft state fill; 0.75rem text.

### Cards
- **Corner Style:** 1rem; paper surface, 1px hairline, 20px padding.

### Inputs
- **Style:** paper surface, 1px hairline, 0.7rem radius, min height 40px; placeholder in Ink Subtle.
- **Disabled:** Mist Sunken fill with subtle text.

### Navigation
- **Style:** navy rail panel; items are quiet pills with light text. The active item is a paper pill with bold ink text; hover is a low-opacity white fill. Count badges use teal.

## Do's and Don'ts

### Do:
- **Do** keep one teal primary action per work area.
- **Do** carry state in a label or shape as well as colour.
- **Do** use tabular figures for all comparable numbers.

### Don't:
- **Don't** use gradients, blur or glass on surfaces.
- **Don't** fill content regions with Navy Rail or use teal as decoration.
- **Don't** build dark-mode variants without revisiting contrast on the rail and teal.
