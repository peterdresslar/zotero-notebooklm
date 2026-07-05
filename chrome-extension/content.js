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

const UPLOAD_CONTROL_LABELS = [
  "upload files",
  "upload file",
  "upload sources",
  "choose files",
  "choose file",
  "browse files",
  "browse",
];
const UPLOAD_TRIGGER_MARKER = "data-zotero-upload-trigger";
const ASSISTED_PROMPT_ID = "zotero-notebooklm-assisted-upload";

async function uploadBatch(files) {
  if (!files || files.length === 0) {
    throw new Error("No files to upload");
  }

  // Step 1: Arm the injector with file data before clicking any NotebookLM
  // controls. Current NotebookLM builds may attach upload behavior directly to
  // the Add sources button or to the persistent source-panel dropzone.
  await armInjector(files);

  // Step 2: Set up result listener BEFORE any injection attempt.
  const resultPromise = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      window.removeEventListener("message", handler);
      hideAssistedUploadPrompt();
      reject(new Error(getUploadTimeoutMessage()));
    }, 120000);

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
  resultPromise.then(
    () => {
      uploadFinished = true;
      hideAssistedUploadPrompt();
    },
    () => {
      uploadFinished = true;
      hideAssistedUploadPrompt();
    },
  );

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

  // Current NotebookLM pages expose a persistent xapscotty uploader dropzone in
  // the source panel. Prefer that before opening secondary upload UI.
  await requestDropInjection("source-panel-before-dialog");
  await sleep(350);
  if (uploadFinished) {
    await resultPromise;
    await sleep(3000);
    return;
  }

  // Step 5: Open the add-sources UI if the persistent upload paths did not work.
  const dialog = await ensureAddSourcesDialog(() => uploadFinished);
  if (uploadFinished || !dialog) {
    await resultPromise;
    await sleep(3000);
    return;
  }

  // Step 6: Find visible upload controls in the dialog.
  const uploadControls = findUploadFileControls(dialog);
  if (uploadControls.length === 0) {
    throw new Error("Could not find an upload-files control");
  }

  console.log(
    "[Zotero content] Found " +
      uploadControls.length +
      " upload control candidate(s)",
  );

  if (
    await requestTriggerActivation("dialog-upload-trigger", uploadControls[0])
  ) {
    await sleep(350);
    if (uploadFinished) {
      await resultPromise;
      await sleep(3000);
      return;
    }

    if (await requestExistingInjection("after-trigger-activation")) {
      await resultPromise;
      await sleep(3000);
      return;
    }
  }

  // Step 7: Fall back to content-script click events.
  for (let i = 0; i < uploadControls.length; i++) {
    if (uploadFinished) break;
    const control = uploadControls[i];
    const reason = "after-click-" + (i + 1);
    console.log(
      "[Zotero content] Clicking upload control " +
        (i + 1) +
        "/" +
        uploadControls.length +
        ": " +
        describeElement(control),
    );
    clickElement(control);
    await sleep(350);

    if (await requestExistingInjection(reason)) {
      await resultPromise;
      await sleep(3000);
      return;
    }
  }

  await requestDropInjection("after-clicks");
  await sleep(350);
  if (uploadFinished) {
    await resultPromise;
    await sleep(3000);
    return;
  }

  showAssistedUploadPrompt(uploadControls[0], files.length);

  // Keep the NotebookLM dialog open. Closing it too early can tear down the
  // Angular uploader before it materializes the real file input.
  console.log(
    "[Zotero content] Waiting for NotebookLM to expose an upload path; if prompted, click the highlighted Upload files button",
  );
  void delayedUploadProbe(1000, "after-click-1s", () => uploadFinished);
  void delayedUploadProbe(5000, "after-click-5s", () => uploadFinished);
  void delayedUploadProbe(15000, "after-click-15s", () => uploadFinished);

  // Step 6: Wait for injector to confirm success.
  await resultPromise;

  // Give NotebookLM time to process
  await sleep(3000);
}

function getUploadTimeoutMessage() {
  const dialog = document.querySelector("add-sources-dialog") || document;
  const controls = findUploadFileControls(dialog);
  const controlSummary = controls.length
    ? controls.map(describeElement).join("; ")
    : "none";
  return (
    "Upload timed out — NotebookLM never exposed a file input or accepted a " +
    "synthetic drop. Upload controls seen: " +
    controlSummary
  );
}

