const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { FileBoardStore } = require("../apps/selfhost/file-board-store");

test("file board store writes, normalizes, reads, and deletes board JSON", async () => {
  const dataDir = path.join(os.tmpdir(), `fridge-store-test-${process.pid}-${Date.now()}`);
  const store = new FileBoardStore({ dataDir });

  try {
    const writeResult = await store.write("kitchen-board", {
      version: 1,
      id: "kitchen-board",
      editToken: "abcdefghijklmnopqrstuvwxyz123456",
      revision: 3,
      theme: "classic-white",
      items: [],
    });

    assert.equal(writeResult.ok, true);
    assert.equal(writeResult.value.revision, 3);

    const readResult = await store.read("kitchen-board");
    assert.equal(readResult.ok, true);
    assert.equal(readResult.value.id, "kitchen-board");
    assert.equal(readResult.value.editToken, "abcdefghijklmnopqrstuvwxyz123456");

    const deleted = await store.delete("kitchen-board");
    assert.equal(deleted.ok, true);

    const missing = await store.read("kitchen-board");
    assert.equal(missing.ok, false);
    assert.equal(missing.status, 404);
  } finally {
    await fs.rm(dataDir, { recursive: true, force: true });
  }
});

test("file board store rejects invalid board ids", async () => {
  const store = new FileBoardStore({ dataDir: os.tmpdir() });
  const result = await store.read("../escape");

  assert.equal(result.ok, false);
  assert.equal(result.status, 400);
});
