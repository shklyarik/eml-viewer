import { contextBridge, ipcRenderer, webUtils } from "electron";
import type { AttachmentPreview, EmailPreview, EmlViewerApi } from "../shared/types";

const api: EmlViewerApi = {
  openFile: () => ipcRenderer.invoke("dialog:open-email") as Promise<EmailPreview | null>,
  openDroppedFile: (file) =>
    ipcRenderer.invoke("email:open-path", webUtils.getPathForFile(file)) as Promise<EmailPreview | null>,
  getAttachmentPreview: (id) =>
    ipcRenderer.invoke("attachment:get-preview", id) as Promise<AttachmentPreview | null>,
  saveAttachment: (id) =>
    ipcRenderer.invoke("dialog:save-attachment", id) as Promise<boolean>,
  onEmailOpened: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, email: EmailPreview): void => {
      callback(email);
    };
    ipcRenderer.on("email:opened", listener);
    return () => ipcRenderer.removeListener("email:opened", listener);
  },
  onOpenError: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, message: string): void => {
      callback(message);
    };
    ipcRenderer.on("email:error", listener);
    return () => ipcRenderer.removeListener("email:error", listener);
  }
};

contextBridge.exposeInMainWorld("emlViewer", api);
