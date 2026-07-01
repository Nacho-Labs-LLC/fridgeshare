const assert = require("node:assert/strict");
const test = require("node:test");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "../src/emoji-data.js"), "utf8");

function createEnv() {
  const context = {
    window: {}
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  return context.window.EmojiData;
}

test("EmojiData is attached to window", () => {
  const EmojiData = createEnv();
  assert.ok(EmojiData, "EmojiData should be defined");
  assert.equal(typeof EmojiData.load, "function", "EmojiData.load should be a function");
});

test("EmojiData.load() returns expected emoji groups", async () => {
  const EmojiData = createEnv();
  const groups = await EmojiData.load();

  assert.ok(Array.isArray(groups), "load() should return an array");
  assert.ok(groups.length > 0, "groups array should not be empty");

  // Check structure of first group
  const firstGroup = groups[0];
  assert.equal(typeof firstGroup.name, "string", "group should have a name string");
  assert.equal(typeof firstGroup.icon, "string", "group should have an icon string");
  assert.ok(Array.isArray(firstGroup.emojis), "group should have an emojis array");

  // Basic validation of specific group (Smileys)
  const smileysGroup = groups.find(g => g.name === "Smileys");
  assert.ok(smileysGroup, "Should contain Smileys group");
  assert.equal(smileysGroup.icon, "😀", "Smileys icon should be correct");
  assert.ok(smileysGroup.emojis.includes("😀"), "Smileys should include grinning face");
});
