# EML Viewer

A small desktop application for opening and previewing `.eml` email files. It is
built with Electron and TypeScript and distributed for Linux as an AppImage.

## Features

- Open an EML file from the application.
- Drag and drop an EML file anywhere onto the application window.
- Open a file from the command line: `eml-viewer message.eml`.
- Handle files passed by the desktop file manager.
- Use the packaged PNG icon for the application window and desktop integration.
- Preview the HTML or plain-text email body.
- Inspect the original raw email headers and decoded HTML source.
- View sender, recipients, subject, date, and filename.
- Preview common raster images, MP4 videos, TXT files, and PDFs rendered with PDF.js.
- Save email attachments.
- Switch between light and dark themes and remember the selected theme.
- Reuse the existing application window when another file is opened.
- Block scripts, remote images, and other active email content.

## Development

Requirements:

- Node.js 22 or newer
- npm 10 or newer

Install dependencies and start the application:

```bash
npm install
npm run dev
```

Open a specific email while developing:

```bash
npm run dev -- /absolute/path/to/message.eml
```

The repository includes a nested multipart example with HTML, plain text, inline
CID images, and an attachment:

```bash
npm run dev -- "$PWD/examples/test_sample_message.eml"
```

Another generated example contains an inline PNG image plus TXT, PDF, and MP4
attachments:

```bash
npm run generate:example
npm run dev -- "$PWD/examples/attachments_example.eml"
```

The generator uses the application icon as the embedded image and creates the
text and PDF attachments without external tools.

Run TypeScript checks and build the application:

```bash
npm run check
npm run build
```

## Build an AppImage

Build the Linux AppImage locally:

```bash
npm run package
```

The output is written to `dist/eml-viewer-<version>-x86_64.AppImage`.

Make the file executable and open an email:

```bash
chmod +x dist/eml-viewer-0.1.0-x86_64.AppImage
./dist/eml-viewer-0.1.0-x86_64.AppImage message.eml
```

An AppImage can also be integrated into the desktop with a tool such as
AppImageLauncher. Once integrated, EML Viewer can be selected as the default
application for `message/rfc822` (`.eml`) files.

To make the short `eml-viewer` command available without desktop integration,
create a symlink from a directory included in `PATH`:

```bash
mkdir -p ~/.local/bin
ln -s "$PWD/dist/eml-viewer-0.1.0-x86_64.AppImage" ~/.local/bin/eml-viewer
eml-viewer message.eml
```

## Releases

The GitHub Actions workflow builds an AppImage when a tag starting with `v` is
pushed. The tag should match the version in `package.json`.

```bash
npm version patch
git push origin main --follow-tags
```

The workflow creates a GitHub Release, generates release notes, and attaches the
AppImage. It can also be started manually from the Actions tab; manual builds are
stored as workflow artifacts instead of GitHub Releases.

## Security

Email content is untrusted input. The application uses context isolation, disables
Node.js in the renderer, sanitizes email HTML, displays it inside a sandboxed
iframe, and applies a restrictive Content Security Policy. Remote images are not
loaded, so opening an email does not notify tracking servers. Embedded CID images
are converted to local data URLs and can be displayed without a network request.
The Raw tab displays original HTML source as inert text and never executes it.

Attachments are never executed by the application. They are only written to a
location explicitly selected by the user. Built-in binary previews are limited to
common raster image formats, MP4 files, and PDFs up to 50 MB. Text previews are
limited to 2 MB. SVG files are not previewed.

## Project structure

```text
src/main/       Electron main process and EML parsing
src/preload/    Restricted API exposed to the renderer
src/renderer/   User interface
src/shared/     Shared TypeScript types
```

## License

MIT
