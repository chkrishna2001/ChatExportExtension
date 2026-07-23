/**
 * SaveGPT Background Service Worker
 * Manages the sequential batch export queue, handles tab load states,
 * and executes file downloads (including markdown and media items) in platform-specific subfolders.
 */

let batchQueue = [];
let isBatchRunning = false;
let currentTabId = null;
let batchOptions = {};
let completedCount = 0;
let totalCount = 0;

/**
 * Clean up invalid characters from file names to prevent OS errors.
 */
function sanitizeFilename(name) {
  return name
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, '_')
    .trim();
}

/**
 * Promisified tab loader with tab state checks and safety timeout.
 */
function waitForTabToComplete(tabId) {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(tabUpdateListener);
      console.warn(`⏳ SaveGPT Background: Timeout waiting for tab ${tabId} to load.`);
      resolve(false);
    }, 15000); // 15-second safety timeout

    function tabUpdateListener(updatedTabId, changeInfo) {
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        clearTimeout(timeout);
        chrome.tabs.onUpdated.removeListener(tabUpdateListener);
        resolve(true);
      }
    }

    chrome.tabs.onUpdated.addListener(tabUpdateListener);

    // Double check if already completed
    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError) {
        clearTimeout(timeout);
        chrome.tabs.onUpdated.removeListener(tabUpdateListener);
        resolve(false);
        return;
      }
      if (tab && tab.status === 'complete') {
        clearTimeout(timeout);
        chrome.tabs.onUpdated.removeListener(tabUpdateListener);
        resolve(true);
      }
    });
  });
}

/**
 * Sequential processor of the batch URL queue.
 */
async function processBatchQueue() {
  if (batchQueue.length === 0) {
    isBatchRunning = false;
    currentTabId = null;
    chrome.runtime.sendMessage({ 
      action: 'BATCH_STATUS', 
      status: 'complete', 
      completed: completedCount, 
      total: totalCount 
    });
    return;
  }

  isBatchRunning = true;
  const currentUrl = batchQueue.shift();
  
  chrome.runtime.sendMessage({ 
    action: 'BATCH_STATUS', 
    status: 'processing', 
    currentUrl: currentUrl,
    completed: completedCount, 
    total: totalCount 
  });

  try {
    // 1. Create a new active tab
    const tab = await chrome.tabs.create({ url: currentUrl, active: true });
    currentTabId = tab.id;

    // 2. Wait for it to fully load
    const loaded = await waitForTabToComplete(currentTabId);
    if (!loaded) {
      throw new Error('Tab failed to load within safety time limit.');
    }

    // Give dynamic JS a moment to render the DOM
    await new Promise(r => setTimeout(r, batchOptions.delay));

    // 3. Request content script to scroll and compile Markdown
    chrome.tabs.sendMessage(currentTabId, {
      action: 'EXPORT_CURRENT',
      options: batchOptions
    }, (result) => {
      // Handle response callback
      if (chrome.runtime.lastError) {
        console.error('Content script communication error:', chrome.runtime.lastError.message);
        finalizeTabAndContinue(false, currentUrl, `Extension not loaded on page. Make sure the URL is valid.`);
        return;
      }

      if (result && result.success) {
        // 4. Download file (including media list if checked)
        triggerDownload(result.title, result.fileContent, result.mediaList, batchOptions.downloadMedia, result.platform, result.format);
        finalizeTabAndContinue(true, currentUrl);
      } else {
        const errorMsg = result ? result.error : 'Parsing returned empty results.';
        finalizeTabAndContinue(false, currentUrl, errorMsg);
      }
    });

  } catch (error) {
    console.error(`Batch processing failed for ${currentUrl}:`, error);
    finalizeTabAndContinue(false, currentUrl, error.message);
  }
}

/**
 * Triggers file download (with media subfolder capabilities if selected).
 * Organizes outputs cleanly in: toolname_chats/toolname_title_timestamp.ext
 * Leverages Blob URLs when supported, and falls back to safe Data URIs.
 */
