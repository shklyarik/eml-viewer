import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const outputPath = resolve("examples/attachments_example.eml");
const iconPath = resolve("build/icons/128x128.png");
const mixedBoundary = "eml-viewer-mixed-boundary";
const alternativeBoundary = "eml-viewer-alternative-boundary";
const sampleMp4Base64 = `
AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAOJbW9vdgAAAGxtdmhkAAAAAAAAAAAA
AAAAAAAD6AAAA+gAAQAAAQAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAA
AABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAArN0cmFrAAAAXHRraGQAAAADAAAA
AAAAAAAAAAABAAAAAAAAA+gAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAA
AAAAAAAAAABAAAAAAKAAAABaAAAAAAAkZWR0cwAAABxlbHN0AAAAAAAAAAEAAAPoAAAAAAABAAAA
AAIrbWRpYQAAACBtZGhkAAAAAAAAAAAAAAAAAAAyAAAAMgBVxAAAAAAALWhkbHIAAAAAAAAAAHZp
ZGUAAAAAAAAAAAAAAABWaWRlb0hhbmRsZXIAAAAB1m1pbmYAAAAUdm1oZAAAAAEAAAAAAAAAAAAA
ACRkaW5mAAAAHGRyZWYAAAAAAAAAAQAAAAx1cmwgAAAAAQAAAZZzdGJsAAAAunN0c2QAAAAAAAAA
AQAAAKphdmMxAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAKAAWgBIAAAASAAAAAAAAAABFUxhdmM2
Mi4yOC4xMDIgbGlieDI2NAAAAAAAAAAAAAAAGP//AAAAMGF2Y0MBQsAe/+EAGGdCwB7ZAo35MBEA
AAMAAQAAAwAyDxYuSAEABWjLg8sgAAAAEHBhc3AAAAABAAAAAQAAABRidHJ0AAAAAAAAI2AAAAAA
AAAAGHN0dHMAAAAAAAAAAQAAABkAAAIAAAAAFHN0c3MAAAAAAAAAAQAAAAEAAAAcc3RzYwAAAAAA
AAABAAAAAQAAABkAAAABAAAAeHN0c3oAAAAAAAAAAAAAABkAAAN7AAAACgAAAAsAAAAKAAAACgAA
AAoAAAAKAAAACgAAAAoAAAAKAAAACgAAAAoAAAAKAAAACgAAAAoAAAAKAAAACgAAAAoAAAAKAAAA
CgAAAAoAAAAKAAAACgAAAAoAAAAKAAAAFHN0Y28AAAAAAAAAAQAAA7kAAABidWR0YQAAAFptZXRh
AAAAAAAAACFoZGxyAAAAAAAAAABtZGlyYXBwbAAAAAAAAAAAAAAAAC1pbHN0AAAAJal0b28AAAAd
ZGF0YQAAAAEAAAAATGF2ZjYyLjEyLjEwMgAAAAhmcmVlAAAEdG1kYXQAAAJxBgX//23cRem95tlI
t5Ys2CDZI+7veDI2NCAtIGNvcmUgMTY1IHIzMjIyIGIzNTYwNWEgLSBILjI2NC9NUEVHLTQgQVZD
IGNvZGVjIC0gQ29weWxlZnQgMjAwMy0yMDI1IC0gaHR0cDovL3d3dy52aWRlb2xhbi5vcmcveDI2
NC5odG1sIC0gb3B0aW9uczogY2FiYWM9MCByZWY9MyBkZWJsb2NrPTE6MDowIGFuYWx5c2U9MHgx
OjB4MTExIG1lPWhleCBzdWJtZT03IHBzeT0xIHBzeV9yZD0xLjAwOjAuMDAgbWl4ZWRfcmVmPTEg
bWVfcmFuZ2U9MTYgY2hyb21hX21lPTEgdHJlbGxpcz0xIDh4OGRjdD0wIGNxbT0wIGRlYWR6b25l
PTIxLDExIGZhc3RfcHNraXA9MSBjaHJvbWFfcXBfb2Zmc2V0PS0yIHRocmVhZHM9MyBsb29rYWhl
YWRfdGhyZWFkcz0xIHNsaWNlZF90aHJlYWRzPTAgbnI9MCBkZWNpbWF0ZT0xIGludGVybGFjZWQ9
MCBibHVyYXlfY29tcGF0PTAgY29uc3RyYWluZWRfaW50cmE9MCBiZnJhbWVzPTAgd2VpZ2h0cD0w
IGtleWludD0yNTAga2V5aW50X21pbj0yNSBzY2VuZWN1dD00MCBpbnRyYV9yZWZyZXNoPTAgcmNf
bG9va2FoZWFkPTQwIHJjPWNyZiBtYnRyZWU9MSBjcmY9MjMuMCBxY29tcD0wLjYwIHFwbWluPTAg
cXBtYXg9NjkgcXBzdGVwPTQgaXBfcmF0aW89MS40MCBhcT0xOjEuMDAAgAAAAQJliIQM8RigACIv
HAAEiSOAAIhMnJycnJycnJydf+OHHjQ5wAGyZtCbKVWYAAQGsZvBvCAAKO4BwgHYIALpsGIztRYI
EMlggRjAmkZ9qLgZkuBsbW1tbW1tfHqHh0CzgAUtD2i9WAR4r+DCAAKgneEBL9AFrSBHF7VLCBWI
EKZF2qWgTCYdrp5uONS0tLS0tPT109PXXXXXT09fCIf/hoNQAGbIiY37ER3aIAAgAxEH8IAh1FhC
EpAAm0Y3IxQbdo8AA8vgERTZA+0eAAr7W1tbW1tceEP+gWQAG6MjYnyFR2QMOEpwBMAJZmJig6T9
2vwCQWgSG7X0w3XS0tLS0tLS114AAAAGQZo4GeD2AAAAB0GaVAZ4PYAAAAAGQZpgM8HsAAAABkGa
gDPB7AAAAAZBmqAzwewAAAAGQZrAM8HsAAAABkGa4DPB7AAAAAZBmwAzwewAAAAGQZsgM8HsAAAA
BkGbQDPB7AAAAAZBm2AzwewAAAAGQZuAM8HsAAAABkGboDPB7AAAAAZBm8AzwewAAAAGQZvgM8Hs
AAAABkGaADPB7AAAAAZBmiAzwewAAAAGQZpAM8HsAAAABkGaYDPB7AAAAAZBmoAzwewAAAAGQZqg
M8HsAAAABkGawC/B7AAAAAZBmuAvwewAAAAGQZsAK8Hs
`;

