if (window.location.hostname.includes('claude.ai') || window.location.hostname.includes('deepseek.com')) {
  try {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('src/inject.js');
    (document.head || document.documentElement).appendChild(script);
    script.remove();
  } catch (e) {
    console.error('[SaveGPT] Injected script load failed:', e);
  }
}

// Global network cache variables
window.SaveGPTClaudeData = null;
window.SaveGPTDeepSeekData = null;

window.addEventListener('message', (e) => {
  if (e.source !== window) return;
  
  if (e.data && e.data.type === 'SAVEGPT_CLAUDE_CHAT_INTERCEPTED') {
    console.log('[SaveGPT] Cache Claude network data');
    window.SaveGPTClaudeData = e.data.data;
  }
  
  if (e.data && e.data.type === 'SAVEGPT_DEEPSEEK_CHAT_INTERCEPTED') {
    console.log('[SaveGPT] Cache DeepSeek network data');
    window.SaveGPTDeepSeekData = e.data.data;
  }
});

/**
 * SaveGPT Content Script
 * Handles auto-scrolling, active DOM extraction, Markdown rendering,
 * media and attachment extraction, relative Markdown link mapping,
 * and renders a premium floating widget.
 */

// Global control variable to allow aborting the scroll process
let isExportAborted = false;

// Inject CSS styles for the Floating Status Overlay dynamically
const overlayStyles = `
  #savegpt-overlay {
    position: fixed;
    bottom: 24px;
    right: 24px;
    width: 320px;
    background: rgba(15, 23, 42, 0.85);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 16px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.1);
    color: #f8fafc;
    font-family: system-ui, -apple-system, sans-serif;
    padding: 20px;
    z-index: 999999;
    display: flex;
    flex-direction: column;
    gap: 14px;
    animation: slideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    transition: all 0.3s ease;
  }
  @keyframes slideIn {
    from { transform: translateY(20px) scale(0.95); opacity: 0; }
    to { transform: translateY(0) scale(1); opacity: 1; }
  }
  .sg-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .sg-title {
    font-size: 15px;
    font-weight: 700;
    letter-spacing: -0.01em;
    background: linear-gradient(135deg, #38bdf8, #a855f7);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }
  .sg-spinner {
    width: 18px;
    height: 18px;
    border: 2px solid rgba(56, 189, 248, 0.2);
    border-top: 2px solid #38bdf8;
    border-radius: 50%;
    animation: sg-spin 0.8s linear infinite;
  }
  @keyframes sg-spin {
    to { transform: rotate(360deg); }
  }
  .sg-status {
    font-size: 13px;
    color: #94a3b8;
    line-height: 1.4;
  }
  .sg-progress-bar-bg {
    width: 100%;
    height: 6px;
    background: rgba(255, 255, 255, 0.08);
    border-radius: 99px;
    overflow: hidden;
  }
  .sg-progress-bar-fill {
    height: 100%;
    width: 0%;
    background: linear-gradient(90deg, #38bdf8, #a855f7);
    border-radius: 99px;
    transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }
  .sg-btn-abort {
    background: rgba(239, 68, 68, 0.15);
    border: 1px solid rgba(239, 68, 68, 0.3);
    border-radius: 8px;
    color: #fca5a5;
    cursor: pointer;
    font-size: 12px;
    font-weight: 600;
    padding: 8px 12px;
    text-align: center;
    transition: all 0.2s ease;
    outline: none;
  }
  .sg-btn-abort:hover {
    background: rgba(239, 68, 68, 0.3);
    border-color: #ef4444;
    color: #ffffff;
    box-shadow: 0 0 10px rgba(239, 68, 68, 0.2);
  }
`;

/**
 * Creates and injects the Status Overlay Widget into the active page DOM.
 */
function createOverlay() {
  // Prevent duplicate overlays
  removeOverlay();
  isExportAborted = false;

  const styleEl = document.createElement('style');
  styleEl.id = 'savegpt-overlay-style';
  styleEl.textContent = overlayStyles;
  document.head.appendChild(styleEl);

  const container = document.createElement('div');
  container.id = 'savegpt-overlay';
  container.innerHTML = `
    <div class="sg-header">
      <span class="sg-title">SaveGPT Active</span>
      <div class="sg-spinner"></div>
    </div>
    <div class="sg-status" id="sg-status-text">Initializing chat backup...</div>
    <div class="sg-progress-bar-bg">
      <div class="sg-progress-bar-fill" id="sg-progress-fill"></div>
    </div>
    <button class="sg-btn-abort" id="sg-btn-abort-action">Abort & Save Current</button>
  `;
  document.body.appendChild(container);

  document.getElementById('sg-btn-abort-action').addEventListener('click', () => {
    isExportAborted = true;
    updateStatusText('Backup aborted by user. Compiling loaded content...');
  });
}

