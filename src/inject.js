(function() {
  const originalFetch = window.fetch;
  window.fetch = async function(...args) {
    const response = await originalFetch(...args);
    const url = args[0];
    
    if (typeof url === 'string') {
      // 1. Claude Chat Interception
      if (url.includes('/api/organizations/') && url.includes('/chat_conversations')) {
        try {
          const clone = response.clone();
          const json = await clone.json();
          // Verify it contains chat messages to avoid list endpoints
          if (json && json.chat_messages) {
            window.postMessage({
              type: 'SAVEGPT_CLAUDE_CHAT_INTERCEPTED',
              url: url,
              data: json
            }, '*');
          }
        } catch (e) {
          console.error('[SaveGPT] Intercept Claude fetch error:', e);
        }
      }
      
      // 2. DeepSeek Chat Interception
      if (url.includes('/api/v0/chat/history_messages')) {
        try {
          const clone = response.clone();
          const json = await clone.json();
          window.postMessage({
            type: 'SAVEGPT_DEEPSEEK_CHAT_INTERCEPTED',
            url: url,
            data: json
          }, '*');
        } catch (e) {
          console.error('[SaveGPT] Intercept DeepSeek fetch error:', e);
        }
      }
    }
    return response;
  };

  console.log('[SaveGPT] Network fetch interceptor loaded.');
})();
