# Self-Hosting

The self-hosted app is the complete public version of FridgeShare. It runs as a local Node HTTP server, stores boards on disk, and does not require hosted accounts, billing, telemetry, or any call-home service.

## Quick Start

```sh
curl -fsSL https://raw.githubusercontent.com/nacho-labs-llc/fridgeshare/main/docker-compose.yml -o docker-compose.yml
docker compose up -d
```

The app listens on `http://localhost:4173`.

1. Open `http://localhost:4173/`.
2. Create a board from the directory. The form is prefilled with a random board name that you can keep or replace.
3. Bookmark or share the returned `/b/<slug>#<edit-token>` URL with people who should be able to edit.
4. Share `/b/<slug>` without the fragment for read-only access.

Set `SELFHOST_ADMIN_TOKEN` before exposing the server outside a trusted LAN.

## Boards

- `/` opens the self-host board directory.
- `/b/kitchen-board` opens a named board.
- `/local` opens the browser-only local storage version.

Named boards are listed in the directory and use lowercase slugs. Creating a named board also creates its initial board JSON file and returns a URL containing the board edit token as a URL fragment.

Self-hosted shared boards are named boards only. The directory suggests a random slug by default so creating a board is still quick without introducing a separate disposable URL mode.

## Edit Access

Board edit tokens live in the URL fragment, for example:

```text
http://localhost:4173/b/kitchen-board#abcdefghijklmnopqrstuvwxyz123456
```

Browsers do not send URL fragments to the server when requesting a page. The client reads the fragment and sends it as `X-Fridge-Edit-Token` only when saving board state or uploading images.

- A URL with the fragment can edit the board.
- The same URL without the fragment can view the board.
- The server stores the board edit token in that board's JSON file.
- If you lose the edit URL, recover the token from `server/data/fridges/<slug>.json`.

Treat edit-token URLs like passwords.

### Recovering a Lost Token

If you lose the edit URL but still have server access, recover the token from the board JSON file.

With the downloaded Docker Compose file:

```text
data/fridges/<slug>.json
```

If you run from a source checkout with the build override:

```text
server/data/fridges/<slug>.json
```

Open the file and look for `"editToken"`. The value is the board edit token.

## Admin Token

Set `SELFHOST_ADMIN_TOKEN` to require an admin token when creating or deleting boards through the directory API.

```yaml
environment:
  SELFHOST_ADMIN_TOKEN: "change-me"
```

The token is sent only from the directory form as `X-Selfhost-Admin-Token`. Board editing still uses per-board edit tokens in URL fragments.

When `SELFHOST_ADMIN_TOKEN` is unset, board creation is open to anyone who can reach the server. For LAN-only deployments that may be acceptable; public deployments should set it.

The admin token also authorizes image uploads without a board edit token. This is mainly useful for administrative tooling.

## Data Layout

Inside the container, all persistent self-host data lives under `/app/server/data`. With the default downloaded Docker Compose file, that container directory is mounted to `./data` on the host:

```text
data/
  boards.json
  fridges/
    kitchen-board.json
  uploads/
    <32-character-asset-id>.png
    <32-character-asset-id>.jpg
    <32-character-asset-id>.gif
    <32-character-asset-id>.webp
```

- `boards.json` stores board directory metadata: slug, title, creation time, and last access/update time.
- `fridges/<slug>.json` stores board canvas state, including the edit token, theme, revision, and items.
- `uploads/` stores raw uploaded image files.
- Saved photo items reference uploaded images as `/api/assets/<asset-id>`.

The historical `fridges` directory name is retained for compatibility. It stores board JSON, not only refrigerator-specific data.

## Image Storage

Self-hosted uploads are stored on local disk and served through `/api/assets/<asset-id>`.

- Upload endpoint: `POST /api/selfhost/uploads`.
- Asset endpoint: `GET /api/assets/<asset-id>`.
- Supported image types: PNG, JPEG, GIF, and WebP.
- Default upload limit: `4 MiB`.
- Asset filenames are random IDs with the original safe extension.
- Asset responses are cacheable for one year because asset IDs are immutable.

Uploads normally require the board edit token and a board id. The browser sends these automatically when adding photos to a board. If `SELFHOST_ADMIN_TOKEN` is configured, clients may also upload with `X-Selfhost-Admin-Token`.

Deleting a board removes its directory metadata and board JSON file, but uploaded image files are not garbage-collected yet. Keep this in mind when estimating disk usage and when pruning old data manually.

Legacy boards may still contain photo `data:` URLs embedded directly in board JSON. They remain supported, so older backups continue to load. New uploaded photos should use `/api/assets/<asset-id>` URLs so board JSON stays small.

## Backup And Restore

Back up the entire host data directory. It contains board metadata, board state, and uploaded images.

