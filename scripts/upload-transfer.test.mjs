import assert from "node:assert/strict";
import test from "node:test";

import "../chrome-extension/upload-transfer.js";

const { CHUNK_SIZE, createBatch, splitBase64IntoChunks } =
  globalThis.ZoteroUploadTransfer;

function chunk(overrides = {}) {
  return {
    batchId: "batch-1",
    fileIndex: 0,
    chunkIndex: 0,
    chunkCount: 1,
    fileName: "source.pdf",
    contentType: "application/pdf",
    data: "c291cmNl",
    ...overrides,
  };
}

test("uses 4 MiB message chunks", () => {
  assert.equal(CHUNK_SIZE, 4 * 1024 * 1024);

  // Seventeen independently delivered chunks can represent more than Chrome's
  // 64 MiB per-message ceiling without allocating that full payload in a test.
  assert.ok(17 * CHUNK_SIZE > 64 * 1024 * 1024);
  assert.equal(splitBase64IntoChunks("abcdefghijklmnopq", 1).length, 17);
});

test("splits and reconstructs a multi-chunk file", () => {
  const data = "abcdefghijklmnop";
  const chunks = splitBase64IntoChunks(data, 5);
  assert.deepEqual(chunks, ["abcde", "fghij", "klmno", "p"]);

  const batch = createBatch("batch-1", 1);
  assert.equal(batch.batchId, "batch-1");
  assert.equal(batch.fileCount, 1);
  chunks.forEach((value, chunkIndex) => {
    batch.addChunk(
      chunk({
        chunkIndex,
        chunkCount: chunks.length,
        data: value,
      }),
    );
  });

  assert.deepEqual(batch.finalize(), [
    {
      fileName: "source.pdf",
      contentType: "application/pdf",
      base64Data: data,
    },
  ]);
});

test("handles exact boundaries and preserves empty data as one chunk", () => {
  assert.deepEqual(splitBase64IntoChunks("abcdefgh", 4), ["abcd", "efgh"]);
  assert.deepEqual(splitBase64IntoChunks("", 4), [""]);

  const batch = createBatch("empty-batch", 1);
  batch.addChunk(
    chunk({
      batchId: "empty-batch",
      fileName: "empty.txt",
      contentType: "text/plain",
      data: "",
    }),
  );
  assert.deepEqual(batch.finalize(), [
    {
      fileName: "empty.txt",
      contentType: "text/plain",
      base64Data: "",
    },
  ]);
});

test("preserves file-index order and duplicate filenames", () => {
  const batch = createBatch("ordered", 2);
  batch.addChunk(
    chunk({
      batchId: "ordered",
      fileIndex: 1,
      fileName: "duplicate.pdf",
      data: "c2Vjb25k",
    }),
  );
  batch.addChunk(
    chunk({
      batchId: "ordered",
      fileIndex: 0,
      fileName: "duplicate.pdf",
      data: "Zmlyc3Q=",
    }),
  );

  assert.deepEqual(batch.finalize(), [
    {
      fileName: "duplicate.pdf",
      contentType: "application/pdf",
      base64Data: "Zmlyc3Q=",
    },
    {
      fileName: "duplicate.pdf",
      contentType: "application/pdf",
      base64Data: "c2Vjb25k",
    },
  ]);
});

test("rejects a chunk for the wrong batch", () => {
  const batch = createBatch("batch-1", 1);
  assert.throws(
    () => batch.addChunk(chunk({ batchId: "batch-2" })),
    /wrong batch/,
  );
});

test("rejects missing files and chunks", () => {
  const missingFile = createBatch("batch-1", 2);
  missingFile.addChunk(chunk());
  assert.throws(() => missingFile.finalize(), /Missing file at index 1/);

  const missingChunk = createBatch("batch-1", 1);
  missingChunk.addChunk(chunk({ chunkCount: 2 }));
  assert.throws(() => missingChunk.finalize(), /Missing chunk\(s\) 1/);
});

test("rejects duplicate and conflicting chunks", () => {
  const duplicate = createBatch("batch-1", 1);
  duplicate.addChunk(chunk());
  assert.throws(() => duplicate.addChunk(chunk()), /Duplicate chunk/);

  const conflicting = createBatch("batch-1", 1);
  conflicting.addChunk(chunk({ chunkCount: 2 }));
  assert.throws(
    () =>
      conflicting.addChunk(
        chunk({
          chunkIndex: 1,
          chunkCount: 3,
        }),
      ),
    /Conflicting metadata/,
  );
});

test("rejects oversized data and unsafe split sizes", () => {
  const batch = createBatch("batch-1", 1);
  assert.throws(
    () => batch.addChunk(chunk({ data: "x".repeat(CHUNK_SIZE + 1) })),
    /cannot exceed/,
  );
  assert.throws(
    () => splitBase64IntoChunks("data", CHUNK_SIZE + 1),
    /cannot exceed/,
  );
});

test("rejects malformed batch and chunk fields", () => {
  assert.throws(() => createBatch("", 1), /Batch ID/);
  assert.throws(() => createBatch("batch-1", 0), /File count/);
  assert.throws(() => createBatch("batch-1", 1.5), /File count/);
  assert.throws(() => splitBase64IntoChunks(null, 4), /must be a string/);
  assert.throws(() => splitBase64IntoChunks("data", 0), /Chunk size/);

  const malformedChunks = [
    [null, /must be an object/],
    [chunk({ batchId: " " }), /Chunk batch ID/],
    [chunk({ fileIndex: -1 }), /File index/],
    [chunk({ fileIndex: 1 }), /File index/],
    [chunk({ chunkIndex: -1 }), /Chunk index/],
    [chunk({ chunkIndex: 1 }), /Chunk index/],
    [chunk({ chunkCount: 0 }), /Chunk count/],
    [chunk({ fileName: " " }), /File name/],
    [chunk({ contentType: "" }), /Content type/],
    [chunk({ data: null }), /Chunk data/],
    [chunk({ chunkCount: 2, data: "" }), /one-chunk empty file/],
  ];

  for (const [value, expectedError] of malformedChunks) {
    const batch = createBatch("batch-1", 1);
    assert.throws(() => batch.addChunk(value), expectedError);
  }
});

test("rejects writes after successful finalization", () => {
  const batch = createBatch("batch-1", 1);
  batch.addChunk(chunk());
  batch.finalize();

  assert.throws(() => batch.addChunk(chunk()), /already been finalized/);
  assert.throws(() => batch.finalize(), /already been finalized/);
});