/**
 * Updates the text status in the injected overlay.
 */
function updateStatusText(text, percentage = null) {
  const statusEl = document.getElementById('sg-status-text');
  if (statusEl) {
    statusEl.textContent = text;
  }
  if (percentage !== null) {
    const fillEl = document.getElementById('sg-progress-fill');
    if (fillEl) {
      fillEl.style.width = `${percentage}%`;
    }
  }
}

/**
 * Removes the Status Overlay Widget from the DOM.
 */
function removeOverlay() {
  const overlay = document.getElementById('savegpt-overlay');
  if (overlay) overlay.remove();

  const styleEl = document.getElementById('savegpt-overlay-style');
  if (styleEl) styleEl.remove();
}

/**
 * Finds the scrollable container holding the chat conversation.
 * Scrapes standard class combinations and properties.
 */
function findScrollContainer(platform) {
  if (platform === 'chatgpt') {
    // ChatGPT utilizes a standard scroll-to-bottom utility wrapper
    const reactScroll = document.querySelector('div[class*="react-scroll-to-bottom"]');
    if (reactScroll) {
      // Find the inner scrollable element if react-scroll-to-bottom uses a nested wrapper
      const inner = reactScroll.querySelector('.react-scroll-to-bottom--css-') || reactScroll.firstElementChild;
      if (inner && inner.scrollHeight > inner.clientHeight) return inner;
      return reactScroll;
    }
  } else if (platform === 'claude') {
    const claudeScroll = document.querySelector('.overflow-y-auto');
    if (claudeScroll) return claudeScroll;
  } else if (platform === 'gemini') {
    const geminiScroll = document.querySelector('.chat-scroll-container, .conversation-container');
    if (geminiScroll) return geminiScroll;
  }

  // Generic Fallback: Search elements with overflow scroll and high scrollable contents
  const scrollableElements = Array.from(document.querySelectorAll('div, main, section')).filter((el) => {
    const style = window.getComputedStyle(el);
    const hasScrollOverflow = style.overflowY === 'auto' || style.overflowY === 'scroll';
    return hasScrollOverflow && el.scrollHeight > el.clientHeight;
  });

  if (scrollableElements.length > 0) {
    // Return the element with the highest scrollable content that is visible
    return scrollableElements.sort((a, b) => b.scrollHeight - a.scrollHeight)[0];
  }

  // Ultimate fallback is the document element or window
  return document.documentElement;
}

/**
 * Robust async scroll-to-top routine.
 * Progressively scrolls the container to the top to trigger dynamic content loads.
 */
async function autoScrollToTop(scrollContainer, platform) {
  return new Promise((resolve) => {
    let lastScrollHeight = scrollContainer.scrollHeight;
    let unchangedCount = 0;
    let currentStep = 0;
    const maxSteps = 40; // Max scrolls to prevent runaways

    // Determine scrolling mode (some sites need window scrolls, others target DOM element)
    const isDocument = scrollContainer === document.documentElement;

    const scrollInterval = setInterval(() => {
      // User aborted scroll, exit early
      if (isExportAborted) {
        clearInterval(scrollInterval);
        resolve();
        return;
      }

      currentStep++;
      const progressPercent = Math.min(90, Math.floor((currentStep / maxSteps) * 100));
      updateStatusText(`Scrolling to load chat history (Scroll ${currentStep}/${maxSteps})...`, progressPercent);

      // Perform scrolling up
      if (isDocument) {
        window.scrollTo(0, 0);
      } else {
        // Scroll up in increments or to top
        scrollContainer.scrollTop = 0;
      }

      // Check if scrollHeight has increased (indicating new history items have loaded)
      const currentScrollHeight = scrollContainer.scrollHeight;
      if (currentScrollHeight === lastScrollHeight) {
        unchangedCount++;
      } else {
        unchangedCount = 0;
        lastScrollHeight = currentScrollHeight;
      }

      // Stop condition: scroll position has stayed 0, and height hasn't changed for 3 consecutive intervals
      if (unchangedCount >= 3 || currentStep >= maxSteps) {
        clearInterval(scrollInterval);
        updateStatusText('Fully scrolled. Compiling chat...', 95);
        setTimeout(resolve, 800); // Give the DOM one last moment to settle
      }
    }, 700); // Wait 700ms between scrolls to allow AJAX/rendering
  });
}

