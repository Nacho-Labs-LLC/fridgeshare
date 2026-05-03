(function () {
  const alphabet = "0123456789abcdefghijklmnopqrstuvwxyz";

  function randomId(length = 12) {
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
  }

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
    } catch (error) {
      return null;
    }
  }

  function getNamedBoardLocator(boardId, bootstrap = null) {
    const current = location.hash.replace(/^#/, "").trim();
    if (/^[a-z0-9_-]{24,96}$/i.test(current)) {
      return { boardId, editToken: current, endpoint: bootstrap?.apiBase || "/api/boards" };
    }

    return { boardId, editToken: "", endpoint: bootstrap?.apiBase || "/api/boards" };
  }

  function getBoardLocator(bootstrap = null) {
    const namedBoard = bootstrap?.boardId || namedBoardFromPath();
    if (namedBoard) {
      return getNamedBoardLocator(namedBoard, bootstrap);
    }

    const current = location.hash.replace(/^#/, "").trim();
    const match = current.match(/^([a-z0-9-]{4,64})(?:\.([a-z0-9_-]{24,96}))?$/i);
    if (match) {
      return { boardId: match[1].toLowerCase(), editToken: match[2] || "", endpoint: bootstrap?.apiBase || "/api/boards" };
    }

    const id = randomId();
    const editToken = randomId(40);
    history.replaceState(null, "", `${location.pathname}${location.search}#${id}.${editToken}`);
    return { boardId: id, editToken, endpoint: bootstrap?.apiBase || "/api/boards" };
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
