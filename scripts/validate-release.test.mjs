import nodeAssert from "node:assert/strict";
import test from "node:test";

import {
  assertUpdateManifest,
  parseUpdateHash,
  releaseContext,
} from "./validate-release.mjs";

const packageJSON = {
  name: "zotero-gemini-notebook",
  version: "0.3.0",
  config: {
    addonName: "Zotero Gemini Notebook",
    addonID: "zotero-notebooklm@peterdresslar.com",
  },
  companionCompatibility: {
    validVersions: ["0.2.0", "0.3.0"],
  },
  repository: {
    url: "git+https://github.com/peterdresslar/zotero-gemini-notebook.git",
  },
};

const compatibility = {
  strict_min_version: "6.999",
  strict_max_version: "9.*",
};

function updateManifest(expected, overrides = {}) {
  return {
    addons: {
      [expected.addonID]: {
        updates: [
          {
            version: expected.version,
            update_link: expected.xpiURL,
            update_hash: `sha512:${"a".repeat(128)}`,
            applications: { zotero: compatibility },
            ...overrides,
          },
        ],
      },
    },
  };
}

test("release context pins the stable identity and URLs", () => {
  const context = releaseContext(packageJSON);
  nodeAssert.equal(context.addonID, packageJSON.config.addonID);
  nodeAssert.deepEqual(
    context.compatibleChromeExtensionVersions,
    packageJSON.companionCompatibility.validVersions,
  );
  nodeAssert.equal(
    context.manifestURL,
    "https://github.com/peterdresslar/zotero-gemini-notebook/releases/download/release/update.json",
  );
  nodeAssert.equal(
    context.legacyManifestURL,
    "https://github.com/peterdresslar/zotero-notebooklm/releases/download/release/update.json",
  );
  nodeAssert.equal(
    context.xpiURL,
    "https://github.com/peterdresslar/zotero-gemini-notebook/releases/download/v0.3.0/zotero-gemini-notebook.xpi",
  );
});

test("release context rejects an add-on ID change", () => {
  nodeAssert.throws(
    () =>
      releaseContext({
        ...packageJSON,
        config: { ...packageJSON.config, addonID: "renamed@example.com" },
      }),
    /must remain zotero-notebooklm@peterdresslar\.com/,
  );
});

test("release context rejects an artifact-name change", () => {
  nodeAssert.throws(
    () => releaseContext({ ...packageJSON, name: "renamed-package" }),
    /Package name must remain zotero-gemini-notebook/,
  );
});

test("release context rejects a companion excluded by its paired plugin", () => {
  nodeAssert.throws(
    () =>
      releaseContext({
        ...packageJSON,
        companionCompatibility: {
          validVersions: ["0.2.0"],
        },
      }),
    /Chrome extension 0\.3\.0 must be compatible/,
  );
});

test("release context rejects invalid companion allowlists", () => {
  for (const validVersions of [
    undefined,
    [],
    ["0.3.0", null],
    ["0.3.0", "0.3.0"],
  ]) {
    nodeAssert.throws(() =>
      releaseContext({
        ...packageJSON,
        companionCompatibility:
          validVersions === undefined ? undefined : { validVersions },
      }),
    );
  }
});

test("update hashes accept supported SHA-512 values", () => {
  nodeAssert.deepEqual(parseUpdateHash(`sha512:${"a".repeat(128)}`), {
    algorithm: "sha512",
    digest: "a".repeat(128),
  });
  nodeAssert.throws(() => parseUpdateHash("md5:abc"), /Unsupported/);
});

test("update manifest must point to the expected versioned XPI", () => {
  const context = releaseContext(packageJSON);
  nodeAssert.doesNotThrow(() =>
    assertUpdateManifest(updateManifest(context), context, compatibility),
  );
  nodeAssert.throws(
    () =>
      assertUpdateManifest(
        updateManifest(context, {
          update_link: "https://example.com/wrong.xpi",
        }),
        context,
        compatibility,
      ),
    /Update link is/,
  );
});
