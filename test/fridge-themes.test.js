const assert = require("node:assert/strict");
const test = require("node:test");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "../src/fridge-themes.js"), "utf8");

function createEnv() {
  const context = {
    window: {}
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  return context.window.FridgeThemes;
}

test("fridgeSurfaceThemeById returns correct theme for valid IDs", () => {
  const { fridgeSurfaceThemeById } = createEnv();

  assert.equal(fridgeSurfaceThemeById("classic-white").id, "classic-white");
  assert.equal(fridgeSurfaceThemeById("brushed-stainless").id, "brushed-stainless");
  assert.equal(fridgeSurfaceThemeById("retro-mint").id, "retro-mint");
  assert.equal(fridgeSurfaceThemeById("warm-cream").id, "warm-cream");
  assert.equal(fridgeSurfaceThemeById("slightly-worn-white").id, "slightly-worn-white");
});

test("fridgeSurfaceThemeById returns default theme for invalid or missing IDs", () => {
  const { fridgeSurfaceThemeById, FRIDGE_SURFACE_THEMES } = createEnv();

  const defaultTheme = FRIDGE_SURFACE_THEMES[0];

  assert.equal(fridgeSurfaceThemeById("unknown-id"), defaultTheme);
  assert.equal(fridgeSurfaceThemeById(null), defaultTheme);
  assert.equal(fridgeSurfaceThemeById(undefined), defaultTheme);
  assert.equal(fridgeSurfaceThemeById(""), defaultTheme);
  assert.equal(fridgeSurfaceThemeById(123), defaultTheme);
});
