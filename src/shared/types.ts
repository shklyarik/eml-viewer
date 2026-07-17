export interface EmailAddress {
  address: string;
  name?: string;
}

export interface AttachmentInfo {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  disposition: string;
  previewType?: "image" | "video" | "text" | "pdf";
}

export type AttachmentPreview =
  | { type: "image"; source: string }
  | { type: "video"; source: string }
  | { type: "pdf"; source: string }
  | { type: "text"; content: string };

export interface EmailPreview {
  filePath: string;
  filename: string;
  subject: string;
  rawHeaders: string;
  rawHtml?: string;
  date?: string;
  from?: EmailAddress;
  to: EmailAddress[];
  cc: EmailAddress[];
  html?: string;
  text?: string;
  attachments: AttachmentInfo[];
}

export interface EmlViewerApi {
  openFile(): Promise<EmailPreview | null>;
  openDroppedFile(file: File): Promise<EmailPreview | null>;
  getAttachmentPreview(id: string): Promise<AttachmentPreview | null>;
  saveAttachment(id: string): Promise<boolean>;
  onEmailOpened(callback: (email: EmailPreview) => void): () => void;
  onOpenError(callback: (message: string) => void): () => void;
}
