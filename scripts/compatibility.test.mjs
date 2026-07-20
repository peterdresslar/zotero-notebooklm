import assert from "node:assert/strict";
import test from "node:test";

import { isChromeCompanionVersionCompatible } from "../chrome-extension/compatibility.js";

test("accepts the legacy backend when compatibility metadata is absent", () => {
  assert.equal(isChromeCompanionVersionCompatible(undefined, "0.3.0"), true);
});

test("accepts a companion version listed by the backend", () => {
  assert.equal(
    isChromeCompanionVersionCompatible(["0.2.0", "0.3.0"], "0.3.0"),
    true,
  );
});

test("rejects a companion version omitted by the backend", () => {
  assert.equal(isChromeCompanionVersionCompatible(["0.4.0"], "0.3.0"), false);
});

test("rejects malformed compatibility metadata", () => {
  assert.equal(isChromeCompanionVersionCompatible(null, "0.3.0"), false);
  assert.equal(isChromeCompanionVersionCompatible("0.3.0", "0.3.0"), false);
  assert.equal(isChromeCompanionVersionCompatible([], "0.3.0"), false);
  assert.equal(
    isChromeCompanionVersionCompatible(["0.3.0", null], "0.3.0"),
    false,
  );
});
