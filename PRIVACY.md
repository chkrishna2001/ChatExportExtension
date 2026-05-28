# Privacy Policy for SaveGPT

**Last Updated: May 28, 2026**

The **SaveGPT** browser extension ("the Extension") is designed with absolute privacy and security in mind. This Privacy Policy outlines our strict data practices.

---

### 1. Data Collection and Usage
**We do not collect, store, or transmit any of your personal data, chat transcripts, or media assets.** 

The Extension operates entirely locally on your machine. When you initiate a single-tab or batch export:
* All DOM parsing, message formatting, and Markdown generation occur locally in your browser.
* All downloaded Markdown (`.md`) files and associated media assets are saved directly to your local disk using native Web APIs.
* We use local storage (`chrome.storage.local`) solely to preserve your configuration preferences (e.g., whether to download media and your batch URL list). This preference data never leaves your device.

---

### 2. Website Content and Permissions
The Extension requests only the minimal set of permissions required to perform its core functions:
* **Host Permissions (`https://chatgpt.com/*`, `https://*.claude.ai/*`, `https://gemini.google.com/*`)**: Required solely to read the page structure and locate message containers on the official chat platforms you are currently viewing.
* **`activeTab` & `scripting`**: Used to temporarily execute the auto-scrolling engine and parse the messages of the focused tab upon your request, ensuring the extension only interacts with your pages when you explicitly click the action button.
* **`downloads`**: Used strictly to save the generated Markdown documents and related chat images to your default Downloads folder.
* **`tabs`**: Used exclusively in the batch export flow to open the chat links you input, monitor their load state, execute the local exporter, and automatically close the tabs when compilation is complete.

No data extracted from your tabs or files is ever transmitted to external servers, third-party services, or analytics platforms.

---

### 3. Contact
If you have any questions, suggestions, or concerns regarding your privacy or this policy, please feel free to open an issue or submit a pull request on our GitHub repository.
