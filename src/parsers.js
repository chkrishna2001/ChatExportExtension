/**
 * SaveGPTParsers - Contains platform-specific DOM extraction rules and adaptive fallbacks.
 * Translates page-specific structures into standardized { sender: 'User'|'Assistant', element: HTMLElement } turns.
 */
const SaveGPTParsers = {
  /**
   * Detects which platform the current tab is on based on the hostname.
   * @returns {string} - 'chatgpt', 'claude', 'gemini', or 'unknown'
   */
  detectPlatform() {
    const host = window.location.hostname;
    if (host.includes('chatgpt.com')) return 'chatgpt';
    if (host.includes('claude.ai')) return 'claude';
    if (host.includes('gemini.google.com')) return 'gemini';
    if (host.includes('deepseek.com')) return 'deepseek';
    return 'unknown';
  },

  /**
   * Extracts the chat title from the current page.
   * @returns {string} - Cleaned up chat title.
   */
  extractTitle(platform) {
    let title = document.title || 'chat-export';
    
    // Platform-specific sidebars or headers often have cleaner titles
    try {
      if (platform === 'chatgpt') {
        // Look for the selected conversation in the sidebar or top header
        const activeSidebarItem = document.querySelector('li.relative[data-sidebar-item="true"] a.bg-token-sidebar-surface-active, a.bg-token-main-surface-secondary');
        if (activeSidebarItem) {
          const titleText = activeSidebarItem.textContent.trim();
          if (titleText) return titleText;
        }
      } else if (platform === 'claude') {
        // Claude places the title in the top center header or document title
        const headerTitle = document.querySelector('header div.font-semibold, div[data-testid="chat-title"]');
        if (headerTitle) {
          const titleText = headerTitle.textContent.trim();
          if (titleText) return titleText;
        }
      } else if (platform === 'deepseek') {
        if (window.SaveGPTDeepSeekData && window.SaveGPTDeepSeekData.data && window.SaveGPTDeepSeekData.data.biz_data && window.SaveGPTDeepSeekData.data.biz_data.chat_session) {
          const networkTitle = window.SaveGPTDeepSeekData.data.biz_data.chat_session.title;
          if (networkTitle) return networkTitle.trim();
        }
      } else if (platform === 'gemini') {
        // Gemini active item in sidebar
        const activeNav = document.querySelector('a.active-chat-item, .navigation-item.selected');
        if (activeNav) {
          const titleText = activeNav.textContent.trim();
          if (titleText) return titleText;
        }
      }
    } catch (e) {
      console.warn('Error fetching custom title, falling back to document.title:', e);
    }

    // Fallback: strip standard suffixes from page title
    title = title
      .replace(/\s*-\s*ChatGPT\s*$/i, '')
      .replace(/\s*-\s*Claude\s*$/i, '')
      .replace(/\s*-\s*Gemini\s*$/i, '')
      .replace(/\s*-\s*DeepSeek\s*$/i, '')
      .trim();

    return title || 'AI Chat Export';
  },

  /**
   * Main entry point to extract conversation turns.
   * @returns {Array<{sender: string, element: Element}>} - Standardized array of conversation turns.
   */
  extractConversation() {
    const platform = this.detectPlatform();
    console.log(`🔍 SaveGPT: Extracting chat for platform: ${platform}`);
    
    // Try network extraction first
    let turns = this.extractConversationFromNetwork(platform);
    if (turns && turns.length > 0) {
      return turns;
    }
    
    turns = [];
    switch (platform) {
      case 'chatgpt':
        turns = this._parseChatGPT();
        break;
      case 'claude':
        turns = this._parseClaude();
        break;
      case 'gemini':
        turns = this._parseGemini();
        break;
      case 'deepseek':
        turns = this._parseDeepSeek();
        break;
      default:
        turns = this._parseAdaptive();
        break;
    }

    // If specific parser fails or returns incomplete results (missing either sender), try the adaptive fallback
    const hasUser = turns.some(t => t.sender === 'User');
    const hasAssistant = turns.some(t => t.sender === 'Assistant');
    if (turns.length === 0 || !hasUser || !hasAssistant) {
      console.warn(`⚠️ SaveGPT: Platform parser for ${platform} returned incomplete results (User: ${hasUser}, Assistant: ${hasAssistant}). Running adaptive fallback...`);
      const fallbackTurns = this._parseAdaptive();
      if (fallbackTurns && fallbackTurns.length > 0) {
        turns = fallbackTurns;
      }
    }

    return turns;
  },

  /**
   * Network-based Extraction
   */
  extractConversationFromNetwork(platform) {
    if (platform === 'claude' && window.SaveGPTClaudeData) {
      try {
        const data = window.SaveGPTClaudeData;
        const messages = data.chat_messages || [];
        const turns = [];
        messages.forEach((msg) => {
          if (msg.sender && (msg.text || msg.content)) {
            let text = msg.text || '';
            if (!text && Array.isArray(msg.content)) {
              text = msg.content
                .map(block => block.text || '')
                .filter(Boolean)
                .join('\n');
            }
            const virtualEl = document.createElement('div');
            virtualEl.className = msg.sender === 'human' ? 'font-user-message' : 'font-claude-message';
            virtualEl.textContent = text;
            turns.push({
              sender: msg.sender === 'human' ? 'User' : 'Assistant',
              element: virtualEl,
              rawText: text
            });
          }
        });
        if (turns.length > 0) {
          console.log('✅ SaveGPT: Successfully extracted Claude chat from network JSON!');
          return turns;
        }
      } catch (e) {
        console.error('❌ SaveGPT: Error parsing Claude network data:', e);
      }
    }
    
    if (platform === 'deepseek' && window.SaveGPTDeepSeekData) {
      try {
        const bizData = window.SaveGPTDeepSeekData.data && window.SaveGPTDeepSeekData.data.biz_data;
        if (bizData) {
          const chatMessages = bizData.chat_messages || [];
          const turns = [];
          chatMessages.forEach((msg) => {
            const role = msg.role;
            const fragments = msg.fragments || [];
            let messageText = '';
            let thinkingText = '';
            fragments.forEach((frag) => {
              if (frag.type === 'THINKING') {
                thinkingText += frag.content || '';
              } else if (frag.type === 'RESPONSE' || frag.type === 'REQUEST') {
                messageText += frag.content || '';
              } else {
                messageText += frag.content || '';
              }
            });
            let combinedText = '';
            if (thinkingText.trim()) {
              combinedText += `> **Thought Process**\n> \n` + thinkingText.split('\n').map(line => `> ${line}`).join('\n') + `\n\n`;
            }
            combinedText += messageText;
            if (combinedText.trim()) {
              const virtualEl = document.createElement('div');
              virtualEl.className = role === 'USER' ? 'user-message' : 'ds-markdown';
              virtualEl.textContent = combinedText;
              turns.push({
                sender: role === 'USER' ? 'User' : 'Assistant',
                element: virtualEl,
                rawText: combinedText
              });
            }
          });
          if (turns.length > 0) {
            console.log('✅ SaveGPT: Successfully extracted DeepSeek chat from network JSON!');
            return turns;
          }
        }
      } catch (e) {
        console.error('❌ SaveGPT: Error parsing DeepSeek network data:', e);
      }
    }
    return null;
  },

  /**
   * ChatGPT DOM Parser
   * @private
   */
  _parseChatGPT() {
    const turns = [];
    
    // ChatGPT utilizes a clear turn-based layout
    // 1. Check for explicit data-testid for conversation turns
    let turnElements = document.querySelectorAll('div[data-testid^="conversation-turn-"]');
    
    // 2. Fallback to standard articles if not found
    if (turnElements.length === 0) {
      turnElements = document.querySelectorAll('article');
    }

    turnElements.forEach((turnNode) => {
      // Find user message (can check by testid or data-message-author-role)
      const userMsgElem = turnNode.querySelector('[data-testid="user-message"], [data-message-author-role="user"]');
      
      // Find assistant message (can check by agent-turn class, data-message-author-role, or prose class)
      const assistantMsgElem = turnNode.querySelector('.agent-turn, [data-message-author-role="assistant"], .prose');

      if (userMsgElem) {
        turns.push({
          sender: 'User',
          element: userMsgElem
        });
      }
      
      if (assistantMsgElem) {
        turns.push({
          sender: 'Assistant',
          element: assistantMsgElem
        });
      }

      // Fallback if neither sub-element is found via explicit selectors:
      // Check for alternating patterns based on structure or presence of user avatar
      if (!userMsgElem && !assistantMsgElem) {
        const textContainer = turnNode.querySelector('.whitespace-pre-wrap, .prose');
        if (textContainer) {
          const isUser = turnNode.querySelector('img[alt*="User"], .user-avatar, [data-testid="user-avatar"]') !== null;
          turns.push({
            sender: isUser ? 'User' : 'Assistant',
            element: textContainer
          });
        }
      }
    });

    return turns;
  },

  /**
   * Claude DOM Parser
   * @private
   */
  _parseClaude() {
    const turns = [];
    
    // Claude conversation bubbles are wrapped in messages container
    // User messages typically contain class 'font-user-message', 'user-message', or 'human-message'
    // Assistant messages typically contain class 'font-claude-message', 'claude-message', 'font-assistant-message', or 'assistant-message'
    
    // Let's find all elements that represent a message bubble
    const messages = document.querySelectorAll('.font-user-message, .font-claude-message, .font-claude-response, .font-assistant-message, .user-message, .claude-message, .assistant-message, .human-message, [data-testid="user-message"], [data-testid="claude-message"], [data-testid="assistant-message"]');
    
    if (messages.length > 0) {
      messages.forEach((msg) => {
        const isUser = msg.classList.contains('font-user-message') || 
                       msg.classList.contains('user-message') ||
                       msg.classList.contains('human-message') ||
                       msg.getAttribute('data-testid') === 'user-message';
        turns.push({
          sender: isUser ? 'User' : 'Assistant',
          element: msg
        });
      });
      return turns;
    }

    // Fallback Claude: find general row/grid containers
    const rows = document.querySelectorAll('div.flex.flex-col.gap-6 div.flex, div[class*="message-container"]');
    rows.forEach((row) => {
      const userText = row.querySelector('.font-user-message, .user-message, .human-message, [data-testid="user-message"]');
      const assistantText = row.querySelector('.font-claude-message, .font-claude-response, .claude-message, .font-assistant-message, .assistant-message, [data-testid="claude-message"], [data-testid="assistant-message"]');
      
      if (userText) {
        turns.push({ sender: 'User', element: userText });
      } else if (assistantText) {
        turns.push({ sender: 'Assistant', element: assistantText });
      }
    });

    return turns;
  },

  /**
   * DeepSeek DOM Parser
   * @private
   */
  _parseDeepSeek() {
    const turns = [];
    const messages = document.querySelectorAll('.ds-markdown, ._9663006');
    messages.forEach((msg) => {
      const isUser = msg.matches('._9663006') || msg.classList.contains('user-message');
      turns.push({
        sender: isUser ? 'User' : 'Assistant',
        element: msg
      });
    });
    return turns;
  },

  /**
   * Gemini DOM Parser
   * @private
   */
  _parseGemini() {
    const turns = [];
    
    // Gemini structures conversations with clear <user-query> and <model-response> tags
    const conversationElements = document.querySelectorAll('user-query, model-response, .user-query, .model-response');
    
    conversationElements.forEach((node) => {
      const tagName = node.tagName.toUpperCase();
      const isUser = tagName === 'USER-QUERY' || node.classList.contains('user-query');
      
      if (isUser) {
        turns.push({
          sender: 'User',
          element: node
        });
      } else {
        // Model responses have the content nested in message-content class or prose
        const content = node.querySelector('.message-content, .markdown, .response-content') || node;
        turns.push({
          sender: 'Assistant',
          element: content
        });
      }
    });

    return turns;
  },

  /**
   * Adaptive DOM Scraper Fallback
   * Uses layout indicators, alignments, and common CSS classes to segment user vs AI turns.
   * @private
   */
  _parseAdaptive() {
    console.log('🤖 Running adaptive scraper...');
    const turns = [];
    
    // 1. Locate the main conversation scrolling container
    let container = document.querySelector('main, [role="main"], #chat-container, .chat-container, .conversation-container');
    if (!container) {
      container = document.body;
    }

    // 2. Select potential message bubbles or text components
    const candidates = container.querySelectorAll([
      'div[class*="message"]',
      'div[class*="bubble"]',
      'div[class*="chat-item"]',
      'div[class*="chat-row"]',
      'article',
      '.prose',
      '.markdown',
      'user-query',
      'model-response'
    ].join(','));

    // Filter candidates to top-level message wrappers
    const seen = new Set();
    const messageBlocks = [];

    candidates.forEach((cand) => {
      // Find the highest ancestor that is still within the container and represents a single message block
      let block = cand;
      while (block && block.parentElement && block.parentElement !== container && block.parentElement !== document.body) {
        const parentClass = block.parentElement.className.toLowerCase();
        if (parentClass.includes('chat') || parentClass.includes('conversation') || parentClass.includes('message-list')) {
          break;
        }
        block = block.parentElement;
      }
      
      if (block && !seen.has(block) && block.textContent.trim().length > 0) {
        seen.add(block);
        messageBlocks.push(block);
      }
    });

    // 3. Classify sender based on features (avatars, text alignments, background colors, custom classes)
    messageBlocks.forEach((block) => {
      const text = block.textContent.trim();
      if (text.length === 0) return;

      const html = block.innerHTML.toLowerCase();
      const className = block.className.toLowerCase();
      
      // Feature 1: Explicit labels or attributes
      const isUserRole = block.getAttribute('data-message-author-role') === 'user' ||
                         block.getAttribute('data-is-user') === 'true' ||
                         html.includes('data-message-author-role="user"');
      
      const isAiRole = block.getAttribute('data-message-author-role') === 'assistant' ||
                       block.getAttribute('data-is-assistant') === 'true' ||
                       html.includes('data-message-author-role="assistant"');

      if (isUserRole) {
        turns.push({ sender: 'User', element: block });
        return;
      }
      if (isAiRole) {
        turns.push({ sender: 'Assistant', element: block });
        return;
      }

      // Feature 2: Class indicators
      const hasUserClass = className.includes('user') || className.includes('query') || className.includes('request');
      const hasAiClass = className.includes('agent') || className.includes('assistant') || className.includes('model') || className.includes('response') || className.includes('prose');

      if (hasUserClass && !hasAiClass) {
        turns.push({ sender: 'User', element: block });
        return;
      }
      if (hasAiClass && !hasUserClass) {
        turns.push({ sender: 'Assistant', element: block });
        return;
      }

      // Feature 3: Check for avatars
      const hasUserAvatar = block.querySelector('img[alt*="user" i], [class*="user-avatar" i], [class*="user-icon" i]');
      const hasAiAvatar = block.querySelector('img[alt*="assistant" i], img[alt*="ai" i], img[alt*="bot" i], img[alt*="gemini" i], img[alt*="claude" i], [class*="bot-avatar" i], [class*="assistant-avatar" i]');

      if (hasUserAvatar && !hasAiAvatar) {
        turns.push({ sender: 'User', element: block });
        return;
      }
      if (hasAiAvatar && !hasUserAvatar) {
        turns.push({ sender: 'Assistant', element: block });
        return;
      }

      // Feature 4: Right-aligned text or block (usually User) vs Left-aligned (usually Assistant)
      const style = window.getComputedStyle(block);
      const isRightAligned = style.justifyContent === 'flex-end' || 
                             style.alignItems === 'flex-end' || 
                             style.textAlign === 'right' ||
                             block.classList.contains('justify-end') ||
                             block.classList.contains('items-end');

      turns.push({
        sender: isRightAligned ? 'User' : 'Assistant',
        element: block
      });
    });

    // Post-processing: clean up overlapping selections
    return turns.filter((turn, idx, self) => {
      // Ensure we don't have nested duplications in turns list
      return !self.some((other, otherIdx) => {
        return otherIdx !== idx && other.element.contains(turn.element) && other.sender === turn.sender;
      });
    });
  }
};

// Export to window object for access across content scripts
window.SaveGPTParsers = SaveGPTParsers;
