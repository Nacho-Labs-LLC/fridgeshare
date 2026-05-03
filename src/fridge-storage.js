(function () {
  const STORAGE_KEY = "the-open-fridge:v1";
  const VERSION = 1;
  const MAX_IMPORT_BYTES = 4 * 1024 * 1024;

  function normalizeState(state, extras = {}) {
    return {
      version: VERSION,
      savedAt: new Date().toISOString(),
      theme: typeof (state && state.theme) === "string" ? state.theme : "classic-white",
      items: Array.isArray(state && state.items) ? state.items : [],
      ...extras,
    };
  }

  function hasFridgeShape(value) {
    return Boolean(value && typeof value === "object" && Array.isArray(value.items));
  }

  async function parseJsonResponse(response, fallback = {}) {
    return response.json().catch(() => fallback);
  }

  function jsonResponseError(response, parsed, fallbackMessage) {
    const error = new Error((parsed && parsed.error) || fallbackMessage);
    error.status = response.status;
    error.body = parsed;
    return error;
  }

  class LocalPersistence {
    constructor(key = STORAGE_KEY) {
      this.key = key;
      this.kind = "local";
    }

    async load() {
      const raw = localStorage.getItem(this.key);
      if (!raw) {
        return null;
      }

      const parsed = JSON.parse(raw);
      return hasFridgeShape(parsed) ? parsed : null;
    }

    async save(state) {
      const payload = normalizeState(state);
      localStorage.setItem(this.key, JSON.stringify(payload));
      return payload;
    }

    async clear() {
      localStorage.removeItem(this.key);
    }
  }

  class BoardPersistence {
    constructor({ boardId, fridgeId = "", editToken = "", endpoint = "/api/boards", uploadEndpoint = "/api/selfhost/uploads" }) {
      this.boardId = boardId || fridgeId;
      this.editToken = editToken;
      this.endpoint = endpoint.replace(/\/$/, "");
      this.uploadEndpoint = uploadEndpoint;
      this.kind = "remote";
    }

    get url() {
      return `${this.endpoint}/${encodeURIComponent(this.boardId)}`;
    }

    async load() {
      const response = await fetch(this.url, { headers: { Accept: "application/json" } });
      if (response.status === 404) {
        return null;
      }
      if (!response.ok) {
        throw new Error(`Load failed with ${response.status}.`);
      }

      const parsed = await response.json();
      return hasFridgeShape(parsed) ? parsed : null;
    }

    async saveOps({ baseRevision = null, opId, clientId = "", ops = [] }) {
      const response = await fetch(this.url, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...this.writeHeaders(),
        },
        body: JSON.stringify({ baseRevision, opId, clientId, ops }),
      });

      const parsed = await parseJsonResponse(response);
      if (!response.ok) {
        throw jsonResponseError(response, parsed, `Patch failed with ${response.status}.`);
      }
      return parsed;
    }

    async loadChanges(sinceRevision) {
      const response = await fetch(`${this.url}/changes?since=${encodeURIComponent(sinceRevision || 0)}`, {
        headers: { Accept: "application/json" },
      });
      const parsed = await parseJsonResponse(response);
      if (!response.ok) {
        throw jsonResponseError(response, parsed, `Change sync failed with ${response.status}.`);
      }
      return parsed;
    }

    async save(state) {
      const extras = { id: this.boardId };
      if (Number.isSafeInteger(state && state.baseRevision)) {
        extras.baseRevision = state.baseRevision;
      }
      if (state && state.forceOverwrite === true) {
        extras.forceOverwrite = true;
      }
      const payload = normalizeState(state, extras);
      const response = await fetch(this.url, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...this.writeHeaders(),
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const parsed = await parseJsonResponse(response);
        throw jsonResponseError(response, parsed, `Save failed with ${response.status}.`);
      }

      const parsed = await response.json();
      return hasFridgeShape(parsed) ? parsed : null;
    }

    async clear() {
      const response = await fetch(this.url, { method: "DELETE", headers: this.writeHeaders() });
      if (!response.ok && response.status !== 404) {
        throw new Error(`Delete failed with ${response.status}.`);
      }
    }

    writeHeaders() {
      return this.editToken ? { "X-Fridge-Edit-Token": this.editToken } : {};
    }

    async uploadImage(file) {
      if (!file) {
        throw new Error("No image selected.");
      }

      const separator = this.uploadEndpoint.includes("?") ? "&" : "?";
      const uploadUrl = `${this.uploadEndpoint}${separator}boardId=${encodeURIComponent(this.boardId)}`;
      const response = await fetch(uploadUrl, {
        method: "POST",
        headers: {
          "Content-Type": file.type || "application/octet-stream",
          Accept: "application/json",
          ...this.writeHeaders(),
        },
        body: file,
      });
      const parsed = await parseJsonResponse(response);
      if (!response.ok) {
        throw jsonResponseError(response, parsed, `Upload failed with ${response.status}.`);
      }
      if (!parsed || typeof parsed.src !== "string") {
        throw new Error("Upload response did not include an image URL.");
      }
      return parsed;
    }
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      if (!file) {
        reject(new Error("No image selected."));
        return;
      }

      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Could not read that image."));
      reader.readAsDataURL(file);
    });
  }

  function createDebouncedSave(saveState, delay = 350, onError = null, onSaved = null) {
    let timer = null;
    let latestArgs = [];
    return function scheduleSave(...args) {
      latestArgs = args;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const saveArgs = latestArgs;
        Promise.resolve(saveState(...saveArgs))
          .then((savedState) => {
            if (onSaved) {
              onSaved(savedState);
            }
          })
          .catch((error) => {
            if (onError) {
              onError(error, ...saveArgs);
            }
          });
      }, delay);
    };
  }

  function exportFile(state) {
    const payload = JSON.stringify(normalizeState(state), null, 2);
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "open-fridge.fridge";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  function importFile(file) {
    return new Promise((resolve, reject) => {
      if (!file) {
        reject(new Error("No file selected."));
        return;
      }
      if (file.size > MAX_IMPORT_BYTES) {
        reject(new Error("Fridge files must be 4 MB or smaller."));
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(String(reader.result || ""));
          if (!hasFridgeShape(parsed)) {
            throw new Error("This does not look like a fridge file.");
          }
          resolve(parsed);
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = () => reject(new Error("Could not read the fridge file."));
      reader.readAsText(file);
    });
  }

  window.FridgeStorage = {
    BoardPersistence,
    LocalPersistence,
    MAX_IMPORT_BYTES,
    RemotePersistence: BoardPersistence,
    STORAGE_KEY,
    VERSION,
    createDebouncedSave,
    exportFile,
    importFile,
    normalizeState,
    readFileAsDataUrl,
  };
})();
