const fsp = require("fs/promises");
const path = require("path");
const fs = require("fs");

async function run() {
  const filePath = path.join(__dirname, "bench-boards-stat.json");
  fs.writeFileSync(filePath, JSON.stringify({ version: 1, boards: [] }));

  const start = process.hrtime.bigint();
  for (let i = 0; i < 1000; i++) {
    await fsp.stat(filePath);
  }
  const end = process.hrtime.bigint();

  console.log(`Time taken for stat: ${(end - start) / 1000000n}ms`);
  fs.unlinkSync(filePath);
}

run().catch(console.error);
