class LarkBookmarksPopup {
  constructor() {
    this.currentPageInfo = null;
    this.selectedTags = new Set();
    this.isLoggedIn = false;
    this.availableTables = [];
    
    this.initializeElements();
    this.bindEvents();
    this.loadPageInfo();
    this.checkLoginStatus();
  }

  initializeElements() {
    this.elements = {
      pageTitle: document.getElementById('pageTitle'),
      pageUrl: document.getElementById('pageUrl'),
      pageFavicon: document.getElementById('pageFavicon'),
      noteInput: document.getElementById('noteInput'),
      tagsInput: document.getElementById('tagsInput'),
      tagsList: document.getElementById('tagsList'),
      tableSelect: document.getElementById('tableSelect'),
      statusMessage: document.getElementById('statusMessage'),
      saveBtn: document.getElementById('saveBtn'),
      cancelBtn: document.getElementById('cancelBtn'),
      settingsBtn: document.getElementById('settingsBtn'),
      loginPrompt: document.getElementById('loginPrompt'),
      openSettingsBtn: document.getElementById('openSettingsBtn')
    };
  }

  bindEvents() {
    this.elements.tagsInput.addEventListener('keydown', this.handleTagInput.bind(this));
    this.elements.saveBtn.addEventListener('click', this.handleSave.bind(this));
    this.elements.cancelBtn.addEventListener('click', this.handleCancel.bind(this));
    this.elements.settingsBtn.addEventListener('click', this.openSettings.bind(this));
    this.elements.openSettingsBtn.addEventListener('click', this.openSettings.bind(this));
    this.elements.tableSelect.addEventListener('change', this.handleTableChange.bind(this));
    
    document.addEventListener('click', (e) => {
      if (e.target.classList.contains('tag-remove')) {
        this.removeTag(e.target.dataset.tag);
      }
    });
  }

