# Wind Forecast Accuracy Dashboard — Design Specification

> Source of truth for all UI implementation. If code and this document disagree, fix one of them in the same change.

## 0. Status of this document

**Legend**

- **[Confirmed]** — stated in the assignment or verified against Elexon documentation.
- **[Assumption]** — a design decision made to proceed; must be verified before it is treated as fact in the UI.
- **[Placeholder]** — illustrative value used only inside this document. Never ship placeholders in the product.

**Project inspection note.** This file was authored without filesystem access to the `wind-forecast-accuracy` repository, so the existing structure (`app/` layout, Tailwind version and config, component folders, FastAPI routes) has **not** been inspected. Before implementation, complete the checklist in §17 and reconcile paths and class names with the real codebase.

---

## 1. Product goals and target users

### 1.1 Purpose [Confirmed]
Help a UK energy utility understand **which national wind-generation forecasts were available at day-ahead purchasing decisions in January 2026**, and **how accurately those forecasts predicted actual generation**.

### 1.2 Goals
1. Make the forecast-selection rule (what the buyer could have known, and when) visible and auditable.
2. Quantify accuracy with a small set of clearly defined metrics (MAE, RMSE, bias, coverage).
3. Show where and when forecasts erred, in time and in direction (over- vs under-forecast).
4. Expose the underlying records so any number can be traced to source rows.
5. Be honest about data quality: missing matches, resolution differences, freshness, and failures.

### 1.3 Non-goals
- No trading execution, price forecasting, or portfolio optimisation.
- No regional, onshore/offshore, or multi-month analysis unless the assignment is extended.
- No synthesised, interpolated, or "smoothed" data presented as observed.

### 1.4 Target users
| User | Needs | Implication |
|---|---|---|
| Energy trader / forward desk analyst | Judge how much to trust day-ahead wind forecasts; spot bias | Fast scan of KPIs, error chart, drill into a day |
| Forecasting / analytics lead | Audit methodology and matching | Methodology page, data-quality section, explorer |
| Reviewer / assessor | Verify the rule and the numbers | Every metric has a definition and traceable rows |

---

## 2. Design principles

1. **Analytical clarity over decoration.** Bloomberg-like density and numeric legibility, with modern SaaS usability: calm, structured, no ornament.
2. **Numbers lead.** Strong numeric hierarchy: value first, unit second, label third.
3. **Never imply accuracy from magnitude.** A high forecast value is not a good forecast. Status colour attaches only to *error* measures against documented thresholds, never to generation levels.
4. **Time semantics are explicit.** Delivery time (`startTime`) and forecast publication time (`publishTime`) are always labelled and never conflated.
5. **No silent data manipulation.** No interpolation, duplication, or aggregation without an explicit, labelled, user-visible method.
6. **Honest states.** Loading, empty, partial, error, and invalid states are first-class designs, not afterthoughts.
7. **Restraint.** Few cards, subtle borders, restrained shadows, minimal motion.
8. **Reusable and consistent.** One component per concept; tokens only, no ad-hoc values.

### Visual references in words
- **Bloomberg Terminal:** information density, tabular figures, unambiguous units, disciplined use of colour as signal.
- **Modern SaaS analytics (Linear/Stripe-style):** generous but efficient spacing, crisp 1px borders, quiet shadows, clear focus states.
- **Not:** generic admin templates, gradient hero banners, glassmorphism, oversized headings, decorative illustrations, card-for-everything layouts.

---

## 3. Data and domain facts that drive the UI

### 3.1 Sources [Confirmed]
- **WINDFOR** — Elexon wind generation forecast. Fields in the Elexon schema: `publishTime`, `startTime`, `settlementDate`, `settlementPeriod`, `generation` (nullable integer).
- **FUELHH** — Elexon half-hourly generation outturn by fuel type; restricted to the national **wind** fuel type.
- Elexon Insights API base: `https://data.elexon.co.uk/bmrs/api/v1`; no API key required; subject to BMRS Data Licence Terms and API Terms of Use.

### 3.2 Units [Confirmed with one verification item]
- Elexon's IDD documents the WINDFOR generation value and the FUELHH fuel-type generation value as **MW**.
- **[Assumption → verify]** Confirm against the live OpenAPI specification that the JSON `generation` fields for both datasets are MW (power), **not** MWh (energy per period). The UI unit label must come from a single constant (`UNITS.generation`) set only after this check. If FUELHH is delivered as MW averaged over a half-hour, state that in the Methodology page.

### 3.3 Time fields
| Field | Meaning | UI label |
|---|---|---|
| `startTime` | Start of the delivery interval the value applies to (UTC) | **Delivery time** |
| `publishTime` | When the forecast was published | **Forecast published** |
| `settlementDate` + `settlementPeriod` | GB settlement day and half-hour index | Secondary/debug column |

