const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { test, expect } = require("@playwright/test");

const onePixelPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL6pQAAAABJRU5ErkJggg==",
  "base64",
);

const dataDir = path.join(os.tmpdir(), `fridgeshare-e2e-${process.pid}`);
process.env.FRIDGE_DATA_DIR = dataDir;
process.env.BOARD_DIRECTORY_PATH = path.join(dataDir, "boards.json");
process.env.FRIDGE_UPLOAD_DIR = path.join(dataDir, "uploads");

const { server } = require("../../server/index.js");

let baseUrl;

test.beforeAll(async () => {
  await fs.rm(dataDir, { recursive: true, force: true });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  await fs.rm(dataDir, { recursive: true, force: true });
});

test("a household can create an editable shared board from the directory", async ({ page }) => {
  const slug = `e2e-kitchen-${Date.now()}`;
  await page.goto(baseUrl);

  await expect(page.getByRole("heading", { name: "FridgeShare" })).toBeVisible();
  await page.getByLabel("Board title").fill("E2E Kitchen");
  await page.getByLabel("Board slug").fill(slug);
  await page.getByRole("button", { name: "Create" }).click();

  await expect(page).toHaveURL(new RegExp(`/b/${slug}#[A-Za-z0-9_-]{24,96}$`));
  await expect(page.locator("#fridge-canvas")).toBeVisible();
  await expect(page.locator("#mode-pill")).toHaveText(/New|Saving|Saved/);

  await page.getByRole("tab", { name: "Notes" }).click();
  await page.getByRole("button", { name: "Add Sticky Note" }).click();

  await expect.poll(() => page.evaluate(() => window.openFridge.items.filter((item) => item.type === "note").length)).toBeGreaterThan(0);
  await expect.poll(async () => page.evaluate(async () => {
    const response = await fetch(`/api/boards/${location.pathname.split("/").pop()}`);
    const board = await response.json();
    return board.items.filter((item) => item.type === "note").length;
  })).toBeGreaterThan(0);

  const viewer = await page.context().newPage();
  await viewer.goto(`${baseUrl}/b/${slug}`);
  await expect(viewer.locator("#mode-pill")).toHaveText(/^View only/);
  await viewer.getByRole("tab", { name: "Notes" }).click();
  await expect(viewer.getByRole("button", { name: "Add Sticky Note" })).toHaveCount(0);
  await viewer.close();

  const persisted = await page.evaluate(async () => {
    const response = await fetch(`/api/boards/${location.pathname.split("/").pop()}`);
    return response.json();
  });
  assert.equal(persisted.id, slug);
  assert.ok(Array.isArray(persisted.items));
});

test("an editor reloads persisted work while a reloaded view link remains read-only", async ({ page }) => {
  const slug = `e2e-reload-${Date.now()}`;
  await page.goto(baseUrl);
  await page.getByLabel("Board title").fill("E2E Reload");
  await page.getByLabel("Board slug").fill(slug);
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page).toHaveURL(new RegExp(`/b/${slug}#[A-Za-z0-9_-]{24,96}$`));
  await expect(page.locator("#mode-pill")).toHaveText(/^Saved/);

  await page.getByRole("tab", { name: "Notes" }).click();
  await page.getByRole("button", { name: "Add Sticky Note" }).click();
  await expect.poll(() => page.evaluate(() => (
    window.openFridge.items.find((item) => item.type === "note")?.id || ""
  ))).not.toBe("");
  const noteId = await page.evaluate(() => (
    window.openFridge.items.find((item) => item.type === "note").id
  ));

  await expect.poll(async () => page.evaluate(async (id) => {
    const response = await fetch(`/api/boards/${location.pathname.split("/").pop()}`);
    const board = await response.json();
    return board.items.some((item) => item.id === id);
  }, noteId)).toBe(true);

  await page.reload();
  await expect(page.locator("#mode-pill")).toHaveText(/^Saved/);
  await expect.poll(() => page.evaluate((id) => (
    window.openFridge.items.some((item) => item.id === id)
  ), noteId)).toBe(true);

  const viewer = await page.context().newPage();
  await viewer.goto(`${baseUrl}/b/${slug}`);
  await viewer.reload();
  await expect(viewer.locator("#mode-pill")).toHaveText(/^View only/);
  await viewer.getByRole("tab", { name: "Notes" }).click();
  await expect(viewer.getByRole("button", { name: "Add Sticky Note" })).toHaveCount(0);
  await viewer.close();
});

