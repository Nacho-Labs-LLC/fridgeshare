const crypto = require("crypto");
const fsp = require("fs/promises");
const path = require("path");

const IMAGE_TYPES = new Map([
  ["image/png", { extension: ".png" }],
  ["image/jpeg", { extension: ".jpg" }],
  ["image/gif", { extension: ".gif" }],
  ["image/webp", { extension: ".webp" }],
]);
const EXTENSION_TYPES = new Map(Array.from(IMAGE_TYPES, ([contentType, { extension }]) => [extension, contentType]));
const ASSET_ID_PATTERN = /^[A-Za-z0-9_-]{32}\.(?:png|jpg|gif|webp)$/;

class FileImageStore {
  constructor({ uploadDir }) {
    this.uploadDir = uploadDir;
  }

  async write({ buffer, contentType }) {
    if (!Buffer.isBuffer(buffer)) {
      return { ok: false, status: 400, error: "Image buffer is required." };
    }

    const type = normalizeContentType(contentType);
    const policy = IMAGE_TYPES.get(type);
    if (!policy) {
      return { ok: false, status: 415, error: "Unsupported image content type." };
    }
    if (!hasImageSignature(buffer, type)) {
      return { ok: false, status: 415, error: "Image bytes do not match the content type." };
    }

    const assetId = `${crypto.randomBytes(24).toString("base64url")}${policy.extension}`;
    const filePath = this.assetPath(assetId);
    if (!filePath) {
      return { ok: false, status: 400, error: "Invalid asset id." };
    }

    await fsp.mkdir(this.uploadDir, { recursive: true });
    const tmpPath = `${filePath}.${process.pid}.${crypto.randomBytes(8).toString("hex")}.tmp`;
    await fsp.writeFile(tmpPath, buffer);
    await fsp.rename(tmpPath, filePath);

    return {
      ok: true,
      assetId,
      contentType: type,
      byteSize: buffer.length,
      publicPath: `/uploads/${assetId}`,
    };
  }

  async read(assetId) {
    const filePath = this.assetPath(assetId);
    if (!filePath) {
      return { ok: false, status: 400, error: "Invalid asset id." };
    }

    try {
      const buffer = await fsp.readFile(filePath);
      return {
        ok: true,
        buffer,
        contentType: contentTypeFromAssetId(assetId),
        byteSize: buffer.length,
      };
    } catch (error) {
      if (error.code === "ENOENT") {
        return { ok: false, status: 404, error: "Image asset not found." };
      }
      throw error;
    }
  }

  async delete(assetId) {
    const filePath = this.assetPath(assetId);
    if (!filePath) {
      return { ok: false, status: 400, error: "Invalid asset id." };
    }

    try {
      await fsp.unlink(filePath);
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }
    }
    return { ok: true };
  }

  assetPath(assetId) {
    if (!isValidAssetId(assetId)) {
      return null;
    }

    const root = path.resolve(this.uploadDir);
    const resolved = path.resolve(root, assetId);
    const relative = path.relative(root, resolved);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      return null;
    }
    return resolved;
  }
}

function normalizeContentType(value) {
  return String(value || "").split(";")[0].trim().toLowerCase();
}

function isValidAssetId(value) {
  return typeof value === "string" && ASSET_ID_PATTERN.test(value);
}

function contentTypeFromAssetId(assetId) {
  return EXTENSION_TYPES.get(path.extname(assetId).toLowerCase()) || "application/octet-stream";
}

function hasImageSignature(buffer, contentType) {
  if (contentType === "image/png") {
    return buffer.length >= 4
      && buffer[0] === 0x89
      && buffer[1] === 0x50
      && buffer[2] === 0x4e
      && buffer[3] === 0x47;
  }
  if (contentType === "image/jpeg") {
    return buffer.length >= 3
      && buffer[0] === 0xff
      && buffer[1] === 0xd8
      && buffer[2] === 0xff;
  }
  if (contentType === "image/gif") {
    return buffer.length >= 6 && (buffer.subarray(0, 6).toString("ascii") === "GIF87a" || buffer.subarray(0, 6).toString("ascii") === "GIF89a");
  }
  if (contentType === "image/webp") {
    return buffer.length >= 12
      && buffer.subarray(0, 4).toString("ascii") === "RIFF"
      && buffer.subarray(8, 12).toString("ascii") === "WEBP";
  }
  return false;
}

module.exports = {
  ASSET_ID_PATTERN,
  FileImageStore,
  IMAGE_TYPES,
  hasImageSignature,
  isValidAssetId,
};
