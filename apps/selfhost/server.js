const http = require("http");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const {
  applyBoardOps,
  getRevision,
  publicBoardChanges,
  publicBoardState,
  validateBoardState,
} = require("../../core/board-state");
const { BoardDirectoryStore, randomToken } = require("./board-directory-store");
const { BOARD_ID_PATTERN, FileBoardStore } = require("./file-board-store");
const { FileImageStore, isValidAssetId } = require("./file-image-store");

const PORT = Number(process.env.PORT || 4173);
const ROOT = path.resolve(__dirname, "../..");
const DATA_DIR = process.env.FRIDGE_DATA_DIR || path.join(ROOT, "server", "data", "fridges");
const DIRECTORY_PATH = process.env.BOARD_DIRECTORY_PATH || path.join(ROOT, "server", "data", "boards.json");
const UPLOAD_DIR = process.env.FRIDGE_UPLOAD_DIR || path.join(ROOT, "server", "data", "uploads");
const SELFHOST_ADMIN_TOKEN = process.env.SELFHOST_ADMIN_TOKEN || "";
const MAX_BODY_BYTES = 4 * 1024 * 1024;
const MAX_UPLOAD_BYTES = Number(process.env.FRIDGE_MAX_UPLOAD_BYTES || MAX_BODY_BYTES);
const WRITE_RATE_WINDOW_MS = Number(process.env.FRIDGE_WRITE_RATE_WINDOW_MS || 60_000);
const WRITE_RATE_LIMIT = Number(process.env.FRIDGE_WRITE_RATE_LIMIT || 60);
const EDIT_TOKEN_PATTERN = /^[a-z0-9_-]{24,96}$/;
const BOARD_SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{2,62}[a-z0-9]$/;
const writeRateBuckets = new Map();
const boardStore = new FileBoardStore({ dataDir: DATA_DIR });
const boardDirectory = new BoardDirectoryStore({ filePath: DIRECTORY_PATH });
const imageStore = new FileImageStore({ uploadDir: UPLOAD_DIR });

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};
const staticFiles = new Map([
  ["/styles.css", "styles.css"],
  ["/src/emoji-data.js", path.join("src", "emoji-data.js")],
  ["/src/fridge-items.js", path.join("src", "fridge-items.js")],
  ["/src/fridge-themes.js", path.join("src", "fridge-themes.js")],
  ["/src/fridge-storage.js", path.join("src", "fridge-storage.js")],
  ["/src/fridge-canvas.js", path.join("src", "fridge-canvas.js")],
  ["/src/app-local.js", path.join("src", "app-local.js")],
  ["/src/app-online.js", path.join("src", "app-online.js")],
  ["/src/app-selfhost.js", path.join("src", "app-selfhost.js")],
]);

function send(response, status, body, headers = {}) {
  response.writeHead(status, securityHeaders(headers));
  response.end(body);
}

function securityHeaders(headers = {}) {
  return {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Content-Security-Policy": [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self'",
      "img-src 'self' data:",
      "connect-src 'self'",
      "font-src 'self'",
      "object-src 'none'",
      "base-uri 'none'",
      "frame-ancestors 'none'",
    ].join("; "),
    ...headers,
  };
}

