const assert = require("node:assert/strict");
const test = require("node:test");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "../src/fridge-items.js"), "utf8");

function createEnv() {
  const context = {
    window: {},
    crypto: { getRandomValues: (arr) => arr },
    Image: class {
      constructor() {}
      set src(value) {}
      get width() { return 100; }
      get height() { return 100; }
    }
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  return context.window.FridgeItems;
}

test("itemFromJSON handles null and non-objects", () => {
  const { itemFromJSON } = createEnv();
  assert.equal(itemFromJSON(null), null);
  assert.equal(itemFromJSON(undefined), null);
  assert.equal(itemFromJSON("string"), null);
  assert.equal(itemFromJSON(123), null);
  assert.equal(itemFromJSON(true), null);
});

test("itemFromJSON returns correct subclasses for each type", () => {
  const { itemFromJSON, AlphabetMagnet, EmojiSticker, StickyNote, PolaroidItem, DryEraseBoardItem } = createEnv();

  assert.ok(itemFromJSON({ type: "alphabet" }) instanceof AlphabetMagnet);
  assert.ok(itemFromJSON({ type: "emoji" }) instanceof EmojiSticker);
  assert.ok(itemFromJSON({ type: "note" }) instanceof StickyNote);
  assert.ok(itemFromJSON({ type: "polaroid", src: "test.jpg" }) instanceof PolaroidItem);
  assert.ok(itemFromJSON({ type: "dryEraseBoard" }) instanceof DryEraseBoardItem);
});

test("itemFromJSON returns null for unknown types", () => {
  const { itemFromJSON } = createEnv();
  assert.equal(itemFromJSON({ type: "unknown" }), null);
  assert.equal(itemFromJSON({ type: "" }), null);
  assert.equal(itemFromJSON({ }), null);
});
