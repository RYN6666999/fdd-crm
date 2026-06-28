# Product

## Register

product

## Users

- **Primary**: Ryan, a Taiwanese real estate agent using this CRM daily for business operations.
- **Context**: Fast-paced, field-heavy workflow. Uses the CRM from desktop (at desk) and mobile (PWA on phone between appointments). Often with unstable connectivity. Needs to log contacts, check schedules, record daily KPI, and review sales progress in under 2 minutes per session.
- **Job to be done**: Never lose track of a lead. Record today's activity before forgetting it. Know who to call next. See at a glance whether the month's targets are on track.

## Product Purpose

FDD CRM is the operational brain of Ryan's real estate business. It tracks every contact, every sale, every daily activity, every appointment — and surfaces what matters most when it matters most. Success means: (1) daily report takes under 60 seconds to fill, (2) no contacted lead falls through the cracks, (3) monthly sales progress is visible at a glance, (4) AI assists without getting in the way.

## Brand Personality

Clean · Confident · Professional

The tone of a trusted business tool: reliable, not flashy; fast, not rushed; helpful, not intrusive. Speaks in clear Taiwanese Mandarin with minimal jargon.

## Anti-references

- Do NOT look like a generic SaaS dashboard (color-coded KPI cards, gradient headers, busy metric panels).
- Do NOT look like a dark-mode "hacker" terminal (green on black, cyber aesthetics).
- Do NOT use heavy illustrations, 3D renders, or decorative icons that add no information.
- Avoid the "AI chatbot pinned to bottom-right corner" pattern — AI should be contextually embedded, not an afterthought.
- Avoid over-designed navigation (hamburger menus on desktop, hidden tabs, multi-level accordions).

## Design Principles

1. **The daily report is the home screen.** The first thing Ryan sees each day should be today's activity record, not a contact tree. Daily logging is the primary workflow; everything else is secondary.
2. **One click, one purpose.** Every action should take at most one explicit step after landing on a page. Adding a contact, recording a sale, checking a calendar — if it needs navigation + modal + form, it's too many.
3. **Data at a glance, details on demand.** The header or a persistent summary bar shows today's KPI, next appointment, and overdue follow-ups. Full detail lives in the page below. No digging for what matters.
4. **AI as a co-pilot, not a feature.** AI shows context-aware suggestions inline (on the daily page: "want to carry yesterday's plan forward?"; on a contact: "this person hasn't been contacted in 2 weeks"). No separate "AI tab" — it lives where the data lives.
5. **Mobile-ready by default.** Every page works on a phone screen without horizontal scrolling. Text inputs are tappable. Buttons are fat enough for thumbs.

## Accessibility & Inclusion

- WCAG 2.1 AA minimum (4.5:1 body text contrast, 3:1 large text).
- Dark theme is the primary theme (used in low-light desk and mobile field use). Light theme is not a priority.
- Support `prefers-reduced-motion` for all transitions.
- All interactive elements must be keyboard-navigable and have visible focus rings.
- Font size at least 14px for body text; no text under 12px anywhere.