test("two editors receive saved changes from the other browser", async ({ page }) => {
  const slug = `e2e-sync-${Date.now()}`;
  await page.goto(baseUrl);
  await page.getByLabel("Board title").fill("E2E Sync");
  await page.getByLabel("Board slug").fill(slug);
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page).toHaveURL(new RegExp(`/b/${slug}#[A-Za-z0-9_-]{24,96}$`));
  await expect(page.locator("#mode-pill")).toHaveText(/New|Saving|Saved/);

  const peer = await page.context().newPage();
  await peer.goto(page.url());
  await expect(peer.locator("#mode-pill")).toHaveText(/New|Saving|Saved/);
  await peer.getByRole("tab", { name: "Notes" }).click();
  await peer.getByRole("button", { name: "Add Sticky Note" }).click();

  await expect.poll(() => page.evaluate(() => window.openFridge.items.filter((item) => item.type === "note").length), { timeout: 10_000 }).toBeGreaterThan(0);
  await peer.close();
});

test("an editor uploads a PNG whose served safe asset bytes are rendered on the shared board", async ({ page }) => {
  const slug = `e2e-photo-${Date.now()}`;
  await page.goto(baseUrl);
  await page.getByLabel("Board title").fill("E2E Photo");
  await page.getByLabel("Board slug").fill(slug);
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page).toHaveURL(new RegExp(`/b/${slug}#[A-Za-z0-9_-]{24,96}$`));
  await expect(page.locator("#mode-pill")).toHaveText(/^Saved/);

  await page.getByRole("tab", { name: "Photos" }).click();
  await page.locator("#photo-file").setInputFiles({
    name: "fridge.png",
    mimeType: "image/png",
    buffer: onePixelPng,
  });

  await expect.poll(async () => page.evaluate(async () => {
    const response = await fetch(`/api/boards/${location.pathname.split("/").pop()}`);
    const board = await response.json();
    return board.items.find((item) => item.type === "polaroid")?.src || "";
  })).toMatch(/^\/api\/assets\/[A-Za-z0-9_-]{32}\.png$/);
  const assetUrl = await page.evaluate(() => (
    window.openFridge.items.find((item) => item.type === "polaroid").src
  ));

  const asset = await page.evaluate(async (src) => {
    const response = await fetch(src);
    return {
      status: response.status,
      contentType: response.headers.get("content-type"),
      bytes: Array.from(new Uint8Array(await response.arrayBuffer())),
    };
  }, assetUrl);
  assert.equal(asset.status, 200);
  assert.equal(asset.contentType, "image/png");
  assert.deepEqual(Buffer.from(asset.bytes), onePixelPng);
  await expect.poll(() => page.evaluate((src) => {
    const photo = window.openFridge.items.find((item) => item.type === "polaroid" && item.src === src);
    return Boolean(photo && photo.imageLoaded && photo.image.naturalWidth === 1 && photo.image.naturalHeight === 1);
  }, assetUrl)).toBe(true);
});

