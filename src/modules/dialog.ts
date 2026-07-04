import { config } from "../../package.json";
import { getString } from "../utils/locale";
import { isWindowAlive } from "../utils/window";
import { getLibraries, getCollectionTree, flattenTree } from "./collections";
import { getItemsForCollection, searchItems } from "./items";
import { stageItems } from "./staging";
import type { CollectionNode, ItemRow, StagedItem } from "../types";

let dialogWindow: Window | null = null;

export function openExportDialog(parentWin: Window) {
  if (isWindowAlive(dialogWindow ?? undefined)) {
    dialogWindow!.focus();
    return;
  }

  dialogWindow = parentWin.openDialog(
    `chrome://${config.addonRef}/content/notebooklm-dialog.xhtml`,
    "notebooklm-export",
    "chrome,centerscreen,resizable=yes",
  );

  // Wait for the dialog window to load before initializing
  const win = dialogWindow;
  win!.addEventListener("load", () => {
    initDialog(win!);
  });
}

interface DialogState {
  win: Window;
  doc: Document;
  libraryID: number;
  selectedCollectionId: number | null;
  flatCollections: CollectionNode[];
  items: ItemRow[];
  selectedItemIds: Set<number>;
  searchTimeout: number | null;
}

async function initDialog(win: Window) {
  const doc = win.document;

  try {
    Zotero.debug("[NotebookLM] Dialog init starting...");

    const libraries = getLibraries();
    Zotero.debug(`[NotebookLM] Found ${libraries.length} libraries`);

    const libraryID =
      libraries.length > 0 ? libraries[0].id : Zotero.Libraries.userLibraryID;
    Zotero.debug(`[NotebookLM] Using library ID: ${libraryID}`);

    const state: DialogState = {
      win,
      doc,
      libraryID,
      selectedCollectionId: null,
      flatCollections: [],
      items: [],
      selectedItemIds: new Set(),
      searchTimeout: null,
    };

    // Load collection tree
    const tree = await getCollectionTree(libraryID);
    Zotero.debug(`[NotebookLM] Got ${tree.length} top-level collections`);
    state.flatCollections = flattenTree(tree);
    Zotero.debug(
      `[NotebookLM] Flattened to ${state.flatCollections.length} total collections`,
    );
    renderCollectionList(state);

    // Pre-select current collection if user has one selected in main pane
    try {
      const zoteroPane = Zotero.getActiveZoteroPane();
      const currentCollection = zoteroPane.getSelectedCollection();
      if (currentCollection) {
        Zotero.debug(
          `[NotebookLM] Pre-selecting collection: ${currentCollection.name}`,
        );
        await selectCollection(state, currentCollection.id);
      }
    } catch {
      // No collection selected, that's fine
    }

    // Wire up search
    const searchInput = doc.getElementById(
      "notebooklm-search-input",
    ) as HTMLInputElement;
    searchInput.addEventListener("input", () => {
      if (state.searchTimeout) {
        win.clearTimeout(state.searchTimeout);
      }
      state.searchTimeout = win.setTimeout(async () => {
        const query = searchInput.value.trim();
        if (query) {
          state.selectedCollectionId = null;
          highlightCollection(state, null);
          state.items = await searchItems(state.libraryID, query);
        } else if (state.selectedCollectionId) {
          state.items = await getItemsForCollection(state.selectedCollectionId);
        } else {
          state.items = [];
        }
        state.selectedItemIds.clear();
        renderItemList(state);
        updateBottomBar(state);
      }, 300) as unknown as number;
    });

    // Wire up export button
    const exportBtn = doc.getElementById("notebooklm-export-btn")!;
    exportBtn.addEventListener("command", () => doExport(state));

    // Wire up cancel button
    const cancelBtn = doc.getElementById("notebooklm-cancel-btn")!;
    cancelBtn.addEventListener("command", () => win.close());

    Zotero.debug("[NotebookLM] Dialog init complete");
  } catch (e: any) {
    Zotero.debug(`[NotebookLM] Dialog init ERROR: ${e.message}\n${e.stack}`);
  }
}

function renderCollectionList(state: DialogState) {
  const container = state.doc.getElementById("notebooklm-collection-list")!;
  container.innerHTML = "";

  if (state.flatCollections.length === 0) {
    const msg = state.doc.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "div",
    );
    msg.className = "empty-message";
    msg.textContent = "No collections found";
    container.appendChild(msg);
    return;
  }

  for (const col of state.flatCollections) {
    const div = state.doc.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "div",
    ) as HTMLDivElement;
    div.className = "collection-item";
    div.dataset.collectionId = String(col.id);
    div.style.paddingLeft = `${8 + col.level * 16}px`;

    const nameSpan = state.doc.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "span",
    );
    nameSpan.textContent = col.name;
    div.appendChild(nameSpan);

    const countSpan = state.doc.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "span",
    );
    countSpan.className = "item-count";
    countSpan.textContent = `(${col.itemCount})`;
    div.appendChild(countSpan);

    div.addEventListener("click", () => selectCollection(state, col.id));
    container.appendChild(div);
  }
}

async function selectCollection(state: DialogState, collectionId: number) {
  state.selectedCollectionId = collectionId;
  state.selectedItemIds.clear();

  // Clear search
  const searchInput = state.doc.getElementById(
    "notebooklm-search-input",
  ) as HTMLInputElement;
  searchInput.value = "";

  highlightCollection(state, collectionId);

  state.items = await getItemsForCollection(collectionId);
  renderItemList(state);
  updateBottomBar(state);
}

