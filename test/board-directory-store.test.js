const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { BoardDirectoryStore, normalizeSlug } = require("../apps/selfhost/board-directory-store");

test("board directory store creates, lists, touches, and deletes metadata", async () => {
  const dir = path.join(os.tmpdir(), `fridge-directory-test-${process.pid}-${Date.now()}`);
  const store = new BoardDirectoryStore({ filePath: path.join(dir, "boards.json") });

  try {
    const created = await store.create({ title: "Kitchen Board", slug: "Kitchen Board" });
    assert.equal(created.ok, true);
    assert.equal(created.board.slug, "kitchen-board");
    assert.match(created.editToken, /^[a-zA-Z0-9_-]{24,}$/);

    const boards = await store.list();
    assert.equal(boards.length, 1);
    assert.equal(boards[0].title, "Kitchen Board");

    const touched = await store.touch("kitchen-board");
    assert.equal(touched.slug, "kitchen-board");

    const deleted = await store.delete("kitchen-board");
    assert.equal(deleted.ok, true);
    assert.deepEqual(await store.list(), []);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("slug normalization rejects unusable values", () => {
  assert.equal(normalizeSlug("Kitchen Board"), "kitchen-board");
  assert.equal(normalizeSlug("x"), "");
});
