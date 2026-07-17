import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { existsSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEmailFile, type StoredAttachment } from "./email";
import type { AttachmentPreview, EmailPreview } from "../shared/types";

let mainWindow: BrowserWindow | null = null;
let pendingFilePath: string | null = null;
let currentAttachments = new Map<string, StoredAttachment>();
const MAX_BINARY_PREVIEW_SIZE = 50 * 1024 * 1024;
const MAX_TEXT_PREVIEW_SIZE = 2 * 1024 * 1024;

function emlPathFromArgs(args: string[]): string | null {
  for (const argument of args) {
    try {
      const candidate = argument.startsWith("file://") ? fileURLToPath(argument) : argument;
      if (extname(candidate).toLowerCase() === ".eml" && existsSync(candidate)) {
        return resolve(candidate);
      }
    } catch {
      // Ignore malformed file URLs and continue checking the other arguments.
    }
  }

  return null;
}

function createWindow(): void {
  const windowIcon = app.isPackaged
    ? join(process.resourcesPath, "icon.png")
    : resolve("build/icons/256x256.png");

  mainWindow = new BrowserWindow({
    width: 1060,
    height: 760,
    minWidth: 700,
    minHeight: 500,
    title: "EML Viewer",
    icon: windowIcon,
    backgroundColor: "#f5f7fa",
    webPreferences: {
      preload: fileURLToPath(new URL("../preload/index.js", import.meta.url)),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.removeMenu();
  mainWindow.maximize();

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://") || url.startsWith("http://") || url.startsWith("mailto:")) {
      void shell.openExternal(url);
    }
    return { action: "deny" };
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void mainWindow.loadFile(fileURLToPath(new URL("../renderer/index.html", import.meta.url)));
  }

  mainWindow.webContents.once("did-finish-load", () => {
    if (pendingFilePath) {
      const filePath = pendingFilePath;
      pendingFilePath = null;
      void openEmail(filePath);
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

async function openEmail(filePath: string): Promise<EmailPreview | null> {
  try {
    const parsed = await parseEmailFile(filePath);
    currentAttachments = parsed.attachments;
    mainWindow?.webContents.send("email:opened", parsed.preview);
    mainWindow?.setTitle(`${parsed.preview.subject} — EML Viewer`);
    mainWindow?.show();
    mainWindow?.focus();
    return parsed.preview;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to open this email.";
    mainWindow?.webContents.send("email:error", message);
    return null;
  }
}

function queueOrOpen(filePath: string): void {
  if (mainWindow && !mainWindow.webContents.isLoading()) {
    void openEmail(filePath);
  } else {
    pendingFilePath = filePath;
  }
}

const initialFilePath = emlPathFromArgs(process.argv);
const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", (_event, commandLine) => {
    const filePath = emlPathFromArgs(commandLine);
    if (filePath) {
      queueOrOpen(filePath);
    } else {
      mainWindow?.show();
      mainWindow?.focus();
    }
  });

  app.on("open-file", (event, filePath) => {
    event.preventDefault();
    queueOrOpen(filePath);
  });

  void app.whenReady().then(() => {
    pendingFilePath = initialFilePath;
    createWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

ipcMain.handle("dialog:open-email", async () => {
  const options: Electron.OpenDialogOptions = {
    title: "Open an email",
    properties: ["openFile"],
    filters: [
      { name: "Email messages", extensions: ["eml"] },
      { name: "All files", extensions: ["*"] }
    ]
  };
  const result = mainWindow
    ? await dialog.showOpenDialog(mainWindow, options)
    : await dialog.showOpenDialog(options);

  return result.canceled || !result.filePaths[0] ? null : openEmail(result.filePaths[0]);
});

ipcMain.handle("email:open-path", (_event, filePath: string) => {
  const validFilePath = emlPathFromArgs([filePath]);
  if (!validFilePath) {
    mainWindow?.webContents.send("email:error", "Drop a valid EML file to open it.");
    return null;
  }
  return openEmail(validFilePath);
});

ipcMain.handle("dialog:save-attachment", async (_event, id: string) => {
  const attachment = currentAttachments.get(id);
  if (!attachment) {
    return false;
  }

  const options: Electron.SaveDialogOptions = {
    title: "Save attachment",
    defaultPath: attachment.filename
  };
  const result = mainWindow
    ? await dialog.showSaveDialog(mainWindow, options)
    : await dialog.showSaveDialog(options);

  if (result.canceled || !result.filePath) {
    return false;
  }

  const { writeFile } = await import("node:fs/promises");
  await writeFile(result.filePath, attachment.content);
  return true;
});

ipcMain.handle("attachment:get-preview", (_event, id: string) => {
  const attachment = currentAttachments.get(id);
  if (!attachment?.previewType) {
    return null;
  }

  if (attachment.previewType === "text") {
    if (attachment.content.byteLength > MAX_TEXT_PREVIEW_SIZE) {
      return null;
    }
    return {
      type: "text",
      content: attachment.content.toString("utf8")
    } satisfies AttachmentPreview;
  }

  if (attachment.content.byteLength > MAX_BINARY_PREVIEW_SIZE) {
    return null;
  }

  const mimeType =
    attachment.previewType === "video"
      ? "video/mp4"
      : attachment.previewType === "pdf"
        ? "application/pdf"
        : attachment.mimeType;
  return {
    type: attachment.previewType,
    source: `data:${mimeType};base64,${attachment.content.toString("base64")}`
  } satisfies AttachmentPreview;
});
