---
name: Browser tests on Replit Nix
description: Why Playwright tests in this project launch the system Chromium wrapper instead of the downloaded browser.
---

Use the Replit/Nix-provided Chromium wrapper for Playwright browser tests rather than Playwright’s downloaded Chromium binary.

**Why:** The downloaded headless binary cannot resolve GLib and related shared libraries in this Nix environment. Installing Chromium as a workspace system dependency provides a wrapper with the correct runtime paths.

**How to apply:** Keep browser-test launch configuration capable of discovering the system Chromium executable, while allowing an explicit executable-path override for other environments.