test("a stale editor can discard an imported overwrite and visibly recover the other editor's saved board", async ({ page, browser }) => {
  const slug = `e2e-conflict-${Date.now()}`;
  await page.goto(baseUrl);
  await page.getByLabel("Board title").fill("E2E Conflict");
  await page.getByLabel("Board slug").fill(slug);
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page).toHaveURL(new RegExp(`/b/${slug}#[A-Za-z0-9_-]{24,96}$`));
  await expect(page.locator("#mode-pill")).toHaveText(/^Saved/);

  const peerContext = await browser.newContext();
  const peer = await peerContext.newPage();
  try {
    await peer.goto(page.url());
    await expect(peer.locator("#mode-pill")).toHaveText(/^Saved/);
    await peer.getByRole("tab", { name: "Notes" }).click();
    await peer.getByRole("button", { name: "Add Sticky Note" }).click();
    await expect.poll(async () => peer.evaluate(async () => {
      const response = await fetch(`/api/boards/${location.pathname.split("/").pop()}`);
      const board = await response.json();
      return board.items.filter((item) => item.type === "note").length;
    })).toBe(1);

    const conflictDialog = page.waitForEvent("dialog");
    const fileChooser = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "Import" }).click();
    await (await fileChooser).setFiles({
      name: "discard-local.fridge",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify({ theme: "classic-white", items: [] })),
    });
    const dialog = await conflictDialog;
    assert.match(dialog.message(), /board changed on the server/i);
    await dialog.dismiss();

    await expect(page.locator("#toast")).toHaveText("Loaded server version.");
    await expect(page.locator("#mode-pill")).toHaveText(/^Synced|^Saved/);
    await expect.poll(() => page.evaluate(() => (
      window.openFridge.items.filter((item) => item.type === "note").length
    ))).toBe(1);
  } finally {
    await peerContext.close();
  }
});

