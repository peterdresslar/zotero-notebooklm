const ZOTERO_BASE = "http://127.0.0.1:23119/notebooklm";

let stagedItems = [];
let selectedIds = new Set();

document.addEventListener("DOMContentLoaded", () => {
  loadPending();
  document.getElementById("refresh-btn").addEventListener("click", loadPending);
  document.getElementById("import-btn").addEventListener("click", doImport);
});

async function loadPending() {
  const dot = document.getElementById("zotero-dot");
  const statusText = document.getElementById("zotero-status");
  const emptyState = document.getElementById("empty-state");
  const itemList = document.getElementById("item-list");
  const instructions = document.getElementById("instructions");

  try {
    const res = await fetch(`${ZOTERO_BASE}/pending`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    dot.className = "status-dot connected";
    statusText.textContent = `Zotero connected — ${data.count} source${data.count !== 1 ? "s" : ""} staged`;

    stagedItems = data.items || [];
    selectedIds = new Set(stagedItems.map((i) => i.attachmentId));

    if (stagedItems.length === 0) {
      emptyState.innerHTML =
        "<p><b>No sources staged</b></p><p>Use the Zotero plugin to select and export sources first.</p>";
      emptyState.style.display = "";
      itemList.style.display = "none";
      instructions.style.display = "none";
    } else {
      emptyState.style.display = "none";
      itemList.style.display = "";
      instructions.style.display = "";
      renderItems();
    }
    updateImportBtn();
  } catch {
    dot.className = "status-dot error";
    statusText.textContent = "Cannot reach Zotero — is it running?";
    emptyState.innerHTML =
      "<p><b>Zotero not detected</b></p><p>Make sure Zotero is open and the NotebookLM plugin is installed.</p>";
    emptyState.style.display = "";
    itemList.style.display = "none";
    instructions.style.display = "none";
    updateImportBtn();
  }
}

function renderItems() {
  const list = document.getElementById("item-list");
  list.innerHTML = "";

  for (const item of stagedItems) {
    const row = document.createElement("div");
    row.className = "item-row";

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = selectedIds.has(item.attachmentId);
    cb.style.pointerEvents = "none";

    const info = document.createElement("div");
    info.className = "item-info";
    info.innerHTML = `<div class="item-title" title="${esc(item.title)}">${esc(item.title)}</div>
      <div class="item-meta">${esc(item.creators)} · ${esc(item.year)}</div>`;

    const type = document.createElement("span");
    type.className = "item-type";
    type.textContent = getTypeLabel(item.contentType);

    row.appendChild(cb);
    row.appendChild(info);
    row.appendChild(type);

    row.addEventListener("click", () => {
      if (selectedIds.has(item.attachmentId)) {
        selectedIds.delete(item.attachmentId);
        cb.checked = false;
      } else {
        selectedIds.add(item.attachmentId);
        cb.checked = true;
      }
      updateImportBtn();
    });
    row.style.cursor = "pointer";

    list.appendChild(row);
  }
}

function updateImportBtn() {
  const btn = document.getElementById("import-btn");
  const count = selectedIds.size;
  btn.disabled = count === 0;
  btn.textContent =
    count > 0
      ? `Import ${count} source${count !== 1 ? "s" : ""} to NotebookLM`
      : "Import to NotebookLM";
}

async function doImport() {
  const btn = document.getElementById("import-btn");
  const progress = document.getElementById("progress");
  const progressFill = document.getElementById("progress-fill");
  const progressText = document.getElementById("progress-text");

  const toImport = stagedItems.filter((i) => selectedIds.has(i.attachmentId));
  if (toImport.length === 0) return;

  btn.disabled = true;
  btn.textContent = "Importing...";
  progress.classList.add("visible");

  // Check we're on NotebookLM
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url?.includes("notebooklm.google.com")) {
    progressText.textContent =
      "Please navigate to notebooklm.google.com first!";
    progressFill.style.width = "0%";
    btn.disabled = false;
    btn.textContent = `Import ${toImport.length} sources to NotebookLM`;
    return;
  }

  // Verify content script is loaded
  try {
    await chrome.tabs.sendMessage(tab.id, { action: "ping" });
  } catch {
    progressText.textContent =
      "Content script not loaded — please refresh the NotebookLM tab and try again.";
    progressFill.style.width = "0%";
    btn.disabled = false;
    btn.textContent = `Import ${toImport.length} sources to NotebookLM`;
    return;
  }

  // Phase 1: Fetch ALL files from Zotero first
  const files = [];
  for (let i = 0; i < toImport.length; i++) {
    const item = toImport[i];
    progressText.textContent = `Fetching from Zotero: ${item.fileName} (${i + 1}/${toImport.length})`;
    progressFill.style.width = `${((i + 0.5) / toImport.length) * 50}%`; // first 50% is fetching

    try {
      const fileRes = await fetch(`${ZOTERO_BASE}/file`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attachmentId: item.attachmentId }),
      });
      if (!fileRes.ok) throw new Error(`Failed to fetch ${item.fileName}`);
      const fileData = await fileRes.json();

      files.push({
        fileName: fileData.fileName,
        contentType: fileData.contentType,
        base64Data: fileData.data,
      });
    } catch (e) {
      progressText.textContent = `Error fetching ${item.fileName}: ${e.message}`;
      btn.disabled = false;
      btn.textContent = `Retry Import`;
      return;
    }
  }

  // Phase 2: Send ALL files to content script in one batch, then close
  // the popup so the page regains focus.  NotebookLM's Angular lifecycle
  // is paused while the extension popup holds focus — closing the popup
  // lets Angular create the file input immediately.
  progressText.textContent = `Uploading ${files.length} files to NotebookLM...`;
  progressFill.style.width = "60%";

  try {
    // Fire the message — don't await the response.  The content script
    // keeps running after the popup closes.
    chrome.tabs.sendMessage(tab.id, {
      action: "uploadBatch",
      files: files,
    });

    // Clear staged items from Zotero optimistically
    try {
      await fetch(`${ZOTERO_BASE}/clear`, { method: "DELETE" });
    } catch {
      // Non-critical
    }

    // Close the popup so NotebookLM regains focus and Angular can run.
    // A small delay lets the sendMessage dispatch first.
    setTimeout(() => window.close(), 200);
  } catch (e) {
    progressText.textContent = `Error uploading to NotebookLM: ${e.message}`;
    btn.disabled = false;
    btn.textContent = `Retry Import`;
  }
}

function getTypeLabel(contentType) {
  if (!contentType) return "?";
  if (contentType.includes("pdf")) return "PDF";
  if (contentType.includes("word")) return "DOCX";
  if (contentType.includes("html")) return "HTML";
  if (contentType.includes("text")) return "TXT";
  return "FILE";
}

function esc(s) {
  const d = document.createElement("div");
  d.textContent = s || "";
  return d.innerHTML;
}
