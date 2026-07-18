import { config } from "../package.json";
import hooks from "./hooks";
import { createZToolkit } from "./utils/ztoolkit";
import type { StagedItem } from "./types";

class Addon {
  public data: {
    alive: boolean;
    config: typeof config;
    env: "development" | "production";
    initialized?: boolean;
    ztoolkit: ZToolkit;
    locale?: {
      current: any;
    };
    // Staged items for Gemini Notebook export
    stagedItems: Map<number, StagedItem>;
    stagedTimestamp: number | null;
  };
  public hooks: typeof hooks;
  public api: object;

  constructor() {
    this.data = {
      alive: true,
      config,
      env: __env__,
      initialized: false,
      ztoolkit: createZToolkit(),
      stagedItems: new Map(),
      stagedTimestamp: null,
    };
    this.hooks = hooks;
    this.api = {};
  }
}

export default Addon;