async function delayedUploadProbe(delayMs, reason, isFinished) {
  await sleep(delayMs);
  if (isFinished()) return;
  if (await requestExistingInjection(reason)) return;
  await requestDropInjection(reason);
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

async function requestDropInjection(reason) {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      window.removeEventListener("message", handler);
      console.log("[Zotero content] Drop probe timed out (" + reason + ")");
      resolve(false);
    }, 1000);

    function handler(e) {
      if (e.source !== window) return;
      if (!e.data || e.data.type !== "__zotero_from_injector") return;
      if (e.data.status !== "drop-files") return;
      clearTimeout(timeout);
      window.removeEventListener("message", handler);
      if (e.data.found) {
        console.log(
          "[Zotero content] Drop probe dispatched files (" +
            reason +
            "): " +
            (e.data.target || "unknown target"),
        );
      } else {
        console.log(
          "[Zotero content] Drop probe found no target (" + reason + ")",
        );
      }
      resolve(Boolean(e.data.found));
    }

    window.addEventListener("message", handler);
    window.postMessage(
      { type: "__zotero_to_injector", command: "drop-files", reason },
      "*",
    );
  });
}

async function requestTriggerActivation(reason, target = null) {
  const marker = target
    ? "zotero-" + Date.now() + "-" + Math.random().toString(36).slice(2)
    : null;
  const selector = marker
    ? "[" + UPLOAD_TRIGGER_MARKER + '="' + marker + '"]'
    : null;
  if (target && marker) {
    target.setAttribute(UPLOAD_TRIGGER_MARKER, marker);
  }

  return new Promise((resolve) => {
    let settled = false;
    function finish(value) {
      if (settled) return;
      settled = true;
      if (target && marker) {
        target.removeAttribute(UPLOAD_TRIGGER_MARKER);
      }
      resolve(value);
    }

    const timeout = setTimeout(() => {
      window.removeEventListener("message", handler);
      console.log(
        "[Zotero content] Upload-trigger activation timed out (" + reason + ")",
      );
      finish(false);
    }, 1000);

    function handler(e) {
      if (e.source !== window) return;
      if (!e.data || e.data.type !== "__zotero_from_injector") return;
      if (e.data.status !== "activate-trigger") return;
      clearTimeout(timeout);
      window.removeEventListener("message", handler);
      if (e.data.found) {
        console.log(
          "[Zotero content] Activated upload trigger (" +
            reason +
            "): " +
            (e.data.target || "unknown target") +
            ", listeners=" +
            e.data.listeners,
        );
      } else {
        console.log(
          "[Zotero content] Upload-trigger activation found no target (" +
            reason +
            ")",
        );
      }
      finish(Boolean(e.data.found));
    }

    window.addEventListener("message", handler);
    window.postMessage(
      {
        type: "__zotero_to_injector",
        command: "activate-trigger",
        reason,
        selector,
      },
      "*",
    );
  });
}

async function ensureAddSourcesDialog(isFinished) {
  const existing = document.querySelector("add-sources-dialog");
  if (existing) return existing;

  const addBtn =
    document.querySelector('[aria-label*="Add source" i]') ||
    findClickableByText("add sources");

  if (addBtn) {
    clickElement(addBtn);
    if (isFinished()) return null;
    const dialog = await waitForElement("add-sources-dialog", 3000);
    if (isFinished()) return null;
    if (!dialog) {
      throw new Error("Could not open the add sources dialog");
    }
    await sleep(500);
    return dialog;
  }

  throw new Error("Could not find the add sources button");
}

function findUploadFileControls(root = document) {
  const candidates = [];
  const seen = new Set();

  for (const label of UPLOAD_CONTROL_LABELS) {
    for (const el of findClickableByTextAll(label, root)) {
      if (seen.has(el)) continue;
      seen.add(el);
      candidates.push(el);
    }
  }

  return candidates.sort(
    (a, b) => scoreUploadControl(b) - scoreUploadControl(a),
  );
}

function findClickableByText(text, root = document) {
  return findClickableByTextAll(text, root)[0] || null;
}

