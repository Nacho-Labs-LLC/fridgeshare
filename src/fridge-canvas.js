const MAX_PHOTO_FILE_BYTES = 1 * 1024 * 1024;
const { FRIDGE_SURFACE_THEMES, fridgeSurfaceThemeById } = window.FridgeThemes;

class FridgeCanvas {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.persistence = options.persistence || new window.FridgeStorage.LocalPersistence();
    this.mode = options.mode || this.persistence.kind || "local";
    this.fridgeId = options.fridgeId || "";
    this.editToken = options.editToken || "";
    this.canEdit = this.mode !== "remote" || Boolean(this.editToken);
    this.items = [];
    this.world = { width: 0, height: 0 };
    this.camera = { x: 0, y: 0, scale: 1 };
    this.activeItem = null;
    this.activePan = null;
    this.pointerOffset = { x: 0, y: 0 };
    this.lastPointer = null;
    this.pointerVelocity = { x: 0, y: 0 };
    this.audioContext = null;
    this.toastTimer = null;
    this.currentMagnetStyle = "classic";
    this.currentMagnetSize = "classic";
    this.currentPaperStyle = "yellow-sticky";
    this.currentNoteSize = "standard";
    this.currentPhotoStyle = "polaroid";
    this.currentPhotoSize = "standard";
    this.currentSurfaceTheme = "classic-white";
    this.currentTrayStyle = "classic";
    this.hoveredItem = null;
    this.editingNote = null;
    this.editOverlay = null;
    this.lastSeenRevision = null;
    this.hasPendingLocalSave = false;
    this.hasUnsavedLocalChanges = false;
    this.deferredRemoteState = null;
    this.syncTimer = null;
    this.syncStatusTimer = null;
    this.isApplyingRemoteState = false;
    this.isPollingRemote = false;
    this.localSaveVersion = 0;
    this.clientId = this.getOrCreateClientId();
    this.patchSequence = 0;
    this.pendingPatchOps = [];
    this.patchFlushTimer = null;
    this.isPatchFlushInFlight = false;

    // Draw mode state (dry-erase board)
    this.drawingBoard = null;
    this.activeStroke = null;
    this.drawPointerId = null;
    this.currentMarkerColor = "#1f2522";
    this.drawToolbar = null;

    this.handleResize = this.handleResize.bind(this);
    this.handlePointerDown = this.handlePointerDown.bind(this);
    this.handlePointerMove = this.handlePointerMove.bind(this);
    this.handlePointerUp = this.handlePointerUp.bind(this);
    this.handlePointerLeave = this.handlePointerLeave.bind(this);
    this.handleWheel = this.handleWheel.bind(this);
    this.handleDrop = this.handleDrop.bind(this);
    this.handleDragOver = this.handleDragOver.bind(this);
    this.handleDoubleClick = this.handleDoubleClick.bind(this);
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.render = this.render.bind(this);
    const debouncedSave = window.FridgeStorage.createDebouncedSave(
      (saveVersion) => this.saveCurrentState(saveVersion),
      this.mode === "remote" ? 650 : 250,
      (error, saveVersion) => this.handleSaveError(error, saveVersion),
      (saveResult) => this.handleSaveSuccess(saveResult)
    );
    this.scheduleSave = () => {
      if (!this.canEdit) {
        return;
      }
      if (this.isApplyingRemoteState) {
        return;
      }
      this.localSaveVersion += 1;
      this.hasUnsavedLocalChanges = true;
      this.hasPendingLocalSave = true;
      if (this.isRemoteMode()) {
        this.updateModePill("Saving");
      }
      debouncedSave(this.localSaveVersion);
    };

