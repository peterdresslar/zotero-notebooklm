import { isChromeCompanionVersionCompatible } from "./compatibility.js";

const ZOTERO_BASE = "http://127.0.0.1:23119/notebooklm";
const ZOTERO_REQUEST_HEADERS = { "zotero-allowed-request": "1" };
const RELEASES_URL =
  "https://github.com/peterdresslar/zotero-gemini-notebook/releases";
const ZOTERO_JSON_HEADERS = {
  ...ZOTERO_REQUEST_HEADERS,
  "Content-Type": "application/json",
};

let stagedItems = [];
let selectedIds = new Set();
let companionCompatible = false;

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

  companionCompatible = false;
  updateImportBtn();

  try {
    const res = await fetch(`${ZOTERO_BASE}/pending`, {
      headers: ZOTERO_REQUEST_HEADERS,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const installedVersion = chrome.runtime.getManifest().version;

    if (
      !isChromeCompanionVersionCompatible(
        data.compatibleChromeExtensionVersions,
        installedVersion,
      )
    ) {
      showIncompatibleCompanionWarning(installedVersion);
      return;
    }

    companionCompatible = true;
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
    companionCompatible = false;
    stagedItems = [];
    selectedIds.clear();
    dot.className = "status-dot error";
    statusText.textContent = "Cannot reach Zotero — is it running?";
    emptyState.innerHTML =
      "<p><b>Zotero not detected</b></p><p>Make sure Zotero is open and the Gemini Notebook plugin is installed.</p>";
    emptyState.style.display = "";
    itemList.style.display = "none";
    instructions.style.display = "none";
    updateImportBtn();
  }
}

function showIncompatibleCompanionWarning(installedVersion) {
  const dot = document.getElementById("zotero-dot");
  const statusText = document.getElementById("zotero-status");
  const emptyState = document.getElementById("empty-state");
  const itemList = document.getElementById("item-list");
  const instructions = document.getElementById("instructions");

  dot.className = "status-dot error";
  statusText.textContent = "Chrome companion update required";
  emptyState.replaceChildren();

  const heading = document.createElement("p");
  const strong = document.createElement("b");
  strong.textContent = `Version ${installedVersion} is not compatible with the installed Zotero plugin`;
  heading.appendChild(strong);

  const guidance = document.createElement("p");
  guidance.textContent =
    "Remove this Chrome extension, download the latest companion, and install it again.";

  const releaseLink = document.createElement("a");
  releaseLink.href = RELEASES_URL;
  releaseLink.target = "_blank";
  releaseLink.rel = "noopener noreferrer";
  releaseLink.textContent = "View releases and install the newest companion";

  emptyState.append(heading, guidance, releaseLink);
  emptyState.style.display = "";
  itemList.style.display = "none";
  instructions.style.display = "none";
  companionCompatible = false;
  stagedItems = [];
  selectedIds.clear();
  updateImportBtn();
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
  btn.disabled = count === 0 || !companionCompatible;
  btn.textContent =
    count > 0
      ? `Import ${count} source${count !== 1 ? "s" : ""} to Gemini Notebook`
      : "Import to Gemini Notebook";
}

async function doImport() {
  if (!companionCompatible) return;

  const btn = document.getElementById("import-btn");
  const progress = document.getElementById("progress");
  const progressFill = document.getElementById("progress-fill");
  const progressText = document.getElementById("progress-text");

  const toImport = stagedItems.filter((i) => selectedIds.has(i.attachmentId));
  if (toImport.length === 0) return;

  btn.disabled = true;
  btn.textContent = "Importing...";
  progress.classList.add("visible");

  // Check we're on NotebookLM. The content script can create a new notebook
  // from the listing page before uploading.
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!isNotebookLMPage(tab?.url)) {
    progressText.textContent =
      "Please open Gemini Notebook before importing sources.";
    progressFill.style.width = "0%";
    btn.disabled = false;
    btn.textContent = `Import ${toImport.length} sources to Gemini Notebook`;
    return;
  }

  // Verify content script is loaded
  try {
    await chrome.tabs.sendMessage(tab.id, { action: "ping" });
  } catch {
    progressText.textContent =
      "Content script not loaded — please refresh the Gemini Notebook tab and try again.";
    progressFill.style.width = "0%";
    btn.disabled = false;
    btn.textContent = `Import ${toImport.length} sources to Gemini Notebook`;
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
        headers: ZOTERO_JSON_HEADERS,
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
  progressText.textContent = `Uploading ${files.length} files to Gemini Notebook...`;
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
      await fetch(`${ZOTERO_BASE}/clear`, {
        method: "DELETE",
        headers: ZOTERO_REQUEST_HEADERS,
      });
    } catch {
      // Non-critical
    }

    // Close the popup so NotebookLM regains focus and Angular can run.
    // A small delay lets the sendMessage dispatch first.
    setTimeout(() => window.close(), 200);
  } catch (e) {
    progressText.textContent = `Error uploading to Gemini Notebook: ${e.message}`;
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

function isNotebookLMPage(url) {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.hostname === "notebooklm.google.com";
  } catch {
    return false;
  }
}

function esc(s) {
  const d = document.createElement("div");
  d.textContent = s || "";
  return d.innerHTML;
}