- **[Assumption → verify]** Settlement periods are 1–48 on normal days (46/50 on clock-change days). January 2026 contains no clock change, but code must not hard-code 48.
- Store and compute in UTC. Display in **Europe/London** with a visible timezone label; offer a UTC toggle in the Data Explorer. In January, London = UTC, but the label must still be present.

### 3.4 Resolution mismatch [Assumption → verify empirically]
- FUELHH is half-hourly (30 min). WINDFOR resolution must be **observed from the data**, not assumed. If it is coarser than 30 min (e.g. hourly), the alignment method in §3.6 applies.
- The UI must display the *detected* resolution of each dataset in the Data Quality section; it must never display an assumed one.

### 3.5 Forecast-selection rule (day-ahead decision cutoff)
Goal: for each delivery interval in January 2026, select the forecast a day-ahead buyer could actually have used.

- **[Confirmed]** Never select a forecast with `publishTime` after the cutoff.
- **[Assumption → needs user confirmation]** Proposed default cutoff: **09:00 Europe/London on the day before delivery (D‑1)**. Rationale: day-ahead purchasing normally closes around the middle of D‑1; the exact gate is a business decision. The cutoff is configurable via a single config value and displayed everywhere it applies.
- **[Assumption]** Among forecasts for a given `startTime` with `publishTime ≤ cutoff`, select the **most recent** one ("latest eligible").
- **[Assumption]** Scope: deliveries with `startTime` in January 2026 (00:00 Jan 1 – 24:00 Jan 31 London). Forecasts published in late December 2025 for early-January delivery are eligible, so the fetch window for `publishTime` must extend before 1 January. The UI states this explicitly.
- If no eligible forecast exists for a delivery interval, the interval is **unmatched** (never back-filled with a later forecast).

### 3.6 Alignment method [Assumption → verify and document before build]
Principle: **explicit, validated, reversible, and visible.**
1. Join on delivery interval identity (`startTime`, or `settlementDate`+`settlementPeriod` — pick one and validate they agree).
2. **Same resolution:** one-to-one match.
3. **Forecast coarser than actual:** the method must be chosen and validated (options: compare only intervals where both have a value; or compare forecast to the *mean* of the actual intervals it covers). Whichever is chosen:
   - it is named in the Methodology page and in the top-bar "Alignment" chip;
   - counts of intervals affected are shown in Data Quality;
   - **no interpolation, no duplication of forecast values into finer slots, no silent aggregation.**
4. Alignment is validated by automated checks (no duplicate keys, no nulls counted as zero, timestamps parse, sums reconcile) before any KPI renders.

### 3.7 Metric definitions [Confirmed definitions; unit pending §3.2]
Let `F_t` = eligible day-ahead forecast and `A_t` = actual, for matched intervals `t = 1..n`. Error `e_t = F_t − A_t`.

| Metric | Formula | Unit | Reading |
|---|---|---|---|
| **MAE** | (1/n) Σ \|e_t\| | MW | Typical size of error, direction-agnostic |
| **RMSE** | √((1/n) Σ e_t²) | MW | Like MAE but penalises large misses |
| **Forecast bias** | (1/n) Σ e_t | MW (signed) | **Positive = over-forecast; negative = under-forecast** |
| **Matched coverage** | n_matched / n_expected_intervals | % (and counts) | Share of January delivery intervals with a valid forecast–actual pair |

Notes:
- `n_expected_intervals` must be defined (e.g. all half-hour intervals in January 2026 = 1,488 if 48 × 31) and **computed by the backend**, not hard-coded in the UI.
- Do not add normalised metrics (e.g. % of capacity) unless a verified capacity denominator is sourced; mark any such addition as an extension.

---

## 4. Colour tokens

### 4.1 Light theme (default)

**Canvas and surfaces**
| Token | Hex | Use |
|---|---|---|
| `--bg-canvas` | `#F6F8FA` | App background (cool white) |
| `--bg-surface` | `#FFFFFF` | Panels, tables, popovers |
| `--bg-surface-subtle` | `#EEF2F6` | Table header, inset areas, hover rows |
| `--bg-surface-sunken` | `#E7ECF2` | Segmented-control track, skeletons |

**Navigation (deep navy)**
| Token | Hex | Use |
|---|---|---|
| `--nav-bg` | `#0B1F3A` | Sidebar |
| `--nav-bg-raised` | `#12294A` | Hover / active item background |
| `--nav-text` | `#C9D4E3` | Default nav text |
| `--nav-text-strong` | `#FFFFFF` | Active nav text, product name |
| `--nav-border` | `#1C3558` | Dividers inside sidebar |

**Borders and text**
| Token | Hex | Use |
|---|---|---|
| `--border-subtle` | `#E1E7EE` | Panel and row dividers |
| `--border-default` | `#CBD5E1` | Inputs, table outer border |
| `--border-strong` | `#94A3B8` | Emphasis, focused-neutral |
| `--text-primary` | `#0F1B2D` | Body, numbers |
| `--text-secondary` | `#475569` | Labels, helper text |
| `--text-tertiary` | `#64748B` | Axis labels, metadata (min 4.5:1 on surface) |
| `--text-disabled` | `#94A3B8` | Disabled only (not for essential info) |