/**
 * Converts site-specific blob: URLs into base64 data URLs inside content page origin scope.
 */
async function blobUrlToDataUrl(blobUrl) {
  try {
    const response = await fetch(blobUrl);
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });
  } catch (e) {
    console.error('Failed to convert blob URL:', e);
    return blobUrl; // Return raw url if conversion fails
  }
}

/**
 * Extracts standard chat media files and attachments from conversation turns.
 */
async function extractMedia(turns) {
  const mediaList = [];
  let imageCounter = 1;
  let fileCounter = 1;

  for (const turn of turns) {
    const el = turn.element;
    if (!el) continue;

    // 1. Search for Images
    const images = el.querySelectorAll('img');
    for (const img of images) {
      // Get image dimensions or attributes
      const width = img.naturalWidth || img.clientWidth || parseInt(img.getAttribute('width') || '100', 10);
      const height = img.naturalHeight || img.clientHeight || parseInt(img.getAttribute('height') || '100', 10);
      
      // Heuristic to filter out avatars or small interface icons
      const isAvatar = img.classList.contains('avatar') || 
                       img.className.toLowerCase().includes('avatar') || 
                       (img.getAttribute('alt') || '').toLowerCase().includes('avatar') ||
                       (width < 45 && height < 45);
                       
      if (isAvatar) continue;

      const rawSrc = img.getAttribute('src');
      if (!rawSrc) continue;

      let src = rawSrc;
      // Make relative URLs absolute
      if (src.startsWith('//')) {
        src = window.location.protocol + src;
      } else if (src.startsWith('/')) {
        src = window.location.origin + src;
      }

      // Convert blob: URLs into standard data base64 strings so they can download on any browser context
      if (src.startsWith('blob:')) {
        src = await blobUrlToDataUrl(src);
      }

      let extension = 'png';
      if (src.startsWith('data:')) {
        const mimeMatch = src.match(/data:image\/([a-zA-Z+0-9]+);base64/);
        if (mimeMatch) extension = mimeMatch[1];
      } else {
        const extMatch = src.split('?')[0].split('#')[0].match(/\.([a-zA-Z0-9]+)$/);
        if (extMatch) extension = extMatch[1];
      }

      let altText = img.getAttribute('alt') || img.getAttribute('title') || '';
      
      // Strict security: if alt text is empty, contains a URL, or is too long, reject it to avoid MAX_PATH failures!
      if (!altText || altText.includes('://') || altText.startsWith('http') || altText.length > 50) {
        altText = `image_${imageCounter}`;
      } else {
        // Clean name and strictly truncate to 25 characters to keep paths extremely safe on Windows
        altText = altText.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 25);
      }
      
      const name = `${altText}.${extension}`;

      mediaList.push({
        url: src,
        type: 'image',
        extension: extension,
        name: name,
        originalSrc: rawSrc // Kept for exact Markdown relative path string replacement
      });
      imageCounter++;
    }

    // 2. Search for downloadable file attachments
    const links = el.querySelectorAll('a[href]');
    for (const a of links) {
      const rawHref = a.getAttribute('href');
      if (!rawHref) continue;

      // Skip navigation blocks
      if (rawHref.startsWith('#') || rawHref.startsWith('javascript:')) continue;

      let href = rawHref;
      // Make absolute
      if (href.startsWith('//')) {
        href = window.location.protocol + href;
      } else if (href.startsWith('/')) {
        href = window.location.origin + href;
      }

      // Detect if link points to standard document/archive attachments
      const hasDownload = a.hasAttribute('download');
      const extMatch = href.split('?')[0].split('#')[0].match(/\.([a-zA-Z0-9]+)$/);
      const isFile = extMatch && ['pdf', 'docx', 'xlsx', 'pptx', 'zip', 'csv', 'txt', 'json', 'png', 'jpg', 'jpeg', 'mp3', 'mp4', 'wav', 'gif'].includes(extMatch[1].toLowerCase());

      if (hasDownload || isFile) {
        let extension = extMatch ? extMatch[1].toLowerCase() : 'download';
        let rawName = a.getAttribute('download') || a.textContent.trim() || '';
        
        // Strict security: if attachment text is a URL, empty, or too long, fallback to safe indices
        if (!rawName || rawName.includes('://') || rawName.startsWith('http') || rawName.length > 50) {
          rawName = `attachment_${fileCounter}`;
        } else {
          // Clean name and strictly truncate to 25 characters to keep paths safe on Windows
          rawName = rawName.replace(/[^a-zA-Z0-9._-]/g, '_').substring(0, 25);
        }

        let suggestedName = rawName;
        if (!suggestedName.endsWith(`.${extension}`)) {
          suggestedName = `${suggestedName}.${extension}`;
        }

        mediaList.push({
          url: href,
          type: 'attachment',
          extension: extension,
          name: suggestedName,
          originalSrc: rawHref // Kept for exact Markdown relative path string replacement
        });
        fileCounter++;
      }
    }
  }

  return mediaList;
}

