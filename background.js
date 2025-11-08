// background.js (MV3 service worker)

const GALLERY_PATH = "gallery.html";const API_BASE = 'http://localhost:3000';
const USER_ID = 'default-user';


// Create context menu to save from linked images
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "vidtab-save-image-link",
    title: "Save to MediaMaker Gallery",
    contexts: ["image"]
  });
});

// Clicking the extension icon opens gallery
chrome.action.onClicked.addListener(openGalleryTab);

// Handle messages from popup or content script
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "OPEN_GALLERY") {
    openGalleryTab().then(() => sendResponse({ ok: true }));
    return true; // keep port open for async
  }

  if (msg?.type === "SAVE_ITEM_FROM_CONTEXT") {
    addItem(msg.payload)
      .then(() => sendResponse({ ok: true }))
      .catch(e => sendResponse({ ok: false, error: String(e) }));
    return true; // keep port open for async
  }
});

// Context menu click handler
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== "vidtab-save-image-link") return;

  const payload = {
    id: makeId(),
    url: info.linkUrl || info.pageUrl,
    img: info.srcUrl,
    title: tab?.title || info.linkUrl || info.pageUrl,
    sourcePageUrl: info.pageUrl,
    tags: [],
    createdAt: Date.now()
  };
  await addItem(payload);
});

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function addItem(item) {
  const data = await chrome.storage.local.get({ items: [] });
  const items = data.items;

  // Prevent duplicates
  if (!items.some(x => x.url === item.url && x.img === item.img)) {
    items.unshift(item);
    await chrome.storage.local.set({ items });  // Persist the item remotely for cross‑device synchronisation.
  sendItemToServer(item).catch(err => console.error(err));
  }
}

async function openGalleryTab() {
  const url = chrome.runtime.getURL(GALLERY_PATH);
  const tabs = await chrome.tabs.query({ url });

  if (tabs.length > 0) {
    await chrome.tabs.update(tabs[0].id, { active: true });
  } else {
    await chrome.tabs.create({ url });
  }
}


/**
 * Send a bookmark to the backend API. The server will upsert the record based on the item id and user_id.
 * Any network errors are logged but do not prevent local storage from being updated.
 */
async function sendItemToServer(item) {
  const payload = { ...item, user_id: USER_ID };
  try {
    await fetch(`${API_BASE}/bookmarks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch (err) {
    console.error('Failed to sync item to server', err);
  }
}

/**
 * Fetch all bookmarks for this user from the backend and merge them into local storage.
 * New items from the server are appended to the local collection. Existing items are left untouched.
 */
async function syncFromServer() {
  try {
    const res = await fetch(`${API_BASE}/bookmarks?user_id=${encodeURIComponent(USER_ID)}`);
    const data = await res.json();
    const remoteItems = data.items || [];
    const localData = await chrome.storage.local.get({ items: [] });
    const localItems = localData.items;
    let changed = false;
    remoteItems.forEach(remote => {
      if (!localItems.some(local => local.id === remote.id)) {
        localItems.push(remote);
        changed = true;
      }
    });
    if (changed) {
      await chrome.storage.local.set({ items: localItems });
    }
  } catch (err) {
    console.error('Failed to sync bookmarks from server', err);
  }
}

// Kick off a sync when the extension is installed or the browser starts.
chrome.runtime.onInstalled.addListener(() => {
  syncFromServer();
});

chrome.runtime.onStartup.addListener(() => {
  syncFromServer();
});
