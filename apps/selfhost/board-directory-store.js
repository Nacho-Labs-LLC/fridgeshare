const crypto = require("crypto");
const fsp = require("fs/promises");
const path = require("path");

const BOARD_SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{2,62}[a-z0-9]$/;

class BoardDirectoryStore {
  constructor({ filePath }) {
    this.filePath = filePath;
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

  async get(slug) {
    const data = await this.readData();
    return data.boards.find((board) => board.slug === slug) || null;
  }

  async create({ slug, title }) {
    const normalizedSlug = normalizeSlug(slug);
    if (!normalizedSlug) {
      return { ok: false, status: 400, error: "Board slugs must be 4-64 lowercase letters, numbers, or hyphens." };
    }

    const data = await this.readData();
    if (data.boards.some((board) => board.slug === normalizedSlug)) {
      return { ok: false, status: 409, error: "Board already exists." };
    }

    const now = new Date().toISOString();
    const board = {
      slug: normalizedSlug,
      title: normalizeTitle(title) || titleFromSlug(normalizedSlug),
      createdAt: now,
      updatedAt: now,
    };
    data.boards.push(board);
    await this.writeData(data);
    return { ok: true, board, editToken: randomToken() };
  }

  async touch(slug) {
    const data = await this.readData();
    const board = data.boards.find((candidate) => candidate.slug === slug);
    if (!board) {
      return null;
    }
    board.updatedAt = new Date().toISOString();
    await this.writeData(data);
    return board;
  }

  async delete(slug) {
    const data = await this.readData();
    const nextBoards = data.boards.filter((board) => board.slug !== slug);
    if (nextBoards.length === data.boards.length) {
      return { ok: false, status: 404, error: "Board not found." };
    }
    data.boards = nextBoards;
    await this.writeData(data);
    return { ok: true };
  }

  async readData() {
    try {
      const raw = await fsp.readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw);
      return {
        version: 1,
        boards: Array.isArray(parsed.boards) ? parsed.boards.filter(isBoardRecord) : [],
      };
    } catch (error) {
      if (error.code === "ENOENT") {
        return { version: 1, boards: [] };
      }
      throw error;
    }
  }

  async writeData(data) {
    await fsp.mkdir(path.dirname(this.filePath), { recursive: true });
    const tmpPath = `${this.filePath}.${process.pid}.${crypto.randomBytes(8).toString("hex")}.tmp`;
    await fsp.writeFile(tmpPath, JSON.stringify(data, null, 2));
    await fsp.rename(tmpPath, this.filePath);
    this._cachedList = null;
    this._cachedMtimeMs = -1;
  }
}

function normalizeSlug(value) {
  const slug = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return BOARD_SLUG_PATTERN.test(slug) ? slug : "";
}

function normalizeTitle(value) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, 80);
}

function titleFromSlug(slug) {
  return slug.split("-").map((part) => part.slice(0, 1).toUpperCase() + part.slice(1)).join(" ");
}

function randomToken() {
  return crypto.randomBytes(30).toString("base64url");
}

function isBoardRecord(value) {
  return Boolean(value && BOARD_SLUG_PATTERN.test(value.slug) && typeof value.title === "string");
}

module.exports = {
  BOARD_SLUG_PATTERN,
  BoardDirectoryStore,
  normalizeSlug,
  randomToken,
  titleFromSlug,
};