**Accent (teal)**
| Token | Hex | Use |
|---|---|---|
| `--accent-600` | `#0F766E` | Primary buttons, links, active indicators |
| `--accent-500` | `#14938A` | Hover, secondary highlights |
| `--accent-100` | `#D5F0EC` | Selected-state backgrounds |
| `--accent-050` | `#ECF8F6` | Subtle tint |
| `--focus-ring` | `#0E7C86` | 2px focus ring + 2px offset |

**Semantic status** (applied to *error/quality* only, never to raw generation values)
| Token | Hex | Background tint | Meaning |
|---|---|---|---|
| `--status-favourable` | `#2F7D6B` | `#E4F2EE` | Error within documented threshold; data check passed |
| `--status-warning` | `#B7791F` | `#FBF1DC` | Approaching threshold; partial data; stale data |
| `--status-error` | `#B4443F` | `#F8E5E3` | Forecast error beyond threshold; failed or invalid data |
| `--status-neutral` | `#64748B` | `#EEF2F6` | No threshold defined; unknown; not applicable |
| `--status-info` | `#2B6CB0` | `#E3EEF9` | Informational notices |

**Rule:** until accuracy thresholds are agreed with the business **[Assumption → needs confirmation]**, KPIs use `--status-neutral`. Status colours on KPIs appear only after thresholds are configured and displayed next to the value ("threshold: X MW").

### 4.2 Dark theme (optional)
Implemented via `data-theme="dark"` on `<html>`; default follows `prefers-color-scheme` only if the user has not chosen explicitly.

| Token | Hex |
|---|---|
| `--bg-canvas` | `#0A1220` |
| `--bg-surface` | `#101B2D` |
| `--bg-surface-subtle` | `#16243A` |
| `--bg-surface-sunken` | `#0D1626` |
| `--nav-bg` | `#07101F` |
| `--nav-bg-raised` | `#0F1E36` |
| `--border-subtle` | `#1E2D45` |
| `--border-default` | `#2B3C58` |
| `--border-strong` | `#4A5E7E` |
| `--text-primary` | `#E6ECF4` |
| `--text-secondary` | `#A9B6C9` |
| `--text-tertiary` | `#8394AD` |
| `--accent-600` | `#2DB3A6` |
| `--accent-500` | `#4CC5B9` |
| `--accent-100` | `#12403F` |
| `--focus-ring` | `#5EC8D8` |
| `--status-favourable` | `#58B89F` |
| `--status-warning` | `#E0A94A` |
| `--status-error` | `#E07A74` |
| `--status-neutral` | `#8394AD` |

Dark chart colours must be re-verified for contrast; do not auto-invert.

### 4.3 Chart palette
Charts must remain readable in greyscale and for colour-vision deficiency: **differ by line style/marker as well as hue.**

| Series | Light | Dark | Style |
|---|---|---|---|
| Actual generation (FUELHH) | `#0B1F3A` | `#E6ECF4` | Solid 2px line |
| Day-ahead forecast (eligible WINDFOR) | `#0F766E` | `#4CC5B9` | Solid 2px line, hollow marker on hover |
| Forecast error (F − A), positive area | `#B4443F` at 70% | `#E07A74` | Bar/area above zero |
| Forecast error, negative area | `#B7791F` at 70% | `#E0A94A` | Bar/area below zero |
| Zero baseline | `#64748B` | `#8394AD` | 1px dashed |
| Missing/unmatched interval | `#CBD5E1` hatch | `#2B3C58` hatch | Hatched band, labelled |
| Comparison/secondary forecast (future) | `#6B7FA3` | `#8FA3C7` | Dashed 2px |

Note: error sign is encoded by **direction relative to zero and pattern**, not colour alone. Over-forecast (above zero) and under-forecast (below zero) use two distinct hues, and red/amber are not the only cue.

---

## 5. Typography

- **UI font:** Inter (fallback: `ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif`).
- **Numeric font:** Inter with `font-variant-numeric: tabular-nums` on **all** numbers, tables, axes, and KPIs. Optional monospaced (`"JetBrains Mono", ui-monospace`) for timestamps and record IDs in the explorer.
- No webfont is allowed to block first render (`font-display: swap`).

