// Content script (isolated world) for notebooklm.google.com
// Communicates with injector.js (main world) via window.postMessage

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action === "uploadBatch") {
    uploadBatch(msg.files)
      .then(() => sendResponse({ success: true }))
      .catch((e) => sendResponse({ success: false, error: e.message }));
    return true;
  }

  if (msg.action === "ping") {
    sendResponse({ ready: true });
    return;
  }
});

async function uploadBatch(files) {
  if (!files || files.length === 0) {
    throw new Error("No files to upload");
  }

  // Step 1: Ensure the add-sources dialog is open
  const dialog = await ensureAddSourcesDialog();

  // Step 2: Arm the injector with file data and WAIT for confirmation
  await armInjector(files);

  // Step 3: Set up result listener BEFORE any injection attempt.
  const resultPromise = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      window.removeEventListener("message", handler);
      reject(
        new Error(
          "Upload timed out — NotebookLM never exposed a file input for interception.",
        ),
      );
    }, 70000);

    function handler(e) {
      if (e.source !== window) return;
      if (!e.data || e.data.type !== "__zotero_from_injector") return;
      if (e.data.status) return; // ignore non-terminal status messages here
      clearTimeout(timeout);
      window.removeEventListener("message", handler);
      if (e.data.success) {
        resolve();
      } else {
        reject(new Error(e.data.error || "Upload failed"));
      }
    }

    window.addEventListener("message", handler);
  });

  let uploadFinished = false;
  resultPromise.finally(() => {
    uploadFinished = true;
  });

  // Step 4: If NotebookLM already has a hidden file input in the DOM, inject
  // directly and skip the fragile button path entirely.
  const injectedWithoutClick = await requestExistingInjection("before-click");
  if (injectedWithoutClick) {
    console.log(
      "[Zotero content] Injector found an existing file input before click",
    );
    await resultPromise;
    await sleep(3000);
    return;
  }

  // Step 5: Fall back to clicking the visible upload control in the dialog.
  const uploadBtn =
    findClickableByText("upload files", dialog) ||
    findClickableByText("upload files");
  if (!uploadBtn) {
    throw new Error("Could not find 'Upload files' button");
  }

  console.log("[Zotero content] Clicking 'Upload files' button");
  clickElement(uploadBtn);

  // Keep the NotebookLM dialog open. Closing it too early can tear down the
  // Angular uploader before it materializes the real file input.
  console.log("[Zotero content] Waiting for NotebookLM to expose a file input");
  void delayedExistingInjection(1000, "after-click", () => uploadFinished);
  void delayedExistingInjection(
    5000,
    "delayed-after-click",
    () => uploadFinished,
  );
  void delayedExistingInjection(
    15000,
    "long-delayed-after-click",
    () => uploadFinished,
  );

  // Step 6: Wait for injector to confirm success.
  await resultPromise;

  // Give NotebookLM time to process
  await sleep(3000);
}

async function delayedExistingInjection(delayMs, reason, isFinished) {
  await sleep(delayMs);
  if (isFinished()) return;
  await requestExistingInjection(reason);
}

async function armInjector(files) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      window.removeEventListener("message", handler);
      reject(
        new Error(
          "Injector did not confirm armed state — is injector.js loaded?",
        ),
      );
    }, 5000);

    function handler(e) {
      if (e.source !== window) return;
      if (!e.data || e.data.type !== "__zotero_from_injector") return;
      if (e.data.status !== "armed") return;
      clearTimeout(timeout);
      window.removeEventListener("message", handler);
      console.log("[Zotero content] Injector confirmed armed");
      resolve();
    }

    window.addEventListener("message", handler);

    console.log(
      "[Zotero content] Arming injector with " + files.length + " files",
    );
    window.postMessage(
      { type: "__zotero_to_injector", command: "arm", files: files },
      "*",
    );
  });
}

async function requestExistingInjection(reason) {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      window.removeEventListener("message", handler);
      console.log(
        "[Zotero content] Existing-input probe timed out (" + reason + ")",
      );
      resolve(false);
    }, 1000);

    function handler(e) {
      if (e.source !== window) return;
      if (!e.data || e.data.type !== "__zotero_from_injector") return;
      if (e.data.status !== "inject-existing") return;
      clearTimeout(timeout);
      window.removeEventListener("message", handler);
      if (e.data.found) {
        console.log(
          "[Zotero content] Existing-input probe found a file input (" +
            reason +
            ")",
        );
      } else {
        console.log(
          "[Zotero content] Existing-input probe found no file input (" +
            reason +
            ")",
        );
      }
      resolve(Boolean(e.data.found));
    }

    window.addEventListener("message", handler);
    window.postMessage(
      { type: "__zotero_to_injector", command: "inject-existing", reason },
      "*",
    );
  });
}

async function ensureAddSourcesDialog() {
  const existing = document.querySelector("add-sources-dialog");
  if (existing) return existing;

  const addBtn =
    document.querySelector('[aria-label*="Add source" i]') ||
    findClickableByText("add sources");

  if (addBtn) {
    clickElement(addBtn);
    const dialog = await waitForElement("add-sources-dialog", 3000);
    if (!dialog) {
      throw new Error("Could not open the add sources dialog");
    }
    await sleep(500);
    return dialog;
  }

  throw new Error("Could not find the add sources button");
}

function findClickableByText(text, root = document) {
  const target = normalizeText(text);
  const clickables = root.querySelectorAll(
    'button, [role="button"], [aria-label], [tabindex]:not([tabindex="-1"])',
  );

  for (const el of clickables) {
    if (!isVisible(el) || isDisabled(el)) continue;
    const label = normalizeText(el.getAttribute("aria-label") || "");
    const content = normalizeText(el.textContent || "");
    if (label.includes(target) || content.includes(target)) {
      return el;
    }
  }

  return null;
}

function clickElement(el) {
  el.scrollIntoView({ block: "center", inline: "center" });
  el.dispatchEvent(
    new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
      composed: true,
    }),
  );
  el.dispatchEvent(
    new MouseEvent("mouseup", {
      bubbles: true,
      cancelable: true,
      composed: true,
    }),
  );
  el.click();
}

function isVisible(el) {
  const style = window.getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden") {
    return false;
  }

  return el.getClientRects().length > 0;
}

function isDisabled(el) {
  return (
    el.hasAttribute("disabled") ||
    el.getAttribute("aria-disabled") === "true" ||
    el.closest("[aria-hidden='true']")
  );
}

function normalizeText(text) {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function waitForElement(selector, timeoutMs = 3000) {
  return new Promise((resolve) => {
    const existing = document.querySelector(selector);
    if (existing) {
      resolve(existing);
      return;
    }
    const observer = new MutationObserver(() => {
      const el = document.querySelector(selector);
      if (el) {
        observer.disconnect();
        resolve(el);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => {
      observer.disconnect();
      resolve(null);
    }, timeoutMs);
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
