---
name: Reliable browser tests on Replit Nix
description: Environment, data-isolation, and locator constraints for stable Playwright runs.
---

Use the Replit/Nix-provided Chromium wrapper for Playwright browser tests rather than Playwright’s downloaded Chromium binary.

Run browser journeys against a temporary database schema rather than the normal
saved-entry tables. Decorative icon-font spans must be hidden from the
accessibility tree, and controls wrapped by labels containing many options may
need a more specific locator because browsers can include all option text in the
computed label.

**Why:** The downloaded headless binary cannot resolve GLib and related shared
libraries in this Nix environment. Real Chromium runs also revealed that icon
glyphs changed button accessible names, wrapped select labels absorbed their
options, and shared saved data made save scenarios nondeterministic.

**How to apply:** Keep browser-test launch configuration capable of discovering
the system Chromium executable while allowing an explicit path override. Preserve
temporary-schema isolation, mark decorative icons `aria-hidden`, and validate
locators against the browser accessibility snapshot.