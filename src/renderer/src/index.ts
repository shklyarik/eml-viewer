import "./style.css";
import pdfWorkerUrl from "./pdf.worker.ts?worker&url";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { AttachmentPreview, EmailAddress, EmailPreview } from "../../shared/types";

const appElement = document.querySelector<HTMLDivElement>("#app");

if (!appElement) {
  throw new Error("Application root was not found.");
}

appElement.innerHTML = `
  <header class="app-header">
    <div class="brand">
      <span class="brand-icon" aria-hidden="true">✉</span>
      <span>EML Viewer</span>
    </div>
    <div class="header-actions">
      <button id="theme-button" class="icon-button" type="button" aria-label="Use dark theme"></button>
      <button id="open-button" class="primary-button" type="button">Open file</button>
    </div>
  </header>
  <main>
    <section id="empty-state" class="empty-state">
      <div class="empty-icon" aria-hidden="true">✉</div>
      <h1>Open an email</h1>
      <p>Select an EML file to preview its content and attachments.</p>
      <button id="empty-open-button" class="primary-button large" type="button">Choose EML file</button>
      <p class="hint">You can also run <code>eml-viewer message.eml</code></p>
    </section>
    <section id="email-view" class="email-view" hidden>
      <div class="message-header">
        <div class="subject-row">
          <h1 id="subject"></h1>
          <div id="view-tabs" class="view-tabs">
            <button id="html-tab" class="tab active" type="button">HTML</button>
            <button id="text-tab" class="tab" type="button">Text</button>
            <button id="raw-tab" class="tab" type="button">Raw</button>
          </div>
        </div>
        <dl class="metadata">
          <div><dt>From</dt><dd id="from"></dd></div>
          <div><dt>To</dt><dd id="to"></dd></div>
          <div id="cc-row"><dt>Cc</dt><dd id="cc"></dd></div>
          <div><dt>Date</dt><dd id="date"></dd></div>
          <div><dt>File</dt><dd id="filename"></dd></div>
        </dl>
      </div>
      <div id="attachments" class="attachments" hidden></div>
      <div class="message-body">
        <iframe
          id="html-preview"
          title="Email HTML preview"
          sandbox="allow-popups"
          referrerpolicy="no-referrer"
        ></iframe>
        <pre id="text-preview" hidden></pre>
        <div id="raw-preview" hidden>
          <section class="raw-block">
            <h2>Raw headers</h2>
            <pre id="raw-headers"></pre>
          </section>
          <section class="raw-block">
            <h2>Raw HTML</h2>
            <pre id="raw-html"></pre>
          </section>
        </div>
      </div>
    </section>
    <div id="error-toast" class="error-toast" role="alert" hidden></div>
    <dialog id="preview-dialog" class="preview-dialog">
      <div class="preview-dialog-header">
        <strong id="preview-dialog-title"></strong>
        <button id="preview-dialog-close" class="dialog-close" type="button" aria-label="Close preview">×</button>
      </div>
      <div class="preview-dialog-body">
        <img id="dialog-image-preview" alt="" hidden>
        <video id="dialog-video-preview" controls hidden></video>
        <pre id="dialog-text-preview" hidden></pre>
        <div id="dialog-pdf-preview" class="pdf-document" hidden></div>
      </div>
    </dialog>
    <div id="drop-overlay" class="drop-overlay" hidden>
      <div>
        <span aria-hidden="true">↓</span>
        <strong>Drop EML file to open</strong>
      </div>
    </div>
  </main>
`;

const byId = <T extends HTMLElement>(id: string): T => {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Element #${id} was not found.`);
  }
  return element as T;
};

