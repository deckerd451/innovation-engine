# Shared screen design

Home, Explore, Inbox, You and Admin use `assets/css/screen-system.css` for shared colors, surfaces, typography and controls. Screen-specific files continue to own layout, navigation and dialog behavior.

Use the `--bs-*` tokens for these screens: navy page/surface backgrounds, white headings, muted supporting text, cyan primary actions, 14px cards and 10px controls. Controls retain 44px touch targets and visible keyboard focus. Status colors remain meaningful.

Inbox uses the same name as its navigation destination and compact conversation rows. Explore keeps its categories and search with less unused space. You places Edit Profile below identity; account actions scroll after the profile content. Admin uses the same neutral frame with an explicit Management label.

No authorization, profile-sharing consent, messaging or campaign delivery rules change. No database migration is required.

Validation: deterministic tests, syntax checks, accessibility checks, Home purpose flow, mobile Admin layout/entry, logout and hostile member-content rendering. `run-screen-system.mjs` additionally checks shared surfaces and reachable controls at 320px, 390px and 1280px using synthetic accounts. It is included in CI. Browser tests do not send production messages or email.
