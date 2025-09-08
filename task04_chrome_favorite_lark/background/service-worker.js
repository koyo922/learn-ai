class LarkBookmarksBackground {
  constructor() {
    console.log('LarkBookmarksBackground initializing...');
    this.initializeListeners();
  }

  initializeListeners() {
    chrome.runtime.onInstalled.addListener(this.handleInstall.bind(this));
    chrome.action.onClicked.addListener(this.handleActionClick.bind(this));
    chrome.commands.onCommand.addListener(this.handleCommand.bind(this));
    chrome.tabs.onUpdated.addListener(this.handleTabUpdate.bind(this));
    chrome.runtime.onMessage.addListener(this.handleMessage.bind(this));
    
    chrome.contextMenus.onClicked.addListener(this.handleContextMenu.bind(this));
  }

  async handleInstall(details) {
    if (details.reason === 'install') {
      console.log('Lark Bookmarks 扩展已安装');
      
      await this.createContextMenus();
      
      chrome.tabs.create({
        url: chrome.runtime.getURL('options/options.html')
      });
    } else if (details.reason === 'update') {
      console.log('Lark Bookmarks 扩展已更新');
    }
  }

  async createContextMenus() {
    try {
      await chrome.contextMenus.removeAll();
      
      chrome.contextMenus.create({
        id: 'bookmark-page',
        title: '收藏到飞书多维表格',
        contexts: ['page']
      });
      
      chrome.contextMenus.create({
        id: 'bookmark-link',
        title: '收藏链接到飞书',
        contexts: ['link']
      });
      
      chrome.contextMenus.create({
        id: 'bookmark-selection',
        title: '收藏选中内容到飞书',
        contexts: ['selection']
      });
      
    } catch (error) {
      console.error('创建右键菜单失败:', error);
    }
  }

  handleActionClick(tab) {
    if (this.isValidUrl(tab.url)) {
      chrome.action.openPopup();
    } else {
      chrome.tabs.create({
        url: chrome.runtime.getURL('options/options.html')
      });
    }
  }

  handleCommand(command, tab) {
    switch (command) {
      case 'bookmark-page':
        if (this.isValidUrl(tab.url)) {
          chrome.action.openPopup();
        }
        break;
      default:
        console.log('未知命令:', command);
    }
  }

  handleTabUpdate(tabId, changeInfo, tab) {
    if (changeInfo.status === 'complete' && tab.active) {
      this.updateBadge(tab);
    }
  }

  async updateBadge(tab) {
    try {
      if (!this.isValidUrl(tab.url)) {
        chrome.action.setBadgeText({ text: '', tabId: tab.id });
        return;
      }
      
      const bookmarks = await this.getStoredBookmarks();
      const isBookmarked = bookmarks.some(bookmark => 
        bookmark.url === tab.url
      );
      
      if (isBookmarked) {
        chrome.action.setBadgeText({ text: '✓', tabId: tab.id });
        chrome.action.setBadgeBackgroundColor({ color: '#10b981' });
      } else {
        chrome.action.setBadgeText({ text: '', tabId: tab.id });
      }
    } catch (error) {
      console.error('更新徽章失败:', error);
    }
  }

  async handleContextMenu(info, tab) {
    try {
      switch (info.menuItemId) {
        case 'bookmark-page':
          await this.quickBookmark(tab);
          break;
          
        case 'bookmark-link':
          if (info.linkUrl) {
            await this.bookmarkUrl(info.linkUrl, tab);
          }
          break;
          
        case 'bookmark-selection':
          if (info.selectionText) {
            await this.bookmarkSelection(info.selectionText, tab);
          }
          break;
      }
    } catch (error) {
      console.error('处理右键菜单失败:', error);
      this.showNotification('操作失败', error.message, 'error');
    }
  }

  async handleMessage(message, sender, sendResponse) {
    try {
      console.log('Background received message:', message);
      switch (message.action) {
        case 'quickBookmark':
          const result = await this.quickBookmark(sender.tab);
          sendResponse({ success: true, data: result });
          break;
          
        case 'getPageMetadata':
          const metadata = await this.getPageMetadata(sender.tab.id);
          sendResponse({ success: true, data: metadata });
          break;
          
        case 'checkBookmarkStatus':
          const isBookmarked = await this.isPageBookmarked(message.url);
          sendResponse({ success: true, isBookmarked });
          break;
          
        case 'getTablesList':
          console.log('Processing getTablesList request...');
          const tables = await this.getTablesList();
          console.log('getTablesList result:', tables);
          sendResponse(tables);
          break;
          
        default:
          sendResponse({ success: false, error: '未知操作' });
      }
    } catch (error) {
      console.error('处理消息失败:', error);
      sendResponse({ success: false, error: error.message });
    }
    
    return true; // 保持消息通道开放
  }

  async quickBookmark(tab) {
    const loginStatus = await this.checkLoginStatus();
    if (!loginStatus.isLoggedIn) {
      throw new Error('请先登录飞书账户');
    }
    
    const defaultTable = await this.getDefaultTable();
    if (!defaultTable) {
      throw new Error('请先设置默认表格');
    }
    
    const bookmarkData = {
      title: tab.title,
      url: tab.url,
      description: '',
      tags: [],
      created_at: new Date().toISOString(),
      status: '未读'
    };
    
    await this.saveBookmarkToLark(defaultTable, bookmarkData);
    await this.saveBookmarkLocal(bookmarkData);
    
    this.showNotification(
      '收藏成功',
      `已将"${tab.title}"保存到飞书多维表格`,
      'success'
    );
    
    this.updateBadge(tab);
    
    return bookmarkData;
  }

  async bookmarkUrl(url, tab) {
    const response = await fetch(url);
    const html = await response.text();
    
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    const title = doc.querySelector('title')?.textContent || url;
    const description = doc.querySelector('meta[name="description"]')?.content || '';
    
    const bookmarkData = {
      title,
      url,
      description,
      tags: ['链接收藏'],
      created_at: new Date().toISOString(),
      status: '未读'
    };
    
    const defaultTable = await this.getDefaultTable();
    if (defaultTable) {
      await this.saveBookmarkToLark(defaultTable, bookmarkData);
      await this.saveBookmarkLocal(bookmarkData);
      
      this.showNotification(
        '链接收藏成功',
        `已收藏: ${title}`,
        'success'
      );
    } else {
      throw new Error('请先设置默认表格');
    }
  }

  async bookmarkSelection(selectionText, tab) {
    const bookmarkData = {
      title: `${tab.title} - 摘录`,
      url: tab.url,
      description: selectionText,
      tags: ['文本摘录'],
      created_at: new Date().toISOString(),
      status: '未读'
    };
    
    const defaultTable = await this.getDefaultTable();
    if (defaultTable) {
      await this.saveBookmarkToLark(defaultTable, bookmarkData);
      await this.saveBookmarkLocal(bookmarkData);
      
      this.showNotification(
        '摘录收藏成功',
        '已保存选中的文本内容',
        'success'
      );
    } else {
      throw new Error('请先设置默认表格');
    }
  }

  async saveBookmarkToLark(appToken, data) {
    const result = await chrome.storage.sync.get(['larkAccessToken']);
    const accessToken = result.larkAccessToken;
    
    if (!accessToken) {
      throw new Error('未找到访问令牌');
    }
    
    const tablesResponse = await fetch(
      `https://open.feishu.cn/open-apis/bitable/v1/apps/${appToken}/tables`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    if (!tablesResponse.ok) {
      throw new Error('获取表格信息失败');
    }
    
    const tablesData = await tablesResponse.json();
    if (!tablesData.data || !tablesData.data.items || tablesData.data.items.length === 0) {
      throw new Error('未找到可用的数据表');
    }
    
    const tableId = tablesData.data.items[0].table_id;
    
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
    
    const response = await fetch(
      `https://open.feishu.cn/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(recordData)
      }
    );
    
    if (!response.ok) {
      throw new Error(`保存失败: ${response.status}`);
    }
    
    const result_1 = await response.json();
    if (result_1.code !== 0) {
      throw new Error(result_1.msg || '保存到飞书失败');
    }
  }

  async saveBookmarkLocal(data) {
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

  async getStoredBookmarks() {
    try {
      const result = await chrome.storage.local.get(['bookmarks']);
      return result.bookmarks || [];
    } catch (error) {
      console.error('获取本地书签失败:', error);
      return [];
    }
  }

  async isPageBookmarked(url) {
    const bookmarks = await this.getStoredBookmarks();
    return bookmarks.some(bookmark => bookmark.url === url);
  }

  async checkLoginStatus() {
    try {
      const result = await chrome.storage.sync.get(['larkAccessToken', 'larkRefreshToken']);
      return {
        isLoggedIn: !!(result.larkAccessToken && result.larkRefreshToken)
      };
    } catch (error) {
      return { isLoggedIn: false };
    }
  }

  async getDefaultTable() {
    try {
      const result = await chrome.storage.sync.get(['defaultTable']);
      return result.defaultTable || localStorage.getItem('lark_default_table');
    } catch (error) {
      console.error('获取默认表格失败:', error);
      return null;
    }
  }

  async getPageMetadata(tabId) {
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId },
        function: () => {
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
      });
      
      return results && results[0] ? results[0].result : {};
    } catch (error) {
      console.error('获取页面元数据失败:', error);
      return {};
    }
  }

  showNotification(title, message, type = 'info') {
    const iconUrl = {
      success: chrome.runtime.getURL('icons/icon48.png'),
      error: chrome.runtime.getURL('icons/icon48.png'),
      info: chrome.runtime.getURL('icons/icon48.png')
    }[type];

    chrome.notifications.create({
      type: 'basic',
      iconUrl,
      title,
      message
    });
  }

  isValidUrl(url) {
    return url && 
           !url.startsWith('chrome://') && 
           !url.startsWith('chrome-extension://') && 
           !url.startsWith('edge://') && 
           !url.startsWith('about:');
  }

  async getTablesList() {
    try {
      // 获取存储的认证信息
      const result = await chrome.storage.sync.get(['authMethod', 'larkAccessToken', 'larkClientId', 'larkClientSecret']);
      
      console.log('Auth method:', result.authMethod);
      
      let accessToken;
      
      if (result.authMethod === 'oauth' && result.larkAccessToken) {
        // 使用OAuth用户访问令牌
        console.log('Using OAuth user access token...');
        accessToken = result.larkAccessToken;
        
        // 检查令牌是否过期
        const tokenExpires = await chrome.storage.sync.get(['larkTokenExpires']);
        if (tokenExpires.larkTokenExpires && Date.now() > tokenExpires.larkTokenExpires) {
          console.log('Token expired, attempting refresh...');
          const refreshResult = await this.refreshAccessToken();
          if (!refreshResult.success) {
            return { success: false, error: '访问令牌已过期，请重新授权' };
          }
          accessToken = refreshResult.accessToken;
        }
        
      } else if (result.larkClientId && result.larkClientSecret) {
        // 使用应用凭据获取tenant access token
        console.log('Using app credentials...');
        
        const tokenResponse = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            app_id: result.larkClientId,
            app_secret: result.larkClientSecret
          })
        });
        
        const tokenData = await tokenResponse.json();
        console.log('Tenant token response:', tokenData);
        
        if (tokenData.code !== 0) {
          return { success: false, error: '获取访问令牌失败: ' + tokenData.msg };
        }
        
        accessToken = tokenData.tenant_access_token;
        
      } else {
        return { success: false, error: '请先配置飞书应用凭据或完成用户授权' };
      }
      
      console.log('Getting apps list...');
      
      // 尝试获取多维表格列表 - 先尝试用户权限API
      let appsResponse, appsData;
      
      if (result.authMethod === 'oauth') {
        // OAuth用户权限，尝试获取用户可访问的表格
        console.log('Trying user accessible apps API...');
        appsResponse = await fetch('https://open.feishu.cn/open-apis/bitable/v1/apps?page_size=100', {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        });
      } else {
        // 应用权限，获取应用创建的表格
        console.log('Trying app created apps API...');
        appsResponse = await fetch('https://open.feishu.cn/open-apis/bitable/v1/apps', {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        });
      }
      
      appsData = await appsResponse.json();
      console.log('Apps response:', appsData);
      
      if (appsData.code !== 0) {
        return { success: false, error: '获取表格列表失败: ' + appsData.msg };
      }
      
      const tables = appsData.data?.items || [];
      console.log(`Found ${tables.length} tables`);
      
      // 如果没有找到表格，添加提示信息
      if (tables.length === 0) {
        console.log('No tables found. This might be because:');
        console.log('1. No bitable apps created via API');
        console.log('2. Tables created in Feishu UI need different permissions');
        console.log('3. Need additional scopes like bitable:app:readonly');
        
        return { 
          success: true, 
          data: [], 
          message: '未找到多维表格。如果您在飞书中创建了表格，可能需要在飞书开放平台申请更多权限，或手动输入表格Token。' 
        };
      }
      
      return { success: true, data: tables };
      
    } catch (error) {
      console.error('Get tables error:', error);
      return { success: false, error: '网络错误: ' + error.message };
    }
  }

  async refreshAccessToken() {
    try {
      const result = await chrome.storage.sync.get(['larkRefreshToken', 'larkAppId']);
      
      if (!result.larkRefreshToken || !result.larkAppId) {
        return { success: false, error: '缺少刷新令牌信息' };
      }

      const response = await fetch('https://open.feishu.cn/open-apis/authen/v1/refresh_access_token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          grant_type: 'refresh_token',
          refresh_token: result.larkRefreshToken,
          client_id: result.larkAppId
        })
      });

      const data = await response.json();
      
      if (data.code !== 0) {
        return { success: false, error: '刷新令牌失败: ' + data.msg };
      }

      // 更新存储的令牌
      await chrome.storage.sync.set({
        larkAccessToken: data.data.access_token,
        larkRefreshToken: data.data.refresh_token,
        larkTokenExpires: Date.now() + (data.data.expires_in * 1000)
      });

      return { success: true, accessToken: data.data.access_token };
      
    } catch (error) {
      console.error('Refresh token error:', error);
      return { success: false, error: '刷新令牌失败: ' + error.message };
    }
  }
}

console.log('Starting LarkBookmarksBackground...');
new LarkBookmarksBackground();
console.log('LarkBookmarksBackground started.');