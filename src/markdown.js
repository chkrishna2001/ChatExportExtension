/**
 * SaveGPTMarkdown - A robust utility to convert browser DOM elements to Markdown.
 * Supports nesting, code blocks with syntax highlighting language, list indentations, tables, and typography.
 */
const SaveGPTMarkdown = {
  /**
   * Convert an HTML Element or DOM subtree to a beautifully formatted Markdown string.
   * @param {Element} element - The DOM Element to convert.
   * @returns {string} - Clean markdown string.
   */
  convert(element) {
    if (!element) return '';
    return this._traverse(element, { listDepth: -1, inCode: false }).trim();
  },

  /**
   * Internal recursive DOM traverser.
   * @private
   */
  _traverse(node, state) {
    if (node.nodeType === Node.TEXT_NODE) {
      // If we are in a code block, preserve all text exactly.
      if (state.inCode) {
        return node.textContent;
      }
      // Otherwise, clean up extra spaces but preserve basic formatting
      return node.textContent.replace(/\s+/g, ' ');
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return '';
    }

    const tagName = node.tagName.toUpperCase();
    
    // Ignore script and style elements entirely
    if (tagName === 'SCRIPT' || tagName === 'STYLE') {
      return '';
    }

    // Ignore interactive UI elements unless they contain a valid chat image!
    if (
      tagName === 'BUTTON' || 
      node.getAttribute('aria-hidden') === 'true' ||
      node.classList.contains('export-ignore') ||
      node.classList.contains('copy-button') ||
      node.classList.contains('sr-only')
    ) {
      // Check if this container contains a valid chat image!
      const img = node.querySelector('img');
      if (img) {
        // Double check it's not a user/assistant avatar or tiny interface icon
        const width = img.naturalWidth || img.clientWidth || parseInt(img.getAttribute('width') || '100', 10);
        const height = img.naturalHeight || img.clientHeight || parseInt(img.getAttribute('height') || '100', 10);
        const isAvatar = img.classList.contains('avatar') || 
                         img.className.toLowerCase().includes('avatar') || 
                         (img.getAttribute('alt') || '').toLowerCase().includes('avatar') ||
                         (width < 45 && height < 45);
        if (!isAvatar) {
          // If it contains a valid chat image, traverse into the image!
          return this._traverse(img, state);
        }
      }
      return '';
    }

    // Special Case: Code blocks (PRE)
    if (tagName === 'PRE') {
      const codeElem = node.querySelector('code') || node;
      let language = '';
      
      // Try to detect language from class list (e.g. language-python, hljs python, etc.)
      const classes = Array.from(codeElem.classList).concat(Array.from(node.classList));
      for (const cls of classes) {
        if (cls.startsWith('language-')) {
          language = cls.replace('language-', '');
          break;
        } else if (cls.startsWith('lang-')) {
          language = cls.replace('lang-', '');
          break;
        }
      }

      // If no explicit class, sometimes a copy button or header has it.
      if (!language) {
        const header = node.previousElementSibling;
        if (header && (header.textContent.toLowerCase().includes('code') || header.textContent.length < 20)) {
          language = header.textContent.trim().split(' ')[0].toLowerCase();
        }
      }

      const codeContent = this._traverse(codeElem, { ...state, inCode: true }).trim();
      return `\n\n\`\`\`${language}\n${codeContent}\n\`\`\`\n\n`;
    }

    // Special Case: Inline Code
    if (tagName === 'CODE') {
      if (state.inCode) {
        return this._traverseChildren(node, state);
      }
      return ` \`${this._traverseChildren(node, { ...state, inCode: true }).trim()}\` `;
    }

    // Headers
    if (/^H[1-6]$/.test(tagName)) {
      const level = parseInt(tagName[1], 10);
      const prefix = '#'.repeat(level);
      return `\n\n${prefix} ${this._traverseChildren(node, state).trim()}\n\n`;
    }

    // Paragraphs
    if (tagName === 'P') {
      return `\n\n${this._traverseChildren(node, state).trim()}\n\n`;
    }

    // Line Breaks
    if (tagName === 'BR') {
      return '\n';
    }

    // Bold
    if (tagName === 'STRONG' || tagName === 'B') {
      const content = this._traverseChildren(node, state).trim();
      return content ? ` **${content}** ` : '';
    }

    // Italics
    if (tagName === 'EM' || tagName === 'I') {
      const content = this._traverseChildren(node, state).trim();
      return content ? ` *${content}* ` : '';
    }

    // Strikethrough
    if (tagName === 'DEL' || tagName === 'S') {
      const content = this._traverseChildren(node, state).trim();
      return content ? ` ~~${content}~~ ` : '';
    }

    // Blockquotes
    if (tagName === 'BLOCKQUOTE') {
      const content = this._traverseChildren(node, state).trim();
      const lines = content.split('\n').map(line => `> ${line}`);
      return `\n\n${lines.join('\n')}\n\n`;
    }

    // Lists (Unordered & Ordered)
    if (tagName === 'UL' || tagName === 'OL') {
      const newState = { 
        ...state, 
        listDepth: state.listDepth + 1,
        listType: tagName,
        listIndex: 0
      };
      return `\n${this._traverseChildren(node, newState)}\n`;
    }

    // List Items
    if (tagName === 'LI') {
      const indent = '  '.repeat(Math.max(0, state.listDepth));
      const content = this._traverseChildren(node, state).trim();
      if (state.listType === 'OL') {
        state.listIndex = (state.listIndex || 0) + 1;
        return `${indent}${state.listIndex}. ${content}\n`;
      } else {
        return `${indent}- ${content}\n`;
      }
    }

    // Anchors (Links)
    if (tagName === 'A') {
      const href = node.getAttribute('href');
      const text = this._traverseChildren(node, state).trim();
      if (!href || href.startsWith('#') || href.startsWith('javascript:')) {
        return text;
      }
      return ` [${text}](${href}) `;
    }

    // Images
    if (tagName === 'IMG') {
      const src = node.getAttribute('src');
      const alt = node.getAttribute('alt') || 'image';
      if (!src) return '';
      return `\n![${alt}](${src})\n`;
    }

    // Tables
    if (tagName === 'TABLE') {
      return `\n\n${this._parseTable(node, state).trim()}\n\n`;
    }

    // Default container elements (div, span, section, main, article)
    return this._traverseChildren(node, state);
  },

  /**
   * Helper to traverse all child nodes and combine results.
   * @private
   */
  _traverseChildren(node, state) {
    let result = '';
    node.childNodes.forEach((child) => {
      result += this._traverse(child, state);
    });
    return result;
  },

  /**
   * Parse tables into GitHub Flavored Markdown table format.
   * @private
   */
  _parseTable(tableNode, state) {
    const rows = Array.from(tableNode.querySelectorAll('tr'));
    if (rows.length === 0) return '';

    let markdown = '';
    let headerLength = 0;

    // Separate rows into header and body
    const standardRows = [];
    rows.forEach((row) => {
      const cells = Array.from(row.cells);
      const cellTexts = cells.map(cell => this._traverse(cell, { ...state, listDepth: -1 }).trim().replace(/\|/g, '\\|'));
      standardRows.push(cellTexts);
    });

    if (standardRows.length > 0) {
      // Determine max columns
      headerLength = Math.max(...standardRows.map(r => r.length));
      
      // Format headers
      const headers = standardRows[0];
      // Pad header array to full column length if mismatch
      while (headers.length < headerLength) {
        headers.push('');
      }

      markdown += `| ${headers.join(' | ')} |\n`;
      
      // Separator row
      const separators = Array(headerLength).fill('---');
      markdown += `| ${separators.join(' | ')} |\n`;

      // Body rows
      for (let i = 1; i < standardRows.length; i++) {
        const rowData = standardRows[i];
        while (rowData.length < headerLength) {
          rowData.push('');
        }
        markdown += `| ${rowData.join(' | ')} |\n`;
      }
    }

    return markdown;
  }
};

// Export to window object for access across content scripts
window.SaveGPTMarkdown = SaveGPTMarkdown;
