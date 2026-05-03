const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const testDir = path.join(os.tmpdir(), `fridge-admin-test-${process.pid}`);
process.env.FRIDGE_DATA_DIR = path.join(testDir, "fridges");
process.env.BOARD_DIRECTORY_PATH = path.join(testDir, "boards.json");
process.env.SELFHOST_ADMIN_TOKEN = "admin-secret";

const { server } = require("../server/index.js");

function listen() {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

async function jsonRequest(baseUrl, pathName, options = {}) {
  const response = await fetch(`${baseUrl}${pathName}`, options);
  const text = await response.text();
  return { response, body: text ? JSON.parse(text) : null };
}

test.before(async () => {
  await fs.rm(testDir, { recursive: true, force: true });
  global.baseUrl = await listen();
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await fs.rm(testDir, { recursive: true, force: true });
});

test("self-host admin token protects board creation", async () => {
  const denied = await jsonRequest(global.baseUrl, "/api/selfhost/boards", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: "Private Board", slug: "private-board" }),
  });
  assert.equal(denied.response.status, 403);

  const created = await jsonRequest(global.baseUrl, "/api/selfhost/boards", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Selfhost-Admin-Token": "admin-secret",
    },
    body: JSON.stringify({ title: "Private Board", slug: "private-board" }),
  });
  assert.equal(created.response.status, 201);
  assert.equal(created.body.board.slug, "private-board");
});

test("self-host admin token protects board deletion", async () => {
  const created = await jsonRequest(global.baseUrl, "/api/selfhost/boards", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Selfhost-Admin-Token": "admin-secret",
    },
    body: JSON.stringify({ title: "Delete Me", slug: "delete-me" }),
  });
  assert.equal(created.response.status, 201);

  const denied = await jsonRequest(global.baseUrl, "/api/selfhost/boards/delete-me", {
    method: "DELETE",
  });
  assert.equal(denied.response.status, 403);
  assert.equal(denied.body.error, "Self-host admin token required.");

  const deleted = await jsonRequest(global.baseUrl, "/api/selfhost/boards/delete-me", {
    method: "DELETE",
    headers: {
      "X-Selfhost-Admin-Token": "admin-secret",
    },
  });
  assert.equal(deleted.response.status, 200);

  const list = await jsonRequest(global.baseUrl, "/api/selfhost/boards");
  assert.equal(list.body.boards.some((board) => board.slug === "delete-me"), false);
});

test("self-host listing only returns edit links with admin token", async () => {
  const created = await jsonRequest(global.baseUrl, "/api/selfhost/boards", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Selfhost-Admin-Token": "admin-secret",
    },
    body: JSON.stringify({ title: "Share Me", slug: "share-me" }),
  });
  assert.equal(created.response.status, 201);

  const publicList = await jsonRequest(global.baseUrl, "/api/selfhost/boards");
  const publicBoard = publicList.body.boards.find((board) => board.slug === "share-me");
  assert.equal(publicBoard.canEdit, false);
  assert.equal(publicBoard.editUrl, undefined);

  const adminList = await jsonRequest(global.baseUrl, "/api/selfhost/boards", {
    headers: { "X-Selfhost-Admin-Token": "admin-secret" },
  });
  const adminBoard = adminList.body.boards.find((board) => board.slug === "share-me");
  assert.equal(adminBoard.canEdit, true);
  assert.equal(adminBoard.editUrl, created.body.url);
});