function triggerDownload(title, fileContent, mediaList = [], downloadMedia = false, platform = 'unknown', format = 'markdown') {
  const sanitizedTitle = sanitizeFilename(title || 'AI_Chat_Export');
  
  // Determine target platform label
  const platformStr = (platform || 'unknown').toLowerCase();
  
  // Generate clean Timestamp: YYYYMMDD_HHMMSS
  const now = new Date();
  const timestamp = `${now.getFullYear()}${(now.getMonth()+1).toString().padStart(2,'0')}${now.getDate().toString().padStart(2,'0')}_${now.getHours().toString().padStart(2,'0')}${now.getMinutes().toString().padStart(2,'0')}${now.getSeconds().toString().padStart(2,'0')}`;
  
  // Standard filename naming convention: toolname_chattitle_timestamp
  const baseName = `${platformStr}_${sanitizedTitle}_${timestamp}`;
  
  // Parent folder: toolname_chats
  const platformFolder = `${platformStr}_chats`;

  let fileExt = 'md';
  let mimeType = 'text/markdown;charset=utf-8';
  if (format === 'html') {
    fileExt = 'html';
    mimeType = 'text/html;charset=utf-8';
  } else if (format === 'json') {
    fileExt = 'json';
    mimeType = 'application/json;charset=utf-8';
  }

  let url;
  let isBlob = false;
  
  // Try to generate Blob URL first (best for Firefox; might be restricted in Chrome MV3 workers)
  try {
    if (typeof Blob !== 'undefined' && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
      const blob = new Blob([fileContent], { type: mimeType });
      url = URL.createObjectURL(blob);
      isBlob = true;
    }
  } catch (e) {
    console.log('Blob URL creation not supported in background, using data URI fallback.');
  }

  // Fallback to Data URI if Blob URL failed
  if (!url) {
    url = 'data:' + mimeType + ',' + encodeURIComponent(fileContent);
  }

  let filePath;
  let targetFolder;

  if (downloadMedia && mediaList.length > 0) {
    // With media: nested inside toolname_chats/toolname_title_timestamp/
    targetFolder = `${platformFolder}/${baseName}`;
    filePath = `${targetFolder}/${baseName}.${fileExt}`;
  } else {
    // Without media: saved directly as toolname_chats/toolname_title_timestamp.ext
    targetFolder = platformFolder;
    filePath = `${platformFolder}/${baseName}.${fileExt}`;
  }

  chrome.downloads.download({
    url: url,
    filename: filePath,
    saveAs: false
  }, (downloadId) => {
    if (chrome.runtime.lastError) {
      console.error('Download trigger failed:', chrome.runtime.lastError.message);
    } else {
      console.log(`📥 Download started with ID: ${downloadId}`);
      if (isBlob) {
        setTimeout(() => URL.revokeObjectURL(url), 15000);
      }
    }
  });

  // Download media files inside the subfolder
  if (downloadMedia && mediaList && mediaList.length > 0) {
    console.log(`📥 Background: Downloading ${mediaList.length} media items for ${title}...`);
    mediaList.forEach((media, idx) => {
      let extension = media.extension || 'png';
      let mediaFilename = media.name || `image_${idx + 1}.${extension}`;
      mediaFilename = sanitizeFilename(mediaFilename);
      
      const mediaPath = `${targetFolder}/media/${mediaFilename}`;

      chrome.downloads.download({
        url: media.url,
        filename: mediaPath,
        saveAs: false
      }, (downloadId) => {
        if (chrome.runtime.lastError) {
          console.warn(`Media download failed for ${media.url}:`, chrome.runtime.lastError.message);
        }
      });
    });
  }
}

/**
 * Closes the processed tab, updates status counts, and schedules next item.
 */
function finalizeTabAndContinue(success, url, errorMessage = null) {
  if (currentTabId) {
    chrome.tabs.remove(currentTabId, () => {
      if (chrome.runtime.lastError) {
        console.warn('Error removing tab:', chrome.runtime.lastError.message);
      }
    });
    currentTabId = null;
  }

  completedCount++;

  chrome.runtime.sendMessage({
    action: 'BATCH_PROGRESS_ITEM',
    url: url,
    success: success,
    error: errorMessage,
    completed: completedCount,
    total: totalCount
  });

  // Short pause before launching the next tab to prevent overwhelming browser
  setTimeout(processBatchQueue, 1500);
}

/**
 * Listener for runtime messaging requests.
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'START_BATCH_EXPORT') {
    if (isBatchRunning) {
      sendResponse({ success: false, error: 'A batch export is already running.' });
      return;
    }

    batchQueue = [...message.urls];
    batchOptions = message.options || { delay: 2000 };
    totalCount = batchQueue.length;
    completedCount = 0;
    isBatchRunning = true;
    
    sendResponse({ success: true, total: totalCount });
    processBatchQueue();
  }

  if (message.action === 'CANCEL_BATCH_EXPORT') {
    console.log('🛑 Batch export cancelled by user.');
    batchQueue = [];
    isBatchRunning = false;
    
    if (currentTabId) {
      chrome.tabs.remove(currentTabId);
      currentTabId = null;
    }

    chrome.runtime.sendMessage({ 
      action: 'BATCH_STATUS', 
      status: 'cancelled',
      completed: completedCount,
      total: totalCount 
    });
    sendResponse({ success: true });
  }

  if (message.action === 'GET_BATCH_STATE') {
    sendResponse({
      isRunning: isBatchRunning,
      completed: completedCount,
      total: totalCount,
      queueLength: batchQueue.length
    });
  }
});
