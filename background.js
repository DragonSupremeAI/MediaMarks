// background.js (MV3 service worker)

const GALLERY_PATH = "gallery.html";const API_BASE = 'http://localhost:3000';
const USER_ID = 'default-user';

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

// Create context menu to save from linked images
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "vidtab-save-image-link",
    title: "Save to MediaMaker Gallery",
    contexts: ["image"]
  });
  chrome.contextMenus.create({
    id: "vidtab-screenshot",
    title: "Take Screenshot and Save",
    contexts: ["page"]
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

  if (msg?.type === "CAPTURE_SCREENSHOT") {
    chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataURL) => {
      sendResponse({ dataURL });
    });
    return true;
  }

  if (msg?.type === "POPULATE_POPUP") {
    openGalleryTab().then(() => {
      // Send to gallery tab after a delay to ensure it's loaded
      setTimeout(() => {
        chrome.tabs.query({ url: chrome.runtime.getURL(GALLERY_PATH) }, (tabs) => {
          if (tabs.length > 0) {
            chrome.tabs.sendMessage(tabs[0].id, { type: 'POPULATE_ADD_PANEL', data: msg });
          }
        });
      }, 1000);
    });
    return true;
  }

  if (msg?.type === "UPLOAD_SCREENSHOT") {
    uploadToPostimg(msg.dataURL).then(directLink => {
      sendResponse({ directLink });
    });
    return true;
  }
});

// Context menu click handler
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "vidtab-save-image-link") {
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
  } else if (info.menuItemId === "vidtab-screenshot") {
    // Inject screenshot script
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["screenshot.js"]
    });
  }
});

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function addItem(item) {
  const data = await storageGet({ items: [] });
  const items = data.items;

  // Prevent duplicates
  if (!items.some(x => x.url === item.url && x.img === item.img)) {
    items.unshift(item);
    await storageSet({ items });  // Persist the item remotely for cross-device synchronisation.
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
    if (!res.ok) {
      throw new Error(`Server responded with ${res.status}`);
    }
    const contentType = res.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      throw new Error('Server did not return JSON');
    }
    const data = await res.json();
    const remoteItems = data.items || [];
    const localData = await storageGet({ items: [] });
    const localItems = localData.items;
    let changed = false;
    remoteItems.forEach(remote => {
      if (!localItems.some(local => local.id === remote.id)) {
        localItems.push(remote);
        changed = true;
      }
    });
    if (changed) {
      await storageSet({ items: localItems });
    }
  } catch (err) {
    console.error('Failed to sync bookmarks from server', err);
  }
}

// Kick off a sync when the extension is installed or the browser starts.
// Disabled server sync to avoid errors when server is not running.
// chrome.runtime.onInstalled.addListener(() => {
//   syncFromServer();
// });

// chrome.runtime.onStartup.addListener(() => {
//   syncFromServer();
// });

async function uploadToPostimg(dataURL) {
  try {
    // Convert dataURL to blob
    const response = await fetch(dataURL);
    const blob = await response.blob();
    const formData = new FormData();
    // First, get token
    const tokenResponse = await fetch('https://postimages.org/');
    const tokenText = await tokenResponse.text();
    const tokenMatch = tokenText.match(/"token"[^}]*"([^"]*)"/);
    const token = tokenMatch ? tokenMatch[1] : '';
    formData.append('file', blob, 'screenshot.png');
    formData.append('token', token);
    formData.append('expire', '0');
    formData.append('numfiles', '1');
    formData.append('optsize', '0');
    formData.append('session_upload', Date.now().toString());
    formData.append('upload_referer', 'aHR0cHM6Ly9wb3N0aW1nLmNjLw==');
    formData.append('upload_session', 'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX');
    formData.append('adult', '0');

    const uploadResponse = await fetch('https://postimages.org/json/rr', {
      method: 'POST',
      body: formData
    });
    const result = await uploadResponse.json();
    return result.url ? 'https:' + result.url : null;
  } catch (err) {
    console.error('Upload failed', err);
    return null;
  }
}