function highlightCollection(state: DialogState, collectionId: number | null) {
  const container = state.doc.getElementById("notebooklm-collection-list")!;
  for (const el of Array.from(container.querySelectorAll(".collection-item"))) {
    const htmlEl = el as HTMLElement;
    if (
      collectionId !== null &&
      htmlEl.dataset.collectionId === String(collectionId)
    ) {
      htmlEl.classList.add("selected");
      htmlEl.scrollIntoView({ block: "nearest" });
    } else {
      htmlEl.classList.remove("selected");
    }
  }
}

function renderItemList(state: DialogState) {
  const container = state.doc.getElementById("notebooklm-item-list")!;
  container.innerHTML = "";

  if (state.items.length === 0) {
    const msg = state.doc.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "div",
    );
    msg.className = "empty-message";
    msg.textContent = state.selectedCollectionId
      ? "No items in this collection"
      : "Select a collection or search to view items";
    container.appendChild(msg);
    return;
  }

  for (const item of state.items) {
    const row = state.doc.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "div",
    );
    row.className = `item-row${item.hasValidAttachment ? "" : " disabled"}`;

    // Checkbox (display-only — pointer-events disabled, row click handles toggle)
    const checkbox = state.doc.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "input",
    ) as HTMLInputElement;
    checkbox.type = "checkbox";
    checkbox.disabled = !item.hasValidAttachment;
    checkbox.checked = state.selectedItemIds.has(item.id);
    checkbox.style.pointerEvents = "none";
    row.appendChild(checkbox);

    // Title
    const titleDiv = state.doc.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "div",
    ) as HTMLDivElement;
    titleDiv.className = "item-title";
    titleDiv.textContent = item.title;
    titleDiv.title = item.title;
    row.appendChild(titleDiv);

    // Creators
    const creatorsDiv = state.doc.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "div",
    ) as HTMLDivElement;
    creatorsDiv.className = "item-creators";
    creatorsDiv.textContent = item.creators;
    creatorsDiv.title = item.creators;
    row.appendChild(creatorsDiv);

    // Year
    const yearDiv = state.doc.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "div",
    );
    yearDiv.className = "item-year";
    yearDiv.textContent = item.year;
    row.appendChild(yearDiv);

    // File type badge
    const typeBadge = state.doc.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "div",
    );
    typeBadge.className = "item-type-badge";
    typeBadge.textContent = item.hasValidAttachment
      ? getTypeLabel(item.contentType!)
      : "---";
    row.appendChild(typeBadge);

    // Click anywhere on the row to toggle (if enabled)
    if (item.hasValidAttachment) {
      row.addEventListener("click", () => {
        toggleItem(state, item.id, checkbox);
      });
    }

    container.appendChild(row);
  }
}

function toggleItem(
  state: DialogState,
  itemId: number,
  checkbox: HTMLInputElement,
) {
  if (state.selectedItemIds.has(itemId)) {
    state.selectedItemIds.delete(itemId);
    checkbox.checked = false;
  } else {
    state.selectedItemIds.add(itemId);
    checkbox.checked = true;
  }
  updateBottomBar(state);
}

function getTypeLabel(contentType: string): string {
  if (contentType.includes("pdf")) return "PDF";
  if (contentType.includes("wordprocessing")) return "DOCX";
  if (contentType.includes("markdown")) return "MD";
  if (contentType.includes("plain")) return "TXT";
  return "FILE";
}

function updateBottomBar(state: DialogState) {
  const countLabel = state.doc.getElementById("notebooklm-selected-count")!;
  const exportBtn = state.doc.getElementById("notebooklm-export-btn")!;

  const count = state.selectedItemIds.size;
  countLabel.setAttribute(
    "value",
    `${count} item${count === 1 ? "" : "s"} selected`,
  );
  exportBtn.setAttribute("disabled", String(count === 0));
}

async function doExport(state: DialogState) {
  const exportBtn = state.doc.getElementById("notebooklm-export-btn")!;

  // Disable button and show progress
  exportBtn.setAttribute("disabled", "true");
  exportBtn.setAttribute("label", "Exporting...");

  // Small delay to let any pending checkbox state settle
  await new Promise((resolve) => state.win.setTimeout(resolve, 150));

  // Re-read selected items from current state (captures all clicks)
  const selectedItems: StagedItem[] = [];
  for (const item of state.items) {
    if (
      state.selectedItemIds.has(item.id) &&
      item.hasValidAttachment &&
      item.attachmentId !== null &&
      item.filePath !== null &&
      item.fileName !== null &&
      item.contentType !== null
    ) {
      selectedItems.push({
        itemId: item.id,
        title: item.title,
        creators: item.creators,
        year: item.year,
        attachmentId: item.attachmentId,
        contentType: item.contentType,
        fileName: item.fileName,
        filePath: item.filePath,
      });
    }
  }

  stageItems(selectedItems);
  state.win.close();

  // Show toast notification
  new ztoolkit.ProgressWindow(config.addonName, {
    closeOnClick: true,
    closeTime: 8000,
  })
    .createLine({
      text: `${selectedItems.length} item${selectedItems.length === 1 ? "" : "s"} staged. Open the NotebookLM extension in Chrome to create your notebook.`,
      type: "success",
      progress: 100,
    })
    .show();
}