const emptyState = byId<HTMLElement>("empty-state");
const emailView = byId<HTMLElement>("email-view");
const htmlPreview = byId<HTMLIFrameElement>("html-preview");
const textPreview = byId<HTMLPreElement>("text-preview");
const rawPreview = byId<HTMLDivElement>("raw-preview");
const rawHeaders = byId<HTMLPreElement>("raw-headers");
const rawHtml = byId<HTMLPreElement>("raw-html");
const htmlTab = byId<HTMLButtonElement>("html-tab");
const textTab = byId<HTMLButtonElement>("text-tab");
const rawTab = byId<HTMLButtonElement>("raw-tab");
const attachments = byId<HTMLDivElement>("attachments");
const errorToast = byId<HTMLDivElement>("error-toast");
const dropOverlay = byId<HTMLDivElement>("drop-overlay");
const previewDialog = byId<HTMLDialogElement>("preview-dialog");
const previewDialogHeader = previewDialog.querySelector<HTMLDivElement>(".preview-dialog-header");
const previewDialogBody = previewDialog.querySelector<HTMLDivElement>(".preview-dialog-body");
const dialogImagePreview = byId<HTMLImageElement>("dialog-image-preview");
const dialogVideoPreview = byId<HTMLVideoElement>("dialog-video-preview");
const dialogTextPreview = byId<HTMLPreElement>("dialog-text-preview");
const dialogPdfPreview = byId<HTMLDivElement>("dialog-pdf-preview");
const attachmentPreviewCache = new Map<string, AttachmentPreview>();

let currentEmail: EmailPreview | null = null;
let dragDepth = 0;
let activePdfDocument: PDFDocumentProxy | null = null;
let pdfRenderGeneration = 0;
let pdfjsPromise: Promise<typeof import("pdfjs-dist")> | null = null;
type Theme = "light" | "dark";

const savedTheme = localStorage.getItem("theme");
let currentTheme: Theme =
  savedTheme === "light" || savedTheme === "dark"
    ? savedTheme
    : window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";

function formatAddress(address: EmailAddress | undefined): string {
  if (!address) {
    return "—";
  }
  return address.name ? `${address.name} <${address.address}>` : address.address;
}

