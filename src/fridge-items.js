(function () {
  const handwrittenFont = "Comic Sans MS, Bradley Hand, Segoe Print, cursive";

  const magnetPalettes = [
    { light: "#ffdf6b", base: "#f7b731", dark: "#d18412" },
    { light: "#ff8f8f", base: "#eb4d4b", dark: "#a92d2b" },
    { light: "#8ed8ff", base: "#2d98da", dark: "#176796" },
    { light: "#91f2bf", base: "#20bf6b", dark: "#127a43" },
    { light: "#d7a4ff", base: "#8854d0", dark: "#56308a" },
    { light: "#ffbd8a", base: "#fa8231", dark: "#b65316" },
  ];

  const foamPalettes = [
    { light: "#ffd6e8", base: "#ffb3cf", dark: "#e5829e" },
    { light: "#d6eaff", base: "#a8ceff", dark: "#6ea8e8" },
    { light: "#d6ffd9", base: "#a8f0ac", dark: "#6ed172" },
    { light: "#fff3d6", base: "#ffe4a8", dark: "#e8c85e" },
    { light: "#ead6ff", base: "#d1a8ff", dark: "#b06ee8" },
    { light: "#d6fff7", base: "#a8ffe6", dark: "#6ed1c0" },
  ];

  const woodPalettes = [
    { light: "#d4a96a", base: "#b8833c", dark: "#8c5e1e", letter: "#f5ead8" },
    { light: "#c9a878", base: "#a07040", dark: "#6b4820", letter: "#f2e6cf" },
    { light: "#b89872", base: "#96704a", dark: "#6a4825", letter: "#ede0ca" },
  ];

  const MAGNET_STYLES = [
    { id: "classic",     label: "Classic Plastic" },
    { id: "foam",        label: "Foam Bath" },
    { id: "wood",        label: "Wooden Block" },
    { id: "schoolhouse", label: "Schoolhouse" },
  ];

  const PHOTO_STYLES = [
    { id: "polaroid",       label: "Polaroid",        swatch: "#fbfaf4" },
    { id: "snapshot",       label: "Snapshot",        swatch: "#ffffff" },
    { id: "sticker-cutout", label: "Sticker Cutout",  swatch: "#ffffff" },
    { id: "tape-corners",   label: "Tape Corners",    swatch: "#f5f2e8" },
    { id: "magnetic-frame", label: "Magnetic Frame",  swatch: "#eb4d4b" },
  ];

  const MAGNET_SIZE_PRESETS = [
    { id: "small",   label: "Small",   width: 48,  height: 52  },
    { id: "classic", label: "Classic", width: 68,  height: 72  },
    { id: "jumbo",   label: "Jumbo",   width: 96,  height: 102 },
  ];

  const NOTE_SIZE_PRESETS = [
    { id: "small",    label: "Small",    width: 130, height: 130 },
    { id: "standard", label: "Standard", width: 176, height: 176 },
    { id: "large",    label: "Large",    width: 230, height: 230 },
  ];

  // Scale factors applied to each frame style's natural dimensions.
  const PHOTO_SIZE_PRESETS = [
    { id: "mini",     label: "Mini",     scale: 0.67 },
    { id: "standard", label: "Standard", scale: 1.0  },
    { id: "large",    label: "Large",    scale: 1.35 },
  ];

  // Palette for magnetic frame colours (cycles by item creation order)
  const magneticFramePalettes = [
    { outer: "#eb4d4b", mid: "#ff7675", inner: "#d63031" },
    { outer: "#2d98da", mid: "#74b9ff", inner: "#1e6fa8" },
    { outer: "#20bf6b", mid: "#55efc4", inner: "#16a355" },
    { outer: "#f7b731", mid: "#ffd32a", inner: "#d48c10" },
    { outer: "#8854d0", mid: "#a29bfe", inner: "#5f3ba8" },
    { outer: "#fa8231", mid: "#ffbe76", inner: "#cc6600" },
  ];

  let _photoFrameCounter = 0;

  const PAPER_STYLES = [
    { id: "yellow-sticky", label: "Yellow Sticky", swatch: "#ffe98a", fill: "#ffe98a", light: "#fff2a8", border: "rgba(121, 95, 37, 0.12)", rule: "rgba(121, 95, 37, 0.14)", fold: "rgba(207, 169, 56, 0.22)", ink: "rgba(47, 43, 33, 0.82)" },
    {
      id: "pastel-sticky",
      label: "Pastel Sticky",
      swatch: "#ffd6e8",
      variants: [
        { fill: "#ffd6e8", light: "#fff0f7", fold: "rgba(224, 130, 158, 0.2)" },
        { fill: "#d8ecff", light: "#f1f8ff", fold: "rgba(110, 168, 232, 0.18)" },
        { fill: "#d9f7dd", light: "#f2fff3", fold: "rgba(110, 209, 114, 0.18)" },
        { fill: "#eadcff", light: "#f7f0ff", fold: "rgba(176, 110, 232, 0.16)" },
      ],
      border: "rgba(71, 86, 78, 0.12)",
      rule: "rgba(71, 86, 78, 0.12)",
      ink: "rgba(35, 43, 40, 0.82)",
    },
    { id: "lined-paper", label: "Lined Paper", swatch: "#fbfaf4", fill: "#fbfaf4", light: "#ffffff", border: "rgba(58, 73, 94, 0.16)", rule: "rgba(80, 137, 190, 0.24)", margin: "rgba(210, 82, 82, 0.2)", ink: "rgba(32, 40, 54, 0.84)", lines: true },
    { id: "grocery-list", label: "Grocery List", swatch: "#fffdf0", fill: "#fffdf0", light: "#ffffff", border: "rgba(71, 86, 78, 0.18)", rule: "rgba(71, 86, 78, 0.12)", ink: "rgba(35, 43, 40, 0.84)", checklist: true },
    { id: "index-card", label: "Index Card", swatch: "#f8f1dc", fill: "#f8f1dc", light: "#fffaf0", border: "rgba(110, 86, 50, 0.18)", rule: "rgba(73, 121, 171, 0.18)", margin: "rgba(210, 82, 82, 0.18)", ink: "rgba(39, 38, 34, 0.84)", indexCard: true, lines: true },
  ];

  function paperStyleById(id) {
    return PAPER_STYLES.find((style) => style.id === id) || PAPER_STYLES[0];
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function roundRect(ctx, x, y, width, height, radius) {
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
  }

  function wrapText(ctx, text, maxWidth) {
    const words = String(text || "").split(/\s+/);
    const lines = [];
    let line = "";

    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    }

    if (line) {
      lines.push(line);
    }

    return lines;
  }

  function randomItemId() {
    const alphabet = "0123456789abcdefghijklmnopqrstuvwxyz";
    const bytes = new Uint8Array(18);
    crypto.getRandomValues(bytes);
    return `item-${Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("")}`;
  }

  class FridgeItem {
    constructor({ id, type, x, y, width, height, rotation = 0 }) {
      this.id = id || randomItemId();
      this.type = type;
      this.x = x;
      this.y = y;
      this.width = width;
      this.height = height;
      this.rotation = rotation;
      this.vx = 0;
      this.vy = 0;
      this.angularVelocity = 0;
      this.isDragging = false;
      this.isHovered = false;
      this.scale = 1;
      this.bounce = 0;
    }

    // Rotate a world-space point into this item's local coordinate space.
    _toLocal(point) {
      const cos = Math.cos(-this.rotation);
      const sin = Math.sin(-this.rotation);
      const dx = point.x - this.x;
      const dy = point.y - this.y;
      return { x: dx * cos - dy * sin, y: dx * sin + dy * cos };
    }

    // Hit-test the delete button in local item coordinates.
    deleteContains(point) {
      const local = this._toLocal(point);
      const dcx = -this.width / 2 + 13;
      const dcy = -this.height / 2 + 13;
      return Math.sqrt((local.x - dcx) ** 2 + (local.y - dcy) ** 2) <= 14;
    }

    // Draw the delete button. Call from inside beginDraw/endDraw.
    _drawDeleteBtn(ctx) {
      const cx = -this.width / 2 + 13;
      const cy = -this.height / 2 + 13;
      const alpha = this.isHovered ? 0.62 : 0.2;

      ctx.save();
      ctx.globalAlpha = alpha;

      ctx.fillStyle = "rgba(160, 35, 18, 0.45)";
      ctx.beginPath();
      ctx.arc(cx, cy, 9, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
      ctx.font = "bold 13px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("x", cx, cy + 0.5);

      ctx.restore();
    }

    contains(point) {
      const cos = Math.cos(-this.rotation);
      const sin = Math.sin(-this.rotation);
      const dx = point.x - this.x;
      const dy = point.y - this.y;
      const localX = dx * cos - dy * sin;
      const localY = dx * sin + dy * cos;

      return (
        localX >= -this.width / 2 &&
        localX <= this.width / 2 &&
        localY >= -this.height / 2 &&
        localY <= this.height / 2
      );
    }

    update(bounds) {
      if (this.isDragging) {
        return;
      }

      this.x += this.vx;
      this.y += this.vy;
      this.rotation += this.angularVelocity;

      this.vx *= 0.9;
      this.vy *= 0.9;
      this.angularVelocity *= 0.88;

      const halfWidth = this.width / 2;
      const halfHeight = this.height / 2;
      const bounceLoss = -0.32;

      if (this.x < halfWidth) {
        this.x = halfWidth;
        this.vx *= bounceLoss;
      } else if (this.x > bounds.width - halfWidth) {
        this.x = bounds.width - halfWidth;
        this.vx *= bounceLoss;
      }

      if (this.y < halfHeight) {
        this.y = halfHeight;
        this.vy *= bounceLoss;
      } else if (this.y > bounds.height - halfHeight) {
        this.y = bounds.height - halfHeight;
        this.vy *= bounceLoss;
      }

      if (this.bounce > 0.001) {
        this.bounce *= 0.74;
        this.scale = 1 + Math.sin(this.bounce * Math.PI) * 0.035;
      } else {
        this.bounce = 0;
        this.scale = 1;
      }
    }

    drop(velocity) {
      this.vx = velocity.x * 0.42;
      this.vy = velocity.y * 0.42;
      this.angularVelocity = clamp(velocity.x * 0.0015, -0.08, 0.08);
      this.bounce = 1;
    }

    baseJSON() {
      return {
        id: this.id,
        type: this.type,
        x: Math.round(this.x),
        y: Math.round(this.y),
        width: this.width,
        height: this.height,
        rotation: Number(this.rotation.toFixed(4)),
      };
    }

    beginDraw(ctx) {
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(this.rotation);
      ctx.scale(this.scale, this.scale);
    }

    endDraw(ctx) {
      ctx.restore();
    }
  }

  class AlphabetMagnet extends FridgeItem {
    constructor(options) {
      super({ ...options, type: "alphabet" });
      this.label = String(options.label || "A").slice(0, 1).toUpperCase();
      this.palette = options.palette || magnetPalettes[0];
      this.magnetStyle = options.magnetStyle || "classic";
      this.sizePreset = options.sizePreset || null;
    }

    _letterIndex() {
      const code = this.label.charCodeAt(0) - 65;
      return code >= 0 && code < 26 ? code : 0;
    }

    draw(ctx) {
      this.beginDraw(ctx);
      switch (this.magnetStyle) {
        case "foam":        this.drawFoam(ctx);        break;
        case "wood":        this.drawWood(ctx);        break;
        case "schoolhouse": this.drawSchoolhouse(ctx); break;
        default:            this.drawClassic(ctx);     break;
      }
      this._drawDeleteBtn(ctx);
      this.endDraw(ctx);
    }

    drawClassic(ctx) {
      const pal = this.palette;
      const fontSize = Math.floor(this.height * 0.86);
      const font = `900 ${fontSize}px "Arial Black", "Arial Bold", Impact, sans-serif`;

      ctx.font = font;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      // 1. Soft drop shadow
      ctx.shadowColor = "rgba(20, 10, 0, 0.32)";
      ctx.shadowBlur = 6;
      ctx.shadowOffsetX = 2;
      ctx.shadowOffsetY = 5;
      ctx.fillStyle = pal.dark;
      ctx.fillText(this.label, 0, 0);
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;

      // 2. Thick cartoon outline
      ctx.lineWidth = fontSize * 0.11;
      ctx.lineJoin = "round";
      ctx.strokeStyle = "rgba(18, 8, 2, 0.88)";
      ctx.strokeText(this.label, 0, 0);

      // 3. Bright flat fill with a gentle top-to-bottom gradient
      const grad = ctx.createLinearGradient(0, -fontSize * 0.44, 0, fontSize * 0.44);
      grad.addColorStop(0, pal.light);
      grad.addColorStop(0.55, pal.base);
      grad.addColorStop(1, pal.dark);
      ctx.fillStyle = grad;
      ctx.fillText(this.label, 0, 0);

      // 4. Cartoon shine in the upper-left
      ctx.fillStyle = "rgba(255, 255, 255, 0.52)";
      ctx.beginPath();
      ctx.ellipse(
        -fontSize * 0.09, -fontSize * 0.24,
        fontSize * 0.15, fontSize * 0.08,
        -0.35, 0, Math.PI * 2
      );
      ctx.fill();
    }

    // Builds a smooth organic blob path centred at (0,0).
    // rx/ry are the half-extents; seed drives per-letter variation.
    _blobPath(ctx, rx, ry, seed) {
      const n = 8;
      const pts = [];
      for (let i = 0; i < n; i++) {
        const angle = (i / n) * Math.PI * 2;
        const wobble = 0.82 + 0.22 * Math.abs(Math.sin(seed * 2.8 + i * 1.73));
        pts.push({ x: Math.cos(angle) * rx * wobble, y: Math.sin(angle) * ry * wobble });
      }
      ctx.beginPath();
      const last = pts[n - 1];
      ctx.moveTo((last.x + pts[0].x) / 2, (last.y + pts[0].y) / 2);
      for (let i = 0; i < n; i++) {
        const curr = pts[i];
        const next = pts[(i + 1) % n];
        ctx.quadraticCurveTo(curr.x, curr.y, (curr.x + next.x) / 2, (curr.y + next.y) / 2);
      }
      ctx.closePath();
    }

    // Builds a regular polygon path centred at (0,0), pointing up.
    _polyPath(ctx, size, sides) {
      ctx.beginPath();
      for (let i = 0; i < sides; i++) {
        const angle = (i / sides) * Math.PI * 2 - Math.PI / 2;
        const x = Math.cos(angle) * size;
        const y = Math.sin(angle) * size;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
    }

    // Each letter gets a stable polygon side count from 3 to 8.
    _woodSides() {
      const table = [5, 3, 7, 4, 6, 3, 8, 5, 4, 7, 3, 6, 5, 4, 8, 3, 6, 5, 7, 4, 3, 6, 5, 8, 4, 7];
      return table[this._letterIndex()];
    }

    drawFoam(ctx) {
      const rx = this.width / 2;
      const ry = this.height / 2;
      const pal = foamPalettes[this._letterIndex() % foamPalettes.length];
      const seed = this._letterIndex();

      const radial = ctx.createRadialGradient(-rx * 0.15, -ry * 0.2, 0, 0, 0, rx * 0.9);
      radial.addColorStop(0, pal.light);
      radial.addColorStop(1, pal.base);

      this._blobPath(ctx, rx, ry, seed);
      ctx.shadowColor = "rgba(31, 37, 34, 0.14)";
      ctx.shadowBlur = 14;
      ctx.shadowOffsetY = 5;
      ctx.fillStyle = radial;
      ctx.fill();

      this._blobPath(ctx, rx, ry, seed);
      ctx.shadowColor = "transparent";
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = pal.light;
      ctx.stroke();

      ctx.fillStyle = pal.dark;
      ctx.font = `900 ${Math.floor(this.height * 0.58)}px ${handwrittenFont}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(this.label, 0, 3);
    }

    drawWood(ctx) {
      const size = Math.min(this.width, this.height) * 0.52;
      const sides = this._woodSides();
      const pal = woodPalettes[this._letterIndex() % woodPalettes.length];

      const gradient = ctx.createLinearGradient(-size, -size, size, size);
      gradient.addColorStop(0, pal.light);
      gradient.addColorStop(0.5, pal.base);
      gradient.addColorStop(1, pal.dark);

      this._polyPath(ctx, size, sides);
      ctx.shadowColor = "rgba(31, 37, 34, 0.3)";
      ctx.shadowBlur = 10;
      ctx.shadowOffsetY = 6;
      ctx.fillStyle = gradient;
      ctx.fill();

      // Grain lines clipped to the polygon
      ctx.save();
      this._polyPath(ctx, size, sides);
      ctx.clip();
      ctx.shadowColor = "transparent";
      ctx.strokeStyle = "rgba(100, 64, 28, 0.07)";
      ctx.lineWidth = 1;
      for (let gy = -size; gy < size; gy += 5) {
        ctx.beginPath();
        ctx.moveTo(-size, gy);
        ctx.lineTo(size, gy + 1.5);
        ctx.stroke();
      }
      ctx.restore();

      this._polyPath(ctx, size, sides);
      ctx.lineWidth = 2;
      ctx.strokeStyle = "rgba(80, 48, 18, 0.38)";
      ctx.stroke();

      // Painted inset letter
      const fontSize = Math.floor(size * 1.15);
      ctx.font = `700 ${fontSize}px Georgia, serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "rgba(70, 40, 12, 0.3)";
      ctx.fillText(this.label, 1, 2);
      ctx.fillStyle = pal.letter;
      ctx.fillText(this.label, 0, 0);
    }

    drawSchoolhouse(ctx) {
      const blockColors = [
        { bg: "#e84040", fg: "#ffffff" },
        { bg: "#2979d4", fg: "#ffffff" },
        { bg: "#f0aa18", fg: "#3a2200" },
        { bg: "#2eaa52", fg: "#ffffff" },
        { bg: "#9b4fd4", fg: "#ffffff" },
        { bg: "#e8682a", fg: "#ffffff" },
      ];
      const col = blockColors[this._letterIndex() % blockColors.length];
      const half = Math.min(this.width, this.height) * 0.44;
      const bevel = 5;
      const r = 4;

      // Drop shadow
      ctx.shadowColor = "rgba(20, 10, 0, 0.3)";
      ctx.shadowBlur = 8;
      ctx.shadowOffsetX = 2;
      ctx.shadowOffsetY = 5;
      ctx.fillStyle = col.bg;
      roundRect(ctx, -half, -half, half * 2, half * 2, r);
      ctx.fill();

      // Bevel highlights and shadows clipped to the block face
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
      ctx.save();
      roundRect(ctx, -half, -half, half * 2, half * 2, r);
      ctx.clip();
      ctx.fillStyle = "rgba(255, 255, 255, 0.28)";
      ctx.fillRect(-half, -half, half * 2, bevel);        // top highlight
      ctx.fillRect(-half, -half, bevel, half * 2);         // left highlight
      ctx.fillStyle = "rgba(0, 0, 0, 0.2)";
      ctx.fillRect(-half, half - bevel, half * 2, bevel);  // bottom shadow
      ctx.fillRect(half - bevel, -half, bevel, half * 2);  // right shadow
      ctx.restore();

      // Border
      ctx.lineWidth = 2;
      ctx.strokeStyle = "rgba(0, 0, 0, 0.3)";
      roundRect(ctx, -half, -half, half * 2, half * 2, r);
      ctx.stroke();

      // Letter
      ctx.fillStyle = col.fg;
      ctx.font = `900 ${Math.floor(half * 1.55)}px "Arial Black", Impact, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(this.label, 0, 2);
    }

    toJSON() {
      const json = { ...this.baseJSON(), label: this.label, palette: this.palette, magnetStyle: this.magnetStyle };
      if (this.sizePreset) json.sizePreset = this.sizePreset;
      return json;
    }
  }

  class StickyNote extends FridgeItem {
    constructor(options) {
      super({ ...options, type: "note" });
      this.text = options.text ?? "milk\nbread\ncall mom";
      this.paperStyle = paperStyleById(options.paperStyle).id;
      this.color = options.color || paperStyleById(this.paperStyle).fill || "#ffe98a";
      this.isEditing = false;
      this.sizePreset = options.sizePreset || null;
    }

    // Hit-test the pencil edit button (top-right corner).
    pencilContains(point) {
      const local = this._toLocal(point);
      const pcx = this.width / 2 - 13;
      const pcy = -this.height / 2 + 13;
      return Math.sqrt((local.x - pcx) ** 2 + (local.y - pcy) ** 2) <= 14;
    }

    _drawPencilBtn(ctx) {
      const cx = this.width / 2 - 13;
      const cy = -this.height / 2 + 13;
      // Three opacity states: resting, hovered, and active.
      const alpha = this.isEditing ? 0.85 : (this.isHovered ? 0.55 : 0.2);

      ctx.save();
      ctx.globalAlpha = alpha;

      // Soft circular background
      ctx.fillStyle = this.isEditing
        ? "rgba(100, 75, 18, 0.55)"
        : "rgba(100, 75, 18, 0.28)";
      ctx.beginPath();
      ctx.arc(cx, cy, 9, 0, Math.PI * 2);
      ctx.fill();

      // Edit marker.
      ctx.fillStyle = this.isEditing ? "rgba(255, 242, 185, 0.98)" : "rgba(255, 255, 255, 0.95)";
      ctx.font = "bold 11px 'Segoe UI Symbol', 'Apple Symbols', system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("E", cx, cy + 1);

      ctx.restore();
    }

    getTextLayout() {
      const style = paperStyleById(this.paperStyle);
      if (style.checklist) {
        return { padH: 27, padTop: 22, padBot: 25, fontSize: 21, lineHeight: 27, bulletGap: 18 };
      }
      if (style.indexCard) {
        return { padH: 20, padTop: 25, padBot: 22, fontSize: 20, lineHeight: 25, bulletGap: 0 };
      }
      return { padH: 17, padTop: 20, padBot: 28, fontSize: 24, lineHeight: 29, bulletGap: 0 };
    }

    getTextColor() {
      return paperStyleById(this.paperStyle).ink || "rgba(47, 43, 33, 0.82)";
    }

    _resolvedPaperStyle() {
      const style = paperStyleById(this.paperStyle);
      if (!style.variants) {
        return style;
      }
      const index = Math.abs(Math.round(this.x + this.y + this.rotation * 1000)) % style.variants.length;
      return { ...style, ...style.variants[index] };
    }

    _drawPaperBackground(ctx, x, y) {
      const style = this._resolvedPaperStyle();
      const radius = style.indexCard ? 5 : 0;
      const fold = 22;
      const gradient = ctx.createLinearGradient(x, y, x + this.width, y + this.height);
      gradient.addColorStop(0, style.light || "#fff2a8");
      gradient.addColorStop(1, style.fill || this.color);

      ctx.shadowColor = "rgba(31, 37, 34, 0.2)";
      ctx.shadowBlur = 16;
      ctx.shadowOffsetY = 9;
      ctx.fillStyle = gradient;
      if (radius) {
        roundRect(ctx, x, y, this.width, this.height, radius);
        ctx.fill();
      } else {
        ctx.fillRect(x, y, this.width, this.height);
      }

      ctx.shadowColor = "transparent";

      if (!style.lines && !style.checklist && !style.indexCard) {
        ctx.fillStyle = style.fold || "rgba(207, 169, 56, 0.22)";
        ctx.beginPath();
        ctx.moveTo(x + this.width - fold, y + this.height);
        ctx.lineTo(x + this.width, y + this.height - fold);
        ctx.lineTo(x + this.width, y + this.height);
        ctx.closePath();
        ctx.fill();
      }

      this._drawPaperDetails(ctx, x, y, style);

      ctx.strokeStyle = style.border || "rgba(121, 95, 37, 0.12)";
      ctx.lineWidth = 1;
      if (radius) {
        roundRect(ctx, x + 0.5, y + 0.5, this.width - 1, this.height - 1, radius);
        ctx.stroke();
      } else {
        ctx.strokeRect(x + 0.5, y + 0.5, this.width - 1, this.height - 1);
      }
    }

    _drawPaperDetails(ctx, x, y, style) {
      const layout = this.getTextLayout();

      if (style.lines || style.checklist) {
        ctx.strokeStyle = style.rule || "rgba(121, 95, 37, 0.14)";
        ctx.lineWidth = 1;
        for (let lineY = y + layout.padTop + layout.lineHeight - 3; lineY < y + this.height - 14; lineY += layout.lineHeight) {
          ctx.beginPath();
          ctx.moveTo(x + 12, lineY + 0.5);
          ctx.lineTo(x + this.width - 12, lineY + 0.5);
          ctx.stroke();
        }
      }

      if (style.margin) {
        ctx.strokeStyle = style.margin;
        ctx.beginPath();
        ctx.moveTo(x + layout.padH - 7.5, y + 10);
        ctx.lineTo(x + layout.padH - 7.5, y + this.height - 10);
        ctx.stroke();
      }

      if (style.checklist) {
        ctx.strokeStyle = "rgba(71, 86, 78, 0.26)";
        ctx.lineWidth = 1.4;
        for (let boxY = y + layout.padTop + 3; boxY < y + this.height - 26; boxY += layout.lineHeight) {
          ctx.strokeRect(x + 12.5, boxY + 0.5, 9, 9);
        }
      }

      if (style.indexCard) {
        ctx.fillStyle = "rgba(255, 255, 255, 0.22)";
        ctx.fillRect(x + 1, y + 1, this.width - 2, 18);
      }
    }

    draw(ctx) {
      this.beginDraw(ctx);

      const x = -this.width / 2;
      const y = -this.height / 2;
      const layout = this.getTextLayout();
      const style = paperStyleById(this.paperStyle);

      this._drawPaperBackground(ctx, x, y);

      // Text is hidden while the textarea overlay handles editing.
      if (!this.isEditing) {
        ctx.fillStyle = this.getTextColor();
        ctx.font = `${layout.fontSize}px ${handwrittenFont}`;
        ctx.textAlign = "left";
        ctx.textBaseline = "top";

        const blocks = String(this.text).split("\n");
        let lineY = y + layout.padTop;
        for (const block of blocks) {
          const textX = x + layout.padH + layout.bulletGap;
          const lines = wrapText(ctx, block, this.width - layout.padH * 2 - layout.bulletGap);
          for (const line of lines.length ? lines : [""]) {
            if (lineY < y + this.height - layout.padBot) {
              if (style.checklist && line) {
                ctx.fillStyle = "rgba(71, 86, 78, 0.5)";
                ctx.fillText("*", x + 16, lineY);
                ctx.fillStyle = this.getTextColor();
              }
              ctx.fillText(line, textX, lineY);
            }
            lineY += layout.lineHeight;
          }
        }
      }

      // Subtle dashed border around the text area while in edit mode
      if (this.isEditing) {
        ctx.save();
        ctx.setLineDash([4, 3]);
        ctx.strokeStyle = "rgba(71, 86, 78, 0.38)";
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x + layout.padH - 2, y + layout.padTop - 2, this.width - layout.padH * 2 + 4, this.height - layout.padTop - layout.padBot + 4);
        ctx.setLineDash([]);
        ctx.restore();
      }

      this._drawDeleteBtn(ctx);
      this._drawPencilBtn(ctx);

      this.endDraw(ctx);
    }

    toJSON() {
      const json = { ...this.baseJSON(), text: this.text, color: this.color, paperStyle: this.paperStyle };
      if (this.sizePreset) json.sizePreset = this.sizePreset;
      return json;
    }
  }

  class PolaroidItem extends FridgeItem {
    constructor(options) {
      super({ ...options, type: "polaroid" });
      this.src = options.src;
      this.caption = options.caption || "";
      this.frameStyle = options.frameStyle || "polaroid";
      this.sizePreset = options.sizePreset || null;
      // Magnetic frame gets a stable palette assigned at creation time
      if (options.framePaletteIndex !== undefined) {
        this.framePaletteIndex = options.framePaletteIndex;
      } else if (this.frameStyle === "magnetic-frame") {
        this.framePaletteIndex = _photoFrameCounter % magneticFramePalettes.length;
      } else {
        this.framePaletteIndex = 0;
      }
      _photoFrameCounter += 1;
      this.image = new Image();
      this.imageLoaded = false;
      this.image.onload = () => {
        this.imageLoaded = true;
      };
      this.image.src = this.src;
      this.isHovered = false;
    }

    // Shared image helper

    _drawImage(ctx, imageX, imageY, imageWidth, imageHeight) {
      if (this.imageLoaded) {
        const ratio = Math.max(imageWidth / this.image.width, imageHeight / this.image.height);
        const drawWidth = this.image.width * ratio;
        const drawHeight = this.image.height * ratio;
        ctx.save();
        ctx.beginPath();
        ctx.rect(imageX, imageY, imageWidth, imageHeight);
        ctx.clip();
        ctx.drawImage(
          this.image,
          imageX + (imageWidth - drawWidth) / 2,
          imageY + (imageHeight - drawHeight) / 2,
          drawWidth,
          drawHeight
        );
        ctx.restore();
      } else {
        ctx.fillStyle = "rgba(31, 37, 34, 0.45)";
        ctx.font = "14px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("loading", imageX + imageWidth / 2, imageY + imageHeight / 2);
      }
    }

    // Per-style draw methods

    _drawPolaroid(ctx) {
      const x = -this.width / 2;
      const y = -this.height / 2;
      const border = 14;
      const bottom = 36;
      const imageX = x + border;
      const imageY = y + border;
      const imageWidth = this.width - border * 2;
      const imageHeight = this.height - border - bottom;

      ctx.shadowColor = "rgba(31, 37, 34, 0.24)";
      ctx.shadowBlur = 18;
      ctx.shadowOffsetY = 10;
      ctx.fillStyle = "#fbfaf4";
      ctx.fillRect(x, y, this.width, this.height);

      ctx.shadowColor = "transparent";
      ctx.fillStyle = "#e9ebe6";
      ctx.fillRect(imageX, imageY, imageWidth, imageHeight);

      this._drawImage(ctx, imageX, imageY, imageWidth, imageHeight);

      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      if (this.caption) {
        ctx.fillStyle = "rgba(47, 43, 33, 0.76)";
        ctx.font = `18px ${handwrittenFont}`;
        ctx.fillText(this.caption, 0, y + this.height - 18, this.width - 24);
      } else if (this.isHovered) {
        ctx.fillStyle = "rgba(47, 43, 33, 0.30)";
        ctx.font = `11px ${handwrittenFont}`;
        ctx.fillText("double-click to caption", 0, y + this.height - 18, this.width - 24);
      }
    }

    _drawSnapshot(ctx) {
      const x = -this.width / 2;
      const y = -this.height / 2;
      const border = 6;
      const bottom = 14;
      const imageX = x + border;
      const imageY = y + border;
      const imageWidth = this.width - border * 2;
      const imageHeight = this.height - border - bottom;

      // Subtle drop shadow
      ctx.shadowColor = "rgba(31, 37, 34, 0.18)";
      ctx.shadowBlur = 10;
      ctx.shadowOffsetY = 5;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(x, y, this.width, this.height);
      ctx.shadowColor = "transparent";

      // Slight gloss sheen on border
      const sheenGrad = ctx.createLinearGradient(x, y, x, y + this.height * 0.5);
      sheenGrad.addColorStop(0, "rgba(255,255,255,0.55)");
      sheenGrad.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = sheenGrad;
      ctx.fillRect(x, y, this.width, this.height);

      // Light placeholder before image loads
      ctx.fillStyle = "#e8eae5";
      ctx.fillRect(imageX, imageY, imageWidth, imageHeight);

      this._drawImage(ctx, imageX, imageY, imageWidth, imageHeight);

      // Hairline border around the whole frame
      ctx.strokeStyle = "rgba(31, 37, 34, 0.12)";
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, this.width - 1, this.height - 1);

      if (this.caption) {
        ctx.fillStyle = "rgba(47, 43, 33, 0.64)";
        ctx.font = `10px ${handwrittenFont}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(this.caption, 0, y + this.height - 7, this.width - 12);
      }
    }

    _drawStickerCutout(ctx) {
      const x = -this.width / 2;
      const y = -this.height / 2;
      const radius = 14;
      const stroke = 12;

      // Hard sticker-style drop shadow
      ctx.shadowColor = "rgba(31, 37, 34, 0.28)";
      ctx.shadowBlur = 6;
      ctx.shadowOffsetY = 3;

      // White rounded-rect outline (the sticker border)
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = stroke;
      ctx.lineJoin = "round";
      roundRect(ctx, x + stroke / 2, y + stroke / 2, this.width - stroke, this.height - stroke, radius);
      ctx.stroke();
      ctx.shadowColor = "transparent";

      // Image fill clipped to the same rounded rect.
      ctx.save();
      roundRect(ctx, x + stroke / 2, y + stroke / 2, this.width - stroke, this.height - stroke, radius);
      ctx.clip();
      const imageX = x + stroke / 2;
      const imageY = y + stroke / 2;
      const imageWidth = this.width - stroke;
      const imageHeight = this.height - stroke;
      ctx.fillStyle = "#e8eae5";
      ctx.fillRect(imageX, imageY, imageWidth, imageHeight);
      this._drawImage(ctx, imageX, imageY, imageWidth, imageHeight);
      ctx.restore();
    }

    _drawTapeCorners(ctx) {
      const x = -this.width / 2;
      const y = -this.height / 2;
      const border = 5;
      const imageX = x + border;
      const imageY = y + border;
      const imageWidth = this.width - border * 2;
      const imageHeight = this.height - border * 2;

      // Thin photo border
      ctx.shadowColor = "rgba(31, 37, 34, 0.2)";
      ctx.shadowBlur = 12;
      ctx.shadowOffsetY = 6;
      ctx.fillStyle = "#f9f7ee";
      ctx.fillRect(x, y, this.width, this.height);
      ctx.shadowColor = "transparent";

      ctx.fillStyle = "#e4e6e1";
      ctx.fillRect(imageX, imageY, imageWidth, imageHeight);
      this._drawImage(ctx, imageX, imageY, imageWidth, imageHeight);

      // Draw masking-tape strips on each corner (rotated rectangles)
      const tapeW = 36;
      const tapeH = 12;
      const tapeColor = "rgba(216, 204, 160, 0.82)";
      const tapeStroke = "rgba(180, 165, 110, 0.35)";
      const corners = [
        { cx: x + 16, cy: y + 16,               angle: -Math.PI / 4 },
        { cx: x + this.width - 16, cy: y + 16,               angle:  Math.PI / 4 },
        { cx: x + 16, cy: y + this.height - 16,  angle:  Math.PI / 4 },
        { cx: x + this.width - 16, cy: y + this.height - 16,  angle: -Math.PI / 4 },
      ];
      for (const corner of corners) {
        ctx.save();
        ctx.translate(corner.cx, corner.cy);
        ctx.rotate(corner.angle);
        // Tape body
        ctx.fillStyle = tapeColor;
        ctx.fillRect(-tapeW / 2, -tapeH / 2, tapeW, tapeH);
        // Tape parallel lines (fabric texture hint)
        ctx.strokeStyle = tapeStroke;
        ctx.lineWidth = 0.8;
        for (let lx = -tapeW / 2 + 5; lx < tapeW / 2; lx += 7) {
          ctx.beginPath();
          ctx.moveTo(lx, -tapeH / 2);
          ctx.lineTo(lx, tapeH / 2);
          ctx.stroke();
        }
        ctx.restore();
      }
    }

    _drawMagneticFrame(ctx) {
      const x = -this.width / 2;
      const y = -this.height / 2;
      const frameW = 16;
      const radius = 10;
      const palette = magneticFramePalettes[this.framePaletteIndex % magneticFramePalettes.length];
      const imageX = x + frameW;
      const imageY = y + frameW;
      const imageWidth = this.width - frameW * 2;
      const imageHeight = this.height - frameW * 2;

      // Drop shadow
      ctx.shadowColor = "rgba(31, 37, 34, 0.30)";
      ctx.shadowBlur = 14;
      ctx.shadowOffsetY = 7;

      // Outer frame body
      roundRect(ctx, x, y, this.width, this.height, radius);
      ctx.fillStyle = palette.outer;
      ctx.fill();
      ctx.shadowColor = "transparent";

      // Inner bevel highlight (top-left)
      const bevelLight = ctx.createLinearGradient(x, y, x + frameW, y + frameW);
      bevelLight.addColorStop(0, "rgba(255,255,255,0.38)");
      bevelLight.addColorStop(1, "rgba(255,255,255,0.0)");
      roundRect(ctx, x, y, this.width, this.height, radius);
      ctx.fillStyle = bevelLight;
      ctx.fill();

      // Inner bevel shadow (bottom-right)
      const bevelShadow = ctx.createLinearGradient(x + this.width, y + this.height, x + this.width - frameW, y + this.height - frameW);
      bevelShadow.addColorStop(0, "rgba(0,0,0,0.22)");
      bevelShadow.addColorStop(1, "rgba(0,0,0,0.0)");
      roundRect(ctx, x, y, this.width, this.height, radius);
      ctx.fillStyle = bevelShadow;
      ctx.fill();

      // Image area inset
      ctx.save();
      ctx.beginPath();
      ctx.rect(imageX, imageY, imageWidth, imageHeight);
      ctx.clip();
      ctx.fillStyle = "#e4e6e1";
      ctx.fillRect(imageX, imageY, imageWidth, imageHeight);
      this._drawImage(ctx, imageX, imageY, imageWidth, imageHeight);
      ctx.restore();

      // Inner rim (dark edge between frame and image)
      ctx.strokeStyle = palette.inner;
      ctx.lineWidth = 2;
      ctx.strokeRect(imageX - 1, imageY - 1, imageWidth + 2, imageHeight + 2);
    }

    // Main draw dispatch

    draw(ctx) {
      this.beginDraw(ctx);
      switch (this.frameStyle) {
        case "snapshot":       this._drawSnapshot(ctx);      break;
        case "sticker-cutout": this._drawStickerCutout(ctx); break;
        case "tape-corners":   this._drawTapeCorners(ctx);   break;
        case "magnetic-frame": this._drawMagneticFrame(ctx); break;
        default:               this._drawPolaroid(ctx);      break;
      }
      this._drawDeleteBtn(ctx);
      this.endDraw(ctx);
    }

    toJSON() {
      const json = {
        ...this.baseJSON(),
        src: this.src,
        caption: this.caption,
        frameStyle: this.frameStyle,
        framePaletteIndex: this.framePaletteIndex,
      };
      if (this.sizePreset) json.sizePreset = this.sizePreset;
      return json;
    }
  }

  class EmojiSticker extends FridgeItem {
    constructor(options) {
      super({ ...options, type: "emoji" });
      this.emoji = options.emoji || "?";
    }

    draw(ctx) {
      this.beginDraw(ctx);
      const size = Math.floor(Math.min(this.width, this.height) * 0.78);
      ctx.shadowColor = "rgba(31, 37, 34, 0.22)";
      ctx.shadowBlur = 8;
      ctx.shadowOffsetY = 4;
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#000000";
      ctx.font = `${size}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(this.emoji, 0, size * 0.06);
      this._drawDeleteBtn(ctx);
      this.endDraw(ctx);
    }

    toJSON() {
      return { ...this.baseJSON(), emoji: this.emoji };
    }
  }

  class DryEraseBoardItem extends FridgeItem {
    constructor(options) {
      super({ ...options, type: "dryEraseBoard" });
      this.strokes = Array.isArray(options.strokes) ? options.strokes : [];
      this._liveStroke = null; // in-progress stroke, not persisted
    }

    clearStrokes() {
      this.strokes = [];
      this._liveStroke = null;
    }

    draw(ctx) {
      this.beginDraw(ctx);

      const x = -this.width / 2;
      const y = -this.height / 2;
      const frame = 14;

      // Drop shadow + dark frame
      ctx.shadowColor = "rgba(31, 37, 34, 0.32)";
      ctx.shadowBlur = 20;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 10;
      ctx.fillStyle = "#4a4f4c";
      roundRect(ctx, x, y, this.width, this.height, 8);
      ctx.fill();

      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;

      // Frame inner highlight (top bevel)
      ctx.fillStyle = "rgba(255, 255, 255, 0.10)";
      ctx.fillRect(x + 3, y + 3, this.width - 6, 5);

      // White glossy board surface
      const sx = x + frame;
      const sy = y + frame;
      const sw = this.width - frame * 2;
      const sh = this.height - frame * 2;

      const surfaceGrad = ctx.createLinearGradient(sx, sy, sx, sy + sh);
      surfaceGrad.addColorStop(0, "#ffffff");
      surfaceGrad.addColorStop(0.5, "#f8faf8");
      surfaceGrad.addColorStop(1, "#edf0ec");
      ctx.fillStyle = surfaceGrad;
      ctx.fillRect(sx, sy, sw, sh);

      // Glossy sheen overlay
      const sheenGrad = ctx.createLinearGradient(sx, sy, sx + sw * 0.4, sy + sh * 0.45);
      sheenGrad.addColorStop(0, "rgba(255, 255, 255, 0.48)");
      sheenGrad.addColorStop(1, "rgba(255, 255, 255, 0)");
      ctx.fillStyle = sheenGrad;
      ctx.fillRect(sx, sy, sw, sh);

      // Clip and render strokes inside the surface
      ctx.save();
      ctx.beginPath();
      ctx.rect(sx, sy, sw, sh);
      ctx.clip();
      ctx.globalAlpha = 0.9;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      const allStrokes = this._liveStroke
        ? [...this.strokes, this._liveStroke]
        : this.strokes;

      for (const stroke of allStrokes) {
        if (!stroke.points || stroke.points.length === 0) continue;
        ctx.beginPath();
        ctx.strokeStyle = stroke.color;
        ctx.fillStyle = stroke.color;
        ctx.lineWidth = stroke.size;

        if (stroke.points.length === 1) {
          // Single-tap dot
          ctx.arc(sx + stroke.points[0].x, sy + stroke.points[0].y, stroke.size / 2, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.moveTo(sx + stroke.points[0].x, sy + stroke.points[0].y);
          for (let i = 1; i < stroke.points.length; i++) {
            ctx.lineTo(sx + stroke.points[i].x, sy + stroke.points[i].y);
          }
          ctx.stroke();
        }
      }

      ctx.restore();

      // Surface border
      ctx.strokeStyle = "rgba(31, 37, 34, 0.07)";
      ctx.lineWidth = 1;
      ctx.strokeRect(sx + 0.5, sy + 0.5, sw - 1, sh - 1);

      this._drawDeleteBtn(ctx);
      this.endDraw(ctx);
    }

    toJSON() {
      return {
        ...this.baseJSON(),
        strokes: this.strokes.map((s) => ({
          color: s.color,
          size: s.size,
          points: s.points.map((p) => ({
            x: Math.round(p.x * 10) / 10,
            y: Math.round(p.y * 10) / 10,
          })),
        })),
      };
    }
  }

  function itemFromJSON(data) {
    if (!data || typeof data !== "object") {
      return null;
    }

    if (data.type === "alphabet") {
      return new AlphabetMagnet(data);
    }

    if (data.type === "emoji") {
      return new EmojiSticker(data);
    }

    if (data.type === "note") {
      return new StickyNote(data);
    }

    if (data.type === "polaroid") {
      return new PolaroidItem(data);
    }

    if (data.type === "dryEraseBoard") {
      return new DryEraseBoardItem(data);
    }

    return null;
  }

  window.FridgeItems = {
    AlphabetMagnet,
    DryEraseBoardItem,
    EmojiSticker,
    FridgeItem,
    MAGNET_SIZE_PRESETS,
    MAGNET_STYLES,
    NOTE_SIZE_PRESETS,
    PAPER_STYLES,
    PHOTO_SIZE_PRESETS,
    PHOTO_STYLES,
    PolaroidItem,
    StickyNote,
    handwrittenFont,
    itemFromJSON,
    magnetPalettes,
    paperStyleById,
  };
})();