test("dragging multiple objects and then panning keeps their world grouping intact", async ({ page }) => {
  const slug = `e2e-canvas-${Date.now()}`;
  await page.goto(baseUrl);
  await page.getByLabel("Board title").fill("E2E Canvas");
  await page.getByLabel("Board slug").fill(slug);
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page).toHaveURL(new RegExp(`/b/${slug}#[A-Za-z0-9_-]{24,96}$`));
  await expect(page.locator("#mode-pill")).toHaveText(/^Saved/);

  await page.getByRole("button", { name: "Add B magnet" }).click();
  await page.getByRole("tab", { name: "Notes" }).click();
  await page.getByRole("button", { name: "Add Sticky Note" }).click();

  const itemIds = await page.evaluate(() => window.openFridge.items.slice(-2).map((item) => item.id));
  const [magnetId, noteId] = itemIds;
  const initialPositions = await page.evaluate(([firstId, secondId]) => {
    const fridge = window.openFridge;
    const item = (id) => fridge.items.find((candidate) => candidate.id === id);
    const first = item(firstId);
    const second = item(secondId);
    return {
      first: { x: first.x, y: first.y },
      second: { x: second.x, y: second.y },
    };
  }, itemIds);
  const blankPoint = await page.evaluate(() => {
    const fridge = window.openFridge;
    const rect = fridge.canvas.getBoundingClientRect();
    for (const point of [{ x: 160, y: 160 }, { x: rect.width - 160, y: 160 }]) {
      if (!fridge.getTopItemAt(fridge.viewportToWorld(point))) {
        return { x: rect.left + point.x, y: rect.top + point.y };
      }
    }
    throw new Error("No empty canvas point available to exit note editing.");
  });
  await page.mouse.click(blankPoint.x, blankPoint.y);
  await expect.poll(() => page.evaluate(() => window.openFridge.editingNote?.id || "")).toBe("");

  async function clientPoint(itemId) {
    return page.evaluate((id) => {
      const fridge = window.openFridge;
      const item = fridge.items.find((candidate) => candidate.id === id);
      const rect = fridge.canvas.getBoundingClientRect();
      return {
        x: rect.left + (item.x - fridge.camera.x) * fridge.camera.scale,
        y: rect.top + (item.y - fridge.camera.y) * fridge.camera.scale,
      };
    }, itemId);
  }

  const noteStart = await clientPoint(noteId);
  assert.equal(await page.evaluate((id) => {
    const fridge = window.openFridge;
    const rect = fridge.canvas.getBoundingClientRect();
    const viewportPoint = { x: rect.width / 2, y: rect.height / 2 };
    return fridge.getTopItemAt(fridge.viewportToWorld(viewportPoint))?.id || "";
  }, noteId), noteId);
  await page.mouse.move(noteStart.x, noteStart.y);
  await page.mouse.down();
  await expect.poll(() => page.evaluate(() => window.openFridge.activeItem?.id || "")).toBe(noteId);
  await page.mouse.move(noteStart.x + 180, noteStart.y - 40, { steps: 8 });
  await expect.poll(() => page.evaluate((id) => {
    const item = window.openFridge.items.find((candidate) => candidate.id === id);
    return item.x;
  }, noteId)).not.toBe(initialPositions.second.x);
  await page.mouse.up();

  const magnetStart = await clientPoint(magnetId);
  await page.mouse.move(magnetStart.x, magnetStart.y);
  await page.mouse.down();
  await page.mouse.move(magnetStart.x - 130, magnetStart.y + 100, { steps: 8 });
  await page.mouse.up();
  await expect.poll(() => page.evaluate((ids) => ids.every((id) => {
    const item = window.openFridge.items.find((candidate) => candidate.id === id);
    return item && !item.isDragging && Math.abs(item.vx) < 0.0001 && Math.abs(item.vy) < 0.0001 && Math.abs(item.angularVelocity) < 0.00001;
  }), itemIds), { timeout: 10_000 }).toBe(true);

  const beforePan = await page.evaluate(([firstId, secondId]) => {
    const fridge = window.openFridge;
    const item = (id) => fridge.items.find((candidate) => candidate.id === id);
    const first = item(firstId);
    const second = item(secondId);
    return {
      camera: { ...fridge.camera },
      first: { x: first.x, y: first.y },
      second: { x: second.x, y: second.y },
      delta: { x: second.x - first.x, y: second.y - first.y },
      panStart: (() => {
        const rect = fridge.canvas.getBoundingClientRect();
        for (const point of [
          { x: 160, y: 160 },
          { x: rect.width - 160, y: 160 },
          { x: 160, y: Math.min(360, rect.height - 160) },
        ]) {
          if (!fridge.getTopItemAt(fridge.viewportToWorld(point))) {
            return { x: rect.left + point.x, y: rect.top + point.y };
          }
        }
        throw new Error("No empty canvas point available for pan test.");
      })(),
    };
  }, itemIds);

  assert.notDeepEqual(beforePan.first, initialPositions.first);
  assert.notDeepEqual(beforePan.second, initialPositions.second);

  const persistedBeforePan = await page.evaluate(async ([firstId, secondId]) => {
    const response = await fetch(`/api/boards/${location.pathname.split("/").pop()}`);
    const board = await response.json();
    const byId = new Map(board.items.map((item) => [item.id, item]));
    return [firstId, secondId].map((id) => {
      const item = byId.get(id);
      return item ? { id: item.id, x: item.x, y: item.y } : null;
    });
  }, itemIds);
  assert.equal(persistedBeforePan.every(Boolean), true);
  assert.notDeepEqual(
    persistedBeforePan.map(({ x, y }) => ({ x, y })),
    [initialPositions.first, initialPositions.second].map(({ x, y }) => ({ x: Math.round(x), y: Math.round(y) })),
  );

  await page.mouse.move(beforePan.panStart.x, beforePan.panStart.y);
  await page.mouse.down();
  await page.mouse.move(beforePan.panStart.x + 110, beforePan.panStart.y + 75, { steps: 8 });
  await page.mouse.up();

  const afterPan = await page.evaluate(([firstId, secondId]) => {
    const fridge = window.openFridge;
    const item = (id) => fridge.items.find((candidate) => candidate.id === id);
    const first = item(firstId);
    const second = item(secondId);
    return {
      camera: { ...fridge.camera },
      first: { x: first.x, y: first.y },
      second: { x: second.x, y: second.y },
      delta: { x: second.x - first.x, y: second.y - first.y },
    };
  }, itemIds);

  assert.notDeepEqual(afterPan.camera, beforePan.camera);
  const assertPointWithin = (actual, expected, tolerance = 0.01) => {
    assert.ok(Math.abs(actual.x - expected.x) <= tolerance, `x drifted from ${expected.x} to ${actual.x}`);
    assert.ok(Math.abs(actual.y - expected.y) <= tolerance, `y drifted from ${expected.y} to ${actual.y}`);
  };
  assertPointWithin(afterPan.first, beforePan.first);
  assertPointWithin(afterPan.second, beforePan.second);
  assertPointWithin(afterPan.delta, beforePan.delta);

  await expect.poll(() => page.evaluate(async ([firstId, secondId]) => {
    const response = await fetch(`/api/boards/${location.pathname.split("/").pop()}`);
    const board = await response.json();
    const byId = new Map(board.items.map((item) => [item.id, item]));
    return [firstId, secondId].map((id) => {
      const item = byId.get(id);
      return item ? { id: item.id, x: item.x, y: item.y } : null;
    });
  }, itemIds)).toEqual(persistedBeforePan);
});

