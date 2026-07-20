export interface StagedItem {
  itemId: number;
  title: string;
  creators: string;
  year: string;
  attachmentId: number;
  contentType: string;
  fileName: string;
  filePath: string;
}

export interface CollectionNode {
  id: number;
  name: string;
  level: number;
  parentId: number | null;
  children: CollectionNode[];
  itemCount: number;
}

export interface ItemRow {
  id: number;
  title: string;
  creators: string;
  year: string;
  hasValidAttachment: boolean;
  attachmentId: number | null;
  contentType: string | null;
  fileName: string | null;
  filePath: string | null;
}

export interface PendingResponse {
  items: StagedItem[];
  count: number;
  timestamp: number | null;
  compatibleChromeExtensionVersions: string[];
}

export interface StatusResponse {
  ready: boolean;
  count: number;
  zoteroVersion: string;
  pluginVersion: string;
}

export interface FileResponse {
  data: string;
  contentType: string;
  fileName: string;
}