function wrapBase64(content) {
  return content.toString("base64").match(/.{1,76}/g)?.join("\r\n") ?? "";
}

function createPdf(message) {
  const escapedMessage = message
    .replaceAll("\\", "\\\\")
    .replaceAll("(", "\\(")
    .replaceAll(")", "\\)");
  const stream = `BT\n/F1 20 Tf\n72 760 Td\n(${escapedMessage}) Tj\nET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = [0];

  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  pdf += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join("");
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  pdf += `startxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(pdf, "ascii");
}

const icon = await readFile(iconPath);
const textAttachment = Buffer.from(
  "This text file was generated for the EML Viewer attachment example.\n",
  "utf8"
);
const pdfAttachment = createPdf("Hello from the EML Viewer PDF attachment!");
const videoAttachment = Buffer.from(sampleMp4Base64.replaceAll(/\s/g, ""), "base64");

const message = [
  "From: EML Viewer Example <sender@example.com>",
  "To: Test User <recipient@example.com>",
  "Subject: Image, text and PDF attachment example",
  "Date: Fri, 17 Jul 2026 12:00:00 +0300",
  "Message-ID: <attachments-example@eml-viewer.local>",
  "User-Agent: EML Viewer Fixture Generator/1.0",
  "X-EML-Viewer-Example: inline-image; text-attachment; pdf-attachment; mp4-attachment;",
  " Content-Language=en-US",
  "MIME-Version: 1.0",
  "Content-Language: en-US",
  `Content-Type: multipart/mixed; boundary="${mixedBoundary}"`,
  "",
  `--${mixedBoundary}`,
  `Content-Type: multipart/alternative; boundary="${alternativeBoundary}"`,
  "",
  `--${alternativeBoundary}`,
  'Content-Type: text/plain; charset="UTF-8"',
  "Content-Transfer-Encoding: quoted-printable",
  "",
  "Hello!",
  "",
  "This example email contains an embedded PNG image, text, PDF, and MP4 attachments.",
  "",
  `--${alternativeBoundary}`,
  'Content-Type: text/html; charset="UTF-8"',
  "Content-Transfer-Encoding: quoted-printable",
  "",
  "<!doctype html>",
  "<html>",
  "<body>",
  "<h1>EML Viewer attachment example</h1>",
  "<p>This email contains an embedded image plus TXT, PDF, and MP4 attachments.</p>",
  '<img src="cid:eml-viewer-example-icon" width="128" height="128" alt="EML Viewer icon">',
  "</body>",
  "</html>",
  `--${alternativeBoundary}--`,
  "",
  `--${mixedBoundary}`,
  'Content-Type: image/png; name="eml-viewer.png"',
  "Content-Transfer-Encoding: base64",
  'Content-Disposition: inline; filename="eml-viewer.png"',
  "Content-ID: <eml-viewer-example-icon>",
  "",
  wrapBase64(icon),
  "",
  `--${mixedBoundary}`,
  'Content-Type: text/plain; name="example.txt"',
  "Content-Transfer-Encoding: base64",
  'Content-Disposition: attachment; filename="example.txt"',
  "",
  wrapBase64(textAttachment),
  "",
  `--${mixedBoundary}`,
  'Content-Type: application/pdf; name="example.pdf"',
  "Content-Transfer-Encoding: base64",
  'Content-Disposition: attachment; filename="example.pdf"',
  "",
  wrapBase64(pdfAttachment),
  "",
  `--${mixedBoundary}`,
  'Content-Type: video/mp4; name="example.mp4"',
  "Content-Transfer-Encoding: base64",
  'Content-Disposition: attachment; filename="example.mp4"',
  "",
  wrapBase64(videoAttachment),
  "",
  `--${mixedBoundary}--`,
  ""
].join("\r\n");

await writeFile(outputPath, message, "utf8");
console.log(`Generated ${outputPath}`);
