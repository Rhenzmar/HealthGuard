# HealthGuard | Current Render deployment guide

**Product name:** HealthGuard. **Legacy backend names:** `physiograph/` Python module, `PHYSIOGRAPH_*` environment settings, existing Render URLs. Changing these operational names without a coordinated migration will break API connections.

This is a fictional, read-only demonstration. The backend does not ingest real astronaut health or suit telemetry. Historical NASA laboratory assays are a separate research input.

## Current architecture (November 15, 2026)

All three currently connected Render services watch the **private** GitHub repository `Rhenzmar/PhysioGraph` on branch `main`, with automatic deploys:

| Render service | Type | URL | Build/runtime |
| --- | --- | --- | --- |
| `healthguard` | Static React/Vite | https://physiograph-dashboard.onrender.com/ | `cd frontend && npm install --no-audit --no-fund && npm run build`, publish `frontend/dist` |
| `physiograph-api-lurx` | FastAPI Docker backend | https://physiograph-api-lurx.onrender.com/ | Root `Dockerfile` |
| `physiograph-api` | Additional FastAPI Docker backend | https://physiograph-api.onrender.com/ | Root `Dockerfile` |

These are **currently observed deployment settings**, not a guarantee that the URLs remain unchanged.

## Frontend configuration

Set the **public-only** build variable `VITE_PHYSIOGRAPH_API_BASE` to the deployed API origin you intend to use. The example `frontend/.env.example` currently points to `https://physiograph-api-lurx.onrender.com`. Do not put passwords, tokens, ingest keys or any other private credentials in a `VITE_*` variable.

Configure `PHYSIOGRAPH_CORS_ORIGINS` on the backend to permit the **exact** static site origin, `https://physiograph-dashboard.onrender.com`. Do not use `*`.

## Backend configuration

`Dockerfile` and `render.yaml` retain these compatibility settings:

```dotenv
PHYSIOGRAPH_INFERENCE_BACKEND=numpy
PHYSIOGRAPH_PUBLIC_MODE=1
PHYSIOGRAPH_AUTO_DEMO=1
PHYSIOGRAPH_AUTO_DEMO_SPEED=10
```

The demo streams four source-separated fictional crews internally. Anonymous live ingestion is disabled in public mode by design. The default API is deliberately not a production medical data service.

## Verification

1. Confirm the static site is live and can show simulated crew packets.
2. Visit `https://physiograph-api-lurx.onrender.com/api/live/health` and `/api/system/readiness` to check availability and inference status.
3. Switch all four fictional crew members. Confirm the UI never displays a NASA historical laboratory result as a current physiological reading.
4. Try normal monitoring over time and a scripted scenario; normal simulator uptime must not itself drain suit oxygen into a false CRITICAL.
5. Check that a scripted failure still changes its affected readings, with proper source and severity labels.
6. Check browser audio manually, because browser tests cannot guarantee sound at the speaker.
7. Inspect GitHub Actions for both frontend and backend verification; do not confuse a green frontend build with full backend or browser testing.

Render cold starts and redeploys can reset in-memory simulated stream state. No medical operational uptime or reliability is promised.

## Repository and service renaming

**Do not rename active API environment variables or the `physiograph/` Python import directory casually.** Rename the GitHub repository only after checking its connection in Render; GitHub redirects are not a sufficient deployment test. Keep the current working static URL until a new custom hostname has actually been verified.

See [repository naming and separate public reader-repo plan](docs/REPOSITORY_RENAME_AND_PUBLICATION.md).

## HealthGuard-branded service pair (created November 15, 2026)

- **Frontend:** https://healthguard-dashboard.onrender.com/ (`healthguard-dashboard`; static site)
- **API:** https://healthguard-api-19xg.onrender.com/ (`healthguard-api`; Docker/FastAPI, free Singapore)
- The new frontend build variable `VITE_PHYSIOGRAPH_API_BASE` points to the new API. The new API's `PHYSIOGRAPH_CORS_ORIGINS` allowlist includes both old and new frontend origins.
- All original Render services remain available as fallbacks. Their URLs have **not** been reassigned or deleted.
- Render generated the `-19xg` suffix for the new API hostname. Do not assume changing its dashboard display name changes the `onrender.com` address.
- The legacy `PHYSIOGRAPH_*` configuration keys and `physiograph/` Python import package are retained to avoid breaking the running application. The public product and API title are HealthGuard.

After any future change to `frontend/src/api.js`, verify the **new** frontend and API have both built from the same commit; the old site remains available during migration.
