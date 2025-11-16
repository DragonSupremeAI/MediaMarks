const grid = document.getElementById("grid");
const searchInput = document.getElementById("search");
const clearAllBtn = document.getElementById("clear-all");
const tagCloud = document.getElementById("tag-cloud");
const cardTpl = document.getElementById("card-tpl");

const editModeBtn = document.getElementById("edit-mode");
const deleteModeBtn = document.getElementById("delete-mode");
const manualPanel = document.getElementById("manual-add-panel");
const globalEditPanel = document.getElementById("global-edit-panel");
const globalImg = document.getElementById("global-img");
const globalTitle = document.getElementById("global-title");
const globalTags = document.getElementById("global-tags");

const manualUrl = document.getElementById("manual-url");
const manualImg = document.getElementById("manual-img");
const manualTitle = document.getElementById("manual-title");
const manualTags = document.getElementById("manual-tags");
const addManualBtn = document.getElementById("add-manual");
const cancelManualBtn = document.getElementById("cancel-manual");
const cancelEditBtn = document.getElementById("cancel-edit");

let items = [];
let activeTag = null;
let searchTerm = "";
let batchMode = null; // "edit" | "delete" | null
let manualPanelOpen = false;
let editPanelOpen = false;

function storageGet(defaults) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(defaults, (result) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
        return;
      }
      resolve(result);
    });
  });
}

function storageSet(values) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set(values, () => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
        return;
      }
      resolve();
    });
  });
}

