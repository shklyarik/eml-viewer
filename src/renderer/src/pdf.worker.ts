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

// PDF.js does not publish a declaration for its worker entry point.
// @ts-expect-error Missing declaration in pdfjs-dist.
await import("pdfjs-dist/build/pdf.worker.min.mjs");

export {};
