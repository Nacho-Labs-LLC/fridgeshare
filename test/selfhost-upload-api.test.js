const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const testDir = path.join(os.tmpdir(), `fridge-upload-api-test-${process.pid}`);
process.env.FRIDGE_DATA_DIR = path.join(testDir, "fridges");
process.env.BOARD_DIRECTORY_PATH = path.join(testDir, "boards.json");
process.env.FRIDGE_UPLOAD_DIR = path.join(testDir, "uploads");
process.env.FRIDGE_MAX_UPLOAD_BYTES = "8";
process.env.SELFHOST_ADMIN_TOKEN = "admin-secret";

const { server } = require("../server/index.js");

const editToken = "abcdefghijklmnopqrstuvwxyz123456";
const boardId = "upload-board";
const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);

function listen() {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

async function jsonRequest(baseUrl, pathName, options = {}) {
  const response = await fetch(`${baseUrl}${pathName}`, options);
  const text = await response.text();
  return { response, body: text ? JSON.parse(text) : null };
}

async function createBoard(baseUrl) {
  const { response } = await jsonRequest(baseUrl, `/api/boards/${boardId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "X-Fridge-Edit-Token": editToken,
    },
    body: JSON.stringify({ items: [], theme: "classic-white" }),
  });
  assert.equal(response.status, 200);
}

test.before(async () => {
  await fs.rm(testDir, { recursive: true, force: true });
  global.uploadBaseUrl = await listen();
  await createBoard(global.uploadBaseUrl);
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await fs.rm(testDir, { recursive: true, force: true });
});

test("self-host upload stores raw image bytes and serves board-safe asset URLs", async () => {
  const uploaded = await jsonRequest(global.uploadBaseUrl, `/api/selfhost/uploads?boardId=${boardId}`, {
    method: "POST",
    headers: {
      "Content-Type": "image/png",
      "X-Fridge-Edit-Token": editToken,
    },
    body: pngBytes,
  });

  assert.equal(uploaded.response.status, 201);
  assert.match(uploaded.body.assetId, /^[A-Za-z0-9_-]{32}\.png$/);
  assert.equal(uploaded.body.src, `/api/assets/${uploaded.body.assetId}`);
  assert.equal(uploaded.body.contentType, "image/png");
  assert.equal(uploaded.body.byteSize, pngBytes.length);

  const saved = await jsonRequest(global.uploadBaseUrl, `/api/boards/${boardId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "X-Fridge-Edit-Token": editToken,
    },
    body: JSON.stringify({
      theme: "classic-white",
      items: [{
        type: "polaroid",
        x: 0,
        y: 0,
        width: 120,
        height: 120,
        src: uploaded.body.src,
      }],
    }),
  });
  assert.equal(saved.response.status, 200);
  assert.equal(saved.body.items[0].src, uploaded.body.src);

  const asset = await fetch(`${global.uploadBaseUrl}${uploaded.body.src}`);
  assert.equal(asset.status, 200);
  assert.equal(asset.headers.get("content-type"), "image/png");
  assert.equal(asset.headers.get("content-length"), String(pngBytes.length));
  assert.equal(asset.headers.get("x-content-type-options"), "nosniff");
  assert.equal(asset.headers.get("cache-control"), "public, max-age=31536000, immutable");
  assert.deepEqual(Buffer.from(await asset.arrayBuffer()), pngBytes);
});

test("self-host upload rejects missing or invalid authorization", async () => {
  const missing = await jsonRequest(global.uploadBaseUrl, `/api/selfhost/uploads?boardId=${boardId}`, {
    method: "POST",
    headers: { "Content-Type": "image/png" },
    body: pngBytes,
  });
  assert.equal(missing.response.status, 403);

  const wrong = await jsonRequest(global.uploadBaseUrl, `/api/selfhost/uploads?boardId=${boardId}`, {
    method: "POST",
    headers: {
      "Content-Type": "image/png",
      "X-Fridge-Edit-Token": "wrongwrongwrongwrongwrongwrong",
    },
    body: pngBytes,
  });
  assert.equal(wrong.response.status, 403);
});

test("self-host upload accepts configured admin token", async () => {
  const uploaded = await jsonRequest(global.uploadBaseUrl, "/api/selfhost/uploads", {
    method: "POST",
    headers: {
      "Content-Type": "image/png",
      "X-Selfhost-Admin-Token": "admin-secret",
    },
    body: pngBytes,
  });

  assert.equal(uploaded.response.status, 201);
  assert.match(uploaded.body.src, /^\/api\/assets\/[A-Za-z0-9_-]{32}\.png$/);
});

test("self-host upload rejects unsupported content types and oversized bodies", async () => {
  const unsupported = await jsonRequest(global.uploadBaseUrl, `/api/selfhost/uploads?boardId=${boardId}`, {
    method: "POST",
    headers: {
      "Content-Type": "image/svg+xml",
      "X-Fridge-Edit-Token": editToken,
    },
    body: Buffer.from("<svg />"),
  });
  assert.equal(unsupported.response.status, 415);

  const mismatch = await jsonRequest(global.uploadBaseUrl, `/api/selfhost/uploads?boardId=${boardId}`, {
    method: "POST",
    headers: {
      "Content-Type": "image/png",
      "X-Fridge-Edit-Token": editToken,
    },
    body: Buffer.from("notpng"),
  });
  assert.equal(mismatch.response.status, 415);
  assert.equal(mismatch.body.error, "Image bytes do not match the content type.");

  const oversized = await jsonRequest(global.uploadBaseUrl, `/api/selfhost/uploads?boardId=${boardId}`, {
    method: "POST",
    headers: {
      "Content-Type": "image/png",
      "X-Fridge-Edit-Token": editToken,
    },
    body: Buffer.alloc(9, 1),
  });
  assert.equal(oversized.response.status, 413);
});

test("asset serving rejects invalid ids without reading arbitrary files", async () => {
  const invalid = await jsonRequest(global.uploadBaseUrl, "/api/assets/..%2Fpackage.json");
  assert.equal(invalid.response.status, 400);
  assert.equal(invalid.body.error, "Invalid asset id.");

  const missing = await jsonRequest(global.uploadBaseUrl, "/api/assets/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png");
  assert.equal(missing.response.status, 404);
});
