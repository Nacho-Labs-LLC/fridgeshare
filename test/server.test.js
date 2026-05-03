const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const dataDir = path.join(os.tmpdir(), `fridge-server-test-${process.pid}`);
process.env.FRIDGE_DATA_DIR = dataDir;
process.env.BOARD_DIRECTORY_PATH = path.join(dataDir, "boards.json");

const { server } = require("../server/index.js");

const editToken = "abcdefghijklmnopqrstuvwxyz123456";

function listen() {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

async function request(baseUrl, pathName, options = {}) {
  const response = await fetch(`${baseUrl}${pathName}`, options);
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  return { response, body };
}

test.before(async () => {
  await fs.rm(dataDir, { recursive: true, force: true });
  global.baseUrl = await listen();
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await fs.rm(dataDir, { recursive: true, force: true });
});

test("write operations require an edit token", async () => {
  const { response, body } = await request(global.baseUrl, "/api/boards/test-fridge", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items: [] }),
  });

  assert.equal(response.status, 403);
  assert.equal(body.error, "Valid edit token required.");
});

test("first authorized write creates a board without leaking the edit token", async () => {
  const { response, body } = await request(global.baseUrl, "/api/boards/test-fridge", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "X-Fridge-Edit-Token": editToken,
    },
    body: JSON.stringify({
      theme: "classic-white",
      items: [{ type: "note", x: 10, y: 20, width: 100, height: 100, text: "hello" }],
    }),
  });

  assert.equal(response.status, 200);
  assert.equal(body.revision, 1);
  assert.equal(body.editToken, undefined);
  assert.equal(body.items[0].text, "hello");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.match(response.headers.get("content-security-policy"), /default-src 'self'/);
});

test("legacy fridge API route remains a board API alias", async () => {
  const { response, body } = await request(global.baseUrl, "/api/fridges/test-fridge");

  assert.equal(response.status, 200);
  assert.equal(body.id, "test-fridge");
  assert.equal(body.editToken, undefined);
});

test("bootstrap returns self-host board context", async () => {
  const named = await request(global.baseUrl, "/api/bootstrap?path=%2Fb%2Fkitchen-board");
  assert.equal(named.response.status, 200);
  assert.equal(named.body.mode, "selfhost");
  assert.equal(named.body.boardId, "kitchen-board");
  assert.equal(named.body.apiBase, "/api/boards");
  assert.equal(named.body.capabilities.namedBoards, true);

  const root = await request(global.baseUrl, "/api/bootstrap?path=%2F");
  assert.equal(root.response.status, 200);
  assert.equal(root.body.boardId, "");
});

test("self-host board directory creates and lists boards", async () => {
  const created = await request(global.baseUrl, "/api/selfhost/boards", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: "Kitchen Board", slug: "kitchen-board" }),
  });

  assert.equal(created.response.status, 201);
  assert.equal(created.body.board.slug, "kitchen-board");
  assert.match(created.body.url, /^\/b\/kitchen-board#/);

  const listed = await request(global.baseUrl, "/api/selfhost/boards");
  assert.equal(listed.response.status, 200);
  assert.equal(listed.body.boards.some((board) => board.slug === "kitchen-board"), true);
  assert.equal(listed.body.boards.find((board) => board.slug === "kitchen-board").canEdit, false);
});

test("self-host board directory lists saved board files without metadata", async () => {
  const saved = await request(global.baseUrl, "/api/boards/saved-only-board", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "X-Fridge-Edit-Token": editToken,
    },
    body: JSON.stringify({ items: [], theme: "classic-white" }),
  });
  assert.equal(saved.response.status, 200);

  const listed = await request(global.baseUrl, "/api/selfhost/boards");
  assert.equal(listed.response.status, 200);
  const board = listed.body.boards.find((candidate) => candidate.slug === "saved-only-board");
  assert.equal(board.title, "Saved Only Board");
  assert.equal(board.canEdit, false);
  assert.equal(board.editUrl, undefined);
});