function formatAddresses(addresses: EmailAddress[]): string {
  return addresses.length > 0 ? addresses.map(formatAddress).join(", ") : "—";
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function emailDocument(body: string, theme: Theme): string {
  const background = theme === "dark" ? "#202630" : "#ffffff";
  const color = theme === "dark" ? "#e8edf5" : "#202733";

  return `<!doctype html>
    <html>
      <head>
        <meta charset="UTF-8">
        <meta
          http-equiv="Content-Security-Policy"
          content="default-src 'none'; img-src data: cid:; style-src 'unsafe-inline'; font-src data:;"
        >
        <base target="_blank">
        <style>
          :root { color-scheme: ${theme}; }
          body {
            background: ${background};
            box-sizing: border-box;
            color: ${color};
            font: 15px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            margin: 0;
            overflow-wrap: anywhere;
            padding: 24px;
          }
          img { height: auto; max-width: 100%; }
          table { max-width: 100%; }
          pre { white-space: pre-wrap; }
        </style>
      </head>
      <body>${body}</body>
    </html>`;
}

function applyTheme(theme: Theme): void {
  currentTheme = theme;
  document.documentElement.dataset.theme = theme;

  const themeButton = byId<HTMLButtonElement>("theme-button");
  const useDarkTheme = theme === "light";
  themeButton.textContent = useDarkTheme ? "☾" : "☀";
  themeButton.setAttribute("aria-label", useDarkTheme ? "Use dark theme" : "Use light theme");
  themeButton.title = useDarkTheme ? "Use dark theme" : "Use light theme";

  if (currentEmail?.html) {
    htmlPreview.srcdoc = emailDocument(currentEmail.html, theme);
  }
}

function showMode(mode: "html" | "text" | "raw"): void {
  const showHtml = mode === "html" && Boolean(currentEmail?.html);
  const showRaw = mode === "raw";
  htmlPreview.hidden = !showHtml;
  textPreview.hidden = showHtml || showRaw;
  rawPreview.hidden = !showRaw;
  htmlTab.classList.toggle("active", showHtml);
  textTab.classList.toggle("active", !showHtml && !showRaw);
  rawTab.classList.toggle("active", showRaw);
}

function renderAttachments(email: EmailPreview): void {
  attachments.replaceChildren();
  attachments.hidden = email.attachments.length === 0;

  if (email.attachments.length === 0) {
    return;
  }

  const title = document.createElement("strong");
  title.textContent = `Attachments (${email.attachments.length})`;
  attachments.append(title);

  const list = document.createElement("div");
  list.className = "attachment-list";

  for (const attachment of email.attachments) {
    const item = document.createElement("div");
    item.className = attachment.previewType ? "attachment preview-attachment" : "attachment";
    item.innerHTML = `
      <button class="attachment-preview" type="button" aria-label="Preview attachment" hidden></button>
      <div class="attachment-details">
        <span aria-hidden="true">📎</span>
        <span class="attachment-name"></span>
        <small>${formatBytes(attachment.size)}</small>
      </div>
      <button class="attachment-save" type="button">Save</button>
    `;
    const name = item.querySelector<HTMLElement>(".attachment-name");
    if (name) {
      name.textContent = attachment.filename;
      name.title = attachment.filename;
    }

    const saveButton = item.querySelector<HTMLButtonElement>(".attachment-save");
    saveButton?.addEventListener("click", () => {
      void window.emlViewer.saveAttachment(attachment.id);
    });

    if (attachment.previewType) {
      const previewButton = item.querySelector<HTMLButtonElement>(".attachment-preview");
      void getAttachmentPreview(attachment.id).then((preview) => {
        if (!preview || !previewButton) {
          return;
        }

        if (preview.type === "image") {
          const image = document.createElement("img");
          image.src = preview.source;
          image.alt = `Preview of ${attachment.filename}`;
          previewButton.append(image);
        } else if (preview.type === "video") {
          const video = document.createElement("video");
          video.src = preview.source;
          video.muted = true;
          video.preload = "metadata";
          previewButton.append(video);
          const badge = document.createElement("span");
          badge.className = "video-badge";
          badge.textContent = "▶";
          previewButton.append(badge);
        } else if (preview.type === "text") {
          const text = document.createElement("pre");
          text.textContent = preview.content.slice(0, 1200);
          previewButton.append(text);
        } else {
          const badge = document.createElement("span");
          badge.className = "file-preview-badge pdf-badge";
          badge.textContent = "PDF";
          previewButton.append(badge);
        }

        previewButton.hidden = false;
        previewButton.addEventListener("click", () => {
          showAttachmentPreview(attachment.filename, preview);
        });
      });
    } else {
      const previewButton = item.querySelector<HTMLButtonElement>(".attachment-preview");
      if (previewButton) {
        const badge = document.createElement("span");
        badge.className = "file-preview-badge generic-file-badge";
        const extension = attachment.filename.split(".").pop();
        badge.textContent = extension && extension.length <= 5 ? extension.toUpperCase() : "FILE";
        previewButton.append(badge);
        previewButton.hidden = false;
        previewButton.disabled = true;
      }
    }

    list.append(item);
  }

  attachments.append(list);
}

async function getAttachmentPreview(id: string): Promise<AttachmentPreview | null> {
  const cached = attachmentPreviewCache.get(id);
  if (cached) {
    return cached;
  }

  const source = await window.emlViewer.getAttachmentPreview(id);
  if (source) {
    attachmentPreviewCache.set(id, source);
  }
  return source;
}

function showAttachmentPreview(filename: string, preview: AttachmentPreview): void {
  byId("preview-dialog-title").textContent = filename;
  previewDialogBody?.classList.toggle("pdf-preview-active", preview.type === "pdf");
  dialogImagePreview.hidden = true;
  dialogVideoPreview.hidden = true;
  dialogTextPreview.hidden = true;
  dialogPdfPreview.hidden = true;

  previewDialog.showModal();
  syncPreviewDialogSize();

  if (preview.type === "image") {
    dialogImagePreview.src = preview.source;
    dialogImagePreview.alt = filename;
    dialogImagePreview.hidden = false;
  } else if (preview.type === "video") {
    dialogVideoPreview.src = preview.source;
    dialogVideoPreview.hidden = false;
  } else if (preview.type === "text") {
    dialogTextPreview.textContent = preview.content;
    dialogTextPreview.hidden = false;
  } else {
    dialogPdfPreview.hidden = false;
    void renderPdf(preview.source);
  }
}

function decodeDataUrl(source: string): Uint8Array {
  const encoded = source.slice(source.indexOf(",") + 1);
  const binary = atob(encoded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function installPdfTypedArrayPolyfills(): void {
  const prototype = Uint8Array.prototype as Uint8Array & {
    toHex?: () => string;
    toBase64?: () => string;
  };
  const constructor = Uint8Array as typeof Uint8Array & {
    fromBase64?: (value: string) => Uint8Array;
  };

  if (!prototype.toHex) {
    Object.defineProperty(Uint8Array.prototype, "toHex", {
      value(this: Uint8Array): string {
        return Array.from(this, (byte) => byte.toString(16).padStart(2, "0")).join("");
      }
    });
  }

  if (!prototype.toBase64) {
    Object.defineProperty(Uint8Array.prototype, "toBase64", {
      value(this: Uint8Array): string {
        let binary = "";
        for (const byte of this) {
          binary += String.fromCharCode(byte);
        }
        return btoa(binary);
      }
    });
  }

  if (!constructor.fromBase64) {
    Object.defineProperty(Uint8Array, "fromBase64", {
      value(value: string): Uint8Array {
        const binary = atob(value);
        return Uint8Array.from(binary, (character) => character.charCodeAt(0));
      }
    });
  }
}

function loadPdfJs(): Promise<typeof import("pdfjs-dist")> {
  if (!pdfjsPromise) {
    installPdfTypedArrayPolyfills();
    pdfjsPromise = import("pdfjs-dist").then((module) => {
      module.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
      return module;
    });
  }
  return pdfjsPromise;
}

async function renderPdf(source: string): Promise<void> {
  const generation = ++pdfRenderGeneration;
  dialogPdfPreview.replaceChildren();

  const loading = document.createElement("div");
  loading.className = "pdf-loading";
  loading.textContent = "Loading PDF…";
  dialogPdfPreview.append(loading);

  try {
    const pdfjs = await loadPdfJs();
    const loadingTask = pdfjs.getDocument({ data: decodeDataUrl(source) });
    const documentProxy = await loadingTask.promise;
    if (generation !== pdfRenderGeneration) {
      await documentProxy.destroy();
      return;
    }

    activePdfDocument = documentProxy;
    dialogPdfPreview.replaceChildren();

    for (let pageNumber = 1; pageNumber <= documentProxy.numPages; pageNumber += 1) {
      if (generation !== pdfRenderGeneration) {
        return;
      }

      const page = await documentProxy.getPage(pageNumber);
      const baseViewport = page.getViewport({ scale: 1 });
      const availableWidth = Math.max(320, dialogPdfPreview.clientWidth - 48);
      const displayScale = Math.min(2, availableWidth / baseViewport.width);
      const viewport = page.getViewport({ scale: displayScale });
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);

      const pageElement = document.createElement("div");
      pageElement.className = "pdf-page";
      const canvas = document.createElement("canvas");
      canvas.width = Math.floor(viewport.width * pixelRatio);
      canvas.height = Math.floor(viewport.height * pixelRatio);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;
      pageElement.append(canvas);
      dialogPdfPreview.append(pageElement);
      const canvasContext = canvas.getContext("2d");
      if (!canvasContext) {
        throw new Error("Unable to create a canvas context for the PDF preview.");
      }

      await page.render({
        canvasContext,
        viewport,
        ...(pixelRatio === 1 ? {} : { transform: [pixelRatio, 0, 0, pixelRatio, 0, 0] })
      }).promise;
    }
  } catch (error) {
    if (generation !== pdfRenderGeneration) {
      return;
    }
    dialogPdfPreview.replaceChildren();
    const message = document.createElement("div");
    message.className = "pdf-loading pdf-error";
    message.textContent = error instanceof Error ? error.message : "Unable to display this PDF.";
    dialogPdfPreview.append(message);
  }
}

function syncPreviewDialogSize(): void {
  if (!previewDialog.open || !previewDialogBody || !previewDialogHeader) {
    return;
  }

  const availableHeight = Math.max(
    0,
    previewDialog.clientHeight - previewDialogHeader.offsetHeight
  );
  previewDialogBody.style.height = `${availableHeight}px`;
}

const previewDialogResizeObserver = new ResizeObserver(syncPreviewDialogSize);
previewDialogResizeObserver.observe(previewDialog);

function renderEmail(email: EmailPreview): void {
  currentEmail = email;
  attachmentPreviewCache.clear();
  emptyState.hidden = true;
  emailView.hidden = false;

  byId("subject").textContent = email.subject;
  byId("from").textContent = formatAddress(email.from);
  byId("to").textContent = formatAddresses(email.to);
  byId("cc").textContent = formatAddresses(email.cc);
  byId("cc-row").hidden = email.cc.length === 0;
  byId("date").textContent = email.date
    ? new Intl.DateTimeFormat(undefined, { dateStyle: "long", timeStyle: "short" }).format(
        new Date(email.date)
      )
    : "—";
  byId("filename").textContent = email.filename;

  htmlPreview.srcdoc = emailDocument(email.html ?? "", currentTheme);
  textPreview.textContent = email.text || "This email does not contain a text version.";
  rawHeaders.textContent = email.rawHeaders;
  rawHtml.textContent = email.rawHtml || "This email does not contain an HTML version.";
  htmlTab.disabled = !email.html;
  renderAttachments(email);
  showMode(email.html ? "html" : "text");
}

function showError(message: string): void {
  errorToast.textContent = message;
  errorToast.hidden = false;
  window.setTimeout(() => {
    errorToast.hidden = true;
  }, 6000);
}

function openFile(): void {
  void window.emlViewer.openFile();
}

window.addEventListener("dragenter", (event) => {
  event.preventDefault();
  dragDepth += 1;
  dropOverlay.hidden = false;
});
window.addEventListener("dragover", (event) => {
  event.preventDefault();
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = "copy";
  }
});
window.addEventListener("dragleave", (event) => {
  event.preventDefault();
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) {
    dropOverlay.hidden = true;
  }
});
window.addEventListener("drop", (event) => {
  event.preventDefault();
  dragDepth = 0;
  dropOverlay.hidden = true;
  const file = event.dataTransfer?.files[0];
  if (file) {
    void window.emlViewer.openDroppedFile(file);
  }
});