test("an editor can use each non-photo creation tool, change the surface, and round-trip an export", async ({ page }) => {
  const slug = `e2e-tools-${Date.now()}`;
  await page.goto(baseUrl);
  await page.getByLabel("Board title").fill("E2E Tools");
  await page.getByLabel("Board slug").fill(slug);
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page).toHaveURL(new RegExp(`/b/${slug}#[A-Za-z0-9_-]{24,96}$`));
  await expect(page.locator("#mode-pill")).toHaveText(/^Saved/);

  await page.getByRole("button", { name: "Add C magnet" }).click();
  await page.getByRole("tab", { name: "Notes" }).click();
  await page.getByRole("button", { name: "Add Sticky Note" }).click();
  const noteEditor = page.locator("textarea.note-edit-overlay");
  await expect(noteEditor).toBeVisible();
  await noteEditor.fill("Dinner at 6");
  await noteEditor.press("Escape");
  await page.getByRole("tab", { name: "Emoji" }).click();
  await expect(page.getByRole("button", { name: "Smileys" })).toBeVisible();
  await page.getByRole("button", { name: "😀", exact: true }).click();
  await page.getByRole("tab", { name: "Boards" }).click();
  await page.getByRole("button", { name: "Add Whiteboard" }).click();
  await page.getByRole("tab", { name: "Surface" }).click();
  await page.getByRole("button", { name: "Brushed Stainless" }).click();

  await expect.poll(() => page.evaluate(() => ({
    theme: window.openFridge.currentSurfaceTheme,
    types: window.openFridge.items.map((item) => item.type),
  }))).toEqual(expect.objectContaining({
    theme: "brushed-stainless",
    types: expect.arrayContaining(["alphabet", "note", "emoji", "dryEraseBoard"]),
  }));

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export" }).click();
  const exportFile = await download;
  assert.equal(exportFile.suggestedFilename(), "open-fridge.fridge");
  const exported = JSON.parse(await fs.readFile(await exportFile.path(), "utf8"));
  assert.equal(exported.theme, "brushed-stainless");
  assert.deepEqual(
    exported.items.map((item) => ({ type: item.type, text: item.text })).sort((a, b) => a.type.localeCompare(b.type)),
    [
      { type: "alphabet", text: undefined },
      { type: "dryEraseBoard", text: undefined },
      { type: "emoji", text: undefined },
      { type: "note", text: "Dinner at 6" },
    ],
  );

  const fileChooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Import" }).click();
  await (await fileChooser).setFiles({
    name: "imported.fridge",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({
      theme: "retro-mint",
      items: [{ id: "imported-note", type: "note", x: 10, y: 20, width: 100, height: 100, text: "Imported" }],
    })),
  });
  await expect(page.locator("#toast")).toHaveText("Fridge imported.");
  await expect.poll(() => page.evaluate(() => ({
    theme: window.openFridge.currentSurfaceTheme,
    items: window.openFridge.items.map((item) => ({ id: item.id, type: item.type, text: item.text })),
  }))).toEqual({
    theme: "retro-mint",
    items: [{ id: "imported-note", type: "note", text: "Imported" }],
  });
});

