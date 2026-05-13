# Contributing

## Running locally

Node.js 20+ required. No install step - zero npm dependencies.

```sh
npm test      # run the full test suite
npm start     # start the server at http://localhost:4173
```

## Project layout

- `core/` - board state validation, normalization, and patch logic
- `apps/selfhost/` - HTTP server and file-backed storage
- `src/` - browser client
- `test/` - test suite (Node native test runner)

## Guidelines

- Keep zero production npm dependencies. Use Node.js built-ins.
- All changes must pass `npm test` before opening a PR.
- Follow the existing style: no bundler, no TypeScript, no frameworks.
- Core logic (`core/`) must stay I/O-free and focused on board state behavior.

## Pull requests

Open a PR against `master`. Include a clear description of what changed and why. For significant changes, open an issue first to discuss the approach.
