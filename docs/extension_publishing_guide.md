# 🌍 Universal Web Extension Publishing & Validation Guide

This document serves as a comprehensive, platform-agnostic playbook for preparing, packaging, and publishing browser extensions to **Google Chrome**, **Microsoft Edge**, and **Mozilla Firefox**. Following these guidelines guarantees error-free automated audits and accelerated manual reviews.

---

## 📋 1. Manifest Schemas & Strict Limits

The `manifest.json` schema is parsed strictly by all store upload validators. Minor oversights will trigger automated rejections.

### 🔤 Description Character Limit (Strict)
* **Rule**: The `"description"` string must be **132 characters or fewer**.
* **Failure Mode**: Uploading a package with a longer description will cause Chrome and Edge validation to fail immediately with a `JSON does not match all schemas` schema error.
* **Best Practice**: Keep it concise, descriptive, and under 120 characters to ensure safe buffers.

### 🦊 Firefox Specifics (`browser_specific_settings`)
Firefox requires explicit declaration of platform targets and data collection consent inside the manifest.
* **Gecko ID**: Every Firefox extension must have a unique ID in the format `yourname@domain.com` or a UUID:
  ```json
  "browser_specific_settings": {
    "gecko": {
      "id": "extensionname@yourdomain.com",
      "strict_min_version": "142.0",
      "data_collection_permissions": {
        "required": ["none"]
      }
    }
  }
  ```
* **Data Collection Alignment**: If your extension defines `"data_collection_permissions"`, you **must** set `"strict_min_version"` to at least `"140.0"` (or `"142.0"` for mobile compatibility). Declaring the key with a lower minimum version (e.g. `109.0`) triggers compiler warnings.

---

## 🎨 2. Icon Asset Rules & Store Listing Sizes

One of the most common automated rejections is a mismatch between declared icon sizes and the actual, physical pixel dimensions of the image files.

### 📐 Physical Asset Matching (Strict)
* **Rule**: Firefox AMO physically audits the image header of every declared icon. If you declare `"16": "icons/icon16.png"`, the image file must be **exactly 16x16 pixels**.
* **Failure Mode**: Registering a 1024x1024 or unsized image under smaller size keys causes package rejection.
* **Best Practice**: Never use a single master file as a placeholder for multiple sizes. Use an automated resampling script (e.g. Photoshop, Sharp in Node, or .NET System.Drawing in PowerShell) to generate exact-resolution PNG files for every size.

### 🛍️ Comprehensive Store Icon Spectrum
Different stores require different icon sizes for store pages, search listings, and promotional banners. Declaring the full spectrum in your manifests makes cross-publishing seamless:

| Target Size | Manifest Key | Usage / Location |
|---|---|---|
| **16x16** | `"16"` | Standard browser action dropdown / Favicon |
| **32x32** | `"32"` | High-DPI screens / Toolbar buttons |
| **48x48** | `"48"` | Extension management dashboard (`chrome://extensions`) |
| **64x64** | `"64"` | Alternative system list displays |
| **96x96** | `"96"` | Small store search results tile |
| **128x128** | `"128"` | **Mandatory** for Chrome Web Store installation tile |
| **256x256** | `"256"` | High-definition Edge partner dashboard representation |
| **512x512** | `"512"` | Promotional banner showcase artwork |

---

## 🤐 3. Package Compression & Zip Structure

The file structure inside your uploadable `.zip` archive must be clean and relative to the extension root.

