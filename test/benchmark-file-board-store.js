const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { FileBoardStore } = require("../apps/selfhost/file-board-store");

async function runBenchmark() {
  const dataDir = path.join(os.tmpdir(), `fridge-store-bench-${process.pid}-${Date.now()}`);
  const store = new FileBoardStore({ dataDir });

  // Create 1000 files
  console.log("Setting up 1000 boards...");
  const setupPromises = [];
  for (let i = 0; i < 1000; i++) {
    const id = `bench-board-${i.toString().padStart(4, '0')}`;
    setupPromises.push(store.write(id, {
      version: 1,
      id: id,
      revision: 1,
      theme: "classic-white",
      items: [],
    }));
  }
  await Promise.all(setupPromises);

  console.log("Running benchmark...");
  const start = performance.now();

  // Call list() 10 times to get a better average
  for (let i = 0; i < 10; i++) {
    await store.list();
  }

  const end = performance.now();
  console.log(`Average time to list 1000 files: ${((end - start) / 10).toFixed(2)} ms`);

  await fs.rm(dataDir, { recursive: true, force: true });
}

runBenchmark().catch(console.error);
