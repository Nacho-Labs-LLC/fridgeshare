# Architecture

FridgeShare is a single self-hosted app. The code is organized by responsibility so the board engine stays easy to test, but there is no separate hosted product or cloud wrapper in this repo.

## Current Boundaries

- `core/` contains board validation, normalization, and patch logic. It must not import server code, filesystem storage, auth, deployment, or browser concerns.
- `server/` is a compatibility entrypoint for `npm start` and existing deployments.
- `apps/selfhost/` contains the HTTP server and runtime adapters, starting with file-backed board persistence.
- `src/` is the browser board experience.
- `test/` covers core behavior, self-host API behavior, and browser shell serving.

## Self-Hosted Product

Self-hosted boards are first-class:

- `/b/:slug` serves a named shared board, such as `/b/kitchen-board`.
- Root `/` serves the board directory.
- `/api/boards/:boardId` is the canonical board state API.
- `/api/fridges/:id` remains as a legacy compatibility alias while the app migrates terminology.
- `/api/bootstrap?path=/b/:slug` exposes board context to the browser.
- `/api/selfhost/boards` manages board directory metadata.
- Board state is stored locally as JSON files.
- Board directory metadata is stored separately from canvas state.
- Edit tokens are URL fragments and are never sent by the server in public board payloads.
- `SELFHOST_ADMIN_TOKEN` can require an admin token for board creation/deletion.
- Shared boards are named boards only; disposable hash-only boards are not part of the self-host product.
- The app should not include billing, hosted accounts, hosted plan limits, telemetry, or call-home behavior.

## Adapter Direction

Keep abstractions tied to real self-hosted needs. Add an interface only when it simplifies the app or when there is a concrete second implementation inside the self-hosted product.

Likely extension points:

- board state store, if file storage stops being enough for self-hosted installs
- image/object store
- realtime transport
- board directory resolver

Avoid marketplace systems, multi-cloud layers, generic policy engines, hosted-only feature flags, and account/billing scaffolding.