    this.handleResize();
    this.addEvents();
    this.setupControls();
    this.loadOrSeed();
    requestAnimationFrame(this.render);
  }

  async loadOrSeed() {
    this.updateModePill("Loading");
    try {
      const saved = await this.persistence.load();
      if (saved) {
        this.updateLastSeenRevision(saved);
        this.loadState(saved);
        this.updateModePill(this.canEdit ? "Saved" : "View only");
        this.startRemoteSync();
        return;
      }
    } catch {
      this.showToast("Saved fridge could not be loaded.");
    }

    if (this.canEdit) {
      this.createStarterKit();
      this.scheduleSave();
      this.updateModePill("New");
    } else {
      this.items = [];
      this.updateModePill("View only");
    }
    this.startRemoteSync();
  }

  isRemoteMode() {
    return this.mode === "remote" && this.persistence && this.persistence.kind === "remote";
  }

  getOrCreateClientId() {
    const key = "open-fridge:client-id";
    try {
      const existing = sessionStorage.getItem(key);
      if (existing) {
        return existing;
      }
      const next = `client-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
      sessionStorage.setItem(key, next);
      return next;
    } catch {
      return `client-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
    }
  }

  recordLocalOp(op) {
    if (!this.canEdit || this.isApplyingRemoteState) {
      return;
    }
    if (!this.isRemoteMode() || typeof this.persistence.saveOps !== "function") {
      this.scheduleSave();
      return;
    }
    this.pendingPatchOps.push(op);
    this.hasUnsavedLocalChanges = true;
    this.hasPendingLocalSave = true;
    this.updateModePill("Saving");
    window.clearTimeout(this.patchFlushTimer);
    this.patchFlushTimer = window.setTimeout(() => this.flushPatchOps(), 220);
  }

  async flushPatchOps() {
    if (!this.isRemoteMode() || this.isPatchFlushInFlight || this.pendingPatchOps.length === 0) {
      return;
    }

    this.isPatchFlushInFlight = true;
    const ops = this.pendingPatchOps.splice(0);
    const opId = `${this.clientId}:${++this.patchSequence}`;
    try {
      const savedState = await this.persistence.saveOps({
        baseRevision: this.lastSeenRevision,
        clientId: this.clientId,
        opId,
        ops,
      });
      this.updateLastSeenRevision(savedState);
      if (this.pendingPatchOps.length > 0) {
        this.isPatchFlushInFlight = false;
        this.flushPatchOps();
        return;
      }
      this.hasUnsavedLocalChanges = false;
      this.hasPendingLocalSave = false;
      this.updateModePill(this.canEdit ? "Saved" : "View only");
      this.tryApplyDeferredRemoteState();
    } catch (error) {
      this.pendingPatchOps = [...ops, ...this.pendingPatchOps];
      this.handleSaveError(error, this.localSaveVersion);
    } finally {
      this.isPatchFlushInFlight = false;
    }
  }

  async saveCurrentState(saveVersion) {
    const state = this.getState();
    if (this.isRemoteMode()) {
      state.baseRevision = this.lastSeenRevision;
    }
    const savedState = await this.persistence.save(state);
    return { savedState, saveVersion };
  }

  handleSaveSuccess(saveResult) {
    const savedState = saveResult && saveResult.savedState;
    const saveVersion = saveResult && saveResult.saveVersion;

    if (this.isRemoteMode()) {
      this.updateLastSeenRevision(savedState);
    }

    if (saveVersion !== this.localSaveVersion) {
      this.tryApplyDeferredRemoteState();
      return;
    }

    this.hasUnsavedLocalChanges = false;
    this.hasPendingLocalSave = false;
    this.updateModePill(this.canEdit ? "Saved" : "View only");
    this.tryApplyDeferredRemoteState();
  }

  handleSaveError(error, saveVersion) {
    if (saveVersion !== this.localSaveVersion) {
      return;
    }

    if (this.isRemoteMode() && error && error.status === 409) {
      this.resolveRemoteSaveConflict(saveVersion);
      return;
    }

    this.hasUnsavedLocalChanges = true;
    this.hasPendingLocalSave = true;
    if (this.isRemoteMode()) {
      if (error && error.status === 403) {
        this.updateModePill("View only");
        this.showToast("Edit link is invalid or missing.");
      } else if (error && error.status === 429) {
        this.updateModePill("Saved locally");
        this.showToast("Too many saves. Try again in a minute.");
      } else {
        this.updateModePill("Offline");
        this.showToast("Connection lost. Your edits will stay here until saving works.");
      }
    } else {
      this.showToast("This fridge is too full for local storage.");
    }
  }

  async resolveRemoteSaveConflict(saveVersion) {
    this.updateModePill("Conflict");
    const sendLocal = window.confirm(
      "This board changed on the server before your edits saved.\n\nOK sends your current board and may overwrite server changes.\nCancel loads the server version and discards your unsaved edits."
    );

    if (saveVersion !== this.localSaveVersion) {
      return;
    }

    if (sendLocal) {
      this.updateModePill("Saving");
      try {
        const state = this.getState();
        state.baseRevision = this.lastSeenRevision;
        state.forceOverwrite = true;
        const savedState = await this.persistence.save(state);
        if (saveVersion !== this.localSaveVersion) {
          return;
        }
        this.updateLastSeenRevision(savedState);
        this.hasUnsavedLocalChanges = false;
        this.hasPendingLocalSave = false;
        this.updateModePill("Saved");
        this.showToast("Your updates were sent.");
      } catch (saveError) {
        if (saveVersion !== this.localSaveVersion) {
          return;
        }
        this.hasUnsavedLocalChanges = true;
        this.hasPendingLocalSave = true;
        this.updateModePill("Offline");
        this.showToast(saveError && saveError.status === 403 ? "Edit link is invalid or missing." : "Could not send your updates.");
      }
      return;
    }

    this.updateModePill("Syncing");
    try {
      const remoteState = await this.persistence.load();
      if (saveVersion !== this.localSaveVersion) {
        return;
      }

      this.hasUnsavedLocalChanges = false;
      this.hasPendingLocalSave = false;
      if (this.isNewerRemoteState(remoteState)) {
        this.applyRemoteState(remoteState);
        this.showToast("Loaded server version.");
      } else {
        this.updateModePill(this.canEdit ? "Saved" : "View only");
      }
    } catch (loadError) {
      if (saveVersion !== this.localSaveVersion) {
        return;
      }
      this.hasUnsavedLocalChanges = true;
      this.hasPendingLocalSave = true;
      this.updateModePill("Offline");
      this.showToast("Could not sync the latest shared fridge.");
    }
  }

  updateLastSeenRevision(state) {
    if (!state || !Number.isSafeInteger(state.revision)) {
      return;
    }
    this.lastSeenRevision = Math.max(this.lastSeenRevision || 0, state.revision);
  }

  startRemoteSync() {
    if (!this.isRemoteMode() || this.syncTimer) {
      return;
    }

    this.syncTimer = window.setInterval(() => this.pollRemoteState(), 4000);
  }

  async pollRemoteState() {
    if (!this.isRemoteMode() || this.isPollingRemote) {
      return;
    }

    this.isPollingRemote = true;
    try {
      if (typeof this.persistence.loadChanges === "function" && this.lastSeenRevision !== null) {
        const result = await this.persistence.loadChanges(this.lastSeenRevision);
        if (result.needsSnapshot && result.state) {
          this.receiveRemoteState(result.state);
        } else if (Array.isArray(result.changes) && result.changes.length) {
          this.receiveRemoteChanges(result);
        } else if (!this.hasPendingLocalSave && !this.hasUnsavedLocalChanges && !this.deferredRemoteState) {
          this.updateModePill(this.canEdit ? "Saved" : "View only");
        }
        return;
      }
      const remoteState = await this.persistence.load();
      if (this.isNewerRemoteState(remoteState)) {
        this.receiveRemoteState(remoteState);
      } else if (!this.hasPendingLocalSave && !this.hasUnsavedLocalChanges && !this.deferredRemoteState) {
        this.updateModePill(this.canEdit ? "Saved" : "View only");
      }
    } catch {
      this.updateModePill("Offline");
    } finally {
      this.isPollingRemote = false;
    }
  }

  receiveRemoteChanges(result) {
    const remoteChanges = result.changes.filter((change) => change.clientId !== this.clientId);
    if (remoteChanges.length && !this.activeItem && !this.activeStroke && !this.editingNote) {
      this.isApplyingRemoteState = true;
      try {
        for (const change of remoteChanges) {
          this.applyRemoteOps(change.ops || []);
        }
        this.updateModePill("Synced", { settleToSaved: true });
        this.showToast("Updated from shared fridge.");
      } finally {
        this.isApplyingRemoteState = false;
      }
    }
    if (Number.isSafeInteger(result.revision)) {
      this.updateLastSeenRevision({ revision: result.revision });
    }
  }

  applyRemoteOps(ops) {
    for (const op of ops) {
      if (op.type === "board.setTheme") {
        this.setSurfaceTheme(op.theme, { skipSave: true });
      } else if (op.type === "item.add" && op.item) {
        const existing = this.items.findIndex((item) => item.id === op.item.id);
        const item = window.FridgeItems.itemFromJSON(op.item);
        if (!item) {
          continue;
        }
        if (existing >= 0) {
          this.items[existing] = item;
        } else {
          this.items.push(item);
        }
      } else if (op.type === "item.delete") {
        this.items = this.items.filter((item) => item.id !== op.id);
      } else if (op.type === "item.update") {
        const item = this.items.find((candidate) => candidate.id === op.id);
        if (item && op.patch) {
          Object.assign(item, op.patch);
          if (item.type === "polaroid" && Object.prototype.hasOwnProperty.call(op.patch, "src")) {
            item.image = new Image();
            item.imageLoaded = false;
            item.image.onload = () => {
              item.imageLoaded = true;
            };
            item.image.src = item.src;
          }
        }
      } else if (op.type === "item.bringToFront") {
        const item = this.items.find((candidate) => candidate.id === op.id);
        if (item) {
          this.bringToFront(item, { skipSave: true });
        }
      }
    }
  }

  isNewerRemoteState(state) {
    if (!state || !Number.isSafeInteger(state.revision)) {
      return false;
    }
    return this.lastSeenRevision === null || state.revision > this.lastSeenRevision;
  }

  receiveRemoteState(state) {
    if (!this.canApplyRemoteState()) {
      if (!this.deferredRemoteState || state.revision > this.deferredRemoteState.revision) {
        this.deferredRemoteState = state;
      }
      this.updateModePill("Update pending");
      return;
    }

    this.applyRemoteState(state);
  }

  canApplyRemoteState() {
    return (
      !this.activeItem &&
      !this.activePan &&
      !this.activeStroke &&
      !this.drawingBoard &&
      !this.editingNote &&
      !this.hasPendingLocalSave &&
      !this.hasUnsavedLocalChanges
    );
  }

  tryApplyDeferredRemoteState() {
    if (!this.deferredRemoteState || !this.canApplyRemoteState()) {
      return;
    }

    const remoteState = this.deferredRemoteState;
    this.deferredRemoteState = null;
    if (this.isNewerRemoteState(remoteState)) {
      this.applyRemoteState(remoteState);
    } else {
      this.updateModePill(this.canEdit ? "Saved" : "View only");
    }
  }

  applyRemoteState(state) {
    this.isApplyingRemoteState = true;
    try {
      this.loadState(state);
      this.updateLastSeenRevision(state);
      this.updateModePill("Synced", { settleToSaved: true });
      this.showToast("Updated from shared fridge.");
    } finally {
      this.isApplyingRemoteState = false;
    }
  }

  finishInteraction() {
    this.tryApplyDeferredRemoteState();
  }

  createStarterKit() {
    const { AlphabetMagnet, StickyNote, magnetPalettes } = window.FridgeItems;
    const center = this.getVisibleWorldCenter();
    this.items = [
      new AlphabetMagnet({
        x: center.x - 120,
        y: center.y - 70,
        width: 78,
        height: 82,
        label: "A",
        rotation: -0.09,
        palette: magnetPalettes[0],
      }),
      new StickyNote({
        x: center.x + 95,
        y: center.y - 45,
        width: 170,
        height: 170,
        rotation: 0.045,
        text: "fresh start\nadd photos\nmake it yours",
      }),
    ];
  }

  addEvents() {
    window.addEventListener("resize", this.handleResize);
    window.addEventListener("keydown", this.handleKeyDown);
    this.canvas.addEventListener("pointerdown", this.handlePointerDown);
    this.canvas.addEventListener("pointermove", this.handlePointerMove);
    this.canvas.addEventListener("pointerup", this.handlePointerUp);
    this.canvas.addEventListener("pointercancel", this.handlePointerUp);
    this.canvas.addEventListener("pointerleave", this.handlePointerLeave);
    this.canvas.addEventListener("wheel", this.handleWheel, { passive: false });
    this.canvas.addEventListener("dragover", this.handleDragOver);
    this.canvas.addEventListener("drop", this.handleDrop);
    this.canvas.addEventListener("dblclick", this.handleDoubleClick);
  }

  setupControls() {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
    const tray = document.querySelector("#alphabet-buttons");
    const { magnetPalettes, MAGNET_STYLES, MAGNET_SIZE_PRESETS, NOTE_SIZE_PRESETS, PAPER_STYLES, PHOTO_SIZE_PRESETS } = window.FridgeItems;

    const themeSelector = document.querySelector("#surface-theme-selector");
    if (themeSelector) {
      for (const theme of FRIDGE_SURFACE_THEMES) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = theme.label;
        btn.dataset.theme = theme.id;
        btn.style.setProperty("--surface-color", theme.swatch);
        btn.setAttribute("aria-pressed", theme.id === this.currentSurfaceTheme ? "true" : "false");
        btn.classList.toggle("is-active", theme.id === this.currentSurfaceTheme);
        btn.addEventListener("click", () => this.setSurfaceTheme(theme.id));
        themeSelector.appendChild(btn);
      }
    }

    // Style selector
    const styleSelector = document.querySelector("#magnet-style-selector");
    for (const style of MAGNET_STYLES) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = style.label;
      btn.dataset.style = style.id;
      btn.setAttribute("aria-pressed", style.id === "classic" ? "true" : "false");
      btn.classList.toggle("is-active", style.id === "classic");
      btn.addEventListener("click", () => {
        this.currentMagnetStyle = style.id;
        for (const b of styleSelector.querySelectorAll("button")) {
          const active = b.dataset.style === style.id;
          b.classList.toggle("is-active", active);
          b.setAttribute("aria-pressed", active ? "true" : "false");
        }
      });
      styleSelector.appendChild(btn);
    }

    const magnetSizeSelector = document.querySelector("#magnet-size-selector");
    if (magnetSizeSelector) {
      for (const preset of MAGNET_SIZE_PRESETS) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = preset.label;
        btn.dataset.size = preset.id;
        btn.setAttribute("aria-pressed", preset.id === this.currentMagnetSize ? "true" : "false");
        btn.classList.toggle("is-active", preset.id === this.currentMagnetSize);
        btn.addEventListener("click", () => {
          this.currentMagnetSize = preset.id;
          for (const b of magnetSizeSelector.querySelectorAll("button")) {
            const active = b.dataset.size === preset.id;
            b.classList.toggle("is-active", active);
            b.setAttribute("aria-pressed", active ? "true" : "false");
          }
        });
        magnetSizeSelector.appendChild(btn);
      }
    }

    for (const [index, letter] of alphabet.entries()) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = letter;
      button.title = `Add ${letter} magnet`;
      button.setAttribute("aria-label", `Add ${letter} magnet`);
      button.style.setProperty("--magnet-color", magnetPalettes[index % magnetPalettes.length].base);
      button.addEventListener("click", () => this.addAlphabetMagnet(letter));
      tray.appendChild(button);
    }

    const paperSelector = document.querySelector("#paper-style-selector");
    if (paperSelector) {
      for (const style of PAPER_STYLES) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = style.label;
        btn.dataset.style = style.id;
        btn.style.setProperty("--paper-color", style.swatch);
        btn.setAttribute("aria-pressed", style.id === this.currentPaperStyle ? "true" : "false");
        btn.classList.toggle("is-active", style.id === this.currentPaperStyle);
        btn.addEventListener("click", () => {
          this.currentPaperStyle = style.id;
          for (const b of paperSelector.querySelectorAll("button")) {
            const active = b.dataset.style === style.id;
            b.classList.toggle("is-active", active);
            b.setAttribute("aria-pressed", active ? "true" : "false");
          }
        });
        paperSelector.appendChild(btn);
      }
    }

    const { PHOTO_STYLES } = window.FridgeItems;
    const photoSelector = document.querySelector("#photo-style-selector");
    if (photoSelector) {
      for (const style of PHOTO_STYLES) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = style.label;
        btn.dataset.style = style.id;
        btn.style.setProperty("--photo-color", style.swatch);
        btn.setAttribute("aria-pressed", style.id === this.currentPhotoStyle ? "true" : "false");
        btn.classList.toggle("is-active", style.id === this.currentPhotoStyle);
        btn.addEventListener("click", () => {
          this.currentPhotoStyle = style.id;
          for (const b of photoSelector.querySelectorAll("button")) {
            const active = b.dataset.style === style.id;
            b.classList.toggle("is-active", active);
            b.setAttribute("aria-pressed", active ? "true" : "false");
          }
        });
        photoSelector.appendChild(btn);
      }
    }

    const noteSizeSelector = document.querySelector("#note-size-selector");
    if (noteSizeSelector) {
      for (const preset of NOTE_SIZE_PRESETS) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = preset.label;
        btn.dataset.size = preset.id;
        btn.setAttribute("aria-pressed", preset.id === this.currentNoteSize ? "true" : "false");
        btn.classList.toggle("is-active", preset.id === this.currentNoteSize);
        btn.addEventListener("click", () => {
          this.currentNoteSize = preset.id;
          for (const b of noteSizeSelector.querySelectorAll("button")) {
            const active = b.dataset.size === preset.id;
            b.classList.toggle("is-active", active);
            b.setAttribute("aria-pressed", active ? "true" : "false");
          }
        });
        noteSizeSelector.appendChild(btn);
      }
    }

    document.querySelector("#add-note-button").addEventListener("click", () => this.addStickyNote());

    const addBoardBtn = document.querySelector("#add-board-button");
    if (addBoardBtn) {
      addBoardBtn.addEventListener("click", () => this.addDryEraseBoard());
    }

    const photoSizeSelector = document.querySelector("#photo-size-selector");
    if (photoSizeSelector) {
      for (const preset of PHOTO_SIZE_PRESETS) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = preset.label;
        btn.dataset.size = preset.id;
        btn.setAttribute("aria-pressed", preset.id === this.currentPhotoSize ? "true" : "false");
        btn.classList.toggle("is-active", preset.id === this.currentPhotoSize);
        btn.addEventListener("click", () => {
          this.currentPhotoSize = preset.id;
          for (const b of photoSizeSelector.querySelectorAll("button")) {
            const active = b.dataset.size === preset.id;
            b.classList.toggle("is-active", active);
            b.setAttribute("aria-pressed", active ? "true" : "false");
          }
        });
        photoSizeSelector.appendChild(btn);
      }
    }

    document.querySelector("#export-button").addEventListener("click", () => {
      window.FridgeStorage.exportFile(this.getState());
      this.showToast("Exported open-fridge.fridge.");
    });
    document.querySelector("#reset-button").addEventListener("click", () => this.reset());
    this.setupShareControls();

    const importInput = document.querySelector("#import-file");
    document.querySelector("#import-button").addEventListener("click", () => importInput.click());
    importInput.addEventListener("change", async () => {
      try {
        const state = await window.FridgeStorage.importFile(importInput.files[0]);
        this.loadState(state);
        this.scheduleSave();
        this.showToast("Fridge imported.");
      } catch (error) {
        this.showToast(error.message || "Import failed.");
      } finally {
        importInput.value = "";
      }
    });

    const photoInput = document.querySelector("#photo-file");
    document.querySelector("#add-photo-button").addEventListener("click", () => photoInput.click());
    photoInput.addEventListener("change", async () => {
      const file = photoInput.files[0];
      if (!file) {
        return;
      }
      try {
        if (!this.canUsePhotoFile(file)) {
          return;
        }
        const point = this.viewportToWorld({ x: this.width / 2, y: this.height / 3 });
        const src = await this.createPhotoSource(file);
        this.addPolaroid(src, point);
        this.showToast("Polaroid added.");
      } catch (error) {
        this.showToast(error.message || "Photo upload failed.");
      } finally {
        photoInput.value = "";
      }
    });

    const kitTray = document.querySelector("#kit-tray");
    const tabs = kitTray.querySelectorAll(".kit-tray__tab");
    const panels = kitTray.querySelectorAll(".kit-tray__panel");

    for (const tab of tabs) {
      tab.addEventListener("click", () => {
        const targetPanel = tab.dataset.tab;
        for (const t of tabs) {
          t.classList.toggle("is-active", t === tab);
          t.setAttribute("aria-selected", t === tab ? "true" : "false");
        }
        for (const panel of panels) {
          panel.classList.toggle("is-hidden", panel.dataset.panel !== targetPanel);
        }
        if (kitTray.classList.contains("is-collapsed")) {
          kitTray.classList.remove("is-collapsed");
          const toggle = document.querySelector("#tray-toggle");
          toggle.textContent = "^";
          toggle.setAttribute("aria-expanded", "true");
          toggle.title = "Collapse tray";
          toggle.setAttribute("aria-label", "Collapse tray");
        }
      });
    }

    const trayToggle = document.querySelector("#tray-toggle");
    trayToggle.addEventListener("click", () => {
      const isCollapsed = kitTray.classList.toggle("is-collapsed");
      trayToggle.textContent = isCollapsed ? "v" : "^";
      trayToggle.setAttribute("aria-expanded", isCollapsed ? "false" : "true");
      trayToggle.title = isCollapsed ? "Expand tray" : "Collapse tray";
      trayToggle.setAttribute("aria-label", isCollapsed ? "Expand tray" : "Collapse tray");
    });

    this.initTrayStyle();
    this.setupEmojiPanel();
    this.applyAccessMode();
  }

  setupShareControls() {
    const shareButton = document.querySelector("#share-button");
    const popover = document.querySelector("#share-popover");
    const closeButton = document.querySelector("#share-close-button");
    const shareLink = document.querySelector("#share-link");
    const copyButton = document.querySelector("#copy-share-link-button");
    const accessInputs = Array.from(document.querySelectorAll('input[name="share-access"]'));
    const editInput = accessInputs.find((input) => input.value === "edit");

    if (!shareButton || !popover || !closeButton || !shareLink || !copyButton || accessInputs.length === 0) {
      return;
    }

    if (!this.isRemoteMode()) {
      shareButton.hidden = true;
      return;
    }

    if (editInput) {
      editInput.disabled = !this.editToken;
      const label = editInput.closest("label");
      if (label) {
        label.classList.toggle("is-disabled", !this.editToken);
      }
    }

    const updateLink = () => {
      const selected = accessInputs.find((input) => input.checked);
      shareLink.value = selected && selected.value === "edit" && this.editToken
        ? this.currentEditUrl()
        : this.currentViewUrl();
    };

    shareButton.addEventListener("click", () => {
      popover.hidden = false;
      updateLink();
      shareLink.focus();
      shareLink.select();
    });
    closeButton.addEventListener("click", () => {
      popover.hidden = true;
    });
    for (const input of accessInputs) {
      input.addEventListener("change", updateLink);
    }
    copyButton.addEventListener("click", async () => {
      try {
        updateLink();
        await this.copyText(shareLink.value);
        this.showToast("Copied share link.");
      } catch {
        this.showToast("Could not copy share link.");
      }
    });
  }

  currentViewUrl() {
    const url = new URL(window.location.href);
    url.hash = "";
    return url.href;
  }

  currentEditUrl() {
    const url = new URL(window.location.href);
    url.hash = this.editToken;
    return url.href;
  }

  async copyText(value) {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(value);
      return;
    }

    const input = document.createElement("textarea");
    input.value = value;
    input.setAttribute("readonly", "");
    input.style.position = "fixed";
    input.style.left = "-9999px";
    document.body.appendChild(input);
    input.select();
    document.execCommand("copy");
    input.remove();
  }

  applyAccessMode() {
    if (this.canEdit) {
      return;
    }

    this.updateModePill("View only");
    for (const selector of [
      "#export-button",
      "#import-button",
      "#reset-button",
      "#add-note-button",
      "#add-photo-button",
      "#add-board-button",
    ]) {
      const el = document.querySelector(selector);
      if (el) {
        el.hidden = true;
      }
    }
  }

  setupEmojiPanel() {
    const categoryBar = document.querySelector("#emoji-category-bar");
    const emojiGrid = document.querySelector("#emoji-grid");
    let loaded = false;

    const showGroup = (group, activeCategoryBtn) => {
      emojiGrid.innerHTML = "";
      for (const emoji of group.emojis) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = emoji;
        btn.title = emoji;
        btn.setAttribute("aria-label", emoji);
        btn.addEventListener("click", () => this.addEmojiSticker(emoji));
        emojiGrid.appendChild(btn);
      }
      for (const b of categoryBar.querySelectorAll("button")) {
        b.classList.toggle("is-active", b === activeCategoryBtn);
      }
    };

    const loadEmojis = async () => {
      if (loaded) return;
      loaded = true;
      emojiGrid.textContent = "Loading...";
      try {
        const groups = await window.EmojiData.load();
        categoryBar.innerHTML = "";
        for (const group of groups) {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.textContent = group.icon;
          btn.title = group.name;
          btn.setAttribute("aria-label", group.name);
          btn.addEventListener("click", () => showGroup(group, btn));
          categoryBar.appendChild(btn);
        }
        if (groups.length) showGroup(groups[0], categoryBar.querySelector("button"));
      } catch {
        emojiGrid.textContent = "Could not load emoji data.";
      }
    };

    // Lazy-load when the emoji tab is first activated.
    const emojiTab = document.querySelector('[data-tab="emoji"]');
    if (emojiTab) emojiTab.addEventListener("click", loadEmojis, { once: true });
  }

  handleResize() {
    const rect = this.canvas.getBoundingClientRect();
    this.width = rect.width;
    this.height = rect.height;
    const oldWorld = { ...this.world };
    const pixelRatio = window.devicePixelRatio || 1;
    this.canvas.width = Math.floor(rect.width * pixelRatio);
    this.canvas.height = Math.floor(rect.height * pixelRatio);
    this.ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    this.refreshWorld(oldWorld);
    this.clampCamera();
    this.repositionEditOverlay();
    this.repositionDrawToolbar();
  }

  handlePointerDown(event) {
    const viewportPoint = this.getViewportPointer(event);
    const worldPoint = this.viewportToWorld(viewportPoint);
    const item = this.getTopItemAt(worldPoint);

    this.unlockAudio();

    if (!this.canEdit) {
      if (!item) {
        this.canvas.setPointerCapture(event.pointerId);
        this.canvas.classList.add("is-dragging");
        this.activePan = {
          pointerId: event.pointerId,
          startPointer: viewportPoint,
          startCamera: { ...this.camera },
        };
      }
      return;
    }

    // Draw mode: intercept pointer on active board
    if (this.drawingBoard) {
      if (this.drawingBoard.contains(worldPoint)) {
        this.drawPointerId = event.pointerId;
        this.canvas.setPointerCapture(event.pointerId);
        const localPt = this._worldToBoardLocal(worldPoint, this.drawingBoard);
        this.activeStroke = { color: this.currentMarkerColor, size: 4, points: [localPt] };
        this.drawingBoard._liveStroke = this.activeStroke;
        return;
      }
      // Pointer outside the board exits draw mode and falls through to normal handling.
      this.exitBoardDrawMode();
    }

    // Delete button on any item removes it immediately without starting a drag.
    if (item && item.deleteContains(worldPoint)) {
      if (item === this.editingNote) this.exitNoteEditMode();
      if (item === this.drawingBoard) this.exitBoardDrawMode();
      this.items = this.items.filter((i) => i !== item);
      if (this.hoveredItem === item) this.hoveredItem = null;
      this.playClack();
      this.recordLocalOp({ type: "item.delete", id: item.id });
      return;
    }

    // Any canvas tap while a note is being edited exits edit mode (no drag).
    if (this.editingNote) {
      this.exitNoteEditMode();
      return;
    }

    // Pencil icon on a sticky note toggles inline edit mode without starting a drag.
    if (item && item.type === "note" && item.pencilContains(worldPoint)) {
      this.enterNoteEditMode(item);
      return;
    }

    // Normal drag / pan from here.
    this.canvas.setPointerCapture(event.pointerId);
    this.canvas.classList.add("is-dragging");

    if (!item) {
      this.activePan = {
        pointerId: event.pointerId,
        startPointer: viewportPoint,
        startCamera: { ...this.camera },
      };
      return;
    }

    this.activeItem = item;
    item.isDragging = true;
    item.vx = 0;
    item.vy = 0;
    item.angularVelocity = 0;
    item.scale = 1.045;

    this.pointerOffset.x = item.x - worldPoint.x;
    this.pointerOffset.y = item.y - worldPoint.y;
    this.lastPointer = { ...worldPoint, time: performance.now() };
    this.pointerVelocity = { x: 0, y: 0 };
    this.bringToFront(item);
    this.recordLocalOp({ type: "item.bringToFront", id: item.id });
  }

  handlePointerMove(event) {
    // Draw mode: extend current stroke
    if (this.drawingBoard && this.activeStroke && event.pointerId === this.drawPointerId) {
      const worldPoint = this.viewportToWorld(this.getViewportPointer(event));
      const localPt = this._worldToBoardLocal(worldPoint, this.drawingBoard);
      this.activeStroke.points.push(localPt);
      return;
    }

    if (this.activePan && this.activePan.pointerId === event.pointerId) {
      const point = this.getViewportPointer(event);
      this.camera.x = this.activePan.startCamera.x - (point.x - this.activePan.startPointer.x) / this.camera.scale;
      this.camera.y = this.activePan.startCamera.y - (point.y - this.activePan.startPointer.y) / this.camera.scale;
      this.clampCamera();
      this.repositionDrawToolbar();
      return;
    }

    // Hover tracking drives edit affordance visibility and cursor shape.
    // Skipped in draw mode to preserve the crosshair cursor.
    if (!this.activeItem && !this.editingNote && !this.drawingBoard) {
      const worldPoint = this.viewportToWorld(this.getViewportPointer(event));
      const hovered = this.getTopItemAt(worldPoint);

      if (this.hoveredItem !== hovered) {
        if (this.hoveredItem) this.hoveredItem.isHovered = false;
        this.hoveredItem = hovered;
        if (this.hoveredItem) this.hoveredItem.isHovered = true;
      }

      if (hovered && hovered.deleteContains(worldPoint)) {
        this.canvas.style.cursor = "pointer";
      } else if (hovered && hovered.type === "note" && hovered.pencilContains(worldPoint)) {
        this.canvas.style.cursor = "pointer";
      } else if (hovered && hovered.type === "polaroid") {
        this.canvas.style.cursor = "pointer";
      } else {
        this.canvas.style.cursor = "";
      }

      // Caption tooltip for frame styles that don't render captions inline.
      const tooltipStyles = ["sticker-cutout", "tape-corners", "magnetic-frame"];
      if (
        hovered &&
        hovered.type === "polaroid" &&
        hovered.caption &&
        tooltipStyles.includes(hovered.frameStyle)
      ) {
        this._showCaptionTooltip(hovered.caption, event.clientX, event.clientY);
      } else {
        this._hideCaptionTooltip();
      }
    }

    if (!this.activeItem) {
      return;
    }

    const point = this.viewportToWorld(this.getViewportPointer(event));
    const now = performance.now();
    const elapsed = Math.max(16, now - this.lastPointer.time);

    this.pointerVelocity = {
      x: ((point.x - this.lastPointer.x) / elapsed) * 16.67,
      y: ((point.y - this.lastPointer.y) / elapsed) * 16.67,
    };

    this.activeItem.x = point.x + this.pointerOffset.x;
    this.activeItem.y = point.y + this.pointerOffset.y;
    this.activeItem.rotation += this.pointerVelocity.x * 0.0008;
    this.lastPointer = { ...point, time: now };
  }

  handlePointerUp(event) {
    // Draw mode: finalize current stroke
    if (this.drawingBoard && this.activeStroke && event.pointerId === this.drawPointerId) {
      this.drawingBoard.strokes.push(this.activeStroke);
      this.drawingBoard._liveStroke = null;
      this.activeStroke = null;
      this.drawPointerId = null;
      this.recordLocalOp({ type: "item.update", id: this.drawingBoard.id, patch: { strokes: this.drawingBoard.strokes } });
      if (this.canvas.hasPointerCapture(event.pointerId)) {
        this.canvas.releasePointerCapture(event.pointerId);
      }
      this.finishInteraction();
      return;
    }

    if (this.activePan && this.activePan.pointerId === event.pointerId) {
      if (this.canvas.hasPointerCapture(event.pointerId)) {
        this.canvas.releasePointerCapture(event.pointerId);
      }
      this.canvas.classList.remove("is-dragging");
      this.activePan = null;
      this.finishInteraction();
      return;
    }

    if (!this.activeItem) {
      return;
    }

    if (this.canvas.hasPointerCapture(event.pointerId)) {
      this.canvas.releasePointerCapture(event.pointerId);
    }
    this.canvas.classList.remove("is-dragging");

    this.activeItem.isDragging = false;
    this.activeItem.drop(this.pointerVelocity);
    const movedItem = this.activeItem;
    this.playClack();
    this.activeItem = null;
    this.lastPointer = null;
    this.recordLocalOp({
      type: "item.update",
      id: movedItem.id,
      patch: {
        x: Math.round(movedItem.x),
        y: Math.round(movedItem.y),
        rotation: Number(movedItem.rotation.toFixed(4)),
      },
    });
    this.finishInteraction();
  }

  handleDragOver(event) {
    event.preventDefault();
  }

  handleWheel(event) {
    event.preventDefault();
    this.camera.x += event.deltaX / this.camera.scale;
    this.camera.y += event.deltaY / this.camera.scale;
    this.clampCamera();
    this.repositionDrawToolbar();
  }

  async handleDrop(event) {
    event.preventDefault();
    if (!this.canEdit) {
      return;
    }
    const file = Array.from(event.dataTransfer.files).find((candidate) => candidate.type.startsWith("image/"));
    if (!file) {
      this.showToast("Drop a local image to make a Polaroid.");
      return;
    }
    if (!this.canUsePhotoFile(file)) {
      return;
    }

    const point = this.viewportToWorld(this.getViewportPointer(event));
    try {
      const src = await this.createPhotoSource(file);
      this.addPolaroid(src, point);
      this.showToast("Polaroid added.");
    } catch (error) {
      this.showToast(error.message || "Photo upload failed.");
    }
  }

  canUsePhotoFile(file) {
    if (!file.type || !/^image\/(png|jpeg|jpg|gif|webp)$/i.test(file.type)) {
      this.showToast("Use a PNG, JPEG, GIF, or WebP image.");
      return false;
    }
    if (file.size > MAX_PHOTO_FILE_BYTES) {
      this.showToast("Images must be 1 MB or smaller.");
      return false;
    }
    return true;
  }

  async createPhotoSource(file) {
    if (this.persistence && typeof this.persistence.uploadImage === "function") {
      this.showToast("Uploading photo...");
      const uploaded = await this.persistence.uploadImage(file);
      return uploaded.src;
    }
    return window.FridgeStorage.readFileAsDataUrl(file);
  }

  handleDoubleClick(event) {
    if (!this.canEdit) {
      return;
    }
    const viewportPoint = this.getViewportPointer(event);
    const worldPoint = this.viewportToWorld(viewportPoint);
    const item = this.getTopItemAt(worldPoint);
    if (item && item.type === "dryEraseBoard") {
      this.enterBoardDrawMode(item);
    } else if (item && item.type === "polaroid") {
      this.editPolaroidCaption(item);
    }
  }

  editPolaroidCaption(item) {
    const current = item.caption || "";
    const result = window.prompt("Caption:", current);
    if (result === null) return;
    item.caption = result.trim().slice(0, 60);
    this.recordLocalOp({ type: "item.update", id: item.id, patch: { caption: item.caption } });
  }

  handleKeyDown(event) {
    if (!this.canEdit) {
      return;
    }
    if (event.key === "Escape" && this.drawingBoard) {
      this.exitBoardDrawMode();
    }
  }

  handlePointerLeave() {
    if (this.hoveredItem) {
      this.hoveredItem.isHovered = false;
      this.hoveredItem = null;
    }
    this._hideCaptionTooltip();
    // Preserve crosshair when still in draw mode
    if (!this.drawingBoard) {
      this.canvas.style.cursor = "";
    }
  }

  // Alphabet magnets

  addAlphabetMagnet(letter) {
    if (!this.canEdit) {
      return;
    }
    const { AlphabetMagnet, magnetPalettes, MAGNET_SIZE_PRESETS } = window.FridgeItems;
    const index = letter.charCodeAt(0) - 65;
    const center = this.getVisibleWorldCenter();
    const magnetPresets = MAGNET_SIZE_PRESETS || [];
    const sizePreset = magnetPresets.find((p) => p.id === this.currentMagnetSize) || { width: 68, height: 72 };
    const item = new AlphabetMagnet({
        x: center.x - 90 + (index % 8) * 18,
        y: center.y - 70 + (index % 5) * 12,
        width: sizePreset.width,
        height: sizePreset.height,
        label: letter,
        rotation: (Math.random() - 0.5) * 0.22,
        palette: magnetPalettes[index % magnetPalettes.length],
        magnetStyle: this.currentMagnetStyle,
        sizePreset: this.currentMagnetSize,
      });
    this.items.push(item);
    this.playClack();
    this.recordLocalOp({ type: "item.add", item: item.toJSON() });
  }

  addStickyNote() {
    if (!this.canEdit) {
      return;
    }
    const { StickyNote, NOTE_SIZE_PRESETS } = window.FridgeItems;
    const center = this.getVisibleWorldCenter();
    const notePresets = NOTE_SIZE_PRESETS || [];
    const sizePreset = notePresets.find((p) => p.id === this.currentNoteSize) || { width: 176, height: 176 };
    const note = new StickyNote({
      x: center.x,
      y: center.y,
      width: sizePreset.width,
      height: sizePreset.height,
      rotation: (Math.random() - 0.5) * 0.18,
      text: "",
      paperStyle: this.currentPaperStyle,
      sizePreset: this.currentNoteSize,
    });
    this.items.push(note);
    this.playClack();
    this.recordLocalOp({ type: "item.add", item: note.toJSON() });
    this.enterNoteEditMode(note);
  }

  addEmojiSticker(emoji) {
    if (!this.canEdit) {
      return;
    }
    const { EmojiSticker } = window.FridgeItems;
    const center = this.getVisibleWorldCenter();
    const item = new EmojiSticker({
        x: center.x + (Math.random() - 0.5) * 140,
        y: center.y + (Math.random() - 0.5) * 80,
        width: 72,
        height: 72,
        rotation: (Math.random() - 0.5) * 0.2,
        emoji,
      });
    this.items.push(item);
    this.playClack();
    this.recordLocalOp({ type: "item.add", item: item.toJSON() });
  }

  // Dry erase board

  addDryEraseBoard() {
    if (!this.canEdit) {
      return;
    }
    const { DryEraseBoardItem } = window.FridgeItems;
    const center = this.getVisibleWorldCenter();
    const board = new DryEraseBoardItem({
      x: center.x + (Math.random() - 0.5) * 100,
      y: center.y + (Math.random() - 0.5) * 60,
      width: 320,
      height: 220,
      rotation: (Math.random() - 0.5) * 0.06,
      strokes: [],
    });
    this.items.push(board);
    this.playClack();
    this.recordLocalOp({ type: "item.add", item: board.toJSON() });
  }

  enterBoardDrawMode(board) {
    this.exitBoardDrawMode();
    this.exitNoteEditMode();
    this.drawingBoard = board;
    this.bringToFront(board);
    this.canvas.style.cursor = "crosshair";
    this._createDrawToolbar();
    this.repositionDrawToolbar();
  }

  exitBoardDrawMode() {
    if (!this.drawingBoard) return;

    const board = this.drawingBoard;
    // Finalize any in-progress stroke
    if (this.activeStroke) {
      if (this.activeStroke.points.length >= 1) {
        board.strokes.push(this.activeStroke);
      }
      board._liveStroke = null;
      this.activeStroke = null;
      this.drawPointerId = null;
    }

    this.drawingBoard = null;
    this.canvas.style.cursor = "";

    if (this.drawToolbar) {
      this.drawToolbar.remove();
      this.drawToolbar = null;
    }

    this.recordLocalOp({ type: "item.update", id: board.id, patch: { strokes: board.strokes } });
    this.finishInteraction();
  }

  _createDrawToolbar() {
    const MARKER_COLORS = [
      { color: "#1f2522", label: "Black" },
      { color: "#1a5fa8", label: "Blue" },
      { color: "#c0392b", label: "Red" },
      { color: "#27ae60", label: "Green" },
      { color: "#8e44ad", label: "Purple" },
    ];

    const toolbar = document.createElement("div");
    toolbar.className = "draw-toolbar";
    toolbar.setAttribute("role", "toolbar");
    toolbar.setAttribute("aria-label", "Drawing toolbar");

    for (const marker of MARKER_COLORS) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "draw-toolbar__color";
      btn.style.setProperty("--marker-color", marker.color);
      btn.title = `${marker.label} marker`;
      btn.setAttribute("aria-label", `${marker.label} marker`);
      btn.setAttribute("aria-pressed", marker.color === this.currentMarkerColor ? "true" : "false");
      if (marker.color === this.currentMarkerColor) btn.classList.add("is-active");
      btn.addEventListener("click", () => {
        this.currentMarkerColor = marker.color;
        for (const b of toolbar.querySelectorAll(".draw-toolbar__color")) {
          const isActive = b.style.getPropertyValue("--marker-color") === marker.color;
          b.classList.toggle("is-active", isActive);
          b.setAttribute("aria-pressed", isActive ? "true" : "false");
        }
      });
      toolbar.appendChild(btn);
    }

    const sep = document.createElement("span");
    sep.className = "draw-toolbar__sep";
    sep.setAttribute("aria-hidden", "true");
    toolbar.appendChild(sep);

    const clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.className = "draw-toolbar__action";
    clearBtn.textContent = "Clear";
    clearBtn.title = "Erase all strokes";
    clearBtn.addEventListener("click", () => {
      if (this.drawingBoard) {
        this.drawingBoard.clearStrokes();
        this.recordLocalOp({ type: "item.update", id: this.drawingBoard.id, patch: { strokes: [] } });
      }
    });
    toolbar.appendChild(clearBtn);

    const doneBtn = document.createElement("button");
    doneBtn.type = "button";
    doneBtn.className = "draw-toolbar__action draw-toolbar__action--done";
    doneBtn.textContent = "Done";
    doneBtn.title = "Exit drawing mode (Esc)";
    doneBtn.addEventListener("click", () => {
      this.exitBoardDrawMode();
    });
    toolbar.appendChild(doneBtn);

    document.body.appendChild(toolbar);
    this.drawToolbar = toolbar;
  }

  repositionDrawToolbar() {
    if (!this.drawToolbar || !this.drawingBoard) return;
    const board = this.drawingBoard;
    // Approximate top-center of board in viewport (ignoring small rotation)
    const topCenter = this.worldToViewport({ x: board.x, y: board.y - board.height / 2 });
    const canvasRect = this.canvas.getBoundingClientRect();

    Object.assign(this.drawToolbar.style, {
      left: `${canvasRect.left + topCenter.x}px`,
      top: `${Math.max(8, canvasRect.top + topCenter.y - 52)}px`,
      transform: "translateX(-50%)",
    });
  }

  // Convert a world-space point to board-surface-local coordinates.
  // (0,0) = top-left corner of the drawable surface (inside the frame).
  _worldToBoardLocal(worldPoint, board) {
    const frame = 14;
    const dx = worldPoint.x - board.x;
    const dy = worldPoint.y - board.y;
    const cos = Math.cos(-board.rotation);
    const sin = Math.sin(-board.rotation);
    const scale = board.scale || 1;
    const lx = (dx * cos - dy * sin) / scale;
    const ly = (dx * sin + dy * cos) / scale;
    return {
      x: lx + board.width / 2 - frame,
      y: ly + board.height / 2 - frame,
    };
  }

  // Inline note editing

  enterNoteEditMode(note) {
    this.exitNoteEditMode(); // clean up any prior session

    note.isEditing = true;
    note.scale = 1;
    note.isDragging = false;
    this.editingNote = note;
    this.bringToFront(note);

    const { handwrittenFont } = window.FridgeItems;
    const s = this.camera.scale;

    const layout = note.getTextLayout();
    const padH = layout.padH + layout.bulletGap;
    const padTop = layout.padTop;
    const padBot = layout.padBot;
    const w = (note.width - layout.padH * 2 - layout.bulletGap) * s;
    const h = (note.height - padTop - padBot) * s;
    const fontPx = Math.round(layout.fontSize * s);
    const linePx = Math.round(layout.lineHeight * s);

    // The vertical centre of the text area is 4 world units above note centre
    // because padTop (20) differs from padBot (28).
    const textOffsetX = (padH - layout.padH) / 2;
    const textOffsetY = (padTop - padBot) / 2;
    const textCenter = this.worldToViewport({ x: note.x + textOffsetX, y: note.y + textOffsetY });
    const rect = this.canvas.getBoundingClientRect();
    const screenX = rect.left + textCenter.x;
    const screenY = rect.top  + textCenter.y;

    const textarea = document.createElement("textarea");
    textarea.className = "note-edit-overlay";
    textarea.value = note.text;
    textarea.spellcheck = false;
    textarea.setAttribute("autocomplete", "off");
    textarea.setAttribute("autocorrect", "off");
    textarea.setAttribute("autocapitalize", "off");

    Object.assign(textarea.style, {
      position:        "fixed",
      left:            `${screenX}px`,
      top:             `${screenY}px`,
      width:           `${w}px`,
      height:          `${h}px`,
      transform:       `translate(-50%, -50%) rotate(${note.rotation}rad)`,
      transformOrigin: "center center",
      background:      "transparent",
      border:          "none",
      outline:         "none",
      resize:          "none",
      font:            `${fontPx}px/${linePx}px ${handwrittenFont}`,
      color:           note.getTextColor(),
      caretColor:      note.getTextColor(),
      padding:         "0",
      margin:          "0",
      overflow:        "hidden",
      whiteSpace:      "pre-wrap",
      wordBreak:       "break-word",
      zIndex:          "50",
      cursor:          "text",
      boxSizing:       "border-box",
    });

    textarea.addEventListener("input", () => {
      note.text = textarea.value.slice(0, 220);
    });

    textarea.addEventListener("blur", () => {
      this.exitNoteEditMode();
    });

    textarea.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        textarea.blur();
      }
    });

    document.body.appendChild(textarea);
    this.editOverlay = textarea;

    // Focus and move cursor to end
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  }

  exitNoteEditMode() {
    if (!this.editingNote) return;

    const note = this.editingNote;
    note.isEditing = false;
    this.editingNote = null;

    if (this.editOverlay) {
      note.text = this.editOverlay.value.slice(0, 220);
      this.editOverlay.remove();
      this.editOverlay = null;
    }

    this.recordLocalOp({ type: "item.update", id: note.id, patch: { text: note.text } });
    this.finishInteraction();
  }

  repositionEditOverlay() {
    if (!this.editOverlay || !this.editingNote) return;

    const note = this.editingNote;
    const { handwrittenFont } = window.FridgeItems;
    const s = this.camera.scale;
    const layout = note.getTextLayout();
    const padH = layout.padH + layout.bulletGap;
    const padTop = layout.padTop;
    const padBot = layout.padBot;
    const w = (note.width - layout.padH * 2 - layout.bulletGap) * s;
    const h = (note.height - padTop - padBot) * s;
    const fontPx = Math.round(layout.fontSize * s);
    const linePx = Math.round(layout.lineHeight * s);

    const textOffsetX = (padH - layout.padH) / 2;
    const textOffsetY = (padTop - padBot) / 2;
    const textCenter = this.worldToViewport({ x: note.x + textOffsetX, y: note.y + textOffsetY });
    const rect = this.canvas.getBoundingClientRect();

    Object.assign(this.editOverlay.style, {
      left:      `${rect.left + textCenter.x}px`,
      top:       `${rect.top  + textCenter.y}px`,
      width:     `${w}px`,
      height:    `${h}px`,
      font:      `${fontPx}px/${linePx}px ${handwrittenFont}`,
      color:     note.getTextColor(),
      caretColor: note.getTextColor(),
      transform: `translate(-50%, -50%) rotate(${note.rotation}rad)`,
    });
  }

  // Items

  addPolaroid(src, point) {
    if (!this.canEdit) {
      return;
    }
    const { PolaroidItem, PHOTO_SIZE_PRESETS } = window.FridgeItems;
    const frameStyle = this.currentPhotoStyle || "polaroid";

    // Base dimensions vary by style to look natural from the start
    const baseDimensionsByStyle = {
      "polaroid":       { width: 210, height: 248 },
      "snapshot":       { width: 185, height: 205 },
      "sticker-cutout": { width: 172, height: 172 },
      "tape-corners":   { width: 192, height: 192 },
      "magnetic-frame": { width: 204, height: 224 },
    };
    const base = baseDimensionsByStyle[frameStyle] || baseDimensionsByStyle["polaroid"];
    const photoPresets = PHOTO_SIZE_PRESETS || [];
    const sizePreset = photoPresets.find((p) => p.id === this.currentPhotoSize) || { scale: 1.0 };
    const width = Math.round(base.width * sizePreset.scale);
    const height = Math.round(base.height * sizePreset.scale);

    const item = new PolaroidItem({
        x: point.x,
        y: point.y,
        width,
        height,
        rotation: (Math.random() - 0.5) * 0.16,
        src,
        frameStyle,
        sizePreset: this.currentPhotoSize,
      });
    this.items.push(item);
    this.playClack();
    this.recordLocalOp({ type: "item.add", item: item.toJSON() });
  }

  getViewportPointer(event) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  }

  viewportToWorld(point) {
    return {
      x: this.camera.x + point.x / this.camera.scale,
      y: this.camera.y + point.y / this.camera.scale,
    };
  }

  worldToViewport(point) {
    return {
      x: (point.x - this.camera.x) * this.camera.scale,
      y: (point.y - this.camera.y) * this.camera.scale,
    };
  }

  getVisibleWorldCenter() {
    return this.viewportToWorld({ x: this.width / 2, y: this.height / 2 });
  }

  refreshWorld(previousWorld = { width: 0, height: 0 }) {
    this.world.width = Math.max(1800, Math.ceil(this.width * 2.2));
    this.world.height = Math.max(1400, Math.ceil(this.height * 2.2));

    if (!previousWorld.width || !previousWorld.height) {
      this.camera.x = Math.max(0, (this.world.width - this.width / this.camera.scale) / 2);
      this.camera.y = Math.max(0, (this.world.height - this.height / this.camera.scale) / 2);
      return;
    }

    this.camera.x += (this.world.width - previousWorld.width) / 2;
    this.camera.y += (this.world.height - previousWorld.height) / 2;
  }

  clampCamera() {
    const visibleWidth = this.width / this.camera.scale;
    const visibleHeight = this.height / this.camera.scale;
    this.camera.x = this.clamp(this.camera.x, 0, Math.max(0, this.world.width - visibleWidth));
    this.camera.y = this.clamp(this.camera.y, 0, Math.max(0, this.world.height - visibleHeight));
  }

  clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  getTopItemAt(point) {
    for (let index = this.items.length - 1; index >= 0; index -= 1) {
      if (this.items[index].contains(point)) {
        return this.items[index];
      }
    }

    return null;
  }

  bringToFront(item) {
    this.items = this.items.filter((candidate) => candidate !== item);
    this.items.push(item);
  }

  initTrayStyle() {
    const saved = localStorage.getItem("fridgeshare:tray-style") || "classic";
    this.applyTrayStyle(saved);

    const btn = document.querySelector("#tray-style-button");
    if (!btn) return;
    btn.addEventListener("click", () => {
      const styles = ["classic", "corner-chip", "paint-shelf", "pill-fan"];
      const idx = styles.indexOf(this.currentTrayStyle);
      this.applyTrayStyle(styles[(idx + 1) % styles.length]);
    });
  }

  applyTrayStyle(styleId) {
    const kitTray = document.querySelector("#kit-tray");
    for (const id of ["corner-chip", "paint-shelf", "pill-fan"]) {
      kitTray.classList.toggle(`kit-tray--${id}`, id === styleId);
    }
    this.currentTrayStyle = styleId;
    localStorage.setItem("fridgeshare:tray-style", styleId);

    const labels = { classic: "Classic", "corner-chip": "Corner", "paint-shelf": "Shelf", "pill-fan": "Pill" };
    const btn = document.querySelector("#tray-style-button");
    if (btn) btn.title = `Tray style: ${labels[styleId] || styleId} — click to cycle`;
  }

  setSurfaceTheme(themeId, options = {}) {
    if (!this.canEdit && !options.skipSave) {
      return;
    }
    this.currentSurfaceTheme = fridgeSurfaceThemeById(themeId).id;
    this.updateSurfaceThemeControls();
    if (!options.skipSave) {
      this.recordLocalOp({ type: "board.setTheme", theme: this.currentSurfaceTheme });
    }
  }

  updateSurfaceThemeControls() {
    const themeSelector = document.querySelector("#surface-theme-selector");
    if (!themeSelector) {
      return;
    }

    for (const btn of themeSelector.querySelectorAll("button")) {
      const active = btn.dataset.theme === this.currentSurfaceTheme;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-pressed", active ? "true" : "false");
    }
  }

  getState() {
    return {
      theme: this.currentSurfaceTheme,
      items: this.items.map((item) => item.toJSON()),
    };
  }

  loadState(state) {
    this.exitBoardDrawMode();
    this.exitNoteEditMode();
    this.setSurfaceTheme(state && state.theme, { skipSave: true });
    this.items = state.items
      .map((item) => window.FridgeItems.itemFromJSON(item))
      .filter(Boolean);
    this.clampItemsToWorld();
    this.focusCameraOnItems();
  }

  async reset() {
    if (!window.confirm("Reset the fridge door?")) {
      return;
    }

    this.exitBoardDrawMode();

    try {
      await this.persistence.clear();
    } catch {
      this.showToast("Could not clear the saved fridge.");
    }
    this.setSurfaceTheme("classic-white", { skipSave: true });
    this.createStarterKit();
    this.clampCamera();
    this.lastSeenRevision = null;
    this.deferredRemoteState = null;
    this.scheduleSave();
    this.showToast("Fridge reset.");
  }

  unlockAudio() {
    if (!this.audioContext) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.audioContext = AudioContext ? new AudioContext() : null;
    }

    if (this.audioContext && this.audioContext.state === "suspended") {
      this.audioContext.resume();
    }
  }

  playClack() {
    this.unlockAudio();
    if (!this.audioContext) {
      return;
    }

    const now = this.audioContext.currentTime;
    const oscillator = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();
    const filter = this.audioContext.createBiquadFilter();

    oscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(210, now);
    oscillator.frequency.exponentialRampToValueAtTime(72, now + 0.06);

    filter.type = "lowpass";
    filter.frequency.setValueAtTime(920, now);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.14, now + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);

    oscillator.connect(filter);
    filter.connect(gain);
    gain.connect(this.audioContext.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.085);
  }

  drawBackground() {
    const ctx = this.ctx;
    const theme = fridgeSurfaceThemeById(this.currentSurfaceTheme);
    const gradient = ctx.createLinearGradient(0, 0, this.world.width, this.world.height);
    for (const [offset, color] of theme.stops) {
      gradient.addColorStop(offset, color);
    }

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, this.world.width, this.world.height);

    this.drawSurfaceTexture(theme);

    ctx.fillStyle = theme.cap;
    ctx.fillRect(0, 0, this.world.width, 22);
  }

  drawSurfaceTexture(theme) {
    const ctx = this.ctx;

    if (theme.texture === "brushed-metal") {
      ctx.save();
      for (let y = 3; y < this.world.height; y += 4) {
        const alpha = y % 16 === 3 ? 0.22 : 0.08;
        ctx.beginPath();
        ctx.moveTo(0, y + Math.sin(y * 0.035) * 1.2);
        ctx.lineTo(this.world.width, y + Math.sin(y * 0.035 + 1.2) * 1.2);
        ctx.strokeStyle = y % 16 === 3 ? `rgba(255, 255, 255, ${alpha})` : `rgba(49, 60, 60, ${alpha})`;
        ctx.lineWidth = y % 28 === 3 ? 1.1 : 0.55;
        ctx.stroke();
      }

      const sheen = ctx.createLinearGradient(0, 0, this.world.width, 0);
      sheen.addColorStop(0, "rgba(255, 255, 255, 0)");
      sheen.addColorStop(0.42, "rgba(255, 255, 255, 0.2)");
      sheen.addColorStop(0.55, "rgba(40, 50, 50, 0.08)");
      sheen.addColorStop(1, "rgba(255, 255, 255, 0)");
      ctx.fillStyle = sheen;
      ctx.fillRect(0, 0, this.world.width, this.world.height);
      ctx.restore();
      return;
    }

    if (theme.texture === "clean-enamel") {
      this.drawDiagonalEnamelLines(theme, 0.65);
      this.drawSoftGloss("rgba(255, 255, 255, 0.16)");
      return;
    }

    if (theme.texture === "glossy-enamel") {
      this.drawDiagonalEnamelLines(theme, 0.4);
      this.drawSoftGloss("rgba(255, 255, 255, 0.22)");
      this.drawEnamelMottling("rgba(255, 255, 255, 0.09)", "rgba(64, 120, 98, 0.07)", 56);
      return;
    }

    if (theme.texture === "warm-enamel") {
      this.drawDiagonalEnamelLines(theme, 0.35);
      this.drawSoftGloss("rgba(255, 255, 255, 0.14)");
      this.drawEnamelMottling("rgba(255, 255, 255, 0.1)", "rgba(142, 111, 63, 0.08)", 46);
      return;
    }

    if (theme.texture === "worn-enamel") {
      this.drawDiagonalEnamelLines(theme, 0.28);
      this.drawEnamelMottling("rgba(255, 255, 255, 0.08)", "rgba(90, 82, 68, 0.09)", 64);
      ctx.save();
      ctx.globalAlpha = 0.16;
      ctx.fillStyle = "#7b6f5e";
      const scuffs = [
        [220, 180, 42, 5, -0.16],
        [760, 310, 68, 4, 0.08],
        [1180, 820, 54, 4, -0.22],
        [420, 1040, 36, 3, 0.18],
        [1480, 520, 46, 4, 0.2],
      ];
      for (const [x, y, width, height, angle] of scuffs) {
        ctx.save();
        ctx.translate(x % this.world.width, y % this.world.height);
        ctx.rotate(angle);
        ctx.beginPath();
        ctx.ellipse(0, 0, width, height, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      ctx.restore();
    }
  }

  drawDiagonalEnamelLines(theme, strength = 1) {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = theme.lineAlpha * strength;
    for (let x = 12; x < this.world.width + this.world.height * 0.2; x += 24) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x - this.world.height * 0.2, this.world.height);
      ctx.strokeStyle = x % 48 === 12 ? theme.lineA : theme.lineB;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.restore();
  }

  drawSoftGloss(color) {
    const ctx = this.ctx;
    const gloss = ctx.createRadialGradient(
      this.world.width * 0.22,
      this.world.height * 0.12,
      0,
      this.world.width * 0.22,
      this.world.height * 0.12,
      Math.max(this.world.width, this.world.height) * 0.72
    );
    gloss.addColorStop(0, color);
    gloss.addColorStop(0.45, "rgba(255, 255, 255, 0.04)");
    gloss.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.fillStyle = gloss;
    ctx.fillRect(0, 0, this.world.width, this.world.height);
  }

  drawEnamelMottling(lightColor, darkColor, gap) {
    const ctx = this.ctx;
    ctx.save();
    for (let y = gap * 0.7; y < this.world.height; y += gap) {
      for (let x = gap * 0.5; x < this.world.width; x += gap) {
        const seed = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
        const value = seed - Math.floor(seed);
        const radius = 5 + value * 13;
        ctx.fillStyle = value > 0.48 ? lightColor : darkColor;
        ctx.beginPath();
        ctx.ellipse(
          x + Math.sin(value * 19) * gap * 0.24,
          y + Math.cos(value * 23) * gap * 0.24,
          radius,
          radius * (0.28 + value * 0.32),
          value * Math.PI,
          0,
          Math.PI * 2
        );
        ctx.fill();
      }
    }
    ctx.restore();
  }

  drawHandle() {
    const ctx = this.ctx;
    const width = 32;
    const height = Math.min(360, this.world.height * 0.34);
    const x = this.world.width - 74;
    const y = this.world.height * 0.18;
    const radius = width / 2;

    ctx.save();
    ctx.shadowColor = "rgba(31, 37, 34, 0.24)";
    ctx.shadowBlur = 22;
    ctx.shadowOffsetX = 8;
    ctx.shadowOffsetY = 12;

    const gradient = ctx.createLinearGradient(x, y, x + width, y);
    gradient.addColorStop(0, "rgba(255, 255, 255, 0.94)");
    gradient.addColorStop(0.46, "rgba(210, 218, 213, 0.94)");
    gradient.addColorStop(1, "rgba(146, 158, 151, 0.9)");

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
    ctx.fill();

    ctx.shadowColor = "transparent";
    ctx.strokeStyle = "rgba(70, 82, 76, 0.2)";
    ctx.stroke();

    ctx.globalAlpha = 0.62;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(x + 6, y + 16, 5, height - 32);
    ctx.restore();
  }

  clampItemsToWorld() {
    for (const item of this.items) {
      item.x = this.clamp(item.x, item.width / 2, this.world.width - item.width / 2);
      item.y = this.clamp(item.y, item.height / 2, this.world.height - item.height / 2);
    }
  }

  focusCameraOnItems() {
    if (!this.items.length) {
      return;
    }

    const bounds = this.items.reduce(
      (result, item) => ({
        minX: Math.min(result.minX, item.x - item.width / 2),
        minY: Math.min(result.minY, item.y - item.height / 2),
        maxX: Math.max(result.maxX, item.x + item.width / 2),
        maxY: Math.max(result.maxY, item.y + item.height / 2),
      }),
      { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
    );

    this.camera.x = (bounds.minX + bounds.maxX) / 2 - this.width / this.camera.scale / 2;
    this.camera.y = (bounds.minY + bounds.maxY) / 2 - this.height / this.camera.scale / 2;
    this.clampCamera();
  }

  showToast(message) {
    const toast = document.querySelector("#toast");
    toast.textContent = message;
    toast.classList.add("is-visible");
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 2200);
  }

  _showCaptionTooltip(text, clientX, clientY) {
    const el = document.querySelector("#caption-tooltip");
    if (!el) return;
    el.textContent = text;
    el.style.left = `${clientX}px`;
    el.style.top = `${clientY + 20}px`;
    el.classList.add("is-visible");
  }

  _hideCaptionTooltip() {
    const el = document.querySelector("#caption-tooltip");
    if (el) el.classList.remove("is-visible");
  }

  updateModePill(status, options = {}) {
    const pill = document.querySelector("#mode-pill");
    if (!pill) {
      return;
    }

    window.clearTimeout(this.syncStatusTimer);

    if (this.mode === "remote") {
      pill.textContent = `${status} - #${this.fridgeId}`;
    } else {
      pill.textContent = `${status} - local`;
    }

    if (options.settleToSaved) {
      this.syncStatusTimer = window.setTimeout(() => {
        if (!this.hasPendingLocalSave && !this.hasUnsavedLocalChanges && !this.deferredRemoteState) {
          this.updateModePill("Saved");
        }
      }, 1400);
    }
  }

  render() {
    this.ctx.clearRect(0, 0, this.width, this.height);
    this.ctx.save();
    this.ctx.scale(this.camera.scale, this.camera.scale);
    this.ctx.translate(-this.camera.x, -this.camera.y);
    this.drawBackground();
    this.drawHandle();

    for (const item of this.items) {
      item.update(this.world);
      item.draw(this.ctx);
    }

    this.ctx.restore();
    requestAnimationFrame(this.render);
  }
}

window.FridgeCanvas = FridgeCanvas;
