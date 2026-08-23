---
name: Production startup readiness
description: How the app avoids false autoscale probe failures during database and corpus initialization.
---

In production, bind the HTTP server and serve the static shell before database
initialization completes, while temporarily returning an explicit initializing
response for application API traffic. The client keeps its loading state and
retries the initial authentication check during that short window.

**Why:** Autoscale probes the root route immediately. Waiting for database
setup or a one-time Tanach corpus representation upgrade before opening the port
created transient connection and 500 probe errors, and could leave a fresh
browser session looking unauthenticated.

**How to apply:** Keep the readiness boundary consistent when adding new
startup work: root/static delivery must remain available, API routes must not
run against a partially initialized corpus, and fatal initialization failures
must still terminate the process.