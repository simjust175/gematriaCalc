---
name: Desktop PWA installation
description: Product and safety rules for the installable Gematria desktop experience
---

Offer desktop installation discreetly from the authenticated app bar’s secondary menu. Use "התקן במחשב" when the browser provides a direct install prompt; otherwise offer "הורד קיצור דרך", which downloads a Windows `.url` file named `גימטריה.url` for the live origin. State honestly that it lands in Downloads and may be moved to the Desktop. Standalone/browser lifecycle signals override stale persisted installation markers.

**Why:** Installation should feel native without interrupting calculator use or repeatedly prompting. A stale local marker must never prevent reinstalling after the user uninstalls while retaining site storage.

**How to apply:** Keep the manifest name and short name as the non-wrapping "גימטריה", Hebrew/RTL and standalone, with padded navy/gold calculator-scroll icons plus a safe maskable variant. Keep the service worker network-only with no Cache API or offline fallback, and let mutating/API requests retain normal browser network behavior so authentication, database-backed results, and deployed updates remain current.