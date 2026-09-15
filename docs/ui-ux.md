# UI/UX — Spidey Player

## Direction
**“Nightclub glass, honest numbers.”** Dark field, cyan accent `#00f2ea`, one cyan play tile, circular art. The interface should feel like a physical deck: what you see is what is playing and what is stored.

## Type
- UI: system-ui / -apple-system
- Times: ui-monospace, tabular
- Title: 1.2rem / 700; kicker: 0.68rem / uppercase / `#7dd3fc`
- Body secondary: `#9ca3af`

## Palette
| Token | Hex | Role |
|-------|-----|------|
| Ink | `#05060a` | Page |
| Cyan | `#00f2ea` | Play, progress, active |
| Magenta | `#ff0055` | Visualizer peak only |
| Glass | `rgba(255,255,255,0.05)` | Cards |
| Danger | not used for counts | |

Spacing: 4/8/12/16/24. Radius: play 1.35rem, dock 1.35rem, rows 0.75rem.

Motion: 150ms color/transform; respect `prefers-reduced-motion` (art pulse off).

## Journey
Open → now playing (bundled or resume) → playlist drawer → search/import → back to now playing on row tap (mobile).

## Trust rules
| Situation | Show |
|-----------|------|
| Zero tracks | Empty illustration + Import, not `0:00` playing |
| Unknown duration | `–:––` |
| Zero duration after metadata | `0:00` (real) |
| Loading library | “Opening library…” then clear or error |
| Import | `Reading i/n: name` then clear |
| Failed catalog | Explicit “Shipped library unavailable” (F-07) |
| Site quota estimate | Prefix `Site ·` so it is not “my MP3s” |
| Hidden bundled | Toast: stays hidden until Undo |
| Save prefs fail | Existing warn toast |

No fake determinate bars. Progress width is `currentTime/duration` only when both finite.

## Responsive
- `<768` or height `<600`: one column, drawer playlist, `100dvh`
- Desktop: card + playlist side by side
- Touch: 44px targets

## A11y
Live region `#sr-status`; progress `role=slider`; play aria-label Play/Pause; search labeled.
