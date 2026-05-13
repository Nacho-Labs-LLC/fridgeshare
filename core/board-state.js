const MAX_ITEMS = 200;
const MAX_DATA_URL_CHARS = 1_500_000;
const MAX_NOTE_CHARS = 220;
const MAX_CAPTION_CHARS = 80;
const MAX_STROKES = 100;
const MAX_POINTS_PER_STROKE = 300;
const MAX_CHANGE_RECORDS = 1000;
const ITEM_ID_PATTERN = /^[a-z0-9_-]{8,80}$/i;
const ASSET_ID_PATTERN = /^[A-Za-z0-9_-]{32}\.(?:png|jpg|gif|webp)$/;
const IMAGE_DATA_URL_PATTERN = /^data:image\/(?:png|jpeg|jpg|gif|webp);base64,/i;

function getRevision(value) {
  return Number.isSafeInteger(value && value.revision) && value.revision >= 0 ? value.revision : 0;
}

function normalizeSavedBoard(value, id) {
  const savedAt = typeof value.savedAt === "string" ? value.savedAt : null;
  const updatedAt = typeof value.updatedAt === "string" ? value.updatedAt : savedAt;
  const items = Array.isArray(value.items)
    ? value.items.map((item, index) => ensureItemId(item, index)).filter(Boolean)
    : [];
  return {
    version: Number.isSafeInteger(value.version) ? value.version : 1,
    id,
    revision: getRevision(value),
    theme: typeof value.theme === "string" ? value.theme : "classic-white",
    editToken: typeof value.editToken === "string" ? value.editToken : "",
    ...(savedAt ? { savedAt } : {}),
    ...(updatedAt ? { updatedAt } : {}),
    items,
    changes: normalizeChanges(value.changes),
  };
}

function publicBoardState(value) {
  const { editToken, changes, ...publicValue } = value;
  return publicValue;
}

function publicBoardChanges(value, sinceRevision) {
  const changes = normalizeChanges(value && value.changes);
  return changes.filter((change) => change.revision > sinceRevision);
}

function validateBoardState(value) {
  if (!value || typeof value !== "object" || !Array.isArray(value.items)) {
    return { ok: false, error: "Invalid fridge state." };
  }
  if (value.items.length > MAX_ITEMS) {
    return { ok: false, error: `Fridge can contain at most ${MAX_ITEMS} items.` };
  }

  const items = [];
  for (let index = 0; index < value.items.length; index += 1) {
    const result = validateItem(value.items[index], index);
    if (!result.ok) {
      return result;
    }
    items.push(result.value);
  }

  return {
    ok: true,
    value: {
      theme: validateTokenString(value.theme, 48) || "classic-white",
      items,
    },
  };
}

function validateItem(item, index = 0) {
  if (!item || typeof item !== "object") {
    return { ok: false, error: "Invalid fridge item." };
  }

  const type = validateTokenString(item.type, 32);
  if (!["alphabet", "note", "polaroid", "emoji", "dryEraseBoard"].includes(type)) {
    return { ok: false, error: "Unsupported fridge item type." };
  }

  const base = {
    id: validateItemId(item.id) || makeLegacyItemId(item, index),
    type,
    x: finiteNumber(item.x, -100000, 100000, 0),
    y: finiteNumber(item.y, -100000, 100000, 0),
    width: finiteNumber(item.width, 24, 1000, 100),
    height: finiteNumber(item.height, 24, 1000, 100),
    rotation: finiteNumber(item.rotation, -Math.PI * 4, Math.PI * 4, 0),
  };

  if (type === "alphabet") {
    return {
      ok: true,
      value: {
        ...base,
        label: String(item.label || "A").slice(0, 1).toUpperCase(),
        magnetStyle: validateTokenString(item.magnetStyle, 32) || "classic",
        palette: validatePalette(item.palette),
        sizePreset: validateTokenString(item.sizePreset, 32) || "",
      },
    };
  }

  if (type === "note") {
    return {
      ok: true,
      value: {
        ...base,
        text: String(item.text || "").slice(0, MAX_NOTE_CHARS),
        color: validateColor(item.color) || "#ffe98a",
        paperStyle: validateTokenString(item.paperStyle, 48) || "yellow-sticky",
        sizePreset: validateTokenString(item.sizePreset, 32) || "",
      },
    };
  }

  if (type === "emoji") {
    return {
      ok: true,
      value: {
        ...base,
        emoji: String(item.emoji || "?").slice(0, 16),
      },
    };
  }

  if (type === "polaroid") {
    const src = validatePhotoSrc(item.src);
    if (!src.ok) {
      return src;
    }
    return {
      ok: true,
      value: {
        ...base,
        src: src.value,
        caption: String(item.caption || "").slice(0, MAX_CAPTION_CHARS),
        frameStyle: validateTokenString(item.frameStyle, 48) || "polaroid",
        framePaletteIndex: Math.round(finiteNumber(item.framePaletteIndex, 0, 20, 0)),
        sizePreset: validateTokenString(item.sizePreset, 32) || "",
      },
    };
  }

  return {
    ok: true,
    value: {
      ...base,
      strokes: validateStrokes(item.strokes),
    },
  };
}

