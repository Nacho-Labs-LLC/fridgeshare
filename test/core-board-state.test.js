const assert = require("node:assert/strict");
const test = require("node:test");

const {
  applyBoardOps,
  getRevision,
  normalizeSavedBoard,
  publicBoardState,
  validateBoardState,
} = require("../core/board-state");

test("core validation sanitizes board state without server dependencies", () => {
  const result = validateBoardState({
    theme: "classic-white",
    items: [{
      type: "note",
      x: "12",
      y: 20,
      width: 100,
      height: 100,
      text: "a".repeat(300),
      color: "not-a-color",
      paperStyle: "yellow-sticky",
    }],
  });

  assert.equal(result.ok, true);
  assert.equal(result.value.items[0].x, 12);
  assert.equal(result.value.items[0].text.length, 220);
  assert.equal(result.value.items[0].color, "#ffe98a");
});

test("core validation preserves safe item display metadata", () => {
  const result = validateBoardState({
    theme: "classic-white",
    items: [
      {
        id: "magnet-alpha",
        type: "alphabet",
        x: 0,
        y: 0,
        width: 68,
        height: 72,
        label: "B",
        magnetStyle: "classic",
        sizePreset: "jumbo",
        palette: {
          light: "#ffdf6b",
          base: "#f7b731",
          dark: "#d18412",
          unsafe: "nope",
        },
      },
      {
        id: "note-alpha",
        type: "note",
        x: 0,
        y: 0,
        width: 176,
        height: 176,
        text: "hello",
        paperStyle: "yellow-sticky",
        sizePreset: "large",
      },
      {
        id: "photo-alpha",
        type: "polaroid",
        x: 0,
        y: 0,
        width: 210,
        height: 248,
        src: "/api/assets/abcdefghijklmnopqrstuvwxyz123456.png",
        sizePreset: "mini",
      },
    ],
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.value.items[0].palette, {
    light: "#ffdf6b",
    base: "#f7b731",
    dark: "#d18412",
  });
  assert.equal(result.value.items[0].sizePreset, "jumbo");
  assert.equal(result.value.items[1].sizePreset, "large");
  assert.equal(result.value.items[2].sizePreset, "mini");
});

test("core validation accepts legacy photo data URLs", () => {
  const src = "data:image/png;base64,aGVsbG8=";
  const result = validateBoardState({
    items: [{
      type: "polaroid",
      x: 0,
      y: 0,
      width: 210,
      height: 248,
      src,
    }],
  });

  assert.equal(result.ok, true);
  assert.equal(result.value.items[0].src, src);
});

test("core validation accepts local photo asset URLs", () => {
  const src = "/api/assets/abcdefghijklmnopqrstuvwxyz123456.png";
  const result = validateBoardState({
    items: [{
      type: "polaroid",
      x: 0,
      y: 0,
      width: 210,
      height: 248,
      src,
    }],
  });

  assert.equal(result.ok, true);
  assert.equal(result.value.items[0].src, src);
});

test("core validation rejects external photo URLs", () => {
  for (const src of [
    "https://example.com/photo.png",
    "http://example.com/photo.png",
    "//example.com/photo.png",
  ]) {
    const result = validateBoardState({
      items: [{ type: "polaroid", src }],
    });

    assert.equal(result.ok, false, src);
    assert.equal(result.error, "Photo asset URLs must be local paths.", src);
  }
});

test("core validation rejects malformed photo asset URLs", () => {
  for (const src of [
    "/uploads/abcdefghijklmnopqrstuvwxyz123456.png",
    "/api/assets/short.png",
    "/api/assets/abcdefghijklmnopqrstuvwxyz123456.svg",
    "/api/assets/abcdefghijklmnopqrstuvwxyz123456.PNG",
    "/api/assets/abcdefghijklmnopqrstuvwxyz123456.png/extra",
    "/api/assets/abcdefghijklmnopqrstuvwxyz123456.png?download=1",
  ]) {
    const result = validateBoardState({
      items: [{ type: "polaroid", src }],
    });

    assert.equal(result.ok, false, src);
    assert.equal(result.error, "Photo asset URLs must match /api/assets/<assetId>.", src);
  }
});

test("public board state strips edit tokens", () => {
  const state = normalizeSavedBoard({
    editToken: "abcdefghijklmnopqrstuvwxyz123456",
    items: [],
    revision: 2,
  }, "kitchen");

  assert.equal(state.editToken, "abcdefghijklmnopqrstuvwxyz123456");
  assert.equal(publicBoardState(state).editToken, undefined);
});

test("core patch operations merge independent item edits", () => {
  const saved = normalizeSavedBoard({
    revision: 2,
    theme: "classic-white",
    items: [
      { id: "note-alpha", type: "note", x: 0, y: 0, width: 100, height: 100, text: "one" },
      { id: "emoji-beta", type: "emoji", x: 10, y: 10, width: 50, height: 50, emoji: "*" },
    ],
  }, "kitchen");

  const result = applyBoardOps(saved, {
    baseRevision: 1,
    clientId: "client-a",
    opId: "client-a:1",
    ops: [
      { type: "item.update", id: "note-alpha", patch: { text: "two" } },
      { type: "item.update", id: "emoji-beta", patch: { x: 42 } },
    ],
  });

  assert.equal(result.ok, true);
  assert.equal(result.value.revision, 3);
  assert.equal(result.value.items[0].text, "two");
  assert.equal(result.value.items[1].x, 42);
  assert.equal(result.value.changes.length, 1);
  assert.equal(result.value.changes[0].opId, "client-a:1");
});

test("core patch operations are idempotent by op id", () => {
  const saved = normalizeSavedBoard({
    revision: 3,
    theme: "classic-white",
    items: [{ id: "note-alpha", type: "note", x: 0, y: 0, width: 100, height: 100, text: "two" }],
    changes: [{ revision: 3, opId: "client-a:1", clientId: "client-a", ops: [] }],
  }, "kitchen");

  const result = applyBoardOps(saved, {
    clientId: "client-a",
    opId: "client-a:1",
    ops: [{ type: "item.update", id: "note-alpha", patch: { text: "three" } }],
  });

  assert.equal(result.ok, true);
  assert.equal(result.duplicate, true);
  assert.equal(result.value.revision, 3);
  assert.equal(result.value.items[0].text, "two");
});

test("getRevision extracts valid positive integers and defaults to 0", () => {
  assert.equal(getRevision(undefined), 0);
  assert.equal(getRevision(null), 0);
  assert.equal(getRevision({}), 0);

  assert.equal(getRevision({ revision: 0 }), 0);
  assert.equal(getRevision({ revision: 42 }), 42);

  assert.equal(getRevision({ revision: -1 }), 0);
  assert.equal(getRevision({ revision: -42 }), 0);

  assert.equal(getRevision({ revision: 3.14 }), 0);

  assert.equal(getRevision({ revision: "42" }), 0);
  assert.equal(getRevision({ revision: "0" }), 0);

  assert.equal(getRevision({ revision: Number.MAX_SAFE_INTEGER + 1 }), 0);
});
