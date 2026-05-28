(function () {
  const listEl = document.querySelector("#board-list");
  const titleInput = document.querySelector("#board-title");
  const slugInput = document.querySelector("#board-slug");
  const adminInput = document.querySelector("#admin-token");
  const createButton = document.querySelector("#create-board");
  const statusEl = document.querySelector("#directory-status");

  function setStatus(message) {
    statusEl.textContent = message || "";
  }

  function randomBoardName() {
    const adjectives = ["sunny", "shared", "family", "kitchen", "weekend", "garden", "studio", "daily"];
    const nouns = ["board", "notes", "menu", "plans", "photos", "list", "fridge", "hub"];
    const suffix = Math.floor(100 + Math.random() * 900);
    const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    return `${adjective}-${noun}-${suffix}`;
  }

  function boardPath(slug) {
    return `/b/${slug}`;
  }

  function boardUrl(slug) {
    return new URL(boardPath(slug), location.origin).href;
  }

  function formatTimestamp(value) {
    if (!value) {
      return "";
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "";
    }
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date);
  }

  async function copyText(value) {
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

  function slugify(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
  }

  function headers() {
    const token = adminInput.value.trim();
    return {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(token ? { "X-Selfhost-Admin-Token": token } : {}),
    };
  }

  async function loadBoards() {
    const response = await fetch("/api/selfhost/boards", { headers: headers() });
    if (!response.ok) {
      setStatus("Could not load boards.");
      return;
    }
    const data = await response.json();
    renderBoards(data.boards || []);
    adminInput.hidden = !data.adminRequired;
    if (data.adminRequired && !data.canEdit) {
      setStatus("Enter the admin token to show edit links.");
    }
  }

  function renderBoards(boards) {
    listEl.textContent = "";
    if (boards.length === 0) {
      const empty = document.createElement("p");
      empty.className = "board-empty";
      empty.textContent = "No boards yet.";
      listEl.appendChild(empty);
      return;
    }

    for (const board of boards) {
      const item = document.createElement("article");
      item.className = "board-row";

      const text = document.createElement("div");
      text.className = "board-row__details";
      const title = document.createElement("h2");
      title.textContent = board.title;
      const path = document.createElement("p");
      path.className = "board-row__path";
      path.textContent = boardPath(board.slug);
      text.append(title, path);

      const updated = formatTimestamp(board.updatedAt);
      if (updated) {
        const meta = document.createElement("p");
        meta.className = "board-row__updated";
        meta.textContent = `Updated ${updated}`;
        text.appendChild(meta);
      }

      const actions = document.createElement("div");
      actions.className = "board-row__actions";

      const view = document.createElement("a");
      view.href = boardPath(board.slug);
      view.textContent = "View";

      const edit = document.createElement("a");
      edit.href = board.editUrl || boardPath(board.slug);
      edit.textContent = "Edit";
      if (!board.editUrl) {
        edit.setAttribute("aria-disabled", "true");
        edit.className = "is-disabled";
        edit.addEventListener("click", (event) => {
          event.preventDefault();
          setStatus("Edit link is unavailable. Enter the admin token if this server requires one.");
        });
      }

      const copy = document.createElement("button");
      copy.type = "button";
      copy.textContent = "Copy View";
      copy.addEventListener("click", async () => {
        try {
          await copyText(boardUrl(board.slug));
          setStatus(`Copied ${boardPath(board.slug)}.`);
        } catch (error) {
          setStatus("Could not copy the board URL.");
        }
      });

      const copyEdit = document.createElement("button");
      copyEdit.type = "button";
      copyEdit.textContent = "Copy Edit";
      copyEdit.disabled = !board.editUrl;
      copyEdit.addEventListener("click", async () => {
        if (!board.editUrl) {
          setStatus("Edit link is unavailable. Enter the admin token if this server requires one.");
          return;
        }
        try {
          await copyText(new URL(board.editUrl, location.origin).href);
          setStatus(`Copied edit link for ${boardPath(board.slug)}.`);
        } catch (error) {
          setStatus("Could not copy the edit link.");
        }
      });

      const del = document.createElement("button");
      del.type = "button";
      del.className = "board-row__delete";
      del.textContent = "Delete";
      del.addEventListener("click", () => deleteBoard(board, del));

      actions.append(view, edit, copy, copyEdit, del);
      item.append(text, actions);
      listEl.appendChild(item);
    }
  }

  async function createBoard() {
    const title = titleInput.value.trim();
    const slug = slugify(slugInput.value || title);
    if (!slug) {
      setStatus("Enter a board name.");
      return;
    }

    setStatus("Creating board...");
    const originalText = createButton.textContent;
    createButton.disabled = true;
    createButton.textContent = "Creating...";

    try {
      const response = await fetch("/api/selfhost/boards", {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ title, slug }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setStatus(data.error || "Could not create board.");
        createButton.disabled = false;
        createButton.textContent = originalText;
        return;
      }

      location.href = data.url;
    } catch (error) {
      setStatus("Could not create board.");
      createButton.disabled = false;
      createButton.textContent = originalText;
    }
  }

  async function deleteBoard(board, button) {
    const confirmed = window.confirm(`Delete "${board.title}"? This cannot be undone.`);
    if (!confirmed) {
      return;
    }

    setStatus(`Deleting ${boardPath(board.slug)}...`);

    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = "Deleting...";

    try {
      const response = await fetch(`/api/selfhost/boards/${board.slug}`, {
        method: "DELETE",
        headers: headers(),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setStatus(data.error || "Could not delete board.");
        button.disabled = false;
        button.textContent = originalText;
        return;
      }

      setStatus(`Deleted ${boardPath(board.slug)}.`);
      await loadBoards();
    } catch (error) {
      setStatus("Could not delete board.");
      button.disabled = false;
      button.textContent = originalText;
    }
  }

  titleInput.addEventListener("input", () => {
    if (!slugInput.dataset.touched) {
      slugInput.value = slugify(titleInput.value);
    }
  });
  slugInput.addEventListener("input", () => {
    slugInput.dataset.touched = "true";
    slugInput.value = slugify(slugInput.value);
  });
  createButton.addEventListener("click", createBoard);
  adminInput.addEventListener("change", loadBoards);
  const initialName = randomBoardName();
  titleInput.value = initialName;
  slugInput.value = initialName;
  loadBoards();
})();