test("an editor can draw on a whiteboard and reload the saved stroke", async ({ page }) => {
  const slug = `e2e-drawing-${Date.now()}`;
  await page.goto(baseUrl);
  await page.getByLabel("Board title").fill("E2E Drawing");
  await page.getByLabel("Board slug").fill(slug);
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page).toHaveURL(new RegExp(`/b/${slug}#[A-Za-z0-9_-]{24,96}$`));

  await page.getByRole("tab", { name: "Boards" }).click();
  await page.getByRole("button", { name: "Add Whiteboard" }).click();
  const board = await page.evaluate(() => {
    const fridge = window.openFridge;
    const item = fridge.items.find((candidate) => candidate.type === "dryEraseBoard");
    const rect = fridge.canvas.getBoundingClientRect();
    const point = fridge.worldToViewport({ x: item.x, y: item.y });
    return { id: item.id, x: rect.left + point.x, y: rect.top + point.y };
  });

  await page.mouse.dblclick(board.x, board.y);
  await expect(page.getByRole("toolbar", { name: "Drawing toolbar" })).toBeVisible();
  await page.getByRole("button", { name: "Blue marker" }).click();
  await page.mouse.move(board.x - 60, board.y - 20);
  await page.mouse.down();
  await page.mouse.move(board.x + 60, board.y + 20, { steps: 8 });
  await page.mouse.up();
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("toolbar", { name: "Drawing toolbar" })).toHaveCount(0);

  await expect.poll(() => page.evaluate((id) => {
    const item = window.openFridge.items.find((candidate) => candidate.id === id);
    return item?.strokes?.map((stroke) => ({ color: stroke.color, points: stroke.points.length })) || [];
  }, board.id)).toEqual([{ color: "#1a5fa8", points: 9 }]);
  await expect.poll(async () => page.evaluate(async (id) => {
    const response = await fetch(`/api/boards/${location.pathname.split("/").pop()}`);
    const state = await response.json();
    const item = state.items.find((candidate) => candidate.id === id);
    return item?.strokes?.[0]?.points?.length || 0;
  }, board.id)).toBe(9);

  await page.reload();
  await expect.poll(() => page.evaluate((id) => {
    const item = window.openFridge.items.find((candidate) => candidate.id === id);
    return item?.strokes?.[0]?.color || "";
  }, board.id)).toBe("#1a5fa8");
});

test("the local-only fridge persists browser state without calling the shared-board API", async ({ page }) => {
  const boardApiRequests = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/boards/")) boardApiRequests.push(request.url());
  });
  await page.goto(`${baseUrl}/local`);
  await expect(page.locator("#mode-pill")).toHaveText(/local$/i);
  await page.getByRole("tab", { name: "Notes" }).click();
  await page.getByRole("button", { name: "Add Sticky Note" }).click();
  const noteEditor = page.locator("textarea.note-edit-overlay");
  await noteEditor.fill("Only on this browser");
  await noteEditor.press("Escape");
  await expect.poll(() => page.evaluate(() => window.openFridge.items.some((item) => item.text === "Only on this browser"))).toBe(true);
  await expect.poll(() => page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem("the-open-fridge:v1") || "{}");
    return saved.items?.some((item) => item.text === "Only on this browser") || false;
  })).toBe(true);
  await page.reload();
  await expect(page.locator("#mode-pill")).toHaveText(/local$/i);
  await expect.poll(() => page.evaluate(() => window.openFridge.items.map((item) => item.text || ""))).toContain("Only on this browser");
  assert.deepEqual(boardApiRequests, []);
});