| Role | Size / line-height | Weight | Tracking | Use |
|---|---|---|---|---|
| Page title | 20 / 28 px | 600 | −0.01em | Top bar title (not oversized) |
| Section heading | 16 / 24 px | 600 | 0 | Panel headings |
| KPI value | 28 / 32 px | 600 | −0.01em | Numeric hero |
| KPI unit | 13 / 16 px | 500 | 0 | Beside/below value, `--text-secondary` |
| Body | 14 / 20 px | 400 | 0 | Default |
| Label / caption | 12 / 16 px | 500 | 0.01em | Field labels, KPI labels |
| Table cell | 13 / 18 px | 400 | 0 | Compact tables |
| Table header | 12 / 16 px | 600 | 0.02em | Not uppercase by default |
| Axis / tooltip meta | 11–12 px | 400 | 0 | Min 11 px |
| Mono timestamp | 12 / 16 px | 400 | 0 | Explorer time columns |

Rules: no heading above 28 px in the app shell. Numbers right-aligned in tables. Units always present (header or value).

---

## 6. Spacing, radii, borders, shadows

**Spacing scale (4 px base):** `0, 2, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64`.
- Page padding: 24 px (desktop), 16 px (tablet), 12 px (mobile).
- Panel padding: 16 px; compact panel: 12 px.
- Section gap: 24 px. Intra-panel gap: 12–16 px.
- Table row height: 36 px (compact, default), 44 px (comfortable, touch/tablet).

**Radii:** `--radius-sm 4px` (chips, inputs), `--radius-md 6px` (buttons, panels), `--radius-lg 8px` (modals/popovers). No pill shapes except status chips.

**Borders:** 1 px `--border-subtle` for panels; `--border-default` for inputs and table frames. Prefer borders over shadows to separate content.

**Shadows (restrained):**
- `--shadow-sm: 0 1px 2px rgba(15, 27, 45, 0.06)` — panels (optional).
- `--shadow-md: 0 4px 12px rgba(15, 27, 45, 0.10)` — popovers, tooltips, dropdowns.
- `--shadow-lg: 0 12px 32px rgba(15, 27, 45, 0.16)` — modals/drawers only.
- No inner glows, no coloured shadows, no gradients (except the data-quality hatch pattern), no glassmorphism/backdrop blur.

**Motion:** 120–180 ms ease-out for hover/focus/expand; 200 ms for drawers. No parallax, no looping animation (skeleton shimmer excepted, ≤1.5 s cycle). Respect `prefers-reduced-motion` (disable shimmer and chart entry animation; render instantly).

**Tailwind mapping:** Define tokens as CSS variables in `globals.css` and map them in `tailwind.config` (`theme.extend.colors`) so classes read `bg-surface`, `text-secondary`, `border-subtle`, `text-status-error`. Do not use raw hex or arbitrary values in components. *(Verify the Tailwind major version first; v4 uses CSS-first `@theme`.)*

---

## 7. Navigation and page hierarchy

### 7.1 Sidebar (left, deep navy)
- **Width:** 232 px expanded; 64 px collapsed (icons + tooltips) on tablet; off-canvas drawer on mobile.
- **Top:** product identity — wordmark "Wind Forecast Accuracy" (**[Assumption]** working name) with a small, simple mark. No decorative illustration.
- **Items (in order):**
  1. **Overview** — KPIs, headline charts, data-quality summary.
  2. **Forecast Analysis** — deeper time-series and error analysis, day-level drill-down.
  3. **Data Explorer** — record-level table.
  4. **Methodology** — sources, rules, definitions, limitations.
- **Footer:** theme toggle, API/data status dot (text-labelled), version.
- Active item: `--nav-bg-raised` background, 3 px teal left indicator, `--nav-text-strong`. `aria-current="page"`.

### 7.2 Top bar (sticky)
Left → right:
1. **Page title** (e.g. "Overview").
2. **Analysis period chip:** "January 2026" (**fixed [Confirmed]**; delivery-time scope; tooltip explains publication window).
3. **Data status:** chip showing one of `Loaded · <timestamp>`, `Loading`, `Partial data`, `Stale`, `Error`. Never show "Live" or success unless the last API call actually succeeded.
4. **Filters** (page-relevant, see below).
5. **Mobile:** menu button at far left; filters collapse behind a "Filters" button.

**Filters (only those that change real queries):**
- **Day-ahead cutoff** (Overview, Forecast Analysis): displays current rule ("D‑1 09:00 London"), editable only if the assumption is made configurable; changing it re-runs the selection and updates every metric. Marked as an assumption chip until confirmed.
- **Date range within January** (day range picker, limited to Jan 1–31, 2026).
- **Time zone** (Data Explorer only): London / UTC.
- **Matched-only toggle** (Data Explorer): show only matched intervals vs. all intervals incl. unmatched.

### 7.3 Routes (Next.js App Router) [Assumption → align with repo]
```
/                      → redirects to /overview
/overview
/forecast-analysis
/data-explorer
/methodology
```

### 7.4 Page content hierarchy
- **Overview:** top bar → KPI row → main time-series → error chart → data-quality summary → link to explorer.
- **Forecast Analysis:** day selector + time-series (zoomable) + error chart + error distribution (**optional extension**; only if backed by real computed data) + notable-error list (computed, not curated).
- **Data Explorer:** table toolbar → table → pagination/virtualisation → export (**[Assumption]** CSV of the current view).
- **Methodology:** long-form, anchored sections, table of contents on the right (desktop).

