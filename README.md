# 🚀 SaveGPT - Premium AI Chat Exporter

SaveGPT is a beautiful, premium, and feature-rich browser extension designed to backup and archive your AI conversations from **ChatGPT**, **Claude**, and **Gemini** into beautifully formatted Markdown (`.md`) files. 

Equipped with an advanced automated scrolling engine and a complete media archiver, SaveGPT handles long threads, rich text formatting, nested lists, source code styling, tables, and images with absolute elegance.

---

## ✨ Features

* **🎨 Neon Glassmorphism UI**: A futuristic, high-aesthetic popup interface featuring premium slate-dark colors, glowing neon badges, custom animation slides, and real-time batch progress monitoring.
* **⚡ Smart Scrolling Engine**: AI chats load messages dynamically as you scroll up. SaveGPT automatically scrolls up to fully retrieve and compile your complete chat history before generating the Markdown.
* **📦 Complete Media Archiver**: Toggling the media backup option will download all images/attachments from your chat directly into platform-specific folders (`[platform]_chats/[platform]_[title]_[timestamp]/media/`) and automatically translate Markdown references into relative local paths (`![img](media/filename.png)`).
* **🔄 Automated Batch Export**: Paste a list of chat URLs/IDs in the queue, click export, and let the background service worker sequentially open tabs, scroll through histories, compile documents, trigger downloads, and clean up.
* **🛡️ CSP & Browser Compliant**: Uses standard native Web APIs and secure Blob-based URIs to ensure compliance with strict Content Security Policies (CSP) and Firefox MV3 specifications.

---

## 🛠️ Technology Stack & Architecture

* **Core Logic**: Vanilla ES6+ Javascript (no external npm library dependencies for absolute lightweight performance and security approval).
* **Styling**: Modern CSS utilizing HSL color variables, smooth hardware-accelerated transitions, and responsive flex/grid layouts.
* **Distribution Build System**: Cross-platform `build.js` compiler supporting native Windows `tar` and Unix/CI/CD shell pipelines.
* **Supported Platforms**:
  * **Google Chrome** (Manifest V3)
  * **Microsoft Edge** (Manifest V3)
  * **Mozilla Firefox** (Manifest V3 - compatible with Android)

---

## 📂 Project Structure

```text
├── dist/                       # Compiled release directories and archives
│   ├── chrome/                 # Unpacked distribution folder for Chrome & Edge
│   ├── firefox/                # Unpacked distribution folder for Firefox
│   ├── savegpt-chrome-edge.zip # Store-ready upload archive for Chrome/Edge
│   └── savegpt-firefox.zip     # Store-ready upload archive for Firefox
├── icons/                      # Verification-compliant, multi-size icon suites
│   └── icon16.png to icon512.png
├── src/                        # Core Shared Extension source code
│   ├── background.js           # Sequentially manages background batch exports
│   ├── content.js              # Scrolling manager and DOM scraper injection
│   ├── markdown.js             # Pure JS HTML-to-Markdown parser
│   ├── parsers.js              # Platform-specific DOM classifiers (ChatGPT, Claude, Gemini)
│   ├── popup.css               # Premium Slate/Neon popup styling
│   ├── popup.html              # Futuristic Glassmorphic user interface
│   └── popup.js                # Extension popup interaction controller
├── build.js                    # Cross-platform automated packaging script
├── manifest.chrome.json        # Main configuration tailored for Chrome/Edge MV3
└── manifest.firefox.json       # Strict engine configuration tailored for Firefox MV3
```

---

## 🚀 Getting Started (Development Mode)

### 1. Build the Extensions
Run the Node build compiler to clean and pack the distribution assets:
```bash
node build.js
```
This generates the `dist/` workspace populated with unpacked directories and ready-to-upload store zip files.

### 2. Loading into Google Chrome & Microsoft Edge
1. Open your browser and navigate to:
   * **Chrome**: `chrome://extensions/`
   * **Edge**: `edge://extensions/`
2. Enable **Developer mode** via the toggle switch in the top-right corner.
3. Click the **Load unpacked** button in the top-left.
4. Select the directory: `/dist/chrome` in this repository.
5. SaveGPT is now loaded! Pin it to your toolbar to access the popup.

### 3. Loading into Mozilla Firefox
1. Open Firefox and navigate to: `about:debugging#/runtime/this-firefox`
2. Click the **Load Temporary Add-on...** button.
3. Select the file: `/dist/firefox/manifest.json`.
4. SaveGPT is loaded temporarily for your session!

---

## 🚀 Submitting to Browser Web Stores

SaveGPT has been fully audited and optimized against strict browser store submission standards:

### 1. Chrome Web Store & Microsoft Edge Add-ons
Upload the compiled `dist/savegpt-chrome-edge.zip` archive directly to the developer consoles.
* **Icon Set**: The icons folder contains a full suite of store-compliant sizes (16, 32, 48, 64, 96, 128, 256, 512).
* **Schema Length**: The description is within the strict 132-character manifest limits.

### 2. Firefox Add-ons (AMO)
Upload the compiled `dist/savegpt-firefox.zip` archive directly to the Firefox Developer Hub.
* **Gecko Support**: Includes mandatory `"data_collection_permissions": { "required": ["none"] }` configurations.
* **Version Targets**: Automatically binned for `"strict_min_version": "142.0"` to perfectly align with modern AMO data policy validation checks without warnings.

---

## 📄 License

This project is open-source and licensed under the permissive [ISC License](LICENSE) (matching standard open-source web conventions). You are free to modify, distribute, and contribute to this repository!
