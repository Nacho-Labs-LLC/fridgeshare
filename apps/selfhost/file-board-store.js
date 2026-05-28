const crypto = require("crypto");
const fsp = require("fs/promises");
const path = require("path");
const { normalizeSavedBoard } = require("../../core/board-state");

const BOARD_ID_PATTERN = /^[a-z0-9-]{4,64}$/;

class FileBoardStore {
  constructor({ dataDir }) {
    this.dataDir = dataDir;
  }

  boardPath(id) {
    if (!BOARD_ID_PATTERN.test(id)) {
      return null;
    }
    return path.join(this.dataDir, `${id}.json`);
  }

  async list() {
    let entries = [];
    try {
      entries = await fsp.readdir(this.dataDir, { withFileTypes: true });
    } catch (error) {
      if (error.code === "ENOENT") {
        return [];
      }
      throw error;
    }

    const readPromises = [];
    for (const entry of entries) {
      if (!entry.isFile() || path.extname(entry.name) !== ".json") {
        continue;
      }

      const id = path.basename(entry.name, ".json");
      if (!BOARD_ID_PATTERN.test(id)) {
        continue;
      }

      readPromises.push(this.read(id));
    }

    const results = await Promise.all(readPromises);
    return results.filter((r) => r.ok).map((r) => r.value);
  }

  async read(id) {
    const filePath = this.boardPath(id);
    if (!filePath) {
      return { ok: false, status: 400, error: "Invalid fridge id." };
    }

    try {
      const raw = await fsp.readFile(filePath, "utf8");
      return { ok: true, value: normalizeSavedBoard(JSON.parse(raw), id) };
    } catch (error) {
      if (error.code === "ENOENT") {
        return { ok: false, status: 404, error: "Fridge not found." };
      }
      throw error;
    }
  }

  async readOptional(id) {
    const result = await this.read(id);
    if (result.ok) {
      return result.value;
    }
    if (result.status === 404) {
      return null;
    }
    const error = new Error(result.error);
    error.statusCode = result.status;
    throw error;
  }

  async write(id, payload) {
    const filePath = this.boardPath(id);
    if (!filePath) {
      return { ok: false, status: 400, error: "Invalid fridge id." };
    }

    await fsp.mkdir(this.dataDir, { recursive: true });
    const tmpPath = `${filePath}.${process.pid}.${crypto.randomBytes(8).toString("hex")}.tmp`;
    await fsp.writeFile(tmpPath, JSON.stringify(payload, null, 2));
    await fsp.rename(tmpPath, filePath);
    return { ok: true, value: normalizeSavedBoard(payload, id) };
  }

  async delete(id) {
    const filePath = this.boardPath(id);
    if (!filePath) {
      return { ok: false, status: 400, error: "Invalid fridge id." };
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
}

module.exports = {
  BOARD_ID_PATTERN,
  FileBoardStore,
};
