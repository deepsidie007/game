# Hatchable deployment

Deployed project: `proj_muwBPxPY3o1F` (slug `project-rjhu`).

App: https://project-rjhu.hatchable.site

Owner console: https://hatchable.com/console/projects/project-rjhu

This directory mirrors the Hatchable files. Upload `public/`, `api/`, `lib/` and `migrations/` through Hatchable, validate with dry_run_deploy, then deploy. Do not run the Node HTTP server on Hatchable; its V8 runtime uses individual API handlers and managed realtime subscriptions.

The game engine is adapted from the sibling Node implementation. Guest seat recovery uses an unguessable HttpOnly capability cookie; guests are not accounts. Room state is stored in PostgreSQL JSONB with conditional version updates to prevent concurrent actions from overwriting each other. Hand references are rehydrated on load so changes to cards and balances remain consistent. Realtime events contain only a version number; each guest receives a filtered snapshot from the server. Timeout processing runs on the next state/action request, with a single browser timer at the current turn deadline; there is no application polling loop.

Verified on 2026-11-18 using two independent managed browser sessions: create/join, ready/start, shared results in all four modes, hidden opponent cards, mobile width, and refresh recovery. Private project visibility was preserved. The owner must change Settings > Sharing to public before friends can use the permanent app URL without the platform sign-in wall; preview URLs are temporary and expire after 30 minutes.

The original single-player file under public/solo.html remains unchanged. Multiplayer room balances are separate from its local save. All chips are virtual, with no payments or cash-out.
