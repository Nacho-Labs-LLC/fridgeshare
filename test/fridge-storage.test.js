const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadFridgeStorage(fetchImpl) {
  const context = {
    Blob,
    FileReader: class {},
    URL,
    fetch: fetchImpl,
    localStorage: {
      getItem: () => null,
      removeItem: () => {},
      setItem: () => {},
    },
    window: {},
  };
  context.window.Blob = Blob;
  context.window.FileReader = context.FileReader;
  context.window.URL = URL;
  context.window.fetch = fetchImpl;
  context.window.localStorage = context.localStorage;
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, "..", "src", "fridge-storage.js"), "utf8"),
    context,
    { filename: "src/fridge-storage.js" }
  );
  return context.window.FridgeStorage;
}

test("BoardPersistence uploads raw image files to the self-host upload endpoint", async () => {
  const file = { type: "image/png", marker: "file-body" };
  const calls = [];
  const storage = loadFridgeStorage(async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      status: 201,
      json: async () => ({ src: "/api/assets/abcdefghijklmnopqrstuvwxyz123456.png" }),
    };
  });

  const persistence = new storage.BoardPersistence({
    boardId: "kitchen-board",
    editToken: "abcdefghijklmnopqrstuvwxyz123456",
  });
  const uploaded = await persistence.uploadImage(file);

  assert.equal(uploaded.src, "/api/assets/abcdefghijklmnopqrstuvwxyz123456.png");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "/api/selfhost/uploads?boardId=kitchen-board");
  assert.equal(calls[0].options.method, "POST");
  assert.equal(calls[0].options.body, file);
  assert.equal(calls[0].options.headers["Content-Type"], "image/png");
  assert.equal(calls[0].options.headers.Accept, "application/json");
  assert.equal(calls[0].options.headers["X-Fridge-Edit-Token"], "abcdefghijklmnopqrstuvwxyz123456");
});

test("BoardPersistence uploadImage propagates server errors", async () => {
  const storage = loadFridgeStorage(async () => ({
    ok: false,
    status: 413,
    json: async () => ({ error: "Request body too large." }),
  }));

  const persistence = new storage.BoardPersistence({
    boardId: "kitchen-board",
    editToken: "abcdefghijklmnopqrstuvwxyz123456",
  });

  await assert.rejects(
    () => persistence.uploadImage({ type: "image/png" }),
    /Request body too large\./
  );
});

test("BoardPersistence uploadImage accepts custom upload endpoints with query strings", async () => {
  const calls = [];
  const storage = loadFridgeStorage(async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      status: 201,
      json: async () => ({ src: "/api/assets/abcdefghijklmnopqrstuvwxyz123456.webp" }),
    };
  });

  const persistence = new storage.BoardPersistence({
    boardId: "kitchen board",
    editToken: "",
    uploadEndpoint: "/api/selfhost/uploads?source=test",
  });

  await persistence.uploadImage({ type: "image/webp" });

  assert.equal(calls[0].url, "/api/selfhost/uploads?source=test&boardId=kitchen%20board");
  assert.equal(calls[0].options.headers["X-Fridge-Edit-Token"], undefined);
});

test("BoardPersistence saves patch operations to board endpoint", async () => {
  const calls = [];
  const storage = loadFridgeStorage(async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      status: 200,
      json: async () => ({ revision: 4, items: [] }),
    };
  });

  const persistence = new storage.BoardPersistence({
    boardId: "kitchen-board",
    editToken: "abcdefghijklmnopqrstuvwxyz123456",
  });
  const result = await persistence.saveOps({
    baseRevision: 3,
    clientId: "client-a",
    opId: "client-a:1",
    ops: [{ type: "board.setTheme", theme: "classic-white" }],
  });

  assert.equal(result.revision, 4);
  assert.equal(calls[0].url, "/api/boards/kitchen-board");
  assert.equal(calls[0].options.method, "PATCH");
  assert.equal(calls[0].options.headers["X-Fridge-Edit-Token"], "abcdefghijklmnopqrstuvwxyz123456");
  assert.deepEqual(JSON.parse(calls[0].options.body).ops, [{ type: "board.setTheme", theme: "classic-white" }]);
});

test("BoardPersistence loads changes since a revision", async () => {
  const calls = [];
  const storage = loadFridgeStorage(async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      status: 200,
      json: async () => ({ revision: 5, changes: [] }),
    };
  });

  const persistence = new storage.BoardPersistence({ boardId: "kitchen-board" });
  const result = await persistence.loadChanges(3);

  assert.equal(result.revision, 5);
  assert.equal(calls[0].url, "/api/boards/kitchen-board/changes?since=3");
  assert.equal(calls[0].options.headers.Accept, "application/json");
});
