import type { EmlViewerApi } from "../../shared/types";

declare global {
  interface Window {
    emlViewer: EmlViewerApi;
  }
}

export {};
