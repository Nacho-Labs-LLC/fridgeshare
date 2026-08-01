const assert = require("node:assert/strict");
const { execFile } = require("node:child_process");
const { randomUUID } = require("node:crypto");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { promisify } = require("node:util");
const test = require("node:test");

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(__dirname, "..", "..");
const runId = `${process.pid}-${randomUUID().slice(0, 8)}`;
const containerName = `fridgeshare-runtime-smoke-${runId}`;
const builtImage = `fridgeshare-runtime-smoke:${runId}`;

async function docker(args, options = {}) {
  return execFileAsync("docker", args, {
    cwd: repoRoot,
    timeout: options.timeout ?? 120_000,
    windowsHide: true,
  });
}

async function loopbackBaseUrl(containerName) {
  const { stdout } = await docker(["port", containerName, "4173/tcp"]);
  const portMatch = stdout.match(/127\.0\.0\.1:(\d+)/);
  assert.ok(portMatch, `Docker did not publish a loopback host port: ${stdout}`);
  return `http://127.0.0.1:${portMatch[1]}`;
}

async function waitFor(url, description) {
  let lastError;
  const deadline = Date.now() + 30_000;

  while (Date.now() < deadline) {
    const controller = new AbortController();
    // Keep a referenced deadline while Docker is bringing the container up. This
    // avoids Node 20 treating a pending fetch as an idle test and cancelling it.
    const requestTimeout = setTimeout(() => controller.abort(), 2_000);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (response.ok) return response;
      lastError = new Error(`${description} returned ${response.status}`);
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(requestTimeout);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`${description} did not become ready: ${lastError?.message ?? "unknown error"}`);
}

test("Docker image serves the self-host UI and bootstrap API with isolated state", async () => {
  let dataDir;
  let image = process.env.FRIDGESHARE_RUNTIME_IMAGE;
  let removeBuiltImage = false;

  try {
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "fridgeshare-runtime-smoke-"));

    if (!image) {
      image = builtImage;
      removeBuiltImage = true;
      await docker(["build", "--tag", image, "."], { timeout: 180_000 });
    }

    await docker([
      "run",
      "--detach",
      "--name", containerName,
      "--label", "fridgeshare.runtime-smoke=true",
      "--publish", "127.0.0.1::4173",
      "--volume", `${dataDir}:/app/server/data`,
      "--env", "PORT=4173",
      image,
    ]);

    let baseUrl = await loopbackBaseUrl(containerName);

    const root = await waitFor(`${baseUrl}/`, "root UI");
    const rootHtml = await root.text();
    assert.match(root.headers.get("content-type") ?? "", /^text\/html/);
    assert.match(rootHtml, /<div id="board-list"/);

    const bootstrap = await waitFor(`${baseUrl}/api/bootstrap?path=%2F`, "bootstrap API");
    assert.match(bootstrap.headers.get("content-type") ?? "", /^application\/json/);
    const body = await bootstrap.json();
    assert.equal(body.mode, "selfhost");
    assert.equal(body.apiBase, "/api/boards");

    const boardId = `runtime-smoke-${runId}`;
    const editToken = "RuntimeSmokeEditToken_1234567890";
    const saved = await fetch(`${baseUrl}/api/boards/${boardId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Fridge-Edit-Token": editToken,
      },
      body: JSON.stringify({
        baseRevision: 0,
        theme: "classic-white",
        items: [{
          id: "runtime-note",
          type: "note",
          x: 10,
          y: 20,
          width: 100,
          height: 100,
          text: "persisted through container restart",
        }],
      }),
    });
    assert.equal(saved.status, 200);

    const mountedBoard = JSON.parse(
      await fs.readFile(path.join(dataDir, "fridges", `${boardId}.json`), "utf8"),
    );
    assert.equal(mountedBoard.items[0].text, "persisted through container restart");

    await docker(["stop", containerName]);
    await docker(["start", containerName]);
    baseUrl = await loopbackBaseUrl(containerName);
    const reloaded = await waitFor(`${baseUrl}/api/boards/${boardId}`, "persisted board API");
    const reloadedBoard = await reloaded.json();
    assert.equal(reloadedBoard.items[0].text, "persisted through container restart");
  } finally {
    // All resources have unique names/paths owned by this test; never target compose services or volumes.
    await docker(["rm", "--force", containerName]).catch(() => {});
    if (removeBuiltImage) await docker(["image", "rm", "--force", builtImage]).catch(() => {});
    if (dataDir) await fs.rm(dataDir, { recursive: true, force: true });
  }
});
