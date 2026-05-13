const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const dataDir = path.join(os.tmpdir(), `fridge-browser-test-${process.pid}`);
process.env.FRIDGE_DATA_DIR = dataDir;
process.env.BOARD_DIRECTORY_PATH = path.join(dataDir, "boards.json");

const { server } = require("../server/index.js");

function listen() {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

async function fetchText(baseUrl, pathName) {
  const response = await fetch(`${baseUrl}${pathName}`);
  return {
    response,
    text: await response.text(),
  };
}

function scriptSources(html) {
  return Array.from(html.matchAll(/<script src="([^"]+)"><\/script>/g), (match) => match[1]);
}

function stylesheetHrefs(html) {
  return Array.from(html.matchAll(/<link rel="stylesheet" href="([^"]+)">/g), (match) => match[1]);
}

function plainObject(value) {
  return JSON.parse(JSON.stringify(value));
}

async function runFridgeBootstrap({
  pathname = "/",
  search = "",
  hash = "",
  bootstrap = { boardId: "", apiBase: "/api/boards" },
  bootstrapOk = true,
} = {}) {
  const source = await fs.readFile(path.join(__dirname, "..", "src", "app-fridge.js"), "utf8");
  const listeners = {};
  const fetchCalls = [];
  const canvasCalls = [];
  const persistenceCalls = [];
  const context = {
    document: {
      querySelector: (selector) => ({ selector }),
    },
    fetch: async (url, options) => {
      fetchCalls.push({ url, options });
      return {
        ok: bootstrapOk,
        json: async () => bootstrap,
      };
    },
    location: { pathname, search, hash },
    window: {
      addEventListener: (name, callback) => {
        listeners[name] = callback;
      },
      FridgeCanvas: class {
        constructor(element, options) {
          canvasCalls.push({ element, options });
        }
      },
      FridgeStorage: {
        BoardPersistence: class {
          constructor(options) {
            persistenceCalls.push(options);
          }
        },
      },
    },
  };

  vm.runInNewContext(source, context, { filename: "src/app-fridge.js" });
  await listeners.DOMContentLoaded();

  return { canvasCalls, fetchCalls, persistenceCalls };
}

test.before(async () => {
  await fs.rm(dataDir, { recursive: true, force: true });
  global.baseUrl = await listen();
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await fs.rm(dataDir, { recursive: true, force: true });
});

test("self-host directory is served at root", async () => {
  const { response, text } = await fetchText(global.baseUrl, "/");

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "text/html; charset=utf-8");
  assert.match(response.headers.get("content-security-policy"), /script-src 'self'/);
  assert.match(response.headers.get("content-security-policy"), /connect-src 'self'/);
  assert.doesNotMatch(response.headers.get("content-security-policy"), /https:\/\/unpkg\.com/);
  assert.match(text, /<div id="board-list"/);
  assert.deepEqual(scriptSources(text), ["/src/app-selfhost.js"]);
});

test("quick board route is not part of the self-host product", async () => {
  const { response, text } = await fetchText(global.baseUrl, "/quick");

  assert.equal(response.status, 404);
  assert.match(text, /Not found/);
});

test("static serving only exposes browser assets", async () => {
  for (const pathName of ["/package.json", "/README.md", "/server/data/boards.json"]) {
    const { response, text } = await fetchText(global.baseUrl, pathName);
    assert.equal(response.status, 404, pathName);
    assert.match(text, /Not found/, pathName);
  }
});

test("local page serves the local app shell", async () => {
  const { response, text } = await fetchText(global.baseUrl, "/local");

  assert.equal(response.status, 200);
  assert.match(text, /<span id="mode-pill" class="mode-pill">Local<\/span>/);
  assert.deepEqual(scriptSources(text).at(-1), "/src/app-local.js");
});

test("named self-host board routes serve the fridge board shell", async () => {
  const { response, text } = await fetchText(global.baseUrl, "/b/kitchen-board");

  assert.equal(response.status, 200);
  assert.match(text, /<span id="mode-pill" class="mode-pill">Shared<\/span>/);
  assert.doesNotMatch(text, /share-button/);
  assert.doesNotMatch(text, /share-popover/);
  assert.deepEqual(scriptSources(text).at(-1), "/src/app-fridge.js");
});

test("named board route uses root-relative assets", async () => {
  const { text } = await fetchText(global.baseUrl, "/b/kitchen-board");

  assert.deepEqual(stylesheetHrefs(text), ["/styles.css"]);
  assert.deepEqual(scriptSources(text), [
    "/src/emoji-data.js",
    "/src/fridge-items.js",
    "/src/fridge-themes.js",
    "/src/fridge-storage.js",
    "/src/fridge-canvas.js",
    "/src/app-fridge.js",
  ]);
});

test("named self-host board routes have matching bootstrap metadata", async () => {
  const { response, text } = await fetchText(global.baseUrl, "/api/bootstrap?path=%2Fb%2Fkitchen-board");
  const bootstrap = JSON.parse(text);

  assert.equal(response.status, 200);
  assert.equal(bootstrap.boardId, "kitchen-board");
  assert.equal(bootstrap.apiBase, "/api/boards");
});

test("all browser scripts referenced by the board page are served as JavaScript", async () => {
  const { text } = await fetchText(global.baseUrl, "/b/kitchen-board");

  for (const source of scriptSources(text)) {
    const { response, text: sourceText } = await fetchText(global.baseUrl, source);
    assert.equal(response.status, 200, source);
    assert.equal(response.headers.get("content-type"), "text/javascript; charset=utf-8");
    assert.match(sourceText, /\S/, source);
  }
});

test("fridge board script preserves case-sensitive edit tokens", async () => {
  const source = await fs.readFile(path.join(__dirname, "..", "src", "app-fridge.js"), "utf8");

  assert.doesNotMatch(source, /location\.hash[^;]+toLowerCase\(\)/);
  assert.match(source, /\^\[a-z0-9_-\]\{24,96\}\$\/i/);
});

test("fridge board bootstrap uses named board hash tokens without changing case", async () => {
  const editToken = "AbCdEfGhIjKlMnOpQrStUvWx";
  const result = await runFridgeBootstrap({
    pathname: "/b/Kitchen-Board",
    hash: `#${editToken}`,
    bootstrap: { boardId: "kitchen-board", apiBase: "/custom/boards" },
  });

  assert.equal(result.fetchCalls[0].url, "/api/bootstrap?path=%2Fb%2FKitchen-Board");
  assert.equal(result.canvasCalls[0].options.fridgeId, "kitchen-board");
  assert.equal(result.canvasCalls[0].options.editToken, editToken);
  assert.deepEqual(plainObject(result.persistenceCalls[0]), {
    boardId: "kitchen-board",
    editToken,
    endpoint: "/custom/boards",
  });
});
