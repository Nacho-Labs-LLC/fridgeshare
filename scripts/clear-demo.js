#!/usr/bin/env node
// Clears all boards and uploads. Run hourly on the demo instance via cron or
// a scheduled Fly.io machine. Safe to run while the server is live; the
// server re-creates boards.json on next write if it's missing.

const fsp = require("fs/promises");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = process.env.FRIDGE_DATA_DIR || path.join(ROOT, "server", "data", "fridges");
const UPLOAD_DIR = process.env.FRIDGE_UPLOAD_DIR || path.join(ROOT, "server", "data", "uploads");
const DIRECTORY_PATH = process.env.BOARD_DIRECTORY_PATH || path.join(ROOT, "server", "data", "boards.json");

async function clearDirectory(dir) {
  let entries;
  try {
    entries = await fsp.readdir(dir);
  } catch {
    return 0;
  }
  let count = 0;
  for (const entry of entries) {
    await fsp.rm(path.join(dir, entry), { recursive: true, force: true });
    count++;
  }
  return count;
}

async function main() {
  const boards = await clearDirectory(DATA_DIR);
  const uploads = await clearDirectory(UPLOAD_DIR);

  await fsp.writeFile(DIRECTORY_PATH, "[]", "utf8").catch(() => {});

  const now = new Date().toISOString();
  console.log(`[${now}] Demo cleared: ${boards} board(s), ${uploads} upload(s)`);
}

main().catch((err) => {
  console.error("clear-demo failed:", err);
  process.exit(1);
});
