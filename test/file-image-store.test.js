const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { FileImageStore, isValidAssetId } = require("../apps/selfhost/file-image-store");

function tempUploadDir() {
  return path.join(os.tmpdir(), `fridge-image-store-test-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
}

test("file image store writes, reads, and deletes image bytes", async () => {
  const uploadDir = tempUploadDir();
  const store = new FileImageStore({ uploadDir });
  const buffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);

  try {
    const written = await store.write({ buffer, contentType: "image/png" });

    assert.equal(written.ok, true);
    assert.equal(written.contentType, "image/png");
    assert.equal(written.byteSize, buffer.length);
    assert.equal(isValidAssetId(written.assetId), true);
    assert.match(written.assetId, /\.png$/);
    assert.equal(written.publicPath, `/uploads/${written.assetId}`);

    const read = await store.read(written.assetId);
    assert.equal(read.ok, true);
    assert.equal(read.contentType, "image/png");
    assert.equal(read.byteSize, buffer.length);
    assert.deepEqual(read.buffer, buffer);

    const deleted = await store.delete(written.assetId);
    assert.equal(deleted.ok, true);

    const missing = await store.read(written.assetId);
    assert.equal(missing.ok, false);
    assert.equal(missing.status, 404);
  } finally {
    await fs.rm(uploadDir, { recursive: true, force: true });
  }
});

test("file image store canonicalizes supported image extensions", async () => {
  const uploadDir = tempUploadDir();
  const store = new FileImageStore({ uploadDir });

  try {
    const jpeg = await store.write({ buffer: Buffer.from([0xff, 0xd8, 0xff, 0xdb]), contentType: "image/jpeg; charset=binary" });
    assert.equal(jpeg.ok, true);
    assert.match(jpeg.assetId, /\.jpg$/);
    assert.equal(jpeg.contentType, "image/jpeg");

    const webp = await store.write({ buffer: Buffer.from("RIFFxxxxWEBP", "ascii"), contentType: "IMAGE/WEBP" });
    assert.equal(webp.ok, true);
    assert.match(webp.assetId, /\.webp$/);
    assert.equal(webp.contentType, "image/webp");
  } finally {
    await fs.rm(uploadDir, { recursive: true, force: true });
  }
});

test("file image store rejects unsupported content types and non-buffer writes", async () => {
  const store = new FileImageStore({ uploadDir: os.tmpdir() });

  const unsupported = await store.write({ buffer: Buffer.from("svg"), contentType: "image/svg+xml" });
  assert.equal(unsupported.ok, false);
  assert.equal(unsupported.status, 415);

  const missing = await store.write({ buffer: Buffer.from("txt") });
  assert.equal(missing.ok, false);
  assert.equal(missing.status, 415);

  const invalidBuffer = await store.write({ buffer: "not-a-buffer", contentType: "image/png" });
  assert.equal(invalidBuffer.ok, false);
  assert.equal(invalidBuffer.status, 400);
});

test("file image store rejects image content type mismatches", async () => {
  const store = new FileImageStore({ uploadDir: os.tmpdir() });
  const result = await store.write({ buffer: Buffer.from("not really a png"), contentType: "image/png" });

  assert.equal(result.ok, false);
  assert.equal(result.status, 415);
  assert.equal(result.error, "Image bytes do not match the content type.");
});

test("file image store rejects invalid and traversing asset ids", async () => {
  const uploadDir = tempUploadDir();
  const store = new FileImageStore({ uploadDir });
  const invalidIds = [
    "../escape.png",
    "..\\escape.png",
    "/absolute/path.png",
    "C:\\absolute\\path.png",
    "short.png",
    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.svg",
    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png/extra",
    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.PNG",
  ];

  try {
    for (const assetId of invalidIds) {
      const read = await store.read(assetId);
      assert.equal(read.ok, false, assetId);
      assert.equal(read.status, 400, assetId);

      const deleted = await store.delete(assetId);
      assert.equal(deleted.ok, false, assetId);
      assert.equal(deleted.status, 400, assetId);
    }
  } finally {
    await fs.rm(uploadDir, { recursive: true, force: true });
  }
});

test("file image store delete is idempotent for valid missing assets", async () => {
  const store = new FileImageStore({ uploadDir: tempUploadDir() });
  const result = await store.delete("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png");

  assert.equal(result.ok, true);
});