---

## 8. Layout specifications

### 8.1 Shell
- Desktop ≥1280 px: sidebar 232 px fixed + content area; content max-width **1440 px**, centred, 24 px padding.
- 12-column grid, 16 px gutters (24 px at ≥1440).
- Cool-white canvas (`--bg-canvas`); panels on `--bg-surface` with 1 px border.

### 8.2 Overview (desktop)
```
┌────────────┬───────────────────────────────────────────────────────┐
│ Sidebar    │ Top bar: title | Jan 2026 | status | filters          │
│            ├───────────────────────────────────────────────────────┤
│            │ KPI row: MAE | RMSE | Bias | Matched coverage (4×3col)│
│            ├───────────────────────────────────────────────────────┤
│            │ Time series: actual vs eligible day-ahead forecast    │
│            │ (12 cols, ~360 px tall)                               │
│            ├───────────────────────────────────────────────────────┤
│            │ Forecast error chart (F − A) (12 cols, ~240 px tall,  │
│            │ x-axis shared/linked with chart above)                │
│            ├───────────────────────────────────────────────────────┤
│            │ Data quality (8 cols summary) | Cutoff rule (4 cols)  │
└────────────┴───────────────────────────────────────────────────────┘
```
- The two charts share x-axis range, zoom, and crosshair.
- Use panels only for: KPI group, each chart, data-quality, tables. Prefer a single bordered KPI strip (4 cells divided by 1 px lines) to four separate cards.

### 8.3 Responsive behaviour
| Breakpoint | Layout |
|---|---|
| ≥1280 (desktop) | Fixed sidebar; KPI strip 4-up; charts full width |
| 1024–1279 | Sidebar collapses to icon rail (64 px); KPI 4-up compressed |
| 768–1023 (tablet) | Icon rail or drawer; KPI 2×2; charts full width, height 300/200; explorer horizontal scroll with sticky first column; 44 px row height |
| <768 (mobile) | Off-canvas drawer; KPI 1- or 2-up (value + unit never truncated); charts full-bleed with reduced axis density; explorer switches to **stacked record cards** with the key fields (delivery time, forecast, actual, error); filters in a bottom sheet; methodology single column |

Rules: never hide data-quality warnings or the cutoff rule on small screens (they may collapse into an accordion but remain visible as a summary chip). Charts must remain keyboard- and screen-reader-accessible at all sizes.

---

## 9. Reusable component specifications

All components live in a shared UI layer (path to be matched to repo, e.g. `components/ui` and `components/dashboard`), are typed in TypeScript, accept token-based variants only, and expose `aria-*` props.

### 9.1 `AppShell`, `Sidebar`, `NavItem`, `TopBar`
As in §7. `TopBar` receives `title`, `period`, `status`, `filters` (slot).

### 9.2 `StatusChip`
- Props: `variant: favourable | warning | error | neutral | info`, `label`, optional `icon`.
- Always icon + text (not colour alone). Height 22 px, radius sm, 12 px label.

### 9.3 `KpiStat` (and `KpiStrip`)
Anatomy (top → bottom):
1. **Label** (12 px, e.g. "MAE") + **info icon** (tooltip with definition, formula, unit, direction of "good").
2. **Value** (28 px, tabular) + **unit** (13 px).
3. **Context line** (12 px): e.g. "n = {count} matched intervals" — computed.
4. Optional **status chip** only when a threshold exists.

Rules:
- Value is `—` (em dash) with state label when unavailable; never `0` as a stand-in.
- **Bias** displays an explicit sign (`+` / `−`) and a words label ("over-forecast" / "under-forecast"). Colour for bias remains neutral unless a bias threshold exists.
- **Coverage** shows percentage **and** counts (`matched / expected`).
- No sparklines or trend arrows unless computed from real data and defined.

Design example (**[Placeholder]**, not real): `MAE  ▮▮▮ 000 MW`, label "Mean absolute error · MW".

### 9.4 `Panel`
Bordered container with optional header (title, subtitle, actions), content, optional footer note. No nested panels.

### 9.5 `TimeSeriesChart`
See §10.1.

### 9.6 `ErrorChart`
See §10.2.

### 9.7 `DataTable`
- Compact, 36 px rows, sticky header, sticky first column on horizontal scroll.
- Zebra off; hover row `--bg-surface-subtle`; selected row `--accent-050` with 2 px teal left bar.
- Numeric columns right-aligned, tabular figures, fixed decimals consistent per column.
- Sortable columns with `aria-sort`; single-column sort by default.
- Virtualised for >500 rows; pagination fallback with page-size 50/100/250.
- Column set (§11).

