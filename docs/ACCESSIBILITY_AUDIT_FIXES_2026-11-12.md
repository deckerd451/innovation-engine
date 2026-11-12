# Accessibility audit fixes — November 12, 2026

Baseline: main `3881c50`. This change addresses the reproducible findings from
the local accessibility/readiness audit. It does not deploy the app or apply
production database migrations.

## Changed behavior

- Project/Admin dialogs move focus inside, contain Tab navigation, close with
  Escape, and restore focus. Nested editors close before their parent. Inbox
  handoff suspends dialogs and restores them on return. Background inert state
  is restored when a dialog closes.
- Mobile task assistance remains a navigable workspace, with a named region;
  its persistent navigation and saved draft behavior remain available.
- Explore categories expose the selected category, a single tab stop, and
  Left/Right/Home/End keys. Selected rows no longer carry unsupported ARIA.
- Admin filters and select-all have names. Action counts, avatar initials and
  task labels agree with their accessible names. Both resize controls expose
  numeric values, and the reflection control exposes its current orientation.
- Explore section labels and secondary metadata have readable contrast,
  including the phone layout.
- CI adds a pinned development-only axe scan and keyboard regression suite.
  The scanner is not shipped to visitors. Existing asset URLs are versioned.

## Local evidence

- Accessibility/keyboard: 30 checks passed, including WCAG-tagged axe scans on
  member Home, Explore, project details, inline completion, Admin People and
  Privacy, phone Explore and 640px reflow.
- Negative control: the same suite on unchanged baseline fails its first scan
  for the missing separator value and accessible-name mismatches.
- Offline regression files: 74/74; tracked JavaScript syntax: 337/337.
- Assistance journey: 42/42; project entry/task completion: 77/77.
- Member-content XSS regression passed. Its existing hostile inline-click
  fixture logs a syntax error; injected scripts did not execute.

All data was synthetic and external requests were blocked by the harness.
Automated scans cover these sampled states, not the entire application.
Real Safari/VoiceOver, actual browser zoom, production sign-in/delivery and
visitor database configuration remain separate verification tasks. This is
not a WCAG certification or a claim of a 100/100 product score.
