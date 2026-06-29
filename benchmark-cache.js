const { BoardDirectoryStore } = require("./apps/selfhost/board-directory-store");
const path = require("path");
const fs = require("fs");
const fsp = require("fs/promises");

class CachedBoardDirectoryStore extends BoardDirectoryStore {
  constructor(opts) {
    super(opts);
    this._cachedList = null;
    this._cachedMtimeMs = -1;
  }

  async list() {
    let mtimeMs = -1;
    try {
      const stat = await fsp.stat(this.filePath);
      mtimeMs = stat.mtimeMs;
    } catch (err) {
      if (err.code !== "ENOENT") throw err;
    }

    if (this._cachedList && this._cachedMtimeMs === mtimeMs) {
      return this._cachedList;
    }

    const data = await this.readData();
    const sorted = data.boards.sort((a, b) => (b.updatedAt || b.createdAt).localeCompare(a.updatedAt || a.createdAt));

    this._cachedList = sorted;
    this._cachedMtimeMs = mtimeMs;
    return sorted;
  }
}

async function run() {
  const filePath = path.join(__dirname, "bench-boards-cache.json");

  const boards = Array.from({ length: 1000 }, (_, i) => ({
    slug: `board-${i}`,
    title: `Board ${i}`,
    createdAt: new Date(Date.now() - Math.random() * 10000000).toISOString(),
    updatedAt: new Date(Date.now() - Math.random() * 1000000).toISOString()
  }));

  fs.writeFileSync(filePath, JSON.stringify({ version: 1, boards }, null, 2));

  const store = new CachedBoardDirectoryStore({ filePath });

  // Warmup
  for (let i = 0; i < 100; i++) {
    await store.list();
  }

  const start = process.hrtime.bigint();
  for (let i = 0; i < 1000; i++) {
    await store.list();
  }
  const end = process.hrtime.bigint();

  console.log(`Time taken with cache: ${(end - start) / 1000000n}ms`);
  fs.unlinkSync(filePath);
}

run().catch(console.error);