| Path | Contents |
|---|---|
| `boards.json` | Board directory metadata: slugs, titles, timestamps |
| `fridges/<slug>.json` | Board canvas state, edit token, items, revision history |
| `uploads/<asset-id>.*` | Raw uploaded image files referenced by photo items |

`boards.json` and `fridges/` are linked. Restoring one without the other leaves boards either missing from the directory or listed without their content. Photo items in board JSON reference files in `uploads/` by asset ID, so restore all three together.

For the default downloaded Docker Compose file, that host directory is `./data`.

Example backup:

```sh
tar -czf fridge-data-$(date +%Y%m%d).tgz data
```

Example restore:

```sh
docker compose down
rm -rf data
tar -xzf fridge-data-20260429.tgz
docker compose up -d
```

Restore the whole directory together. Restoring only `fridges/` without `boards.json` can leave named boards missing from the directory. Restoring only board JSON without `uploads/` can leave photo items pointing at missing assets.

Before a manual restore, verify that the archive expands to the same host data path your Compose file mounts. For the default downloaded Compose file, that is `data/...`; for a source checkout using the build override, it may be `server/data/...`.

## Environment

- `PORT`: HTTP port, default `4173`.
- `FRIDGE_DATA_DIR`: board state directory, default `server/data/fridges`.
- `FRIDGE_UPLOAD_DIR`: uploaded image directory, default `server/data/uploads`.
- `BOARD_DIRECTORY_PATH`: board metadata file, default `server/data/boards.json`.
- `FRIDGE_MAX_UPLOAD_BYTES`: maximum upload request size, default `4194304`.
- `FRIDGE_WRITE_RATE_WINDOW_MS`: write rate limit window per client and board, default `60000`.
- `FRIDGE_WRITE_RATE_LIMIT`: write requests allowed per window, default `60`.
- `SELFHOST_ADMIN_TOKEN`: admin token for board creation/deletion. If not set, one is generated at startup and written to `.admin-token` in the same directory as `boards.json`. Retrieve it with `cat ./data/.admin-token`.
- `FRIDGE_TRUST_PROXY`: set to `1` if the server is behind a reverse proxy that sets `X-Forwarded-For`. Leave unset for direct deployments. When unset, the real socket address is always used for rate limiting.

`FRIDGE_WRITE_RATE_WINDOW_MS` and `FRIDGE_WRITE_RATE_LIMIT` together define a write rate limiter applied per client IP per board. The defaults (60 writes per 60 seconds) are generous for normal household use. For a more public server, reduce `FRIDGE_WRITE_RATE_LIMIT`.

## Docker Compose

The included `docker-compose.yml` publishes the app on port `4173` and persists data with this host volume:

```yaml
volumes:
  - ./data:/app/server/data
```

With the default environment, the container stores:

- board JSON at `/app/server/data/fridges`
- uploads at `/app/server/data/uploads`
- board directory metadata at `/app/server/data/boards.json`

If you override `FRIDGE_DATA_DIR`, `FRIDGE_UPLOAD_DIR`, or `BOARD_DIRECTORY_PATH`, make sure those paths are inside a mounted volume. Otherwise, the data can be lost when the container is replaced.

For public or semi-public deployments, set:

```yaml
environment:
  PORT: "4173"
  NODE_ENV: production
  SELFHOST_ADMIN_TOKEN: "change-me"
```

### Changing the Port

To run on a different port, for example `8080`:

```yaml
environment:
  PORT: "8080"
ports:
  - "8080:8080"
```

Both the `environment` value and the `ports` mapping must match.

### Moving Data to a Different Host Directory

If you want to store data somewhere other than `./data`, update the volume mapping and the path environment variables together:

```yaml
environment:
  FRIDGE_DATA_DIR: /data/fridges
  FRIDGE_UPLOAD_DIR: /data/uploads
  BOARD_DIRECTORY_PATH: /data/boards.json
volumes:
  - /your/host/path:/data
```

All three paths must be inside the mounted volume. If any path falls outside the mount, data stored there will be lost when the container is replaced.

## Upgrades

Stop the server, back up, then pull the latest image:

```sh
docker compose down
tar -czf fridge-backup-pre-upgrade-$(date +%Y%m%d).tgz data
docker compose pull
docker compose up -d
```

Open `http://localhost:4173` and verify your boards are still there.

If you run from a source checkout:

```sh
git pull
docker compose -f docker-compose.yml -f docker-compose.build.yml up --build -d
```

Upgrade cautions:

- Keep the Docker volume mapping pointed at the same host data directory.
- Do not rename the `fridges` directory unless you also set `FRIDGE_DATA_DIR`.
- Do not rename the `uploads` directory unless you also set `FRIDGE_UPLOAD_DIR`.
- Keep `boards.json`, `fridges/`, and `uploads/` from the same backup snapshot.
- Preserve legacy board JSON containing embedded photo `data:` URLs; the app still accepts them.
- Prefer testing the upgraded container against a copy of your data directory before replacing a public deployment.
