import { config } from "../../package.json";
import {
  getStagedItems,
  getStagedCount,
  getStagedTimestamp,
  isReady,
  isStagedAttachment,
  clearStaged,
} from "./staging";
import { readFileAsBase64 } from "../utils/file";
import type { StatusResponse, PendingResponse, FileResponse } from "../types";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, zotero-allowed-request",
};

function sendJSON(callback: Function, status: number, data: object) {
  callback(status, "application/json", JSON.stringify(data), CORS_HEADERS);
}

export function registerEndpoints() {
  // Health check
  const statusEndpoint = (Zotero.Server.Endpoints["/notebooklm/status"] =
    function () {});
  statusEndpoint.prototype = {
    supportedMethods: ["GET", "OPTIONS"],
    supportedDataTypes: ["application/json"],
    init: function (_data: any, sendResponseCallback: Function) {
      const response: StatusResponse = {
        ready: isReady(),
        count: getStagedCount(),
        zoteroVersion: Zotero.version,
        pluginVersion: config.addonName + " " + "0.1.0",
      };
      sendJSON(sendResponseCallback, 200, response);
    },
  };

  // Get staged items metadata
  const pendingEndpoint = (Zotero.Server.Endpoints["/notebooklm/pending"] =
    function () {});
  pendingEndpoint.prototype = {
    supportedMethods: ["GET", "OPTIONS"],
    supportedDataTypes: ["application/json"],
    init: function (_data: any, sendResponseCallback: Function) {
      const response: PendingResponse = {
        items: getStagedItems(),
        count: getStagedCount(),
        timestamp: getStagedTimestamp(),
      };
      sendJSON(sendResponseCallback, 200, response);
    },
  };

  // Get file content by attachment ID (only for staged items)
  const fileEndpoint = (Zotero.Server.Endpoints["/notebooklm/file"] =
    function () {});
  fileEndpoint.prototype = {
    supportedMethods: ["POST", "OPTIONS"],
    supportedDataTypes: ["application/json"],
    init: async function (data: any, sendResponseCallback: Function) {
      try {
        let body = data;
        if (typeof data === "string") {
          body = JSON.parse(data);
        }

        const attachmentId = body?.attachmentId;
        if (!attachmentId) {
          sendJSON(sendResponseCallback, 400, {
            error: "attachmentId is required",
          });
          return;
        }

        // Security: only serve files that are currently staged
        if (!isStagedAttachment(attachmentId)) {
          sendJSON(sendResponseCallback, 403, {
            error: "Attachment is not staged for export",
          });
          return;
        }

        const attachment = Zotero.Items.get(attachmentId);
        if (!attachment) {
          sendJSON(sendResponseCallback, 404, {
            error: "Attachment not found",
          });
          return;
        }

        const filePath = await attachment.getFilePathAsync();
        if (!filePath) {
          sendJSON(sendResponseCallback, 404, {
            error: "File not found on disk",
          });
          return;
        }

        const base64Data = await readFileAsBase64(filePath);
        const response: FileResponse = {
          data: base64Data,
          contentType:
            attachment.attachmentContentType || "application/octet-stream",
          fileName:
            attachment.attachmentFilename ||
            filePath.split("/").pop() ||
            "unknown",
        };
        sendJSON(sendResponseCallback, 200, response);
      } catch (e: any) {
        sendJSON(sendResponseCallback, 500, {
          error: e.message || "Internal error",
        });
      }
    },
  };

  // Clear staged items (called by Chrome extension after successful upload)
  const clearEndpoint = (Zotero.Server.Endpoints["/notebooklm/clear"] =
    function () {});
  clearEndpoint.prototype = {
    supportedMethods: ["DELETE", "OPTIONS"],
    supportedDataTypes: ["application/json"],
    init: function (_data: any, sendResponseCallback: Function) {
      clearStaged();
      sendJSON(sendResponseCallback, 200, { cleared: true });
    },
  };
}