### ⚠️ Common Compression Pitfalls
1. **Windows `Compress-Archive` (PowerShell)**: Generates zip files with backslashes (`\`) in directory paths inside headers. Chrome/Edge will parse these, but Firefox silently rejects them with a `File not found` or `Invalid manifest` error.
2. **Folder Parent Nesting**: Do not zip the parent folder itself. The root of the `.zip` archive **must** contain `manifest.json` directly.
3. **Prefix Headers**: Avoid targeting the directory using a dot prefix (e.g. `tar -cf out.zip .`). This adds a `./` prefix to file headers, which strict Firefox parsers reject.

### 🔧 Perfect Cross-Platform Build Command
Always change your active directory (`cwd`) to the build folder before running the zip tool. Use native `tar` on Windows (which creates correct Unix-style forward slashes) and `zip` on Unix/macOS/Linux:

```javascript
const isWindows = process.platform === 'win32';
if (isWindows) {
  // Uses native Windows tar to format forward slashes in zip headers
  execSync(`tar -a -c -f "package.zip" manifest.json src icons`, { cwd: targetDir });
} else {
  // Standard Unix zip
  execSync(`zip -r "package.zip" manifest.json src icons`, { cwd: targetDir });
}
```

---

## 🗳️ 4. Store Submission Forms & Justifications

When uploading your extension, both Microsoft and Google require descriptions and justifications for declared APIs. Use this generic blueprint:

### 🧩 Single Purpose Description
* **Rule**: Write a clear, focused sentence stating exactly *one* narrow purpose.
* **Template**:
  > *"The single, narrow purpose of this extension is to allow users to [core action, e.g. visualize / export / organize] their [target data, e.g. JSON payloads / AI chat logs] directly within [target environment, e.g. their active browser tab / a local sandbox interface]."*

### 🔑 Common API Permission Justifications
Ensure you justify every single permission declared in your manifest:

* **`activeTab` Justification**:
  > *"Required to grant temporary, secure access to the currently focused page only when the user explicitly clicks the extension popup trigger, preventing the need for broad, persistent read/write permissions."*
* **`scripting` Justification**:
  > *"Necessary to dynamically inject and run the core parsing and formatting scripts on the page when the user initiates the action."*
* **`storage` Justification**:
  > *"Used strictly to save user preference configurations (such as layout choices, visual theme selections, and custom parameters) locally on their device."*
* **`downloads` Justification**:
  > *"Needed to trigger the browser's native file-saving system, allowing users to download generated documents or associated assets to their local machine."*
* **`tabs` Justification**:
  > *"Used to monitor tab loading sequences and automatically transition active sandbox tabs during multi-tab workflows initiated by the user."*
* **Host/Match Patterns (e.g. `<all_urls>` or specific domains)**:
  > *"Host permissions are limited strictly to [explain target URLs, e.g. the specific sites the extension supports]. This is required to read the DOM layout and extract content to format it for the user."*

---

## 📄 5. Essential Repository Documents (README & PRIVACY)

For professional open-source publishing on platforms like GitHub and compliant store submissions, having structured repository documentation is critical.

### 📘 A. Standard `README.md` Blueprint
Your repository `README.md` must clearly orient developers and users. Ensure you include:
1. **Clear Feature Description**: Explain exactly what the extension does, highlighting browser compatibility.
2. **Interactive Elements & UI Previews**: Describe the layout (e.g., popup behaviors, custom themes, visual options).
3. **Installation & Development Steps**:
   - Explicit commands to run the build pipeline (e.g., `node build.js`).
   - Platform-specific loading guides (e.g., Chrome Developer Mode `Load unpacked`, Firefox `about:debugging` `Load Temporary Add-on`).
4. **Project Structure Tree**: An ascii-visualized map of key files and directories so developers know where components reside.
5. **Publishing Guidelines**: Brief directions on how standard target zip files are built and distributed.

### 🔒 B. Compliant `PRIVACY.md` Blueprint
Most modern stores (especially Microsoft Edge and Firefox AMO) require a dedicated, publicly accessible privacy policy link during submission.
* **Core Privacy Clauses**:
  1. **Zero External Data Transmission**: Clearly state that the extension operates strictly locally. Emphasize that all DOM parsing, page actions, and file generation processes take place entirely inside the user's browser context.
  2. **Data Storage Scope**: Explain what is saved in local storage (e.g., user UI configuration choices, list caches) and guarantee that none of this data is sent to external servers or third-party trackers.
  3. **Permission Justification Transparency**: Formally detail *why* specific permissions (e.g., `host_permissions`, `activeTab`, `scripting`, `downloads`) are requested. Explain their direct relationship to core extension utility to build user trust.
  4. **Open-Source Auditing**: Point users to the open GitHub repository so they can transparently inspect the raw code themselves.

---

## 🚀 6. Final Checklist before Uploading

Before uploading your package to any developer portal, run this quick check:

- [ ] **Character Count**: Is `"description"` in `manifest.json` $\le 132$ characters?
- [ ] **Icon Physical Dimensions**: Does `icon16.png` measure exactly 16x16? `icon128.png` exactly 128x128? (Check all declared sizes).
- [ ] **Firefox ID**: Is `"browser_specific_settings"` declared with a valid email-like Gecko ID?
- [ ] **Min Version Alignment**: Is `"strict_min_version"` set to `"142.0"` or higher if `"data_collection_permissions"` is included?
- [ ] **Root Hierarchy**: Double-click your `.zip` archive. Does `manifest.json` sit immediately in the root, rather than inside a sub-folder?
- [ ] **Local Files Only**: Are there no external CDN script references? (Store policies strictly forbid remote code execution; all JS must be shipped locally inside the package).
- [ ] **No Minifier Questionnaire**: If you did not minify or bundle code, check **No** to the "minified code" form on Firefox and Edge to bypass mandatory source package uploads.
- [ ] **Compliance Docs**: Are public `README.md` and `PRIVACY.md` documents placed in the repository root for store policy reference?