### 9.8 `Tooltip` / `MetricInfo`
- Triggered by hover **and** focus; dismissible with `Esc`; stays open when hovered; 8 px offset; max-width 280 px; `--shadow-md`.
- Metric tooltips contain: name, plain-language meaning, formula, unit, sign convention.

### 9.9 `FilterBar`, `DateRangePicker`, `SegmentedControl`, `Select`, `Toggle`
- 32 px height controls (36 px on tablet/mobile → 44 px touch target).
- Labelled; visible focus ring; selected values appear as removable chips when filters are collapsed.

### 9.10 `DataQualityPanel`
See §12.

### 9.11 `StateBlock`
Unified loading/empty/error/partial/invalid presentation (§12).

### 9.12 `MethodologySection`
Anchored headings, definition lists for metrics, callout for assumptions (neutral info style), "last verified" metadata for API facts.

### 9.13 `AssumptionBadge`
Small `info`-style chip "Assumption" placed beside any displayed value or rule that depends on an unconfirmed decision (e.g. cutoff). Links to the relevant Methodology anchor.

---

## 10. Chart behaviour and metric presentation

### 10.1 Main time-series: actual vs eligible day-ahead forecast
- **X-axis:** delivery time (`startTime`), January 2026, labelled "Delivery time (Europe/London)". Ticks at day boundaries (day labels) with minor ticks per 6 h on zoom.
- **Y-axis:** "Wind generation (MW)" **[unit pending §3.2]**; starts at 0 for the generation chart; do not truncate the axis.
- **Series:** Actual (FUELHH, navy) and Day-ahead forecast (WINDFOR, teal) — see §4.3.
- **Gaps:** Where an interval is unmatched or missing, **break the line** (do not connect across gaps) and show a hatched band with label "No eligible forecast" or "No actual". No interpolation.
- **Resolution:** Plot at native resolution of each series; if resolutions differ, plot each at its native step (step-after line for coarser series) with a legend note "Forecast resolution: X; actual resolution: Y" (values from detected data). Do not draw smoothed curves (`curve: step` or linear only).
- **Tooltip (crosshair, shared with error chart):**
  - Delivery time
  - Actual (MW)
  - Forecast (MW)
  - Error (F − A, MW, signed)
  - **Forecast published** (`publishTime`)
  - Publication lead: "published {Δ} before delivery" (computed)
  - Eligibility: "Published before cutoff ✔" (always true for plotted points)
- **Interactions:** drag-to-zoom on x; "Reset zoom"; brush overview optional; legend toggles series; keyboard: arrow keys move the crosshair between data points, `Home/End` jump to ends, `+`/`−` zoom, `Esc` resets.
- **Title and description:** Chart panel title plus a one-sentence description that includes the cutoff rule ("Forecasts published before D‑1 09:00 London"), as `aria-describedby` text.
- **Data table alternative:** "View as table" toggle (links to Data Explorer with the same filters) — required for accessibility.

### 10.2 Forecast error chart (F − A)
- **Type:** bars (preferred at ≤ 2 weeks view) or thin area/step line at full month; zero baseline always visible and labelled "Forecast = actual".
- **Y-axis:** "Forecast error, F − A (MW)"; symmetric around zero by default with axis labels "Over-forecast ↑" and "Under-forecast ↓".
- **Colour:** above zero `--status-error`-family (red), below zero amber family (§4.3). Not coloured by "badness"; both signs are errors.
- **Shared** x-domain, zoom, and crosshair with §10.1.
- **Optional overlays (only if computed from data):** horizontal reference lines for ±MAE and bias; labelled.
- Gaps rendered as in §10.1.

### 10.3 Metric presentation rules
1. Every metric shows **name, value, unit**, and an info tooltip.
2. Use a consistent number format: thousands separator, **0 decimals for MW** unless data precision warrants more **[Assumption]**; bias and error keep sign.
3. Ratios/percentages: 1 decimal place.
4. No gauges, donuts, speedometers, or traffic-light icons.
5. Do not colour generation values as "good" or "bad".
6. Never compare to an implied benchmark that isn't defined in Methodology.
7. Round only at presentation; full precision in the export.

---

## 11. Data Explorer table

**Columns (default order):**
| Column | Source | Notes |
|---|---|---|
| Delivery time | `startTime` | Mono, timezone-labelled; sortable; default sort ascending |
| Forecast published | `publishTime` | Mono; shows eligibility icon if ≤ cutoff |
| Publication lead | computed | Duration before delivery |
| Forecast generation (MW) | WINDFOR `generation` | Right-aligned, tabular |
| Actual generation (MW) | FUELHH `generation` | Right-aligned |
| Forecast error (MW) | F − A | Signed; error colour cue only through a small ▲/▼ glyph + sign, not full-cell fills |
| Match status | computed | `Matched` / `No eligible forecast` / `No actual` / `Invalid` |
| Settlement date / period | optional (column menu) | Debug |