/**
 * Main export handler.
 * Performs scroll, DOM parsing, HTML-to-Markdown conversion, and formats the output.
 */
async function handleExport(options = {}) {
  const platform = window.SaveGPTParsers.detectPlatform();
  const format = options.format || 'markdown';
  
  if (options.autoScroll) {
    createOverlay();
    const scrollContainer = findScrollContainer(platform);
    if (scrollContainer) {
      console.log('📜 SaveGPT: Found scroll container, initiating auto-scroll...');
      await autoScrollToTop(scrollContainer, platform);
    } else {
      console.warn('⚠️ SaveGPT: No scroll container detected, exporting visible only.');
    }
  }

  // Compile final output based on format
  try {
    if (options.autoScroll) {
      updateStatusText('Generating structures...', 98);
    }

    const turns = window.SaveGPTParsers.extractConversation();
    const title = window.SaveGPTParsers.extractTitle(platform);
    
    let fileContent = '';

    if (format === 'json') {
      const jsonOutput = {
        title: title,
        source: window.location.href,
        platform: platform.toUpperCase(),
        exportDate: new Date().toLocaleString(),
        messages: turns.map(t => ({
          sender: t.sender,
          text: t.rawText !== undefined ? t.rawText : window.SaveGPTMarkdown.convert(t.element)
        }))
      };
      fileContent = JSON.stringify(jsonOutput, null, 2);
    } 
    else if (format === 'html') {
      let htmlMessages = '';
      turns.forEach((t) => {
        const senderLabel = t.sender === 'User' ? 'User' : 'Assistant';
        const senderClass = t.sender === 'User' ? 'user-msg' : 'assistant-msg';
        const avatar = t.sender === 'User' ? '🧑' : '🤖';
        
        let contentHtml = '';
        if (t.rawText !== undefined) {
          contentHtml = convertMarkdownToHtml(t.rawText);
        } else {
          contentHtml = t.element.innerHTML;
        }
        
        htmlMessages += `
        <div class="message-card ${senderClass}">
          <div class="message-header">
            <span class="avatar">${avatar}</span>
            <span class="sender-name">${senderLabel}</span>
          </div>
          <div class="message-content">
            ${contentHtml}
          </div>
        </div>`;
      });

      fileContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} - Chat Export</title>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-app: #060913;
      --bg-card: rgba(15, 23, 42, 0.45);
      --border-glass: rgba(255, 255, 255, 0.08);
      --text-primary: #f8fafc;
      --text-secondary: #94a3b8;
      --text-muted: #64748b;
      --color-cyan: #06b6d4;
      --color-purple: #8b5cf6;
      --grad-primary: linear-gradient(135deg, #06b6d4 0%, #8b5cf6 100%);
    }
    
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    
    body {
      background-color: var(--bg-app);
      color: var(--text-primary);
      font-family: 'Outfit', sans-serif;
      line-height: 1.6;
      padding: 40px 20px;
    }
    
    .container {
      max-width: 800px;
      margin: 0 auto;
      display: flex;
      flex-direction: column;
      gap: 24px;
    }
    
    header {
      border-bottom: 1px solid var(--border-glass);
      padding-bottom: 20px;
      margin-bottom: 10px;
    }
    
    h1 {
      font-size: 32px;
      font-weight: 800;
      letter-spacing: -0.02em;
      margin-bottom: 8px;
      background: var(--grad-primary);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    
    .metadata {
      font-size: 13px;
      color: var(--text-secondary);
      display: flex;
      flex-wrap: wrap;
      gap: 16px;
    }
    
    .metadata a {
      color: var(--color-cyan);
      text-decoration: none;
    }
    
    .metadata a:hover {
      text-decoration: underline;
    }
    
    .message-card {
      background: var(--bg-card);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      border: 1px solid var(--border-glass);
      border-radius: 16px;
      padding: 24px;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
      transition: transform 0.2s ease;
      margin-bottom: 20px;
    }
    
    .message-card:hover {
      transform: translateY(-2px);
    }
    
    .user-msg {
      border-left: 4px solid var(--color-cyan);
    }
    
    .assistant-msg {
      border-left: 4px solid var(--color-purple);
    }
    
    .message-header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 16px;
    }
    
    .avatar {
      font-size: 20px;
    }
    
    .sender-name {
      font-weight: 700;
      font-size: 15px;
      letter-spacing: -0.01em;
    }
    
    .message-content {
      font-size: 15px;
      color: #e2e8f0;
    }
    
    .message-content p {
      margin-bottom: 12px;
    }
    
    .message-content p:last-child {
      margin-bottom: 0;
    }
    
    pre {
      background: #0f172a;
      border: 1px solid rgba(255, 255, 255, 0.05);
      border-radius: 8px;
      padding: 16px;
      overflow-x: auto;
      margin: 16px 0;
      font-family: 'Fira Code', 'Courier New', Courier, monospace;
      font-size: 14px;
    }
    
    code {
      background: rgba(255, 255, 255, 0.06);
      padding: 2px 6px;
      border-radius: 4px;
      font-family: 'Fira Code', 'Courier New', Courier, monospace;
      font-size: 13.5px;
    }
    
    pre code {
      background: transparent;
      padding: 0;
      border-radius: 0;
      font-size: 14px;
    }
    
    a {
      color: var(--color-cyan);
      text-decoration: none;
    }
    
    a:hover {
      text-decoration: underline;
    }
    
    ul, ol {
      margin: 12px 0 12px 20px;
    }
    
    li {
      margin-bottom: 6px;
    }
    
    blockquote {
      border-left: 4px solid var(--text-muted);
      padding-left: 16px;
      color: var(--text-secondary);
      font-style: italic;
      margin: 16px 0;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>${escapeHtml(title)}</h1>
      <div class="metadata">
        <span>Platform: <strong>${platform.toUpperCase()}</strong></span>
        <span>Source: <a href="${window.location.href}" target="_blank">${window.location.href}</a></span>
        <span>Date: <strong>${new Date().toLocaleString()}</strong></span>
      </div>
    </header>
    <main>
      ${htmlMessages}
    </main>
  </div>
</body>
</html>`;
    } 
    else {
      // Default: Markdown
      if (options.includeMetadata) {
        fileContent += `---\n`;
        fileContent += `title: "${title.replace(/"/g, '\\"')}"\n`;
        fileContent += `source: ${window.location.href}\n`;
        fileContent += `platform: ${platform.toUpperCase()}\n`;
        fileContent += `exportDate: ${new Date().toLocaleString()}\n`;
        fileContent += `---\n\n`;
        fileContent += `# ${title}\n\n`;
        fileContent += `*Exported from [${platform.toUpperCase()}](${window.location.href})*\n\n---\n\n`;
      } else {
        fileContent += `# ${title}\n\n`;
      }

      if (turns.length === 0) {
        fileContent += `*No conversation turns could be detected. This might be due to structural changes on the chat interface or an empty chat.*`;
      } else {
        turns.forEach((turn) => {
          const senderIcon = turn.sender === 'User' ? '🧑 **User**' : '🤖 **Assistant**';
          const turnMd = turn.rawText !== undefined ? turn.rawText : window.SaveGPTMarkdown.convert(turn.element);
          fileContent += `### ${senderIcon}\n\n${turnMd}\n\n---\n\n`;
        });
      }
    }

    // Extract media assets if selected
    let mediaList = [];
    if (options.downloadMedia) {
      if (options.autoScroll) {
        updateStatusText('Extracting chat media assets...', 99);
      }
      mediaList = await extractMedia(turns);

      // Perform highly robust regex link translations to map image sources back to relative local paths
      mediaList.forEach((media) => {
        if (media.originalSrc) {
          // Helper to safely escape special regex characters
          const escapeRegExp = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          
          const escapedRaw = escapeRegExp(media.originalSrc);
          const escapedRawHtml = escapeRegExp(media.originalSrc.replace(/&/g, '&amp;'));
          
          const escapedAbs = escapeRegExp(media.url);
          const escapedAbsHtml = escapeRegExp(media.url.replace(/&/g, '&amp;'));

          // Attempt replacements for both raw relative and absolute/escaped URL patterns
          const patterns = [escapedRaw, escapedRawHtml, escapedAbs, escapedAbsHtml];
          
          patterns.forEach((pattern) => {
            if (!pattern) return;
            
            // 1. Match Markdown images: ![alt](url)
            const imgRegex = new RegExp(`!\\[([^\\]]*)\\]\\(${pattern}\\)`, 'gi');
            fileContent = fileContent.replace(imgRegex, `![$1](media/${media.name})`);
            
            // 2. Match Markdown anchors: [text](url)
            const linkRegex = new RegExp(`\\[([^\\]]*)\\]\\(${pattern}\\)`, 'gi');
            fileContent = fileContent.replace(linkRegex, `[$1](media/${media.name})`);
          });
        }
      });
    }

    if (options.autoScroll) {
      updateStatusText('Export complete!', 100);
      setTimeout(removeOverlay, 1000);
    }

    return {
      success: true,
      title: title,
      fileContent: fileContent,
      format: format,
      mediaList: mediaList,
      platform: platform
    };
  } catch (error) {
    console.error('❌ SaveGPT compilation failed:', error);
    if (options.autoScroll) {
      updateStatusText(`Error: ${error.message}`);
      setTimeout(removeOverlay, 3000);
    }
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Helper: Convert Markdown string to HTML (simple regex-based parser)
 */
function convertMarkdownToHtml(md) {
  if (!md) return '';
  
  let html = md;
  
  // Escape HTML entities to prevent injection
  html = html
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
    
  // Code Blocks: ```lang ... ```
  html = html.replace(/```([a-zA-Z0-9+-]*)\n([\s\S]*?)\n```/g, (match, lang, code) => {
    return `<pre><code class="language-${lang}">${code}</code></pre>`;
  });
  
  // Inline code: `code`
  html = html.replace(/`([^`\n]+)`/g, '<code>$1</code>');
  
  // Blockquotes: > quote
  html = html.replace(/^\s*>\s+(.+)$/gm, '<blockquote>$1</blockquote>');
  
  // Headers: ###, ##, #
  html = html.replace(/^\s*###\s+(.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^\s*##\s+(.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^\s*#\s+(.+)$/gm, '<h1>$1</h1>');
  
  // Unordered list items: - item or * item
  html = html.replace(/^\s*[-*]\s+(.+)$/gm, '<li>$1</li>');
  
  // Wrap list items in <ul>
  html = html.replace(/(<li>.*<\/li>)/g, '<ul>$1</ul>');
  html = html.replace(/<\/ul>\s*<ul>/g, '');

  // Bold: **text** or __text__
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  
  // Italics: *text* or _text_
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  html = html.replace(/_([^_]+)_/g, '<em>$1</em>');
  
  // Links: [text](url)
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
  
  // Paragraphs: double newlines
  const paragraphs = html.split(/\n\n+/);
  html = paragraphs.map(p => {
    p = p.trim();
    if (!p) return '';
    if (p.startsWith('<pre') || p.startsWith('<h') || p.startsWith('<ul') || p.startsWith('<blockquote')) {
      return p;
    }
    return `<p>${p.replace(/\n/g, '<br>')}</p>`;
  }).filter(Boolean).join('\n');
  
  return html;
}

/**
 * Helper: Escape HTML strings
 */
function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Global runtime listener for Chrome extension message passing
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'EXPORT_CURRENT') {
    handleExport(message.options).then(sendResponse);
    return true; // Keep message channel open for async response
  }
});
