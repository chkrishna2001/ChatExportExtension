/**
 * SaveGPT Popup Controller
 * Manages UI interactions, tab switching, form storage syncing, active tab scraping,
 * and tracks real-time background service worker batch queues.
 */

document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const tabButtons = document.querySelectorAll('.nav-btn');
  const tabPanes = document.querySelectorAll('.tab-pane');
  const navIndicator = document.querySelector('.nav-indicator');

  const platformBadge = document.getElementById('platform-badge');
  const platformName = document.getElementById('platform-name');

  // Active Tab Elements
  const btnExportActive = document.getElementById('btn-export-active');
  const activeFormat = document.getElementById('active-format');
  const activeScroll = document.getElementById('active-scroll');
  const activeMetadata = document.getElementById('active-metadata');
  const activeMediaDownload = document.getElementById('active-media-download');
  const activeStatus = document.getElementById('active-status');
  const activeStatusText = document.getElementById('active-status-text');

  // Batch Export Elements
  const batchUrls = document.getElementById('batch-urls');
  const batchDelay = document.getElementById('batch-delay');
  const batchFormat = document.getElementById('batch-format');
  const batchScroll = document.getElementById('batch-scroll');
  const batchMetadata = document.getElementById('batch-metadata');
  const batchMediaDownload = document.getElementById('batch-media-download');
  const btnStartBatch = document.getElementById('btn-start-batch');
  const btnCancelBatch = document.getElementById('btn-cancel-batch');
  const batchInitialActions = document.getElementById('batch-initial-actions');
  const batchRunningState = document.getElementById('batch-running-state');
  const batchProgressFraction = document.getElementById('batch-progress-fraction');
  const batchProgressFill = document.getElementById('batch-progress-fill');
  const batchCurrentUrlText = document.getElementById('batch-current-url-text');
  const batchResultsList = document.getElementById('batch-results-list');

  let activeTabUrl = '';
  let activeTabId = null;
  let activePlatform = 'unknown';

  /* ==========================================================================
     Tab Navigation Controls
     ========================================================================== */
  tabButtons.forEach((button) => {
    button.addEventListener('click', () => {
      // Deactivate all buttons & panes
      tabButtons.forEach(btn => btn.classList.remove('active'));
      tabPanes.forEach(pane => pane.classList.remove('active'));

      // Activate selected
      button.classList.add('active');
      const paneId = button.getAttribute('data-tab');
      document.getElementById(paneId).classList.add('active');

      // Slide indicator bar
      if (paneId === 'active-tab') {
        navIndicator.style.transform = 'translateX(0)';
      } else {
        navIndicator.style.transform = 'translateX(100%)';
      }
    });
  });

  /* ==========================================================================
     Form Storage Syncing
     ========================================================================== */
  // Load saved preferences
  chrome.storage.local.get([
    'activeScroll', 
    'activeMetadata', 
    'activeMediaDownload',
    'activeFormat',
    'batchScroll', 
    'batchMetadata', 
    'batchMediaDownload',
    'batchFormat',
    'batchDelay',
    'batchUrlsCache'
  ], (res) => {
    if (res.activeScroll !== undefined) activeScroll.checked = res.activeScroll;
    if (res.activeMetadata !== undefined) activeMetadata.checked = res.activeMetadata;
    if (res.activeMediaDownload !== undefined) activeMediaDownload.checked = res.activeMediaDownload;
    if (res.activeFormat !== undefined) activeFormat.value = res.activeFormat;
    if (res.batchScroll !== undefined) batchScroll.checked = res.batchScroll;
    if (res.batchMetadata !== undefined) batchMetadata.checked = res.batchMetadata;
    if (res.batchMediaDownload !== undefined) batchMediaDownload.checked = res.batchMediaDownload;
    if (res.batchFormat !== undefined) batchFormat.value = res.batchFormat;
    if (res.batchDelay !== undefined) batchDelay.value = res.batchDelay;
    if (res.batchUrlsCache !== undefined) batchUrls.value = res.batchUrlsCache;
  });

  // Save preferences on modification
  const savePreference = (key, value) => {
    const data = {};
    data[key] = value;
    chrome.storage.local.set(data);
  };

  activeScroll.addEventListener('change', (e) => savePreference('activeScroll', e.target.checked));
  activeMetadata.addEventListener('change', (e) => savePreference('activeMetadata', e.target.checked));
  activeMediaDownload.addEventListener('change', (e) => savePreference('activeMediaDownload', e.target.checked));
  activeFormat.addEventListener('change', (e) => savePreference('activeFormat', e.target.value));
  batchScroll.addEventListener('change', (e) => savePreference('batchScroll', e.target.checked));
  batchMetadata.addEventListener('change', (e) => savePreference('batchMetadata', e.target.checked));
  batchMediaDownload.addEventListener('change', (e) => savePreference('batchMediaDownload', e.target.checked));
  batchFormat.addEventListener('change', (e) => savePreference('batchFormat', e.target.value));
  batchDelay.addEventListener('input', (e) => savePreference('batchDelay', parseInt(e.target.value) || 2000));
  batchUrls.addEventListener('input', (e) => savePreference('batchUrlsCache', e.target.value));

  /* ==========================================================================
     Active Platform Detection
     ========================================================================== */
  function updatePlatformBadge(platform) {
    activePlatform = platform;
    platformBadge.className = `platform-badge ${platform}`;
    
    if (platform === 'chatgpt') {
      platformName.textContent = 'ChatGPT';
      btnExportActive.disabled = false;
      btnExportActive.style.opacity = '1';
      btnExportActive.style.cursor = 'pointer';
    } else if (platform === 'claude') {
      platformName.textContent = 'Claude AI';
      btnExportActive.disabled = false;
      btnExportActive.style.opacity = '1';
      btnExportActive.style.cursor = 'pointer';
    } else if (platform === 'gemini') {
      platformName.textContent = 'Gemini';
      btnExportActive.disabled = false;
      btnExportActive.style.opacity = '1';
      btnExportActive.style.cursor = 'pointer';
    } else if (platform === 'deepseek') {
      platformName.textContent = 'DeepSeek';
      btnExportActive.disabled = false;
      btnExportActive.style.opacity = '1';
      btnExportActive.style.cursor = 'pointer';
    } else {
      platformName.textContent = 'Unsupported';
      btnExportActive.disabled = true;
      btnExportActive.style.opacity = '0.5';
      btnExportActive.style.cursor = 'not-allowed';
    }
  }

  // Query active tab details
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const activeTab = tabs[0];
    if (activeTab && activeTab.url) {
      activeTabUrl = activeTab.url;
      activeTabId = activeTab.id;

      let detectedPlatform = 'unknown';
      if (activeTabUrl.includes('chatgpt.com')) detectedPlatform = 'chatgpt';
      else if (activeTabUrl.includes('claude.ai')) detectedPlatform = 'claude';
      else if (activeTabUrl.includes('gemini.google.com')) detectedPlatform = 'gemini';
      else if (activeTabUrl.includes('deepseek.com')) detectedPlatform = 'deepseek';

      updatePlatformBadge(detectedPlatform);
    }
  });

  /* ==========================================================================
     Active Tab Export Handlers
     ========================================================================== */
  btnExportActive.addEventListener('click', () => {
    if (!activeTabId || activePlatform === 'unknown') return;

    // Trigger state changes
    btnExportActive.disabled = true;
    activeStatus.classList.remove('hidden');
    activeStatusText.textContent = activeScroll.checked 
      ? 'Export active: Scrolling & parsing. View browser viewport...' 
      : 'Export active: Scraping current content...';

    chrome.tabs.sendMessage(activeTabId, {
      action: 'EXPORT_CURRENT',
      options: {
        autoScroll: activeScroll.checked,
        includeMetadata: activeMetadata.checked,
        downloadMedia: activeMediaDownload.checked,
        format: activeFormat.value
      }
    }, (result) => {
      // Check callbacks
      btnExportActive.disabled = false;
      activeStatus.classList.add('hidden');

      if (chrome.runtime.lastError) {
        alert('Could not establish connection to the tab. Please refresh the page and try again.');
        console.error(chrome.runtime.lastError.message);
        return;
      }

      if (result && result.success) {
        // Trigger download inside popup
        triggerLocalDownload(result.title, result.fileContent, result.mediaList, activeMediaDownload.checked, result.platform, activeFormat.value);
      } else {
        alert(`Export failed: ${result ? result.error : 'Unknown parsing error'}`);
      }
    });
  });

  /**
   * Helper to trigger download directly in popup context
   * Organizes outputs cleanly in: toolname_chats/toolname_title_timestamp.md
   * Uses Blob/createObjectURL for full compatibility on Firefox and Chrome
   */
  function triggerLocalDownload(title, fileContent, mediaList = [], downloadMedia = false, platform = 'unknown', format = 'markdown') {
    const sanitizeFilename = (name) => name.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, '_').trim();
    const cleanTitle = sanitizeFilename(title || 'Export');
    
    // Determine target platform label
    const platformStr = (platform || activePlatform || 'unknown').toLowerCase();
    
    // Generate clean Timestamp: YYYYMMDD_HHMMSS
    const now = new Date();
    const timestamp = `${now.getFullYear()}${(now.getMonth()+1).toString().padStart(2,'0')}${now.getDate().toString().padStart(2,'0')}_${now.getHours().toString().padStart(2,'0')}${now.getMinutes().toString().padStart(2,'0')}${now.getSeconds().toString().padStart(2,'0')}`;
    
    // Standard filename naming convention: toolname_chattitle_timestamp
    const baseName = `${platformStr}_${cleanTitle}_${timestamp}`;
    
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

    // Create Blob URL (works 100% in Firefox and Chrome)
    const blob = new Blob([fileContent], { type: mimeType });
    const downloadBlobUrl = URL.createObjectURL(blob);

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
      url: downloadBlobUrl,
      filename: filePath,
      saveAs: false
    }, () => {
      // Cleanup Blob URL shortly after
      setTimeout(() => URL.revokeObjectURL(downloadBlobUrl), 15000);
    });

    // Download media files inside subfolders
    if (downloadMedia && mediaList && mediaList.length > 0) {
      console.log(`📥 Downloading ${mediaList.length} media items to subfolder...`);
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

  /* ==========================================================================
     Batch Export Coordination & State Management
     ========================================================================== */
  
  // Restore batch panel UI state if background worker is currently active
  chrome.runtime.sendMessage({ action: 'GET_BATCH_STATE' }, (state) => {
    if (state && state.isRunning) {
      showBatchRunningState(state.completed, state.total);
    }
  });

  btnStartBatch.addEventListener('click', () => {
    const urlsText = batchUrls.value.trim();
    if (!urlsText) {
      alert('Please enter at least one URL.');
      return;
    }

    // Split urls and filter empty lines
    const urls = urlsText
      .split('\n')
      .map(url => url.trim())
      .filter(url => url.startsWith('http://') || url.startsWith('https://'));

    if (urls.length === 0) {
      alert('No valid URLs found. Make sure they start with http:// or https://');
      return;
    }

    // Clear previous logs
    batchResultsList.innerHTML = '';

    chrome.runtime.sendMessage({
      action: 'START_BATCH_EXPORT',
      urls: urls,
      options: {
        autoScroll: batchScroll.checked,
        includeMetadata: batchMetadata.checked,
        downloadMedia: batchMediaDownload.checked,
        format: batchFormat.value
      }
    }, (response) => {
      if (response && response.success) {
        showBatchRunningState(0, response.total);
      } else {
        alert(response ? response.error : 'Failed to launch background worker.');
      }
    });
  });

  btnCancelBatch.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'CANCEL_BATCH_EXPORT' }, (res) => {
      if (res && res.success) {
        hideBatchRunningState();
      }
    });
  });

  function showBatchRunningState(completed, total) {
    batchInitialActions.classList.add('hidden');
    batchRunningState.classList.remove('hidden');
    updateBatchProgressUI(completed, total);
  }

  function hideBatchRunningState() {
    batchInitialActions.classList.remove('hidden');
    batchRunningState.classList.add('hidden');
  }

  function updateBatchProgressUI(completed, total) {
    batchProgressFraction.textContent = `${completed} / ${total}`;
    const percent = total > 0 ? (completed / total) * 100 : 0;
    batchProgressFill.style.width = `${percent}%`;
  }

  function addBatchResultRow(url, success, errorMessage = null) {
    const row = document.createElement('div');
    row.className = 'batch-row';
    
    // Extract short name for display
    let displayUrl = url.replace(/^https?:\/\/(www\.)?/, '');
    if (displayUrl.length > 32) {
      displayUrl = displayUrl.substring(0, 30) + '...';
    }

    const nameSpan = document.createElement('span');
    nameSpan.className = 'batch-row-url';
    nameSpan.textContent = displayUrl;
    nameSpan.title = url;

    const statusSpan = document.createElement('span');
    if (success) {
      statusSpan.className = 'batch-row-status success';
      statusSpan.innerHTML = '✓ Done';
    } else {
      statusSpan.className = 'batch-row-status failed';
      statusSpan.innerHTML = '✗ Failed';
      statusSpan.title = errorMessage || 'Extraction failed';
    }

    row.appendChild(nameSpan);
    row.appendChild(statusSpan);
    batchResultsList.appendChild(row);

    // Scroll to bottom of results list
    batchResultsList.scrollTop = batchResultsList.scrollHeight;
  }

  // Listen for progress updates from the background script
  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'BATCH_STATUS') {
      if (message.status === 'processing') {
        showBatchRunningState(message.completed, message.total);
        batchCurrentUrlText.textContent = message.currentUrl;
      } else if (message.status === 'complete') {
        updateBatchProgressUI(message.completed, message.total);
        batchCurrentUrlText.textContent = 'All items finished!';
        btnCancelBatch.textContent = 'Dismiss Progress';
        btnCancelBatch.className = 'btn-primary';
        btnCancelBatch.style.width = '100%';
        btnCancelBatch.onclick = () => {
          hideBatchRunningState();
          // Reset button to standard cancel state
          btnCancelBatch.textContent = 'Cancel Batch Export';
          btnCancelBatch.className = 'btn-secondary';
          btnCancelBatch.onclick = null;
        };
      } else if (message.status === 'cancelled') {
        hideBatchRunningState();
      }
    }

    if (message.action === 'BATCH_PROGRESS_ITEM') {
      addBatchResultRow(message.url, message.success, message.error);
      updateBatchProgressUI(message.completed, message.total);
    }
  });
});
