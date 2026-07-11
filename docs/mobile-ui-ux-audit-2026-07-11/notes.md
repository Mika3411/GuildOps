# Mobile UI/UX Audit - 2026-07-11

Scope: 390 x 844 mobile viewport in the Codex in-app browser against `http://127.0.0.1:5173`.

## Steps

1. Landing page: healthy overall. Strong responsive CTA stack and no horizontal overflow. Header takes 143 px before the hero and the public navigation links disappear on mobile, leaving account actions only.
2. Guild gallery: mostly usable. Filters stack cleanly, but the stat cards consume most of the first viewport before the user reaches actual guild results.
3. Guild gallery language picker: needs attention. Opening the picker scrolls the page to keep the focused search field visible, and list options are 38 px tall, below common mobile target-size guidance.
4. Registration form: usable but cramped. Inputs are 48 px tall, but tabs, primary action, and password toggle are 38 px or 34 px tall. API failure appears as a clear alert, but it blocks confidence at the account-creation moment.
5. App entry: blocked. `/app` resolves to the login gate and shows the same API connection error, so the private workspace mobile shell could not be audited from the configured app state.

## Highest Impact Recommendations

- Make mobile interactive controls consistently at least 44 px tall, especially auth tabs, primary buttons, password visibility controls, and gallery picker rows.
- Reduce mobile gallery hero/stat height or compress stats into a single row/strip so users see filters and results sooner.
- Add a compact mobile landing navigation path to product/modules/gallery, or make the hidden links available via a menu.
- Treat API-unavailable auth as a stronger recovery state: show service status, retry, and a non-destructive path back to public browsing.
- Verify the authenticated app shell separately once the API/session is available.

## Evidence Limits

This audit is based on screenshots plus DOM/layout measurements. It does not prove full WCAG compliance, keyboard behavior, screen-reader quality, authenticated workspace behavior, or real form submission recovery.