**Behaviour**
- Column visibility menu; sticky header; per-column tooltips (definition + unit).
- Search/filter by date and match status.
- Row click opens a **detail drawer**: shows raw record fields for both sources, the candidate forecasts considered, which was selected, and the reason (e.g. "latest published ≤ cutoff"). This makes selection auditable.
- Export CSV of the current view with units in headers and the cutoff rule in a header comment/metadata file **[Assumption]**.
- Unmatched rows display `—` (never `0`) in missing cells.

---

## 12. Data-quality section and system states

### 12.1 Data-quality section (Overview summary; full detail in Forecast Analysis/Methodology)
Show **only values the backend can supply**; anything unknown displays "Not available" with reason.

| Item | Display |
|---|---|
| Forecast records retrieved | count (WINDFOR) |
| Actual records retrieved | count (FUELHH) |
| Expected delivery intervals | count (computed) |
| Matched intervals | count + % |
| Missing matches | count, split by reason: no eligible forecast / no actual / invalid value |
| Null/invalid values | count of nulls (`generation` nullable) and rejected rows |
| Time resolution | detected, per dataset (e.g. "WINDFOR: {detected}", "FUELHH: {detected}") |
| Alignment method | named method + count of intervals it affected |
| Forecast publication cutoff | rule, timezone, and "assumption/confirmed" tag |
| Publication window fetched | earliest/latest `publishTime` used |
| Data freshness | latest `publishTime` / latest actual `startTime` retrieved, and "retrieved at {time}" from the API call; **omit** if unknown |
| Validation checks | list with pass/fail: duplicates, timezone parsing, range sanity, join integrity |

Layout: a compact two-column definition list inside one panel, with a `StatusChip` summarising ("All checks passed" only when they genuinely did). A "Missing intervals" mini-timeline (hatched ticks per day) links to the explorer filtered to unmatched rows.

### 12.2 State designs (apply to each panel independently)
| State | Visual | Copy pattern | Behaviour |
|---|---|---|---|
| **Loading** | Skeletons matching final geometry (KPI value bars, chart frame with axes skeleton, table rows). Shimmer only if motion allowed. | "Loading January 2026 data…" (`aria-busy`, polite live region) | Keep layout stable (no shift) |
| **Empty** | Neutral icon-less text block in the panel | "No records for the selected filters." + "Clear filters" action | Distinct from error |
| **Partial data** | Warning banner + chart still renders with hatched gaps; KPIs show values with "Based on {n} of {N} intervals" | "Some intervals have no eligible forecast or actual. Metrics use matched intervals only." | KPIs carry `Partial` chip; coverage KPI emphasised |
| **API error** | Error panel with status chip, short cause (HTTP status / timeout), request ID if available | "Couldn't load data from the backend. {reason}" + **Retry** | Previously loaded data may remain visible, clearly marked "Stale" with last-success timestamp; never show "Loaded" |
| **Upstream (Elexon) error** | As above, naming the source | "Elexon {dataset} data unavailable" | Per-dataset granularity |
| **Invalid data** | Warning/error panel listing validation failures (count, example field, reason) | "N records failed validation and were excluded." | Excluded records downloadable from the explorer filter "Invalid" |
| **Stale** | Warning chip with age | "Last updated {time}" | Only when freshness is known |
| **Rate-limited / timeout** | Error variant with retry-after if provided | — | Backoff handled in the data layer |

Rules: never fabricate a success state; never render a KPI when its inputs failed validation; each panel fails independently.

---

## 13. Methodology page

Sections (anchored, with a right-hand table of contents):
1. **Purpose and scope** — January 2026, national wind.
2. **Data sources** — WINDFOR and FUELHH, endpoints, field mapping (`startTime`, `publishTime`, `generation`, settlement fields), licence note, retrieval timestamp.
3. **Units** — verified unit statement with link to the source documentation and date verified.
4. **Time definitions** — delivery time vs publication time; timezone handling; settlement periods.
5. **Forecast-selection rule** — cutoff definition, "latest eligible" rule, treatment of forecasts published before January, no post-cutoff forecasts. Marked assumption until confirmed.
6. **Matching and alignment** — detected resolutions, chosen method, validation checks, unmatched handling.
7. **Metric definitions** — formulas, units, sign conventions (§3.7).
8. **Data quality handling** — nulls, duplicates, missing records.
9. **Limitations** — (see below).
10. **Changelog / assumptions register** — every assumption with status (open/confirmed).

**Limitations to state (as applicable, after verification):**
- Results describe January 2026 only and do not generalise to other seasons.
- Metrics depend on the cutoff assumption; a different cutoff changes forecast selection.
- National aggregate hides regional variation.
- FUELHH is outturn-based; later revisions, if any, are not tracked **[verify]**.
- Metrics in MW are not normalised by installed capacity.
- Error metrics do not capture financial impact.

---

## 14. Accessibility requirements