test("subsequent writes must use the original edit token", async () => {
  const { response } = await request(global.baseUrl, "/api/boards/test-fridge", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "X-Fridge-Edit-Token": "wrongwrongwrongwrongwrongwrong",
    },
    body: JSON.stringify({ items: [] }),
  });

  assert.equal(response.status, 403);
});

test("stale board writes are rejected by revision", async () => {
  const created = await request(global.baseUrl, "/api/boards/conflict-board", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "X-Fridge-Edit-Token": editToken,
    },
    body: JSON.stringify({ baseRevision: 0, items: [] }),
  });
  assert.equal(created.response.status, 200);
  assert.equal(created.body.revision, 1);

  const stale = await request(global.baseUrl, "/api/boards/conflict-board", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "X-Fridge-Edit-Token": editToken,
    },
    body: JSON.stringify({
      baseRevision: 0,
      items: [{ type: "note", x: 10, y: 20, width: 100, height: 100, text: "stale" }],
    }),
  });
  assert.equal(stale.response.status, 409);
  assert.equal(stale.body.revision, 1);

  const current = await request(global.baseUrl, "/api/boards/conflict-board", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "X-Fridge-Edit-Token": editToken,
    },
    body: JSON.stringify({ baseRevision: 1, items: [] }),
  });
  assert.equal(current.response.status, 200);
  assert.equal(current.body.revision, 2);
});

test("stale board writes can be explicitly overwritten", async () => {
  const created = await request(global.baseUrl, "/api/boards/overwrite-board", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "X-Fridge-Edit-Token": editToken,
    },
    body: JSON.stringify({ baseRevision: 0, items: [] }),
  });
  assert.equal(created.response.status, 200);
  assert.equal(created.body.revision, 1);

  const overwritten = await request(global.baseUrl, "/api/boards/overwrite-board", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "X-Fridge-Edit-Token": editToken,
    },
    body: JSON.stringify({
      baseRevision: 0,
      forceOverwrite: true,
      items: [{ type: "note", x: 10, y: 20, width: 100, height: 100, text: "overwrite" }],
    }),
  });
  assert.equal(overwritten.response.status, 200);
  assert.equal(overwritten.body.revision, 2);
  assert.equal(overwritten.body.items[0].text, "overwrite");
});

test("patch updates merge independent board edits without full-state replacement", async () => {
  const created = await request(global.baseUrl, "/api/boards/patch-board", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "X-Fridge-Edit-Token": editToken,
    },
    body: JSON.stringify({
      baseRevision: 0,
      items: [
        { id: "note-alpha", type: "note", x: 10, y: 20, width: 100, height: 100, text: "one" },
        { id: "emoji-beta", type: "emoji", x: 20, y: 30, width: 50, height: 50, emoji: "*" },
      ],
    }),
  });
  assert.equal(created.response.status, 200);

  const first = await request(global.baseUrl, "/api/boards/patch-board", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "X-Fridge-Edit-Token": editToken,
    },
    body: JSON.stringify({
      baseRevision: 1,
      clientId: "client-a",
      opId: "client-a:1",
      ops: [{ type: "item.update", id: "note-alpha", patch: { text: "two" } }],
    }),
  });
  assert.equal(first.response.status, 200);
  assert.equal(first.body.revision, 2);

  const second = await request(global.baseUrl, "/api/boards/patch-board", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "X-Fridge-Edit-Token": editToken,
    },
    body: JSON.stringify({
      baseRevision: 1,
      clientId: "client-b",
      opId: "client-b:1",
      ops: [{ type: "item.update", id: "emoji-beta", patch: { x: 80 } }],
    }),
  });
  assert.equal(second.response.status, 200);
  assert.equal(second.body.revision, 3);

  const loaded = await request(global.baseUrl, "/api/boards/patch-board");
  assert.equal(loaded.body.items.find((item) => item.id === "note-alpha").text, "two");
  assert.equal(loaded.body.items.find((item) => item.id === "emoji-beta").x, 80);
  assert.equal(loaded.body.changes, undefined);

  const changes = await request(global.baseUrl, "/api/boards/patch-board/changes?since=1");
  assert.equal(changes.response.status, 200);
  assert.equal(changes.body.revision, 3);
  assert.deepEqual(changes.body.changes.map((change) => change.opId), ["client-a:1", "client-b:1"]);
});

