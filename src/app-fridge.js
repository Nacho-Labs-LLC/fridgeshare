(function () {
  function namedBoardFromPath() {
    const match = location.pathname.match(/^\/b\/([a-z0-9][a-z0-9-]{2,62}[a-z0-9])$/i);
    return match ? match[1].toLowerCase() : "";
  }

  async function loadBootstrap() {
    try {
      const response = await fetch(`/api/bootstrap?path=${encodeURIComponent(location.pathname)}`, {
        headers: { Accept: "application/json" },
      });
      if (!response.ok) {
        return null;
      }
      return response.json();
    } catch {
      return null;
    }
  }

  function getBoardLocator(bootstrap = null) {
    const boardId = bootstrap?.boardId || namedBoardFromPath();
    const endpoint = bootstrap?.apiBase || "/api/boards";
    const current = location.hash.replace(/^#/, "").trim();
    const editToken = /^[a-z0-9_-]{24,96}$/i.test(current) ? current : "";
    return { boardId, editToken, endpoint };
  }

  window.addEventListener("DOMContentLoaded", async () => {
    const bootstrap = await loadBootstrap();
    const { boardId, editToken, endpoint } = getBoardLocator(bootstrap);
    window.openFridge = new window.FridgeCanvas(document.querySelector("#fridge-canvas"), {
      editToken,
      fridgeId: boardId,
      mode: "remote",
      persistence: new window.FridgeStorage.BoardPersistence({ boardId, editToken, endpoint }),
    });
  });
})();
