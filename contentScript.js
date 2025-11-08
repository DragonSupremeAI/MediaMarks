// Inject "+ Save" button on hover for linked images
const BTN_CLASS = "vv-save-btn";
const WRAP_CLASS = "vv-rel";
const HOVER_CLASS = "vv-hover";
const processedAnchors = new WeakSet();
const MEDIA_SELECTOR = "img, picture img, video";
const DATA_ATTRS = ["data-img-url", "data-thumbnail-url", "data-thumb", "data-src", "data-lazy-src", "data-original"];
const DATA_ATTR_SELECTOR = DATA_ATTRS.map(attr => `[${attr}]`).join(",");
const BACKGROUND_SCAN_LIMIT = 12;
let toastEl = null;

init();

function init() {
  injectToast();
  hydrateExistingAnchors(document);
  observeMutations();
}

function observeMutations() {
  const obs = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      if (mutation.type === "childList" && mutation.target.nodeType === Node.ELEMENT_NODE) {
        const targetEl = mutation.target;
        if (targetEl.matches?.("a[href]")) {
          processAnchor(targetEl);
        } else {
          const ancestorAnchor = targetEl.closest?.("a[href]");
          if (ancestorAnchor) processAnchor(ancestorAnchor);
        }
      }

      mutation.addedNodes.forEach(node => {
        if (node.nodeType !== Node.ELEMENT_NODE) return;
        hydrateExistingAnchors(node);
      });
    }
  });
  obs.observe(document.documentElement, { childList: true, subtree: true });
}

function hydrateExistingAnchors(root) {
  if (root.matches?.("a[href]")) {
    processAnchor(root);
  }

  root.querySelectorAll?.("a[href]").forEach(processAnchor);
}

function processAnchor(anchor) {
  if (!anchor.isConnected || processedAnchors.has(anchor)) return;

  const media = findMediaElement(anchor);
  if (!media) return;

  processedAnchors.add(anchor);

  ensureRelativePosition(anchor);
  anchor.classList.add(HOVER_CLASS);

  const btn = buildButton(anchor, media);
  anchor.appendChild(btn);
}

function findMediaElement(anchor) {
  const media = anchor.querySelector(MEDIA_SELECTOR);
  if (media) return media;

  const dataNode = findDataAttrNode(anchor);
  if (dataNode) {
    return dataNode;
  }

  const backgroundNode = findBackgroundImageNode(anchor);
  if (backgroundNode) return backgroundNode;

  return null;
}

function findDataAttrNode(anchor) {
  for (const attr of DATA_ATTRS) {
    if (anchor.hasAttribute(attr)) return anchor;
  }
  if (!DATA_ATTR_SELECTOR) return null;
  return anchor.querySelector(DATA_ATTR_SELECTOR);
}

function findBackgroundImageNode(anchor) {
  const candidates = [anchor, ...anchor.querySelectorAll("*")];
  for (let i = 0; i < candidates.length && i < BACKGROUND_SCAN_LIMIT; i++) {
    const node = candidates[i];
    if (!(node instanceof Element)) continue;

    if (node.style?.backgroundImage && node.style.backgroundImage !== "none") {
      return node;
    }

    const computed = window.getComputedStyle(node);
    if (computed.backgroundImage && computed.backgroundImage !== "none") {
      return node;
    }
  }
  return null;
}

function ensureRelativePosition(anchor) {
  const computed = window.getComputedStyle(anchor);
  if (computed.position === "static") {
    anchor.classList.add(WRAP_CLASS);
  }
}

function buildButton(anchor, media) {
  const btn = document.createElement("span");
  btn.className = BTN_CLASS;
  btn.setAttribute("role", "button");
  btn.tabIndex = 0;
  btn.textContent = "＋ Save";
  btn.title = "Save to MediaMaker Gallery";

  const activate = async (event) => {
    event.preventDefault();
    event.stopPropagation();

    const url = absolutizeUrl(anchor.getAttribute("href") || anchor.href);
    const img = resolveMediaUrl(media);

    if (!url || !img) {
      showToast("Couldn’t detect link or image to save.");
      return;
    }

    const payload = {
      id: makeId(),
      url,
      img,
      title: getTitle(media, anchor, url),
      sourcePageUrl: location.href,
      tags: [],
      createdAt: Date.now()
    };

    try {
      await chrome.runtime.sendMessage({ type: "SAVE_ITEM_FROM_CONTEXT", payload });
      showToast("Saved to VidTab Gallery ✔️");
    } catch (err) {
      showToast("Couldn’t save. Check extension permissions.");
      console.error(err);
    }
  };

  btn.addEventListener("click", activate);
  btn.addEventListener("keydown", e => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      activate(e);
    }
  });

  return btn;
}

function resolveMediaUrl(media) {
  if (!media) return null;

  // If we fabricated a ghost <img>, just take its src directly.
  if (!media.isConnected && media.tagName === "IMG") {
    return absolutizeUrl(media.src);
  }

  if ("currentSrc" in media && media.currentSrc) {
    return absolutizeUrl(media.currentSrc);
  }

  if ("src" in media && media.src) {
    return absolutizeUrl(media.src);
  }

  if (media.tagName === "VIDEO") {
    const poster = media.getAttribute("poster");
    if (poster) return absolutizeUrl(poster);
  }

  const dataSrcAttr = ["data-src", "data-lazy-src", "data-original", "data-thumb", "data-thumbnail-url"];
  for (const attr of dataSrcAttr) {
    const val = media.getAttribute?.(attr);
    if (val) return absolutizeUrl(val);
  }

  const bgImage = window.getComputedStyle(media).backgroundImage;
  if (bgImage && bgImage !== "none") {
    const match = bgImage.match(/url\((["']?)(.*?)\1\)/);
    if (match && match[2]) {
      return absolutizeUrl(match[2]);
    }
  }

  return null;
}

function getTitle(media, anchor, fallbackUrl) {
  return (
    media.getAttribute?.("alt") ||
    media.getAttribute?.("aria-label") ||
    anchor.getAttribute("title") ||
    anchor.textContent?.trim() ||
    document.title ||
    fallbackUrl
  );
}

function absolutizeUrl(u) {
  if (!u) return null;
  try {
    return new URL(u, location.href).toString();
  } catch {
    return u;
  }
}

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function injectToast() {
  if (toastEl) return;
  toastEl = document.createElement("div");
  toastEl.id = "vv-toast";
  document.documentElement.appendChild(toastEl);
}

function showToast(msg, ms = 1800) {
  if (!toastEl) injectToast();
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  setTimeout(() => toastEl && toastEl.classList.remove("show"), ms);
}
