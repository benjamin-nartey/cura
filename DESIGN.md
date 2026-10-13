# CuraSphere design system

Visual language for the clinician workspace. It is a modern clinical interface: soft gray canvas, white surfaces, a deep teal for actions, and a blue accent for links and focus. Text and button colors are chosen so labels stay readable.

## Principles

- The chart is the page. Derived text is smaller than the source record and always cites an event.
- Teal means navigation and action. Red and green are reserved for threshold flags, allergies, and save confirmation.
- Facility and purpose of use are visible and not editable in the browser.
- Neutrals stay cool and quiet. No warm parchment, no decorative gradients.

## Color

| Token | Value | Use |
| --- | --- | --- |
| canvas | `#f4f7f8` | Page background |
| surface | `#ffffff` | Cards, sidebar, lists |
| ink | `#0f172a` | Headlines |
| body | `#334155` | Paragraphs |
| muted | `#475569` | Meta text |
| hairline | `#e2e8f0` | Borders |
| primary | `#0f766e` | Buttons, mark, timeline. White label text. |
| primary-active | `#115e59` | Hover, selected nav text |
| primary-soft | `#ccfbf1` | Selected row, purpose chip |
| accent | `#1d4ed8` | Links and keyboard focus |
| danger | `#b91c1c` | High/low flags and allergies, on `#fef2f2` |
| success | `#047857` | Saved confirmation and normal flags, on `#ecfdf5` |

The synthetic-data bar is `#134e4a` with `#f8fafc` text.

## Type

- Interface, titles, and buttons: Inter, 600–700 for headings and 400 for body.
- MRNs and codes: JetBrains Mono.
- Section labels: 12px, uppercase, teal.

## Layout

- White sidebar on a light gray canvas.
- Cards and lists use a 16px radius, a hairline border, and a soft shadow.
- Controls use a 10px radius.
- Page margin 48px on desktop, 16px under 960px.

## Clinical UI rules

- Allergies sit on a red surface with a matching border. An empty allergy list stays plain text.
- Timeline events are anchored to source rows. Abnormal events use the danger color.
- A persistent bar states that the database holds synthetic development records.

Tokens and controls live in `packages/design-system/system.css`.
