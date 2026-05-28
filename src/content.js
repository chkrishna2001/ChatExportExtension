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

  // Compile final markdown
  try {
    if (options.autoScroll) {
      updateStatusText('Generating Markdown structures...', 98);
    }

    const turns = window.SaveGPTParsers.extractConversation();
    const title = window.SaveGPTParsers.extractTitle(platform);
    
    let markdown = '';

    // Append metadata if checked
    if (options.includeMetadata) {
      markdown += `---\n`;
      markdown += `title: "${title.replace(/"/g, '\\"')}"\n`;
      markdown += `source: ${window.location.href}\n`;
      markdown += `platform: ${platform.toUpperCase()}\n`;
      markdown += `exportDate: ${new Date().toLocaleString()}\n`;
      markdown += `---\n\n`;
      markdown += `# ${title}\n\n`;
      markdown += `*Exported from [${platform.toUpperCase()}](${window.location.href})*\n\n---\n\n`;
    } else {
      markdown += `# ${title}\n\n`;
    }

    if (turns.length === 0) {
      markdown += `*No conversation turns could be detected. This might be due to structural changes on the chat interface or an empty chat.*`;
    } else {
      turns.forEach((turn) => {
        const senderIcon = turn.sender === 'User' ? '🧑 **User**' : '🤖 **Assistant**';
        const turnMd = window.SaveGPTMarkdown.convert(turn.element);
        markdown += `### ${senderIcon}\n\n${turnMd}\n\n---\n\n`;
      });
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
            markdown = markdown.replace(imgRegex, `![$1](media/${media.name})`);
            
            // 2. Match Markdown anchors: [text](url)
            const linkRegex = new RegExp(`\\[([^\\]]*)\\]\\(${pattern}\\)`, 'gi');
            markdown = markdown.replace(linkRegex, `[$1](media/${media.name})`);
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
      markdown: markdown,
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

// Global runtime listener for Chrome extension message passing
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'EXPORT_CURRENT') {
    handleExport(message.options).then(sendResponse);
    return true; // Keep message channel open for async response
  }
});
