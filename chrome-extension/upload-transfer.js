(() => {
  "use strict";

  const CHUNK_SIZE = 4 * 1024 * 1024;

  function requireNonEmptyString(value, label) {
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new TypeError(`${label} must be a non-empty string`);
    }
  }

  function requirePositiveInteger(value, label) {
    if (!Number.isInteger(value) || value <= 0) {
      throw new TypeError(`${label} must be a positive integer`);
    }
  }

  function splitBase64IntoChunks(value, chunkSize = CHUNK_SIZE) {
    if (typeof value !== "string") {
      throw new TypeError("Base64 data must be a string");
    }
    requirePositiveInteger(chunkSize, "Chunk size");
    if (chunkSize > CHUNK_SIZE) {
      throw new RangeError(`Chunk size cannot exceed ${CHUNK_SIZE} characters`);
    }
    if (value.length === 0) {
      return [""];
    }

    const chunks = [];
    for (let offset = 0; offset < value.length; offset += chunkSize) {
      chunks.push(value.slice(offset, offset + chunkSize));
    }
    return chunks;
  }

  function createBatch(batchId, fileCount) {
    requireNonEmptyString(batchId, "Batch ID");
    requirePositiveInteger(fileCount, "File count");

    let files = Array(fileCount).fill(null);
    let finalized = false;

    function addChunk(chunk) {
      if (finalized) {
        throw new Error("Batch has already been finalized");
      }
      if (!chunk || typeof chunk !== "object" || Array.isArray(chunk)) {
        throw new TypeError("Chunk must be an object");
      }

      requireNonEmptyString(chunk.batchId, "Chunk batch ID");
      if (chunk.batchId !== batchId) {
        throw new Error(`Chunk belongs to the wrong batch: ${chunk.batchId}`);
      }

      if (
        !Number.isInteger(chunk.fileIndex) ||
        chunk.fileIndex < 0 ||
        chunk.fileIndex >= fileCount
      ) {
        throw new RangeError("File index is outside the batch");
      }
      requirePositiveInteger(chunk.chunkCount, "Chunk count");
      if (
        !Number.isInteger(chunk.chunkIndex) ||
        chunk.chunkIndex < 0 ||
        chunk.chunkIndex >= chunk.chunkCount
      ) {
        throw new RangeError("Chunk index is outside the file");
      }
      requireNonEmptyString(chunk.fileName, "File name");
      requireNonEmptyString(chunk.contentType, "Content type");
      if (typeof chunk.data !== "string") {
        throw new TypeError("Chunk data must be a string");
      }
      if (chunk.data.length > CHUNK_SIZE) {
        throw new RangeError(
          `Chunk data cannot exceed ${CHUNK_SIZE} characters`,
        );
      }
      if (chunk.data.length === 0 && chunk.chunkCount !== 1) {
        throw new Error("Only a one-chunk empty file may contain empty data");
      }

      let file = files[chunk.fileIndex];
      if (!file) {
        file = {
          fileName: chunk.fileName,
          contentType: chunk.contentType,
          chunkCount: chunk.chunkCount,
          chunks: Array(chunk.chunkCount),
          receivedCount: 0,
        };
        files[chunk.fileIndex] = file;
      } else if (
        file.fileName !== chunk.fileName ||
        file.contentType !== chunk.contentType ||
        file.chunkCount !== chunk.chunkCount
      ) {
        throw new Error(
          `Conflicting metadata for file index ${chunk.fileIndex}`,
        );
      }

      if (file.chunks[chunk.chunkIndex] !== undefined) {
        throw new Error(
          `Duplicate chunk ${chunk.chunkIndex} for file index ${chunk.fileIndex}`,
        );
      }

      file.chunks[chunk.chunkIndex] = chunk.data;
      file.receivedCount += 1;
    }

    function finalize() {
      if (finalized) {
        throw new Error("Batch has already been finalized");
      }

      const completedFiles = files.map((file, fileIndex) => {
        if (!file) {
          throw new Error(`Missing file at index ${fileIndex}`);
        }
        if (file.receivedCount !== file.chunkCount) {
          const missingChunks = [];
          for (let i = 0; i < file.chunkCount; i++) {
            if (file.chunks[i] === undefined) missingChunks.push(i);
          }
          throw new Error(
            `Missing chunk(s) ${missingChunks.join(", ")} for file index ${fileIndex}`,
          );
        }

        return {
          fileName: file.fileName,
          contentType: file.contentType,
          base64Data: file.chunks.join(""),
        };
      });

      finalized = true;
      files = null;
      return completedFiles;
    }

    return Object.freeze({ batchId, fileCount, addChunk, finalize });
  }

  globalThis.ZoteroUploadTransfer = Object.freeze({
    CHUNK_SIZE,
    splitBase64IntoChunks,
    createBatch,
  });
})();