(async function init() {
  await loadItems();
  renderAll();
  manualPanel.hidden = true;
  globalEditPanel.hidden = true;

  searchInput.addEventListener("input", () => {
    searchTerm = searchInput.value.trim().toLowerCase();
    renderAll();
  });

  clearAllBtn.addEventListener("click", async () => {
    if (!confirm("Delete ALL saved items? This cannot be undone.")) return;
    items = [];
    await storageSet({ items });
    renderAll();
  });

  editModeBtn.addEventListener("click", async () => {
    if (!editPanelOpen) {
      if (manualPanelOpen) {
        closeManualPanel();
      }
      if (batchMode === "delete") {
        batchMode = null;
        renderAll();
      }
      batchMode = "edit";
      editPanelOpen = true;
      globalEditPanel.hidden = false;
      editModeBtn.textContent = "Submit";
      renderAll();
      globalTitle.focus();
      return;
    }

    const checked = getCheckedIds();
    if (!checked.length) {
      alert("Select at least one item to update.");
      return;
    }

    const titleVal = globalTitle.value.trim();
    const imgVal = globalImg.value.trim();
    const tagsVal = parseTags(globalTags.value);

    items = items.map(it => {
      if (checked.includes(it.id)) {
        return {
          ...it,
          title: titleVal || it.title,
          img: imgVal || it.img,
          tags: tagsVal.length ? Array.from(new Set([...(it.tags || []), ...tagsVal])) : it.tags
        };
      }
      return it;
    });
    await storageSet({ items });

    closeEditPanel();
    renderAll();
  });

  deleteModeBtn.addEventListener("click", async () => {
    if (batchMode === "delete") {
      const checked = getCheckedIds();
      if (checked.length && confirm(`Delete ${checked.length} items?`)) {
        items = items.filter(it => !checked.includes(it.id));
        await storageSet({ items });
      }
      batchMode = null;
      renderAll();
    } else {
      if (editPanelOpen) {
        closeEditPanel();
      }
      if (manualPanelOpen) {
        closeManualPanel();
      }
      batchMode = "delete";
      renderAll();
    }
  });

  addManualBtn.addEventListener("click", async () => {
    if (!manualPanelOpen) {
      if (editPanelOpen) {
        closeEditPanel();
        renderAll();
      } else if (batchMode === "delete") {
        batchMode = null;
        renderAll();
      }
      manualPanel.hidden = false;
      manualPanelOpen = true;
      addManualBtn.textContent = "Submit";
      manualUrl.focus();
      return;
    }

    const url = manualUrl.value.trim();
    const img = manualImg.value.trim();
    if (!url || !img) {
      alert("Both Video URL and Image URL are required.");
      return;
    }

    const payload = {
      id: makeId(),
      url,
      img,
      title: manualTitle.value.trim() || url,
      tags: parseTags(manualTags.value),
      sourcePageUrl: url,
      createdAt: Date.now()
    };

    // Save
    items.unshift(payload);
    await storageSet({ items });

    // Reset form / close panel
    closeManualPanel();

    renderAll();
  });

  cancelManualBtn.addEventListener("click", () => {
    if (!manualPanelOpen) return;
    closeManualPanel();
  });

  cancelEditBtn.addEventListener("click", () => {
    closeEditPanel();
    renderAll();
  });

  // Message listener for populating add panel
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'POPULATE_ADD_PANEL') {
      const { imageUrl, url, title } = msg.data;
      manualImg.value = imageUrl;
      manualUrl.value = url || '';
      manualTitle.value = title || '';
      // Open the panel
      if (!manualPanelOpen) {
        manualPanel.hidden = false;
        manualPanelOpen = true;
        addManualBtn.textContent = "Submit";
      }
      manualUrl.focus();
    }
  });

  await loadItems();
  renderAll();

  // Listen for changes to the items in storage
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.items) {
      items = changes.items.newValue || [];
      renderAll();
    }
  });

  // Initialise import/export buttons if they exist in the gallery HTML.
  const exportBtn = document.getElementById('export-btn');
  const importInput = document.getElementById('import-btn');
  if (exportBtn) {
    exportBtn.addEventListener('click', async () => {
      const data = await storageGet({ items: [] });
      const blob = new Blob([JSON.stringify(data.items, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'mediamarks-backup.json';
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  }
  if (importInput) {
    importInput.addEventListener('change', async (event) => {
      const file = event.target.files[0];
      if (!file) return;
      const text = await file.text();
      try {
        const imported = JSON.parse(text);
        if (!Array.isArray(imported)) {
          alert('Imported file does not contain an array of bookmarks.');
          return;
        }
        const data = await storageGet({ items: [] });
        const localItems = data.items;
        let changed = false;
        imported.forEach(item => {
          if (!localItems.some(x => x.id === item.id)) {
            localItems.push(item);
            changed = true;
          }
        });
        if (changed) {
          await storageSet({ items: localItems });
          renderAll();
        }
        event.target.value = '';
        alert(`${imported.length} bookmarks imported`);
      } catch (err) {
        console.error(err);
        alert('Failed to import bookmarks: ' + err.message);
      }
    });
  }
})();  // End of the IIFE

async function loadItems() {
  try {
    const data = await storageGet({ items: [] });
    items = data.items;
  } catch (err) {
    console.error("Failed to load saved items from storage", err);
    items = [];
  }
}

function renderAll() {
  const filtered = filterItems(items, searchTerm, activeTag);
  renderTagCloud(items, activeTag);
  renderGrid(filtered);
}

function filterItems(list, term, tag) {
  return list.filter(it => {
    const hitTag = tag ? (it.tags || []).map(t => t.toLowerCase()).includes(tag.toLowerCase()) : true;
    const hay = `${it.title} ${it.url} ${(it.tags || []).join(" ")}`.toLowerCase();
    const hitTerm = term ? hay.includes(term) : true;
    return hitTag && hitTerm;
  });
}

function renderTagCloud(list, active) {
  const counts = new Map();
  list.forEach(it => (it.tags || []).forEach(t => counts.set(t, (counts.get(t) || 0) + 1)));

  tagCloud.innerHTML = "";
  const all = document.createElement("span");
  all.className = `tag ${active ? "" : "active"}`;
  all.textContent = "All";
  all.title = "Show all items";
  all.addEventListener("click", () => {
    activeTag = null;
    renderAll();
  });
  tagCloud.appendChild(all);

  Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 100)
    .forEach(([tag, count]) => {
      const span = document.createElement("span");
      span.className = `tag ${active === tag ? "active" : ""}`;
      span.textContent = `${tag} (${count})`;
      span.title = `Filter by ${tag}`;
      span.addEventListener("click", () => {
        activeTag = active === tag ? null : tag;
        renderAll();
      });
      tagCloud.appendChild(span);
    });
}

function renderGrid(list) {
  grid.innerHTML = "";
  if (list.length === 0) {
    const empty = document.createElement("div");
    empty.style.opacity = ".7";
    empty.textContent = "No items yet. Save by clicking “＋ Save” on a linked image.";
    grid.appendChild(empty);
    return;
  }

  list.forEach(item => {
    const node = cardTpl.content.firstElementChild.cloneNode(true);

    const aThumb = node.querySelector(".thumb");
    const img = node.querySelector("img");
    const titleDiv = node.querySelector(".title");
    const linkA = node.querySelector(".link");

    if (batchMode) {
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.className = "select-card";
      cb.dataset.id = item.id;
      cb.style.margin = "6px";
      node.prepend(cb);
    }

    aThumb.href = item.url;
    img.src = item.img;
    img.alt = item.title || "";
    titleDiv.textContent = item.title || "";

    linkA.href = item.url;
    linkA.textContent = truncate(item.url, 48);
    linkA.title = item.url;

    grid.appendChild(node);
  });
}

function truncate(str, n) {
  return str.length > n ? str.slice(0, n - 1) + "…" : str;
}

function parseTags(str) {
  return str
    .split(",")
    .map(s => s.trim())
    .filter(Boolean)
    .slice(0, 20);
}

function getCheckedIds() {
  return Array.from(document.querySelectorAll(".select-card:checked")).map(cb => cb.dataset.id);
}

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function resetManualForm() {
  manualUrl.value = "";
  manualImg.value = "";
  manualTitle.value = "";
  manualTags.value = "";
}

function closeManualPanel() {
  resetManualForm();
  manualPanel.hidden = true;
  manualPanelOpen = false;
  addManualBtn.textContent = "Add Entry";
}

function resetGlobalForm() {
  globalTitle.value = "";
  globalImg.value = "";
  globalTags.value = "";
}

function closeEditPanel() {
  resetGlobalForm();
  editPanelOpen = false;
  batchMode = null;
  globalEditPanel.hidden = true;
  editModeBtn.textContent = "Edit";
}