function applyBoardOps(saved, input) {
  if (!saved || typeof saved !== "object") {
    return { ok: false, error: "Saved board state is required." };
  }
  if (!input || typeof input !== "object" || !Array.isArray(input.ops)) {
    return { ok: false, error: "Patch operations are required." };
  }
  if (input.ops.length < 1 || input.ops.length > 100) {
    return { ok: false, error: "Patch must contain 1-100 operations." };
  }

  const baseRevision = Number.isSafeInteger(input.baseRevision) && input.baseRevision >= 0
    ? input.baseRevision
    : null;
  const opId = validateOpId(input.opId);
  if (!opId) {
    return { ok: false, error: "Valid opId is required." };
  }

  const existingChange = Array.isArray(saved.changes)
    ? saved.changes.find((change) => change.opId === opId)
    : null;
  if (existingChange) {
    return {
      ok: true,
      value: saved,
      change: existingChange,
      duplicate: true,
    };
  }

  const next = {
    ...saved,
    theme: validateTokenString(saved.theme, 48) || "classic-white",
    items: Array.isArray(saved.items) ? saved.items.map((item, index) => ensureItemId(item, index)).filter(Boolean) : [],
    changes: normalizeChanges(saved.changes),
  };
  const appliedOps = [];

  for (const op of input.ops) {
    const result = applyBoardOp(next, op);
    if (!result.ok) {
      return result;
    }
    if (result.value) {
      appliedOps.push(result.value);
    }
  }

  if (appliedOps.length < 1) {
    return { ok: false, error: "Patch did not contain applicable operations." };
  }

  const revision = getRevision(saved) + 1;
  const now = new Date().toISOString();
  const change = {
    revision,
    baseRevision,
    opId,
    clientId: validateTokenLike(input.clientId, 96),
    createdAt: now,
    ops: appliedOps,
  };

  next.revision = revision;
  next.savedAt = now;
  next.updatedAt = now;
  next.changes = [...next.changes, change].slice(-MAX_CHANGE_RECORDS);

  return { ok: true, value: next, change, duplicate: false };
}

function applyBoardOp(state, op) {
  if (!op || typeof op !== "object") {
    return { ok: false, error: "Invalid board operation." };
  }

  if (op.type === "board.setTheme") {
    const theme = validateTokenString(op.theme, 48);
    if (!theme) {
      return { ok: false, error: "Valid board theme is required." };
    }
    state.theme = theme;
    return { ok: true, value: { type: "board.setTheme", theme } };
  }

  if (op.type === "item.add") {
    const result = validateItem(op.item);
    if (!result.ok) {
      return result;
    }
    const existingIndex = state.items.findIndex((item) => item.id === result.value.id);
    if (existingIndex >= 0) {
      state.items[existingIndex] = result.value;
    } else {
      state.items.push(result.value);
    }
    return { ok: true, value: { type: "item.add", item: result.value } };
  }

  const id = validateItemId(op.id);
  if (!id) {
    return { ok: false, error: "Valid item id is required." };
  }

  const index = state.items.findIndex((item) => item.id === id);
  if (op.type === "item.delete") {
    if (index >= 0) {
      state.items.splice(index, 1);
    }
    return { ok: true, value: { type: "item.delete", id } };
  }

  if (op.type === "item.update") {
    if (index < 0) {
      return { ok: true, value: null };
    }
    const patch = sanitizeItemPatch(op.patch);
    if (!patch || Object.keys(patch).length === 0) {
      return { ok: false, error: "Item update patch is empty." };
    }
    const result = validateItem({ ...state.items[index], ...patch, id });
    if (!result.ok) {
      return result;
    }
    state.items[index] = result.value;
    return { ok: true, value: { type: "item.update", id, patch } };
  }

  if (op.type === "item.bringToFront") {
    if (index >= 0) {
      const [item] = state.items.splice(index, 1);
      state.items.push(item);
    }
    return { ok: true, value: { type: "item.bringToFront", id } };
  }

  return { ok: false, error: "Unsupported board operation." };
}

