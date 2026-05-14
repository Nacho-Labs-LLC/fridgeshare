# FridgeShare

![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)

A virtual fridge door for your household. Put sticky notes, letter magnets, photos, emoji, and drawings on a shared board and give everyone the edit link.

No accounts. No tracking. Your data stays on your server.

## Quick Start

No git clone needed. Download the compose file and start:

```sh
curl -fsSL https://raw.githubusercontent.com/nacho-labs-llc/fridgeshare/main/docker-compose.yml -o docker-compose.yml
docker compose up -d
```

Or as a single `docker run`:

```sh
docker run -d \
  -p 4173:4173 \
  -v "$(pwd)/data:/app/server/data" \
  --restart unless-stopped \
  nacholabs/fridgeshare
```

Open http://localhost:4173, create a board, and share the URL.

## Features

- **Letter magnets** - multicolor alphabet magnets with style presets
- **Sticky notes** - notes with different paper styles and colors
- **Photos** - upload images with optional captions
- **Emoji** - large emoji magnets
- **Drawings** - dry-erase style sketches
- **Themes** - choose a fridge surface theme
- **Shared editing** - share the `#edit-token` URL fragment to give write access
- **Read-only links** - share the URL without the fragment for view-only access

## How Boards Work

When you create a board you get a URL like:

```
http://your-server/b/kitchen-board#abcdefghijklmnopqrstuvwxyz123456
```

The fragment (`#abc...`) is the edit token. It never leaves the browser; the server only receives it as a header when you save. Share the full URL for edit access; strip the fragment for read-only.

## Self-Hosting

See [docs/SELF_HOSTING.md](docs/SELF_HOSTING.md) for the full guide.

**Docker quick reference:**

```sh
# Start
docker compose up -d

# Stop
docker compose down

# Backup
tar -czf fridge-backup-$(date +%Y%m%d).tgz data
```

Set `SELFHOST_ADMIN_TOKEN` before exposing the server to the internet.

## Configuration

| Variable | Default | Description |
|---|---|---|
| `PORT` | `4173` | HTTP port |
| `SELFHOST_ADMIN_TOKEN` | _(unset)_ | Required token for board create/delete |
| `FRIDGE_DATA_DIR` | `server/data/fridges` | Board JSON directory |
| `FRIDGE_UPLOAD_DIR` | `server/data/uploads` | Image upload directory |
| `BOARD_DIRECTORY_PATH` | `server/data/boards.json` | Board metadata file |
| `FRIDGE_MAX_UPLOAD_BYTES` | `4194304` | Max upload size (bytes) |
| `FRIDGE_WRITE_RATE_WINDOW_MS` | `60000` | Rate limit window (ms) |
| `FRIDGE_WRITE_RATE_LIMIT` | `60` | Max writes per window |

## Unraid

Install via Community Applications or add the template repository manually in the CA settings:

```
https://github.com/nacho-labs-llc/fridgeshare
```

App data is stored at `/mnt/user/appdata/fridgeshare` by default.

## Development

Requires Node.js 20+. Zero npm dependencies; no install step needed.

```sh
# Run tests
npm test

# Start server locally (no Docker)
npm start
```

To build and run from source with Docker:

```sh
docker compose -f docker-compose.yml -f docker-compose.build.yml up --build
```

## Architecture

- `core/` - board state validation and mutation logic (no I/O)
- `apps/selfhost/` - HTTP server and file-backed storage
- `src/` - vanilla JS browser client

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full guide.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT - see [LICENSE](LICENSE).