function sendJson(response, status, value) {
  send(response, status, JSON.stringify(value), {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
}

function isBoardSlug(value) {
  return BOARD_SLUG_PATTERN.test(value);
}

function getEditToken(request) {
  const value = request.headers["x-fridge-edit-token"];
  return typeof value === "string" && EDIT_TOKEN_PATTERN.test(value) ? value : null;
}

function canAdminister(request) {
  if (!SELFHOST_ADMIN_TOKEN) {
    return true;
  }
  return request.headers["x-selfhost-admin-token"] === SELFHOST_ADMIN_TOKEN;
}

function hasUploadAdminToken(request) {
  return Boolean(SELFHOST_ADMIN_TOKEN) && request.headers["x-selfhost-admin-token"] === SELFHOST_ADMIN_TOKEN;
}

function canWriteBoard(request, saved) {
  const supplied = getEditToken(request);
  if (!supplied) {
    return false;
  }
  return !saved || !saved.editToken || saved.editToken === supplied;
}

function clientKey(request, boardId) {
  const forwardedFor = request.headers["x-forwarded-for"];
  const forwardedIp = typeof forwardedFor === "string" ? forwardedFor.split(",")[0].trim() : "";
  return `${forwardedIp || request.socket.remoteAddress || "unknown"}:${boardId}`;
}

function checkWriteRateLimit(request, boardId) {
  const now = Date.now();
  const key = clientKey(request, boardId);
  const bucket = writeRateBuckets.get(key) || [];
  const recent = bucket.filter((timestamp) => now - timestamp < WRITE_RATE_WINDOW_MS);
  if (recent.length >= WRITE_RATE_LIMIT) {
    writeRateBuckets.set(key, recent);
    return false;
  }
  recent.push(now);
  writeRateBuckets.set(key, recent);
  return true;
}

function readBody(request) {
  return readRawBody(request, MAX_BODY_BYTES).then((buffer) => buffer.toString("utf8"));
}

async function readJsonBody(request, response) {
  const raw = await readBody(request);
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch (error) {
    sendJson(response, 400, { error: "Invalid JSON." });
    return { ok: false };
  }
}

async function authorizeBoardWrite(request, response, boardId) {
  const previous = await boardStore.readOptional(boardId);
  if (!canWriteBoard(request, previous)) {
    sendJson(response, 403, { error: "Valid edit token required." });
    return { ok: false };
  }
  return { ok: true, previous };
}

function readBinaryBody(request) {
  return readRawBody(request, MAX_UPLOAD_BYTES);
}

function readRawBody(request, maxBytes) {
  return new Promise((resolve, reject) => {
    const contentLength = Number(request.headers["content-length"] || 0);
    if (contentLength > maxBytes) {
      const error = new Error("Request body too large.");
      error.statusCode = 413;
      reject(error);
      return;
    }

    let total = 0;
    const chunks = [];
    let tooLarge = false;

    request.on("data", (chunk) => {
      if (tooLarge) {
        return;
      }
      total += chunk.length;
      if (total > maxBytes) {
        tooLarge = true;
        const error = new Error("Request body too large.");
        error.statusCode = 413;
        reject(error);
        return;
      }
      chunks.push(chunk);
    });

    request.on("end", () => {
      if (!tooLarge) {
        resolve(Buffer.concat(chunks));
      }
    });
    request.on("error", reject);
  });
}

function boardIdFromUploadRequest(request, url) {
  const queryBoardId = url.searchParams.get("boardId");
  const headerBoardId = request.headers["x-fridge-board-id"];
  return queryBoardId || (typeof headerBoardId === "string" ? headerBoardId : "");
}

function boardIdFromPathname(pathname) {
  const match = pathname.match(/^\/b\/([a-z0-9][a-z0-9-]{2,62}[a-z0-9])$/);
  return match ? match[1] : "";
}

function bootstrapPayload(pathname = "/") {
  return {
    mode: "selfhost",
    boardId: boardIdFromPathname(pathname),
    apiBase: "/api/boards",
    legacyApiBase: "/api/fridges",
    capabilities: {
      namedBoards: true,
      fileStorage: true,
      editTokens: true,
    },
  };
}

function boardTitleFromSlug(slug) {
  return slug.split("-").map((part) => part.slice(0, 1).toUpperCase() + part.slice(1)).join(" ");
}

async function listSelfhostBoards(request) {
  const directoryBoards = await boardDirectory.list();
  const savedBoards = await boardStore.list();
  const canShowEditLinks = Boolean(SELFHOST_ADMIN_TOKEN) && canAdminister(request);
  const bySlug = new Map();

  for (const board of directoryBoards) {
    bySlug.set(board.slug, {
      slug: board.slug,
      title: board.title,
      createdAt: board.createdAt,
      updatedAt: board.updatedAt || board.createdAt,
      canEdit: false,
    });
  }

  for (const saved of savedBoards) {
    const existing = bySlug.get(saved.id) || {};
    const board = {
      slug: saved.id,
      title: existing.title || boardTitleFromSlug(saved.id),
      createdAt: existing.createdAt || saved.savedAt || saved.updatedAt || "",
      updatedAt: saved.updatedAt || saved.savedAt || existing.updatedAt || existing.createdAt || "",
      canEdit: canShowEditLinks && Boolean(saved.editToken),
    };
    if (board.canEdit) {
      board.editUrl = `/b/${saved.id}#${saved.editToken}`;
    }
    bySlug.set(saved.id, board);
  }

  return Array.from(bySlug.values())
    .sort((a, b) => (b.updatedAt || b.createdAt || "").localeCompare(a.updatedAt || a.createdAt || ""));
}

async function handleBootstrap(request, response, url) {
  const pathname = url.searchParams.get("path") || "/";
  const boardId = boardIdFromPathname(pathname);
  if (pathname !== "/" && !boardId) {
    sendJson(response, 400, { error: "Invalid board path." });
    return;
  }
  sendJson(response, 200, bootstrapPayload(pathname));
}

async function handleBoardDirectory(request, response, pathname) {
  if (pathname === "/api/selfhost/boards" && request.method === "GET") {
    sendJson(response, 200, {
      boards: await listSelfhostBoards(request),
      adminRequired: Boolean(SELFHOST_ADMIN_TOKEN),
      canEdit: canAdminister(request),
    });
    return;
  }

  if (pathname === "/api/selfhost/boards" && request.method === "POST") {
    if (!canAdminister(request)) {
      sendJson(response, 403, { error: "Self-host admin token required." });
      return;
    }

    const raw = await readBody(request);
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      sendJson(response, 400, { error: "Invalid JSON." });
      return;
    }

    const result = await boardDirectory.create(parsed || {});
    if (!result.ok) {
      sendJson(response, result.status, { error: result.error });
      return;
    }

    const initialState = {
      version: 1,
      id: result.board.slug,
      editToken: result.editToken,
      savedAt: result.board.createdAt,
      updatedAt: result.board.updatedAt,
      revision: 0,
      theme: "classic-white",
      items: [],
    };
    await boardStore.write(result.board.slug, initialState);
    sendJson(response, 201, {
      board: result.board,
      editToken: result.editToken,
      url: `/b/${result.board.slug}#${result.editToken}`,
    });
    return;
  }

  const match = pathname.match(/^\/api\/selfhost\/boards\/([a-z0-9][a-z0-9-]{2,62}[a-z0-9])$/);
  if (match && request.method === "DELETE") {
    if (!canAdminister(request)) {
      sendJson(response, 403, { error: "Self-host admin token required." });
      return;
    }
    const slug = match[1];
    const result = await boardDirectory.delete(slug);
    const saved = await boardStore.readOptional(slug);
    if (!result.ok && !saved) {
      sendJson(response, result.status, { error: result.error });
      return;
    }
    await boardStore.delete(slug);
    sendJson(response, 200, { ok: true });
    return;
  }

  sendJson(response, 404, { error: "Not found." });
}

async function authorizeUpload(request, url) {
  if (hasUploadAdminToken(request)) {
    return { ok: true, boardId: "selfhost-uploads" };
  }

  const boardId = boardIdFromUploadRequest(request, url);
  if (!boardId || !BOARD_ID_PATTERN.test(boardId)) {
    return { ok: false, status: 400, error: "Valid board id required." };
  }

  const saved = await boardStore.readOptional(boardId);
  if (!saved || !canWriteBoard(request, saved)) {
    return { ok: false, status: 403, error: "Valid edit token required." };
  }

  return { ok: true, boardId };
}

async function handleUpload(request, response, url) {
  if (request.method !== "POST") {
    sendJson(response, 405, { error: "Method not allowed." });
    return;
  }

  const auth = await authorizeUpload(request, url);
  if (!auth.ok) {
    sendJson(response, auth.status, { error: auth.error });
    return;
  }

  if (!checkWriteRateLimit(request, auth.boardId)) {
    sendJson(response, 429, { error: "Too many write requests. Try again shortly." });
    return;
  }

  const buffer = await readBinaryBody(request);
  const result = await imageStore.write({
    buffer,
    contentType: request.headers["content-type"],
  });
  if (!result.ok) {
    sendJson(response, result.status, { error: result.error });
    return;
  }

  sendJson(response, 201, {
    src: `/api/assets/${result.assetId}`,
    assetId: result.assetId,
    contentType: result.contentType,
    byteSize: result.byteSize,
  });
}

async function handleAsset(request, response, pathname) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    sendJson(response, 405, { error: "Method not allowed." });
    return;
  }

  const match = pathname.match(/^\/api\/assets\/([^/?#]+)$/);
  if (!match || !isValidAssetId(match[1])) {
    sendJson(response, 400, { error: "Invalid asset id." });
    return;
  }

  const result = await imageStore.read(match[1]);
  if (!result.ok) {
    sendJson(response, result.status, { error: result.error });
    return;
  }

  response.writeHead(200, securityHeaders({
    "Content-Type": result.contentType,
    "Content-Length": String(result.byteSize),
    "Cache-Control": "public, max-age=31536000, immutable",
  }));
  if (request.method === "HEAD") {
    response.end();
    return;
  }
  response.end(result.buffer);
}

async function handleApi(request, response, pathname) {
  const changesMatch = pathname.match(/^\/api\/(?:boards|fridges)\/([a-z0-9-]{4,64})\/changes$/);
  if (changesMatch) {
    await handleBoardChanges(request, response, changesMatch[1]);
    return;
  }

  const match = pathname.match(/^\/api\/(?:boards|fridges)\/([a-z0-9-]{4,64})$/);
  if (!match) {
    sendJson(response, 404, { error: "Not found." });
    return;
  }

  const boardId = match[1];
  if (!BOARD_ID_PATTERN.test(boardId)) {
    sendJson(response, 400, { error: "Invalid board id." });
    return;
  }

  if ((request.method === "PUT" || request.method === "PATCH" || request.method === "DELETE") && !checkWriteRateLimit(request, boardId)) {
    sendJson(response, 429, { error: "Too many write requests. Try again shortly." });
    return;
  }

  if (request.method === "GET") {
    await handleBoardRead(response, boardId);
    return;
  }

  if (request.method === "PUT") {
    await handleBoardReplace(request, response, boardId);
    return;
  }

  if (request.method === "PATCH") {
    await handleBoardPatch(request, response, boardId);
    return;
  }

  if (request.method === "DELETE") {
    await handleBoardDelete(request, response, boardId);
    return;
  }

  sendJson(response, 405, { error: "Method not allowed." });
}

async function handleBoardRead(response, boardId) {
  const result = await boardStore.read(boardId);
  if (!result.ok) {
    sendJson(response, result.status, { error: result.error });
    return;
  }
  await boardDirectory.touch(boardId);
  sendJson(response, 200, publicBoardState(result.value));
}

async function handleBoardReplace(request, response, boardId) {
  const body = await readJsonBody(request, response);
  if (!body.ok) {
    return;
  }
  const parsed = body.value;

  const auth = await authorizeBoardWrite(request, response, boardId);
  if (!auth.ok) {
    return;
  }
  const previous = auth.previous;

  const previousRevision = getRevision(previous);
  if (
    previous &&
    parsed.forceOverwrite !== true &&
    Number.isSafeInteger(parsed.baseRevision) &&
    parsed.baseRevision < previousRevision
  ) {
    sendJson(response, 409, {
      error: "Board has newer changes. Reload the latest board before saving.",
      revision: previousRevision,
    });
    return;
  }

  const state = validateBoardState(parsed);
  if (!state.ok) {
    sendJson(response, 400, { error: state.error });
    return;
  }

  const savedAt = new Date().toISOString();
  const payload = {
    version: 1,
    id: boardId,
    editToken: previous && previous.editToken ? previous.editToken : getEditToken(request),
    savedAt,
    updatedAt: savedAt,
    revision: previousRevision + 1,
    theme: state.value.theme,
    items: state.value.items,
    changes: previous && Array.isArray(previous.changes) ? previous.changes : [],
  };

  const result = await boardStore.write(boardId, payload);
  if (!result.ok) {
    sendJson(response, result.status, { error: result.error });
    return;
  }
  sendJson(response, 200, publicBoardState(result.value));
}

async function handleBoardPatch(request, response, boardId) {
  const body = await readJsonBody(request, response);
  if (!body.ok) {
    return;
  }
  const parsed = body.value;

  const auth = await authorizeBoardWrite(request, response, boardId);
  if (!auth.ok) {
    return;
  }
  const previous = auth.previous;
  if (!previous) {
    sendJson(response, 404, { error: "Board not found." });
    return;
  }

  const result = applyBoardOps(previous, parsed);
  if (!result.ok) {
    sendJson(response, 400, { error: result.error });
    return;
  }
  if (!result.duplicate) {
    const written = await boardStore.write(boardId, result.value);
    if (!written.ok) {
      sendJson(response, written.status, { error: written.error });
      return;
    }
  }
  await boardDirectory.touch(boardId);
  sendJson(response, 200, {
    ...publicBoardState(result.value),
    change: result.change,
    duplicate: result.duplicate,
  });
}

async function handleBoardDelete(request, response, boardId) {
  const previous = await boardStore.readOptional(boardId);
  if (!canWriteBoard(request, previous)) {
    sendJson(response, 403, { error: "Valid edit token required." });
    return;
  }

  await boardStore.delete(boardId);
  sendJson(response, 200, { ok: true });
}

async function handleBoardChanges(request, response, boardId) {
  if (request.method !== "GET") {
    sendJson(response, 405, { error: "Method not allowed." });
    return;
  }
  if (!BOARD_ID_PATTERN.test(boardId)) {
    sendJson(response, 400, { error: "Invalid board id." });
    return;
  }

  const since = Number(new URL(request.url, `http://${request.headers.host}`).searchParams.get("since") || 0);
  const sinceRevision = Number.isSafeInteger(since) && since >= 0 ? since : 0;
  const result = await boardStore.read(boardId);
  if (!result.ok) {
    sendJson(response, result.status, { error: result.error });
    return;
  }

  const revision = getRevision(result.value);
  const history = Array.isArray(result.value.changes) ? result.value.changes : [];
  const changes = publicBoardChanges(result.value, sinceRevision);
  const oldestRevision = history.length ? history[0].revision : revision;
  const newestRevision = history.length ? history[history.length - 1].revision : 0;
  const needsSnapshot = sinceRevision > 0 && sinceRevision < revision && (
    history.length === 0 ||
    sinceRevision < oldestRevision - 1 ||
    newestRevision < revision
  );
  sendJson(response, 200, {
    revision,
    changes,
    needsSnapshot,
    ...(needsSnapshot ? { state: publicBoardState(result.value) } : {}),
  });
}

function staticPath(pathname) {
  if (pathname === "/") {
    return { filePath: path.join(ROOT, "selfhost.html") };
  }
  if (pathname === "/local") {
    return { filePath: path.join(ROOT, "index.html") };
  }
  if (/^\/b\/[a-z0-9][a-z0-9-]{2,62}[a-z0-9]$/.test(pathname)) {
    return { filePath: path.join(ROOT, "online.html") };
  }

  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch (error) {
    return { status: 404 };
  }

  if (decoded.includes("..")) {
    return { status: 403 };
  }

  const relativePath = staticFiles.get(decoded);
  return relativePath
    ? { filePath: path.join(ROOT, relativePath) }
    : { status: 404 };
}

async function handleStatic(request, response, pathname) {
  const target = staticPath(pathname);
  if (!target.filePath) {
    send(response, target.status || 404, target.status === 403 ? "Forbidden" : "Not found");
    return;
  }

  try {
    const stat = await fsp.stat(target.filePath);
    if (!stat.isFile()) {
      send(response, 404, "Not found");
      return;
    }

    const extension = path.extname(target.filePath);
    response.writeHead(200, {
      ...securityHeaders({
        "Content-Type": mimeTypes[extension] || "application/octet-stream",
        "Cache-Control": "no-cache",
      }),
    });
    fs.createReadStream(target.filePath).pipe(response);
  } catch (error) {
    if (error.code === "ENOENT") {
      send(response, 404, "Not found");
      return;
    }
    throw error;
  }
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);
    if (url.pathname === "/api/bootstrap") {
      await handleBootstrap(request, response, url);
      return;
    }

    if (url.pathname === "/api/selfhost/uploads") {
      await handleUpload(request, response, url);
      return;
    }

    if (url.pathname.startsWith("/api/selfhost/")) {
      await handleBoardDirectory(request, response, url.pathname);
      return;
    }

    if (url.pathname.startsWith("/api/assets/")) {
      await handleAsset(request, response, url.pathname);
      return;
    }

    if (url.pathname.startsWith("/api/")) {
      await handleApi(request, response, url.pathname);
      return;
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      send(response, 405, "Method not allowed");
      return;
    }

    await handleStatic(request, response, url.pathname);
  } catch (error) {
    if (!response.headersSent) {
      if (error.statusCode === 413) {
        sendJson(response, 413, { error: "Request body too large." });
        return;
      }
      console.error(error);
      sendJson(response, 500, { error: "Internal server error." });
    } else {
      console.error(error);
      response.end();
    }
  }
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`FridgeShare server is running at http://localhost:${PORT}`);
  });
}

module.exports = {
  bootstrapPayload,
  server,
  validateBoardState,
  validateFridgeState: validateBoardState,
};