- **Standard:** WCAG 2.2 AA.
- **Contrast:** text ≥ 4.5:1; large text and UI components/graphics ≥ 3:1 against adjacent colours (including chart lines against the surface). Verify every token pair in both themes.
- **Colour independence:** status and error direction always carry a text/icon/pattern cue.
- **Keyboard:** all functionality operable by keyboard; logical tab order; skip-to-content link; visible focus ring (`--focus-ring`, 2 px + 2 px offset, ≥3:1); no keyboard traps; chart navigation per §10.1; table sort via `Enter/Space` on headers.
- **Screen readers:** landmarks (`nav`, `main`, `header`); one `h1` per page; charts have `role="img"` (or an accessible SVG group) with a descriptive label and long description (period, series, cutoff, headline numbers computed from data), plus a "View as table" alternative; tables use proper `<table>` semantics, `scope`, captions; live regions announce loading/error/updated status.
- **Tooltips:** accessible on focus; not the only place essential info appears.
- **Targets:** ≥ 24×24 px minimum (44×44 px on touch layouts).
- **Motion:** respect `prefers-reduced-motion`; no autoplay.
- **Zoom/reflow:** usable at 200% zoom and 320 px width without 2D scrolling (except data tables, which scroll within their container).
- **Language/time:** `lang="en-GB"`, dates as `1 Jan 2026 00:00 GMT` style with explicit timezone; numbers use `en-GB` formatting.

---

## 15. Visual-consistency rules

1. Use tokens only; no raw hex, no arbitrary Tailwind values in components.
2. One component per concept; extend variants rather than forking.
3. Max one primary (teal) button per view region; secondary = bordered neutral; destructive actions are not expected.
4. No panel inside a panel; no shadows on panels in dense data areas.
5. Units and timezone are always visible near numbers and time axes.
6. Error colours mark error only; teal marks selection/interactive/primary data series; navy marks actual data and navigation.
7. Status colours never encode generation magnitude.
8. All numbers use tabular figures; signed values use `+`/`−` (true minus U+2212).
9. Copy style: sentence case, plain English, no hype ("accurate", "great") unless a defined threshold backs it.
10. Placeholders and demo values never appear in production builds; any design/storybook examples are labelled "Illustrative".
11. Any new metric, filter, or chart must include its definition and an entry in the Methodology page in the same change.
12. Components must render all states in §12.2 before being considered complete.
13. Update this document in the same PR as any visual-system change.

---

## 16. Technical integration guidance (design-relevant)

- **Frontend:** Next.js App Router, React, TypeScript, Tailwind CSS. Prefer server components for static shells and client components for charts/interactivity. Share filter state via URL search params (shareable, back-button friendly).
- **Backend:** Python FastAPI. UI expectations of API responses (**[Assumption → agree contract]**): each response includes `data`, `meta` (counts, detected resolution, cutoff rule, retrieval timestamp, alignment method), and `quality` (validation results, missing-match counts by reason). The UI renders only what `meta`/`quality` provides; absent fields render as "Not available".
- **Computation location:** selection, alignment, and metrics are computed **server-side** in one place; the UI never recomputes KPIs from partial client data.
- **Chart library:** choose one (e.g. a SVG-based library with good a11y control); must support gaps, step lines, shared crosshair, and keyboard navigation. Not specified by assignment — **[Assumption]**.
- **Formatting utilities:** single module for number, unit, and datetime formatting.
- **Error handling:** typed error objects mapped to the state designs in §12.2.

---

## 17. Open items — verify before implementation

| # | Item | Status |
|---|---|---|
| 1 | Inspect the repo: App Router structure, Tailwind version/config, existing components, FastAPI routes, lint/format conventions | **Not done** (no repo access when authored) |
| 2 | Confirm units (MW vs MWh) for WINDFOR and FUELHH against live OpenAPI | Open |
| 3 | Observe actual WINDFOR and FUELHH time resolution and publication frequency | Open |
| 4 | Confirm the day-ahead decision cutoff (proposed: D‑1 09:00 Europe/London) | **Needs user decision** |
| 5 | Confirm the "latest eligible forecast" selection rule | Open |
| 6 | Choose and validate the alignment method for any resolution mismatch | Open |
| 7 | Confirm WINDFOR retrieval window (publication dates before 1 Jan 2026) and API limits/pagination | Open |
| 8 | Define accuracy thresholds (if any) for status colouring of MAE/RMSE/bias | Open — until set, KPIs stay neutral |
| 9 | Confirm FUELHH wind fuel-type identifier and national scope | Open |
| 10 | Confirm how nulls/zero values in `generation` should be treated | Open |
| 11 | Confirm expected-interval count definition and settlement-period handling | Open |
| 12 | Choose chart library satisfying §10 and §14 | Open |
| 13 | Confirm product name/wordmark | Open |
| 14 | Confirm whether dark theme and CSV export are in scope for v1 | Open |
