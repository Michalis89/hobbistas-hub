---
name: ui-component
description: Build or restyle any UI in Hobbistas — components, cards, forms, dialogs, empty states, layouts, spacing, colors, dark mode. Use whenever writing JSX/Tailwind for this project, adding a shadcn primitive, picking a color or radius, or reviewing whether existing UI matches the violet-bloom design system.
---

# Building UI in the violet-bloom system

## Step 1 — Do not write a new component yet

Check, in this order:

1. `src/components/ui/` — the single source of truth for primitives. Inventory: accordion, alert, alert-dialog, aspect-ratio, avatar, avatar-image, badge, breadcrumb, breadcrumbs, button, calendar, card, carousel, chart, checkbox, collapsible, cover-image, dialog, dropdown-menu, empty, field, input, item, label, menubar, pagination, popover, progress, scroll-area, select, select-field, separator, sheet, sidebar, skeleton, slider, sonner, spinner, switch, table, tabs, textarea, tooltip.
2. `src/app/components/layout/` — `PageContainer`, `PageHeader`, `PageShell`, `PageWrapper`, `Footer`.
3. `src/app/components/<domain>/` and `src/components/article|profile/` — an existing domain component may already do it.
4. `src/lib/constants/ui.ts` — `UI_CLASSNAMES` for pre-composed Tailwind: `pageShell`, `pageBackdrop`, `pageGradient`, `panelCard`, `tagPill`, `mutedInteractive`. Also `DATE_OPTIONS` / `DATE_TIME_OPTIONS` for date formatting.

Compose Radix/shadcn primitives before writing a custom implementation. A new file in `src/components/ui/` is justified only when it is a genuinely new, reusable primitive — otherwise it belongs in `src/app/components/<domain>/` or the route's `_components/`.

## Step 2 — Colors: tokens only

Never write a hex, `rgb()`, or a raw Tailwind palette class (`bg-slate-800`, `text-purple-500`). Every color resolves through an HSL custom property defined in `src/app/globals.css` and exposed as a Tailwind class.

Core: `background`, `foreground`, `card`, `muted`, `muted-foreground`, `primary` (~258deg violet), `destructive`, `border`, `popover`, `accent`, `ring`.

Semantic aliases — prefer these when the intent is semantic:

| Purpose | Token |
|---|---|
| Page background | `--surface-base` |
| Card / panel | `--surface-raised` |
| Popover / dropdown | `--surface-overlay` |
| Hover surface | `--surface-hover` |
| Warm surfaces (diary) | `--surface-warm`, `--surface-warm-2` |
| Main text | `--text-primary` |
| Secondary text | `--text-secondary` |
| Tertiary/disabled | `--text-tertiary` |
| Accent | `--accent-primary`, `--accent-hover`, `--accent-muted` |
| Link | `--link` |
| Status | `--success`, `--warning`, `--error`, `--info` |
| Charts | `--chart-1` … `--chart-5` (Recharts) |

In CSS use `hsl(var(--token))`; in JSX use the Tailwind class (`bg-card`, `text-muted-foreground`, `border-border`). Opacity modifiers are fine: `bg-primary/10`.

## Step 3 — The rest of the scale

- **Radius**: `--radius-sm` 6px (badges/chips) · `--radius-md` 10px (inputs/buttons) · `--radius-lg` 16px (cards/panels) · `--radius-xl` 22px (modals/large containers).
- **Type**: `--font-sans` Plus Jakarta Sans (UI/body) · `--font-serif` Lora (article & review content, editorial headings) · `--font-mono` IBM Plex Mono (code). Weights 400/500/600 via `--weight-*`; line-heights via `--leading-tight|normal|relaxed`.
- **Motion**: `--duration-fast` 150ms (micro) · `--duration-normal` 200ms · `--easing-default` · `--easing-out`. Do not invent longer durations.
- **Shadows**: `--shadow-2xs` … `--shadow-2xl`; `--shadow-diary` is reserved for the diary feature's warm surfaces.
- **Touch**: interactive elements need at least `--touch-min` (44px) on mobile. This is a real constraint — the app is a PWA used on phones.

## Step 4 — Dark mode

Dark is the **default**. The theme is an attribute, not a class: `data-theme="dark"` on `<html>`, with Tailwind configured as `darkMode: ['class', '[data-theme="dark"]']`. `ThemeContext` manages it and persists to the `theme` / `theme-preference` cookies; the root layout resolves the initial value server-side from cookies to avoid a flash.

Consequences when writing UI:
- Use tokens and both themes work for free. Hardcoded colors break exactly one theme, usually light — which is why they get through review.
- Use `dark:` variants only for genuine per-theme adjustments (e.g. image overlays), never to patch a hardcoded color.
- Do not read the theme during render to branch markup; that reintroduces hydration flash.

## Step 5 — Composition conventions

```tsx
<main className="pb-10 pt-6 md:pb-16 md:pt-8">
  <PageContainer size="lg" className="space-y-6">
    <PageHeader title="…" description="…" eyebrow="…" align="left" />
    <Card>…</Card>
  </PageContainer>
</main>
```

- Vertical rhythm via `space-y-*` on the container, not margins on each child.
- `cn()` from `src/lib/utils.ts` (clsx + tailwind-merge) for conditional classes — never string concatenation that can produce conflicting Tailwind classes.
- Icons: `lucide-react`. It is mocked in jest via `__mocks__/lucide-react.js`, so icon-heavy components stay testable.
- Prettier runs `prettier-plugin-tailwindcss`, so class order is normalized automatically — do not hand-sort.

## Step 6 — Verify

```
npm run lint
```
Then check the component in both themes and at a mobile width. If it renders differently from neighboring UI, the neighbor is the spec.
