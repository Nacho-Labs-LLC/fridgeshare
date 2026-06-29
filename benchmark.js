const { BoardDirectoryStore } = require("./apps/selfhost/board-directory-store");
const path = require("path");
const fs = require("fs");

async function run() {
  const filePath = path.join(__dirname, "bench-boards.json");

  // create dummy data
  const boards = Array.from({ length: 1000 }, (_, i) => ({
    slug: `board-${i}`,
    title: `Board ${i}`,
    createdAt: new Date(Date.now() - Math.random() * 10000000).toISOString(),
    updatedAt: new Date(Date.now() - Math.random() * 1000000).toISOString()
  }));

  fs.writeFileSync(filePath, JSON.stringify({ version: 1, boards }, null, 2));

  const store = new BoardDirectoryStore({ filePath });

  // Warmup
  for (let i = 0; i < 100; i++) {
    await store.list();
  }

  const start = process.hrtime.bigint();
  for (let i = 0; i < 1000; i++) {
    await store.list();
  }
  const end = process.hrtime.bigint();

  console.log(`Time taken: ${(end - start) / 1000000n}ms`);

  fs.unlinkSync(filePath);
}

run().catch(console.error);