byId("open-button").addEventListener("click", openFile);
byId("empty-open-button").addEventListener("click", openFile);
byId("theme-button").addEventListener("click", () => {
  const theme = currentTheme === "light" ? "dark" : "light";
  localStorage.setItem("theme", theme);
  applyTheme(theme);
});
byId("preview-dialog-close").addEventListener("click", () => previewDialog.close());
previewDialog.addEventListener("click", (event) => {
  if (event.target === previewDialog) {
    previewDialog.close();
  }
});
previewDialog.addEventListener("close", () => {
  pdfRenderGeneration += 1;
  previewDialogBody?.classList.remove("pdf-preview-active");
  previewDialogBody?.style.removeProperty("height");
  dialogImagePreview.removeAttribute("src");
  dialogVideoPreview.pause();
  dialogVideoPreview.removeAttribute("src");
  dialogVideoPreview.load();
  dialogTextPreview.textContent = "";
  dialogPdfPreview.replaceChildren();
  if (activePdfDocument) {
    void activePdfDocument.destroy();
    activePdfDocument = null;
  }
});
htmlTab.addEventListener("click", () => showMode("html"));
textTab.addEventListener("click", () => showMode("text"));
rawTab.addEventListener("click", () => showMode("raw"));
window.emlViewer.onEmailOpened(renderEmail);
window.emlViewer.onOpenError(showError);
applyTheme(currentTheme);
