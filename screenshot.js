// screenshot.js - Injected script for screenshot selection

let overlay = null;
let startX, startY, endX, endY;
let isSelecting = false;

function initScreenshot() {
  overlay = document.createElement('div');
  overlay.style.position = 'fixed';
  overlay.style.top = '0';
  overlay.style.left = '0';
  overlay.style.width = '100%';
  overlay.style.height = '100%';
  overlay.style.backgroundColor = 'rgba(0,0,0,0.3)';
  overlay.style.zIndex = '999999';
  overlay.style.cursor = 'crosshair';
  document.body.appendChild(overlay);

  overlay.addEventListener('mousedown', startSelection);
  overlay.addEventListener('mousemove', updateSelection);
  overlay.addEventListener('mouseup', finishSelection);
}

function startSelection(e) {
  isSelecting = true;
  startX = e.clientX;
  startY = e.clientY;
  endX = startX;
  endY = startY;
  drawSelection();
}

function updateSelection(e) {
  if (!isSelecting) return;
  endX = e.clientX;
  endY = e.clientY;
  drawSelection();
}

function drawSelection() {
  const rect = overlay.querySelector('.selection-rect');
  if (!rect) {
    const r = document.createElement('div');
    r.className = 'selection-rect';
    r.style.position = 'absolute';
    r.style.border = '2px solid #fff';
    r.style.backgroundColor = 'rgba(255,255,255,0.2)';
    overlay.appendChild(r);
  }
  const r = overlay.querySelector('.selection-rect');
  const left = Math.min(startX, endX);
  const top = Math.min(startY, endY);
  const width = Math.abs(endX - startX);
  const height = Math.abs(endY - startY);
  r.style.left = left + 'px';
  r.style.top = top + 'px';
  r.style.width = width + 'px';
  r.style.height = height + 'px';
}

async function finishSelection(e) {
  if (!isSelecting) return;
  isSelecting = false;
  const left = Math.min(startX, endX);
  const top = Math.min(startY, endY);
  const width = Math.abs(endX - startX);
  const height = Math.abs(endY - startY);
  if (width < 10 || height < 10) {
    cancelScreenshot();
    return;
  }
  // Capture screenshot
  const response = await chrome.runtime.sendMessage({ type: 'CAPTURE_SCREENSHOT' });
  if (response.dataURL) {
    cropAndUpload(response.dataURL, left, top, width, height);
  }
  removeOverlay();
}

function cancelScreenshot() {
  removeOverlay();
}

function removeOverlay() {
  if (overlay) {
    document.body.removeChild(overlay);
    overlay = null;
  }
}

async function cropAndUpload(dataURL, x, y, w, h) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const img = new Image();
  img.onload = async () => {
    canvas.width = w;
    canvas.height = h;
    ctx.drawImage(img, x, y, w, h, 0, 0, w, h);
    const croppedDataURL = canvas.toDataURL('image/png');
    // Send to background for upload
    const response = await chrome.runtime.sendMessage({ type: 'UPLOAD_SCREENSHOT', dataURL: croppedDataURL });
    if (response.directLink) {
      // Populate popup
      chrome.runtime.sendMessage({ type: 'POPULATE_POPUP', imageUrl: response.directLink, url: window.location.href, title: document.title });
    }
  };
  img.src = dataURL;
}



chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'START_SCREENSHOT') {
    initScreenshot();
  }
});

// Start immediately
initScreenshot();