function sanitizeItemPatch(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const allowed = new Set([
    "x", "y", "width", "height", "rotation",
    "label", "magnetStyle", "palette", "sizePreset",
    "text", "color", "paperStyle",
    "emoji",
    "src", "caption", "frameStyle", "framePaletteIndex",
    "strokes",
  ]);
  const patch = {};
  for (const [key, item] of Object.entries(value)) {
    if (allowed.has(key)) {
      patch[key] = item;
    }
  }
  return patch;
}

function normalizeChanges(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((change) => change && Number.isSafeInteger(change.revision) && Array.isArray(change.ops) && validateOpId(change.opId))
    .slice(-MAX_CHANGE_RECORDS)
    .map((change) => ({
      revision: change.revision,
      baseRevision: Number.isSafeInteger(change.baseRevision) ? change.baseRevision : null,
      opId: change.opId,
      clientId: validateTokenLike(change.clientId, 96),
      createdAt: typeof change.createdAt === "string" ? change.createdAt : "",
      ops: change.ops,
    }));
}

function ensureItemId(item, index = 0) {
  if (!item || typeof item !== "object") {
    return null;
  }
  return {
    ...item,
    id: validateItemId(item.id) || makeLegacyItemId(item, index),
  };
}

function makeLegacyItemId(item, index) {
  const type = validateTokenString(item && item.type, 32) || "item";
  return `legacy-${index}-${type}`;
}

function validateItemId(value) {
  return typeof value === "string" && ITEM_ID_PATTERN.test(value) ? value : "";
}

function validateOpId(value) {
  return validateTokenLike(value, 128);
}

function validateTokenLike(value, maxLength) {
  return typeof value === "string" && /^[a-z0-9:._-]+$/i.test(value) && value.length <= maxLength ? value : "";
}

function validatePhotoSrc(value) {
  if (typeof value !== "string") {
    return { ok: false, error: "Photo items must use supported image data URLs or local asset URLs." };
  }
  if (IMAGE_DATA_URL_PATTERN.test(value)) {
    if (value.length > MAX_DATA_URL_CHARS) {
      return { ok: false, error: "Photo data is too large." };
    }
    return { ok: true, value };
  }
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value) || value.startsWith("//")) {
    return { ok: false, error: "Photo asset URLs must be local paths." };
  }

  const match = value.match(/^\/api\/assets\/([^/?#]+)$/);
  if (!match || !ASSET_ID_PATTERN.test(match[1])) {
    return { ok: false, error: "Photo asset URLs must match /api/assets/<assetId>." };
  }
  return { ok: true, value };
}

function finiteNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, number));
}

function validateTokenString(value, maxLength) {
  return typeof value === "string" && /^[a-z0-9-]+$/i.test(value) && value.length <= maxLength ? value : "";
}

function validateColor(value) {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : "";
}

function validatePalette(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const palette = {};
  for (const key of ["light", "base", "dark", "letter"]) {
    const color = validateColor(value[key]);
    if (color) {
      palette[key] = color;
    }
  }
  return palette.base ? palette : null;
}

function validateStrokes(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.slice(0, MAX_STROKES).map((stroke) => ({
    color: validateColor(stroke && stroke.color) || "#1f2522",
    size: finiteNumber(stroke && stroke.size, 1, 16, 4),
    points: Array.isArray(stroke && stroke.points)
      ? stroke.points.slice(0, MAX_POINTS_PER_STROKE).map((point) => ({
          x: finiteNumber(point && point.x, -1000, 1000, 0),
          y: finiteNumber(point && point.y, -1000, 1000, 0),
        }))
      : [],
  }));
}

module.exports = {
  applyBoardOps,
  getRevision,
  ITEM_ID_PATTERN,
  MAX_CHANGE_RECORDS,
  normalizeSavedBoard,
  normalizeSavedFridge: normalizeSavedBoard,
  publicBoardState,
  publicBoardChanges,
  publicFridgeState: publicBoardState,
  validateBoardState,
  validateFridgeState: validateBoardState,
};
