# Zotero → NotebookLM

A Zotero 7 plugin and Chrome extension that lets you select articles from your Zotero library and import their PDFs directly into Google NotebookLM — no manual file wrangling required.

<p align="center">
  <img src="public/zotero-notebooklm.png" alt="Chrome extension popup showing 8 Zotero sources staged for import to NotebookLM" width="400">
</p>

## Why?

Zotero stores PDFs in opaque, key-based folder names. Manually gathering files from a subcollection and uploading them to NotebookLM is tedious and error-prone. This tool automates the entire workflow: browse your collections in Zotero, pick your sources, and push them to NotebookLM with two clicks.

## How It Works

The system has two parts:

1. **Zotero Plugin** — Adds an "Export to NotebookLM" dialog to Zotero's Tools menu. Browse your collection tree, search/filter items, and select which sources to stage. The plugin starts a local HTTP server that serves the staged files.

2. **Chrome Extension** — Connects to the Zotero plugin's local server, fetches the staged files, and injects them into NotebookLM's upload interface.

## Installation

### Zotero Plugin

1. Download or build the `.xpi` file (see [Building](#building) below)
2. In Zotero 7: **Tools → Add-ons → ⚙ → Install Add-on From File...**
3. Select the `.xpi` file and restart Zotero if prompted

### Chrome Extension

1. Open `chrome://extensions/` in Chrome
2. Enable **Developer mode** (top right toggle)
3. Click **Load unpacked** and select the `chrome-extension/` directory

## Usage

### Step 1: Stage Sources in Zotero

1. Open Zotero and go to **Tools → Export to NotebookLM...**
2. Browse the collection tree on the left to find your subcollection
3. Use the search box to filter items by title, author, or year
4. Click items to select them (checked items will be exported). Items without a valid PDF attachment are greyed out.
5. Click **Export to NotebookLM** to stage the selected files

### Step 2: Import into NotebookLM

1. Open [notebooklm.google.com](https://notebooklm.google.com) in Chrome and create or open a notebook
2. Click the Zotero → NotebookLM extension icon in your Chrome toolbar
3. The popup will show your staged sources with a green "Zotero connected" indicator
4. Click **Import to NotebookLM**
5. The extension will fetch each file from Zotero, then upload them all to NotebookLM's sources panel

### Tips

- Keep Zotero running while importing — the Chrome extension fetches files from Zotero's local server
- You can deselect items in the Chrome popup if you change your mind
- After a successful import, staged items are automatically cleared
- If the import fails, refresh the NotebookLM tab and try again

## Building

```bash
npm install
npm run build
```

The Zotero plugin `.xpi` will be at `.scaffold/build/zotero-notebook-lm.xpi`.

The Chrome extension requires no build step — load `chrome-extension/` directly.

## Known Issues

- Large batches (9+ files) may occasionally time out due to a race condition in the Chrome extension's file injection. If this happens, try importing in smaller batches.
- NotebookLM's DOM structure may change without notice, which could break the upload mechanism.

## License

MIT — see [LICENSE](LICENSE).
