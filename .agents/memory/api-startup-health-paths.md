---
name: API startup health paths
description: Production API startup can probe the service base path as well as its configured readiness endpoint.
---

When changing API readiness routes, keep the service base path and the configured production startup path healthy and backed by the same readiness response.

**Why:** Deployment logs showed the artifact service probing `/api` separately from `/api/healthz`; the dedicated endpoint could succeed while the base-path probe still failed.

**How to apply:** Check both the artifact service path and `services.production.health.startup.path`, then verify each route after restarting the API service.
