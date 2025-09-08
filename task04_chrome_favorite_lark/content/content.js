class LarkBookmarksContent {
  constructor() {
    this.isBookmarked = false;
    this.bookmarkIndicator = null;
    
    this.initializeContent();
  }

  async initializeContent() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        this.setupContentFeatures();
      });
    } else {
      this.setupContentFeatures();
    }
    
    this.checkBookmarkStatus();
  }

  setupContentFeatures() {
    this.createBookmarkIndicator();
    this.setupKeyboardShortcuts();
    this.setupTextSelection();
  }

  createBookmarkIndicator() {
    if (this.bookmarkIndicator) return;
    
    this.bookmarkIndicator = document.createElement('div');
    this.bookmarkIndicator.id = 'lark-bookmark-indicator';
    this.bookmarkIndicator.innerHTML = `
      <div class="lark-bookmark-badge" title="已收藏到飞书">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z"/>
        </svg>
      </div>
    `;
    
    const style = document.createElement('style');
    style.textContent = `
      #lark-bookmark-indicator {
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 10000;
        pointer-events: none;
        opacity: 0;
        transition: opacity 0.3s ease;
      }
      
      #lark-bookmark-indicator.show {
        opacity: 1;
      }
      
      .lark-bookmark-badge {
        background: #10b981;
        color: white;
        padding: 8px;
        border-radius: 50%;
        box-shadow: 0 2px 10px rgba(16, 185, 129, 0.3);
        animation: lark-bookmark-pulse 2s infinite;
      }
      
      @keyframes lark-bookmark-pulse {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.05); }
      }
      
      .lark-selection-toolbar {
        position: absolute;
        background: #374151;
        border-radius: 8px;
        padding: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        z-index: 10000;
        opacity: 0;
        transform: translateY(10px);
        transition: all 0.2s ease;
        pointer-events: none;
      }
      
      .lark-selection-toolbar.show {
        opacity: 1;
        transform: translateY(0);
        pointer-events: auto;
      }
      
      .lark-selection-btn {
        background: #3b82f6;
        color: white;
        border: none;
        padding: 6px 12px;
        border-radius: 4px;
        font-size: 12px;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 4px;
        transition: background 0.2s;
      }
      
      .lark-selection-btn:hover {
        background: #2563eb;
      }
      
      .lark-quick-bookmark-btn {
        position: fixed;
        bottom: 20px;
        right: 20px;
        width: 56px;
        height: 56px;
        background: #3b82f6;
        color: white;
        border: none;
        border-radius: 50%;
        cursor: pointer;
        box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
        z-index: 9999;
        display: none;
        align-items: center;
        justify-content: center;
        transition: all 0.3s ease;
      }
      
      .lark-quick-bookmark-btn:hover {
        background: #2563eb;
        transform: scale(1.1);
      }
      
      .lark-quick-bookmark-btn.show {
        display: flex;
      }
    `;
    
    document.head.appendChild(style);
    document.body.appendChild(this.bookmarkIndicator);
    
    this.createQuickBookmarkButton();
  }

  createQuickBookmarkButton() {
    const quickBtn = document.createElement('button');
    quickBtn.className = 'lark-quick-bookmark-btn';
    quickBtn.id = 'lark-quick-bookmark';
    quickBtn.title = '快速收藏到飞书 (Ctrl+Shift+B)';
    quickBtn.innerHTML = `
      <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
        <path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z"/>
      </svg>
    `;
    
    quickBtn.addEventListener('click', (e) => {
      e.preventDefault();
      this.quickBookmark();
    });
    
    document.body.appendChild(quickBtn);
    
    setTimeout(() => {
      quickBtn.classList.add('show');
    }, 1000);
  }

  setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'B') {
        e.preventDefault();
        this.quickBookmark();
      }
      
      if ((e.ctrlKey || e.metaKey) && e.key === 's' && window.getSelection().toString()) {
        e.preventDefault();
        this.bookmarkSelection();
      }
    });
  }

  setupTextSelection() {
    let selectionToolbar = null;
    let hideTimeout = null;
    
    const createToolbar = () => {
      if (selectionToolbar) return selectionToolbar;
      
      selectionToolbar = document.createElement('div');
      selectionToolbar.className = 'lark-selection-toolbar';
      selectionToolbar.innerHTML = `
        <button class="lark-selection-btn" id="lark-bookmark-selection">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
            <path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z"/>
          </svg>
          收藏摘录
        </button>
      `;
      
      selectionToolbar.querySelector('#lark-bookmark-selection').addEventListener('click', () => {
        this.bookmarkSelection();
        hideToolbar();
      });
      
      document.body.appendChild(selectionToolbar);
      return selectionToolbar;
    };
    
    const showToolbar = (x, y) => {
      const toolbar = createToolbar();
      toolbar.style.left = `${x}px`;
      toolbar.style.top = `${y - 50}px`;
      toolbar.classList.add('show');
      
      clearTimeout(hideTimeout);
    };
    
    const hideToolbar = () => {
      if (selectionToolbar) {
        selectionToolbar.classList.remove('show');
      }
    };
    
    document.addEventListener('mouseup', (e) => {
      const selection = window.getSelection();
      const selectedText = selection.toString().trim();
      
      if (selectedText && selectedText.length > 10) {
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        showToolbar(rect.left + rect.width / 2, rect.top + window.scrollY);
        
        hideTimeout = setTimeout(hideToolbar, 3000);
      } else {
        hideToolbar();
      }
    });
    
    document.addEventListener('mousedown', () => {
      if (window.getSelection().toString()) {
        hideToolbar();
      }
    });
  }

  async checkBookmarkStatus() {
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'checkBookmarkStatus',
        url: window.location.href
      });
      
      if (response && response.success) {
        this.isBookmarked = response.isBookmarked;
        this.updateBookmarkIndicator();
      }
    } catch (error) {
      console.error('检查书签状态失败:', error);
    }
  }

  updateBookmarkIndicator() {
    if (this.isBookmarked && this.bookmarkIndicator) {
      this.bookmarkIndicator.classList.add('show');
      setTimeout(() => {
        this.bookmarkIndicator.classList.remove('show');
      }, 3000);
    }
  }

  async quickBookmark() {
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'quickBookmark'
      });
      
      if (response && response.success) {
        this.isBookmarked = true;
        this.showSuccessMessage('页面已收藏到飞书多维表格！');
        this.updateBookmarkIndicator();
      } else {
        throw new Error(response?.error || '收藏失败');
      }
    } catch (error) {
      console.error('快速收藏失败:', error);
      this.showErrorMessage('收藏失败: ' + error.message);
    }
  }

  async bookmarkSelection() {
    const selectedText = window.getSelection().toString().trim();
    
    if (!selectedText || selectedText.length < 10) {
      this.showErrorMessage('请选择至少10个字符的文本内容');
      return;
    }
    
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'bookmarkSelection',
        text: selectedText,
        url: window.location.href,
        title: document.title
      });
      
      if (response && response.success) {
        this.showSuccessMessage('选中内容已收藏到飞书！');
        window.getSelection().removeAllRanges();
      } else {
        throw new Error(response?.error || '摘录收藏失败');
      }
    } catch (error) {
      console.error('摘录收藏失败:', error);
      this.showErrorMessage('摘录收藏失败: ' + error.message);
    }
  }

  showSuccessMessage(message) {
    this.showToast(message, 'success');
  }

  showErrorMessage(message) {
    this.showToast(message, 'error');
  }

  showToast(message, type) {
    const existingToast = document.querySelector('#lark-toast');
    if (existingToast) {
      existingToast.remove();
    }
    
    const toast = document.createElement('div');
    toast.id = 'lark-toast';
    toast.className = `lark-toast lark-toast-${type}`;
    toast.textContent = message;
    
    const toastStyle = document.createElement('style');
    toastStyle.textContent = `
      .lark-toast {
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 12px 20px;
        border-radius: 8px;
        color: white;
        font-size: 14px;
        z-index: 10001;
        opacity: 0;
        transform: translateX(100%);
        transition: all 0.3s ease;
        max-width: 300px;
        word-wrap: break-word;
      }
      
      .lark-toast-success {
        background: #10b981;
      }
      
      .lark-toast-error {
        background: #ef4444;
      }
      
      .lark-toast.show {
        opacity: 1;
        transform: translateX(0);
      }
    `;
    
    document.head.appendChild(toastStyle);
    document.body.appendChild(toast);
    
    setTimeout(() => {
      toast.classList.add('show');
    }, 100);
    
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => {
        toast.remove();
        toastStyle.remove();
      }, 300);
    }, 3000);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new LarkBookmarksContent();
  });
} else {
  new LarkBookmarksContent();
}