test("a view-only link exposes no mutation controls and cannot alter the shared board", async ({ page }) => {
  const slug = `e2e-viewer-lock-${Date.now()}`;
  await page.goto(baseUrl);
  await page.getByLabel("Board title").fill("E2E Viewer Lock");
  await page.getByLabel("Board slug").fill(slug);
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page).toHaveURL(new RegExp(`/b/${slug}#[A-Za-z0-9_-]{24,96}$`));
  const initialState = await page.evaluate(async () => {
    const response = await fetch(`/api/boards/${location.pathname.split("/").pop()}`);
    return response.json();
  });

  const viewer = await page.context().newPage();
  try {
    await viewer.goto(`${baseUrl}/b/${slug}`);
    await expect(viewer.locator("#mode-pill")).toHaveText(/^View only/);
    for (const selector of [
      "#alphabet-buttons",
      "#magnet-style-selector",
      "#magnet-size-selector",
      "#paper-style-selector",
      "#note-size-selector",
      "#photo-style-selector",
      "#photo-size-selector",
      "#emoji-category-bar",
      "#emoji-grid",
      "#surface-theme-selector",
      "#export-button",
      "#import-button",
      "#reset-button",
      "#add-note-button",
      "#add-photo-button",
      "#add-board-button",
    ]) {
      await expect(viewer.locator(selector)).toBeHidden();
    }
    const beforePan = await viewer.evaluate(() => ({ ...window.openFridge.camera }));
    const canvasBox = await viewer.locator("#fridge-canvas").boundingBox();
    await viewer.mouse.move(canvasBox.x + 120, canvasBox.y + 120);
    await viewer.mouse.down();
    await viewer.mouse.move(canvasBox.x + 180, canvasBox.y + 160, { steps: 4 });
    await viewer.mouse.up();
    await expect.poll(() => viewer.evaluate(() => ({ ...window.openFridge.camera }))).not.toEqual(beforePan);
  } finally {
    await viewer.close();
  }

  const afterState = await page.evaluate(async () => {
    const response = await fetch(`/api/boards/${location.pathname.split("/").pop()}`);
    return response.json();
  });
  assert.deepEqual(afterState.items, initialState.items);
  assert.equal(afterState.theme, initialState.theme);
});

test("reset preserves a board when cancelled and restores the starter board when confirmed", async ({ page }) => {
  const slug = `e2e-reset-${Date.now()}`;
  await page.goto(baseUrl);
  await page.getByLabel("Board title").fill("E2E Reset");
  await page.getByLabel("Board slug").fill(slug);
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page).toHaveURL(new RegExp(`/b/${slug}#[A-Za-z0-9_-]{24,96}$`));
  await page.getByRole("button", { name: "Add A magnet" }).click();
  await expect.poll(() => page.evaluate(() => window.openFridge.items.some((item) => item.type === "alphabet"))).toBe(true);
  const beforeCancel = await page.evaluate(() => window.openFridge.items.map((item) => item.id));

  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Reset" }).click();
  await expect.poll(() => page.evaluate(() => window.openFridge.items.map((item) => item.id))).toEqual(beforeCancel);

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Reset" }).click();
  await expect(page.locator("#toast")).toHaveText("Fridge reset.");
  await expect.poll(() => page.evaluate(() => ({
    theme: window.openFridge.currentSurfaceTheme,
    types: window.openFridge.items.map((item) => item.type).sort(),
  }))).toEqual({
    theme: "classic-white",
    types: ["alphabet", "note"],
  });
  await expect.poll(async () => page.evaluate(async () => {
    const response = await fetch(`/api/boards/${location.pathname.split("/").pop()}`);
    if (!response.ok) return null;
    const state = await response.json();
    return { theme: state.theme, types: state.items.map((item) => item.type).sort() };
  })).toEqual({ theme: "classic-white", types: ["alphabet", "note"] });
  await page.reload();
  await expect.poll(() => page.evaluate(() => window.openFridge.items.map((item) => item.type).sort())).toEqual(["alphabet", "note"]);
});