test("change polling requests a snapshot when full-state saves are not in the patch log", async () => {
  const created = await request(global.baseUrl, "/api/boards/snapshot-fallback", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "X-Fridge-Edit-Token": editToken,
    },
    body: JSON.stringify({
      items: [{ id: "note-alpha", type: "note", x: 10, y: 20, width: 100, height: 100, text: "one" }],
    }),
  });
  assert.equal(created.response.status, 200);

  const overwritten = await request(global.baseUrl, "/api/boards/snapshot-fallback", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "X-Fridge-Edit-Token": editToken,
    },
    body: JSON.stringify({
      baseRevision: 1,
      items: [{ id: "note-alpha", type: "note", x: 10, y: 20, width: 100, height: 100, text: "two" }],
    }),
  });
  assert.equal(overwritten.response.status, 200);
  assert.equal(overwritten.body.revision, 2);

  const changes = await request(global.baseUrl, "/api/boards/snapshot-fallback/changes?since=1");
  assert.equal(changes.response.status, 200);
  assert.equal(changes.body.needsSnapshot, true);
  assert.equal(changes.body.state.items[0].text, "two");
});

test("patch updates are idempotent by op id", async () => {
  const first = await request(global.baseUrl, "/api/boards/patch-idempotent", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "X-Fridge-Edit-Token": editToken,
    },
    body: JSON.stringify({
      items: [{ id: "note-alpha", type: "note", x: 10, y: 20, width: 100, height: 100, text: "one" }],
    }),
  });
  assert.equal(first.response.status, 200);

  const body = JSON.stringify({
    clientId: "client-a",
    opId: "client-a:repeat",
    ops: [{ type: "item.update", id: "note-alpha", patch: { text: "two" } }],
  });
  const patched = await request(global.baseUrl, "/api/boards/patch-idempotent", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "X-Fridge-Edit-Token": editToken,
    },
    body,
  });
  assert.equal(patched.response.status, 200);
  assert.equal(patched.body.revision, 2);

  const repeated = await request(global.baseUrl, "/api/boards/patch-idempotent", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "X-Fridge-Edit-Token": editToken,
    },
    body,
  });
  assert.equal(repeated.response.status, 200);
  assert.equal(repeated.body.duplicate, true);
  assert.equal(repeated.body.revision, 2);
});

test("server rejects oversized item collections and photo data", async () => {
  const tooManyItems = Array.from({ length: 201 }, () => ({
    type: "emoji",
    x: 0,
    y: 0,
    width: 50,
    height: 50,
    emoji: "*",
  }));

  const many = await request(global.baseUrl, "/api/boards/too-many", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "X-Fridge-Edit-Token": editToken,
    },
    body: JSON.stringify({ items: tooManyItems }),
  });
  assert.equal(many.response.status, 400);

  const photo = await request(global.baseUrl, "/api/boards/too-large-photo", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "X-Fridge-Edit-Token": editToken,
    },
    body: JSON.stringify({
      items: [{
        type: "polaroid",
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        src: `data:image/png;base64,${"a".repeat(1_500_001)}`,
      }],
    }),
  });
  assert.equal(photo.response.status, 400);
});

test("server returns 413 for request bodies above the configured cap", async () => {
  const response = await fetch(`${global.baseUrl}/api/boards/too-large-body`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "X-Fridge-Edit-Token": editToken,
    },
    body: JSON.stringify({ items: [], padding: "a".repeat(4 * 1024 * 1024) }),
  });

  assert.equal(response.status, 413);
});

test("write operations are rate limited by client and board", async () => {
  let response = null;
  for (let index = 0; index < 61; index += 1) {
    response = await fetch(`${global.baseUrl}/api/boards/rate-limit-test`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Fridge-Edit-Token": editToken,
      },
      body: JSON.stringify({ items: [], theme: "classic-white" }),
    });
  }

  assert.equal(response.status, 429);
});

test("static path traversal is blocked", async () => {
  const response = await fetch(`${global.baseUrl}/..%2Fpackage.json`);
  assert.equal(response.status, 403);
});
