document.getElementById("open").addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "OPEN_GALLERY" });
  window.close();
});