function findClickableByTextAll(text, root = document) {
  const target = normalizeText(text);
  const clickables = querySelectorAllDeep(
    root,
    'button, [role="button"], [aria-label], [tabindex]:not([tabindex="-1"])',
  );
  const matches = [];

  for (const el of clickables) {
    if (!isVisible(el) || isDisabled(el)) continue;
    const label = normalizeText(el.getAttribute("aria-label") || "");
    const content = normalizeText(el.textContent || "");
    if (label.includes(target) || content.includes(target)) {
      matches.push(el);
    }
  }

  return matches;
}

function querySelectorAllDeep(root, selector) {
  const results = [];
  const visitedShadowRoots = new Set();
  const stack = [root];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || typeof current.querySelectorAll !== "function") continue;

    results.push(...current.querySelectorAll(selector));

    for (const el of current.querySelectorAll("*")) {
      if (el.shadowRoot && !visitedShadowRoots.has(el.shadowRoot)) {
        visitedShadowRoots.add(el.shadowRoot);
        stack.push(el.shadowRoot);
      }
    }
  }

  return results;
}

function scoreUploadControl(el) {
  const tag = el.tagName.toLowerCase();
  const role = normalizeText(el.getAttribute("role") || "");
  const label = normalizeText(el.getAttribute("aria-label") || "");
  const content = normalizeText(el.textContent || "");
  let score = 0;

  if (tag === "button") score += 30;
  if (role === "button") score += 20;
  if (label.includes("upload files")) score += 25;
  if (content.includes("upload files")) score += 20;
  if (label.includes("browse") || content.includes("browse")) score += 10;
  if (el.closest("add-sources-dialog")) score += 10;

  return score;
}

function clickElement(el) {
  el.scrollIntoView({ block: "center", inline: "center" });
  const eventInit = {
    bubbles: true,
    cancelable: true,
    composed: true,
    view: window,
  };
  if (typeof PointerEvent === "function") {
    el.dispatchEvent(new PointerEvent("pointerdown", eventInit));
  }
  el.dispatchEvent(
    new MouseEvent("mousedown", {
      ...eventInit,
    }),
  );
  if (typeof PointerEvent === "function") {
    el.dispatchEvent(new PointerEvent("pointerup", eventInit));
  }
  el.dispatchEvent(
    new MouseEvent("mouseup", {
      ...eventInit,
    }),
  );
  el.click();
}

function showAssistedUploadPrompt(uploadControl, fileCount) {
  hideAssistedUploadPrompt();
  if (!uploadControl || !document.body) return;

  uploadControl.setAttribute("data-zotero-assisted-upload", "true");
  uploadControl.style.outline = "3px solid #1a73e8";
  uploadControl.style.outlineOffset = "3px";
  uploadControl.scrollIntoView({ block: "center", inline: "center" });

  const prompt = document.createElement("div");
  prompt.id = ASSISTED_PROMPT_ID;
  prompt.setAttribute("role", "status");
  Object.assign(prompt.style, {
    position: "fixed",
    left: "24px",
    bottom: "24px",
    zIndex: "2147483647",
    maxWidth: "380px",
    padding: "14px 16px",
    borderRadius: "8px",
    background: "#202124",
    color: "#fff",
    boxShadow: "0 8px 24px rgba(0, 0, 0, 0.25)",
    font: '13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  });
  prompt.textContent =
    "Zotero has " +
    fileCount +
    " source" +
    (fileCount === 1 ? "" : "s") +
    " ready. Click NotebookLM's highlighted Upload files button to finish importing.";
  document.body.appendChild(prompt);
}

function hideAssistedUploadPrompt() {
  document.getElementById(ASSISTED_PROMPT_ID)?.remove();
  for (const el of document.querySelectorAll("[data-zotero-assisted-upload]")) {
    el.style.outline = "";
    el.style.outlineOffset = "";
    el.removeAttribute("data-zotero-assisted-upload");
  }
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

function describeElement(el) {
  const tag = el.tagName.toLowerCase();
  const id = el.id ? "#" + el.id : "";
  const classes =
    typeof el.className === "string" && el.className
      ? "." + el.className.trim().replace(/\s+/g, ".")
      : "";
  const role = el.getAttribute("role")
    ? '[role="' + el.getAttribute("role") + '"]'
    : "";
  const label = el.getAttribute("aria-label")
    ? '[aria-label="' + el.getAttribute("aria-label") + '"]'
    : "";
  const text = normalizeText(el.textContent || "").slice(0, 80);
  return (
    tag + id + classes + role + label + (text ? ' text="' + text + '"' : "")
  );
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
