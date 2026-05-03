(function () {
  const FRIDGE_SURFACE_THEMES = [
    {
      id: "classic-white",
      label: "Classic White",
      swatch: "#f6f8f4",
      stops: [[0, "#fbfcf8"], [0.28, "#e6ece7"], [0.5, "#f3f6f1"], [0.78, "#d8dfda"], [1, "#fafbf7"]],
      lineAlpha: 0.12,
      lineA: "#ffffff",
      lineB: "#7f8a84",
      cap: "rgba(255, 255, 255, 0.28)",
      texture: "clean-enamel",
    },
    {
      id: "brushed-stainless",
      label: "Brushed Stainless",
      swatch: "#b8c0bf",
      stops: [[0, "#f0f3f2"], [0.16, "#aeb8b7"], [0.32, "#d8dddd"], [0.52, "#9ca8a7"], [0.74, "#e4e7e6"], [1, "#b5bfbe"]],
      lineAlpha: 0.18,
      lineA: "#ffffff",
      lineB: "#596766",
      cap: "rgba(255, 255, 255, 0.2)",
      texture: "brushed-metal",
    },
    {
      id: "retro-mint",
      label: "Retro Mint",
      swatch: "#aad7c4",
      stops: [[0, "#dff4e9"], [0.3, "#a8d8c4"], [0.58, "#ccebdd"], [0.82, "#8fc8b2"], [1, "#e5f6ee"]],
      lineAlpha: 0.1,
      lineA: "#f6fff9",
      lineB: "#5f9c87",
      cap: "rgba(255, 255, 255, 0.24)",
      texture: "glossy-enamel",
    },
    {
      id: "warm-cream",
      label: "Warm Cream",
      swatch: "#f1e3c4",
      stops: [[0, "#fffaf0"], [0.26, "#eadbbd"], [0.55, "#f8edcf"], [0.78, "#dccaa6"], [1, "#fff7e6"]],
      lineAlpha: 0.1,
      lineA: "#fffef8",
      lineB: "#a28d67",
      cap: "rgba(255, 255, 255, 0.22)",
      texture: "warm-enamel",
    },
    {
      id: "slightly-worn-white",
      label: "Slightly Worn White",
      swatch: "#edf0e9",
      stops: [[0, "#fbfbf4"], [0.25, "#dde3db"], [0.52, "#f0f2eb"], [0.78, "#d2d9d1"], [1, "#f8f7ee"]],
      lineAlpha: 0.1,
      lineA: "#ffffff",
      lineB: "#727d76",
      cap: "rgba(255, 255, 255, 0.24)",
      texture: "worn-enamel",
    },
  ];

  function fridgeSurfaceThemeById(id) {
    return FRIDGE_SURFACE_THEMES.find((theme) => theme.id === id) || FRIDGE_SURFACE_THEMES[0];
  }

  window.FridgeThemes = {
    FRIDGE_SURFACE_THEMES,
    fridgeSurfaceThemeById,
  };
})();
