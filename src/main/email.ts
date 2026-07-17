import { readFile, stat } from "node:fs/promises";
import { basename } from "node:path";
import PostalMime from "postal-mime";
import sanitizeHtml from "sanitize-html";
import type { AttachmentInfo, EmailAddress, EmailPreview } from "../shared/types";

export interface StoredAttachment extends AttachmentInfo {
  content: Buffer;
}

export interface ParsedEmail {
  preview: EmailPreview;
  attachments: Map<string, StoredAttachment>;
}

const MAX_EMAIL_SIZE = 100 * 1024 * 1024;
const MAX_RAW_HEADERS_SIZE = 512 * 1024;
const PREVIEWABLE_IMAGE_TYPES = new Set([
  "image/avif",
  "image/bmp",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp"
]);

function getAttachmentPreviewType(
  mimeType: string,
  filename: string
): AttachmentInfo["previewType"] {
  const normalizedMimeType = mimeType.toLowerCase();
  const normalizedFilename = filename.toLowerCase();

  if (PREVIEWABLE_IMAGE_TYPES.has(normalizedMimeType)) {
    return "image";
  }
  if (normalizedMimeType === "video/mp4" || normalizedFilename.endsWith(".mp4")) {
    return "video";
  }
  if (normalizedMimeType === "application/pdf" || normalizedFilename.endsWith(".pdf")) {
    return "pdf";
  }
  if (normalizedMimeType === "text/plain" || normalizedFilename.endsWith(".txt")) {
    return "text";
  }
  return undefined;
}

function normalizeAddress(
  value: { address?: string; name?: string } | undefined
): EmailAddress | undefined {
  if (!value?.address) {
    return undefined;
  }

  return {
    address: value.address,
    ...(value.name ? { name: value.name } : {})
  };
}

function normalizeAddresses(
  values: Array<{ address?: string; name?: string }> | undefined
): EmailAddress[] {
  return (values ?? [])
    .map(normalizeAddress)
    .filter((value): value is EmailAddress => value !== undefined);
}

function extractRawHeaders(source: Buffer): string {
  const crlfSeparator = source.indexOf("\r\n\r\n");
  const lfSeparator = source.indexOf("\n\n");
  const separatorIndex =
    crlfSeparator >= 0
      ? crlfSeparator
      : lfSeparator >= 0
        ? lfSeparator
        : source.byteLength;
  const headerLength = Math.min(separatorIndex, MAX_RAW_HEADERS_SIZE);
  const headers = source.subarray(0, headerLength).toString("utf8");

  if (separatorIndex > MAX_RAW_HEADERS_SIZE) {
    return `${headers}\n\n[Headers truncated at 512 KB]`;
  }

  return headers;
}

function normalizeContentId(contentId: string): string {
  return contentId.trim().replace(/^<|>$/g, "");
}

function sanitizeEmailHtml(html: string, inlineImages: Map<string, string>): string {
  return sanitizeHtml(html, {
    allowedTags: [
      ...sanitizeHtml.defaults.allowedTags,
      "article",
      "aside",
      "details",
      "figcaption",
      "figure",
      "footer",
      "header",
      "img",
      "main",
      "section",
      "summary"
    ],
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      "*": ["class", "dir", "lang", "style", "title"],
      a: ["href", "name", "target", "title"],
      img: ["alt", "height", "src", "title", "width"]
    },
    allowedSchemes: ["cid", "data"],
    allowedSchemesByTag: {
      a: ["http", "https", "mailto"],
      img: ["cid", "data"]
    },
    transformTags: {
      img: (tagName, attributes) => {
        const source = attributes.src;
        if (!source?.toLowerCase().startsWith("cid:")) {
          return { tagName, attribs: attributes };
        }

        let contentId = source.slice(4);
        try {
          contentId = decodeURIComponent(contentId);
        } catch {
          // Keep the original value when a content ID contains invalid URL encoding.
        }

        const embeddedSource = inlineImages.get(normalizeContentId(contentId));
        return {
          tagName,
          attribs: embeddedSource ? { ...attributes, src: embeddedSource } : attributes
        };
      }
    },
    allowProtocolRelative: false,
    disallowedTagsMode: "discard"
  });
}

export async function parseEmailFile(filePath: string): Promise<ParsedEmail> {
  const fileInfo = await stat(filePath);

  if (fileInfo.size > MAX_EMAIL_SIZE) {
    throw new Error("The selected file is larger than the 100 MB limit.");
  }

  const source = await readFile(filePath);
  const parsed = await new PostalMime().parse(source);
  const attachments = new Map<string, StoredAttachment>();
  const inlineImages = new Map<string, string>();
  const attachmentInfo = parsed.attachments.map((attachment, index) => {
    const id = String(index);
    const filename = attachment.filename || `attachment-${index + 1}`;
    let content: Buffer;

    if (typeof attachment.content === "string") {
      content = Buffer.from(attachment.content);
    } else if (attachment.content instanceof ArrayBuffer) {
      content = Buffer.from(new Uint8Array(attachment.content));
    } else {
      content = Buffer.from(attachment.content);
    }
    const mimeType = attachment.mimeType || "application/octet-stream";
    const previewType = getAttachmentPreviewType(mimeType, filename);
    const info: AttachmentInfo = {
      id,
      filename,
      mimeType,
      size: content.byteLength,
      disposition: attachment.disposition || "attachment",
      ...(previewType ? { previewType } : {})
    };

    attachments.set(id, { ...info, content });
    if (attachment.contentId && attachment.mimeType?.startsWith("image/")) {
      inlineImages.set(
        normalizeContentId(attachment.contentId),
        `data:${info.mimeType};base64,${content.toString("base64")}`
      );
    }
    return info;
  });

  const preview: EmailPreview = {
    filePath,
    filename: basename(filePath),
    subject: parsed.subject || "(no subject)",
    rawHeaders: extractRawHeaders(source),
    ...(parsed.html ? { rawHtml: parsed.html } : {}),
    ...(parsed.date ? { date: parsed.date } : {}),
    ...(normalizeAddress(parsed.from) ? { from: normalizeAddress(parsed.from) } : {}),
    to: normalizeAddresses(parsed.to),
    cc: normalizeAddresses(parsed.cc),
    ...(parsed.html ? { html: sanitizeEmailHtml(parsed.html, inlineImages) } : {}),
    ...(parsed.text ? { text: parsed.text } : {}),
    attachments: attachmentInfo
  };

  return { preview, attachments };
}