  async loadPageInfo() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (tab) {
        this.currentPageInfo = {
          title: tab.title || '未知标题',
          url: tab.url || '',
          favicon: tab.favIconUrl || ''
        };
        
        this.updatePagePreview();
        
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          function: this.extractPageMetadata
        }, (results) => {
          if (results && results[0] && results[0].result) {
            Object.assign(this.currentPageInfo, results[0].result);
            this.updatePagePreview();
          }
        });
      }
    } catch (error) {
      console.error('获取页面信息失败:', error);
      this.showStatus('获取页面信息失败', 'error');
    }
  }

  extractPageMetadata() {
    const getMetaContent = (name) => {
      const meta = document.querySelector(`meta[name="${name}"], meta[property="${name}"]`);
      return meta ? meta.content : '';
    };

    return {
      description: getMetaContent('description') || 
                  getMetaContent('og:description') || 
                  getMetaContent('twitter:description') || '',
      keywords: getMetaContent('keywords') || '',
      author: getMetaContent('author') || '',
      siteName: getMetaContent('og:site_name') || ''
    };
  }

  updatePagePreview() {
    if (!this.currentPageInfo) return;
    
    this.elements.pageTitle.textContent = this.currentPageInfo.title;
    this.elements.pageUrl.textContent = this.currentPageInfo.url;
    
    if (this.currentPageInfo.favicon) {
      this.elements.pageFavicon.src = this.currentPageInfo.favicon;
      this.elements.pageFavicon.style.display = 'block';
    }
    
    if (this.currentPageInfo.description) {
      this.elements.noteInput.placeholder = `页面描述: ${this.currentPageInfo.description.substring(0, 50)}...`;
    }
  }

  async checkLoginStatus() {
    try {
      const result = await chrome.storage.sync.get(['larkAccessToken', 'larkRefreshToken']);
      this.isLoggedIn = !!(result.larkAccessToken && result.larkRefreshToken);
      
      if (this.isLoggedIn) {
        this.loadAvailableTables();
        this.elements.loginPrompt.style.display = 'none';
      } else {
        this.elements.loginPrompt.style.display = 'flex';
      }
    } catch (error) {
      console.error('检查登录状态失败:', error);
      this.elements.loginPrompt.style.display = 'flex';
    }
  }

  async loadAvailableTables() {
    try {
      this.showStatus('加载表格列表...', 'info');
      
      const response = await this.makeApiRequest('/open-apis/bitable/v1/apps');
      
      if (response && response.data && response.data.items) {
        this.availableTables = response.data.items;
        this.updateTableSelect();
        this.elements.saveBtn.disabled = false;
      }
      
      this.hideStatus();
    } catch (error) {
      console.error('加载表格失败:', error);
      this.showStatus('加载表格列表失败', 'error');
    }
  }

  updateTableSelect() {
    const select = this.elements.tableSelect;
    select.innerHTML = '<option value="">请选择表格...</option>';
    
    this.availableTables.forEach(app => {
      const option = document.createElement('option');
      option.value = app.app_token;
      option.textContent = app.name;
      select.appendChild(option);
    });

    const savedTable = localStorage.getItem('lark_default_table');
    if (savedTable) {
      select.value = savedTable;
    }
  }

  handleTagInput(e) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const tag = e.target.value.trim();
      if (tag && !this.selectedTags.has(tag)) {
        this.addTag(tag);
        e.target.value = '';
      }
    }
  }

  addTag(tag) {
    this.selectedTags.add(tag);
    this.renderTags();
  }

  removeTag(tag) {
    this.selectedTags.delete(tag);
    this.renderTags();
  }

  renderTags() {
    const container = this.elements.tagsList;
    container.innerHTML = '';
    
    this.selectedTags.forEach(tag => {
      const tagElement = document.createElement('span');
      tagElement.className = 'tag';
      tagElement.innerHTML = `
        ${tag}
        <span class="tag-remove" data-tag="${tag}">&times;</span>
      `;
      container.appendChild(tagElement);
    });
  }

  handleTableChange(e) {
    const tableToken = e.target.value;
    if (tableToken) {
      localStorage.setItem('lark_default_table', tableToken);
    }
  }

  async handleSave() {
    if (!this.currentPageInfo || !this.elements.tableSelect.value) {
      this.showStatus('请选择目标表格', 'error');
      return;
    }

    try {
      this.setSaving(true);
      
      const bookmarkData = {
        title: this.currentPageInfo.title,
        url: this.currentPageInfo.url,
        description: this.elements.noteInput.value || this.currentPageInfo.description || '',
        tags: Array.from(this.selectedTags),
        created_at: new Date().toISOString(),
        status: '未读'
      };
      
      const tableToken = this.elements.tableSelect.value;
      await this.saveBookmark(tableToken, bookmarkData);
      
      this.showStatus('保存成功！', 'success');
      setTimeout(() => {
        window.close();
      }, 1500);
      
    } catch (error) {
      console.error('保存失败:', error);
      this.showStatus('保存失败: ' + error.message, 'error');
    } finally {
      this.setSaving(false);
    }
  }

  async saveBookmark(appToken, data) {
    try {
      const tablesResponse = await this.makeApiRequest(`/open-apis/bitable/v1/apps/${appToken}/tables`);
      
      if (!tablesResponse.data || !tablesResponse.data.items || tablesResponse.data.items.length === 0) {
        throw new Error('未找到可用的数据表');
      }
      
      const tableId = tablesResponse.data.items[0].table_id;
      
      const recordData = {
        fields: {
          '标题': data.title,
          'URL': data.url,
          '描述': data.description,
          '标签': data.tags.join(', '),
          '收藏时间': data.created_at,
          '状态': data.status
        }
      };
      
      const response = await this.makeApiRequest(
        `/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records`,
        'POST',
        recordData
      );
      
      if (!response || response.code !== 0) {
        throw new Error(response?.msg || '保存到飞书失败');
      }
      
      await this.saveToLocal(data);
      
    } catch (error) {
      throw error;
    }
  }

  async saveToLocal(data) {
    try {
      const result = await chrome.storage.local.get(['bookmarks']);
      const bookmarks = result.bookmarks || [];
      bookmarks.unshift({ ...data, id: Date.now() });
      
      await chrome.storage.local.set({ 
        bookmarks: bookmarks.slice(0, 100) 
      });
    } catch (error) {
      console.warn('保存到本地失败:', error);
    }
  }

  async makeApiRequest(endpoint, method = 'GET', data = null) {
    const result = await chrome.storage.sync.get(['larkAccessToken']);
    const accessToken = result.larkAccessToken;
    
    if (!accessToken) {
      throw new Error('未找到访问令牌，请重新登录');
    }
    
    const options = {
      method,
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    };
    
    if (data && method !== 'GET') {
      options.body = JSON.stringify(data);
    }
    
    const response = await fetch(`https://open.feishu.cn${endpoint}`, options);
    
    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('登录已过期，请重新登录');
      }
      throw new Error(`请求失败: ${response.status}`);
    }
    
    return await response.json();
  }

  setSaving(saving) {
    const saveBtn = this.elements.saveBtn;
    const textSpan = saveBtn.querySelector('.btn-text');
    const loadingSpan = saveBtn.querySelector('.btn-loading');
    
    saveBtn.disabled = saving;
    textSpan.style.display = saving ? 'none' : 'inline';
    loadingSpan.style.display = saving ? 'inline-flex' : 'none';
  }

  showStatus(message, type) {
    const status = this.elements.statusMessage;
    status.textContent = message;
    status.className = `status-message ${type}`;
    status.style.display = 'block';
  }

  hideStatus() {
    this.elements.statusMessage.style.display = 'none';
  }

  handleCancel() {
    window.close();
  }

  openSettings() {
    chrome.tabs.create({ url: chrome.runtime.getURL('options/options.html') });
    window.close();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new LarkBookmarksPopup();
});

chrome.commands.onCommand.addListener((command) => {
  if (command === 'bookmark-page') {
    chrome.action.openPopup();
  }
});