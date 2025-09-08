class LarkAPI {
  constructor() {
    this.baseURL = 'https://open.feishu.cn';
    this.accessToken = null;
    this.refreshToken = null;
    this.clientId = null;
    this.clientSecret = null;
    
    this.loadTokens();
  }

  async loadTokens() {
    try {
      const result = await chrome.storage.sync.get([
        'larkAccessToken',
        'larkRefreshToken', 
        'larkClientId',
        'larkClientSecret'
      ]);
      
      this.accessToken = result.larkAccessToken;
      this.refreshToken = result.larkRefreshToken;
      this.clientId = result.larkClientId;
      this.clientSecret = result.larkClientSecret;
    } catch (error) {
      console.error('加载令牌失败:', error);
    }
  }

  async saveTokens(accessToken, refreshToken) {
    try {
      await chrome.storage.sync.set({
        larkAccessToken: accessToken,
        larkRefreshToken: refreshToken
      });
      
      this.accessToken = accessToken;
      this.refreshToken = refreshToken;
    } catch (error) {
      console.error('保存令牌失败:', error);
      throw error;
    }
  }

  async refreshAccessToken() {
    if (!this.refreshToken || !this.clientId || !this.clientSecret) {
      throw new Error('缺少刷新令牌或应用凭据');
    }
    
    try {
      const response = await fetch(`${this.baseURL}/open-apis/auth/v3/tenant_access_token/internal`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          app_id: this.clientId,
          app_secret: this.clientSecret
        })
      });
      
      const data = await response.json();
      
      if (data.code === 0) {
        await this.saveTokens(data.tenant_access_token, this.refreshToken);
        return data.tenant_access_token;
      } else {
        throw new Error(data.msg || '刷新令牌失败');
      }
    } catch (error) {
      console.error('刷新访问令牌失败:', error);
      throw error;
    }
  }

  async makeRequest(endpoint, method = 'GET', data = null, retryCount = 0) {
    if (!this.accessToken) {
      await this.loadTokens();
      if (!this.accessToken) {
        throw new Error('未找到访问令牌，请先登录');
      }
    }
    
    const url = `${this.baseURL}${endpoint}`;
    const options = {
      method,
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json'
      }
    };
    
    if (data && method !== 'GET') {
      options.body = JSON.stringify(data);
    }
    
    try {
      const response = await fetch(url, options);
      
      if (response.status === 401 && retryCount < 1) {
        await this.refreshAccessToken();
        return this.makeRequest(endpoint, method, data, retryCount + 1);
      }
      
      if (!response.ok) {
        throw new Error(`请求失败: ${response.status} ${response.statusText}`);
      }
      
      const result = await response.json();
      
      if (result.code !== 0) {
        throw new Error(result.msg || '请求失败');
      }
      
      return result;
    } catch (error) {
      console.error('API请求失败:', error);
      throw error;
    }
  }

  async getUserInfo() {
    return this.makeRequest('/open-apis/authen/v1/user_info');
  }

  async getApps() {
    return this.makeRequest('/open-apis/bitable/v1/apps');
  }

  async getTables(appToken) {
    return this.makeRequest(`/open-apis/bitable/v1/apps/${appToken}/tables`);
  }

  async getTableFields(appToken, tableId) {
    return this.makeRequest(`/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/fields`);
  }

  async createRecord(appToken, tableId, fields) {
    const data = { fields };
    return this.makeRequest(
      `/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records`,
      'POST',
      data
    );
  }

  async batchCreateRecords(appToken, tableId, records) {
    const data = { records };
    return this.makeRequest(
      `/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records/batch_create`,
      'POST',
      data
    );
  }

  async getRecords(appToken, tableId, options = {}) {
    const params = new URLSearchParams();
    
    if (options.pageSize) params.append('page_size', options.pageSize);
    if (options.pageToken) params.append('page_token', options.pageToken);
    if (options.filter) params.append('filter', options.filter);
    if (options.sort) params.append('sort', JSON.stringify(options.sort));
    
    const queryString = params.toString();
    const endpoint = `/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records${queryString ? '?' + queryString : ''}`;
    
    return this.makeRequest(endpoint);
  }

  async updateRecord(appToken, tableId, recordId, fields) {
    const data = { fields };
    return this.makeRequest(
      `/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records/${recordId}`,
      'PUT',
      data
    );
  }

  async deleteRecord(appToken, tableId, recordId) {
    return this.makeRequest(
      `/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records/${recordId}`,
      'DELETE'
    );
  }

  async searchRecords(appToken, tableId, query) {
    const filter = `OR(SEARCH("${query}", {标题}), SEARCH("${query}", {描述}), SEARCH("${query}", {标签}))`;
    
    return this.getRecords(appToken, tableId, {
      filter,
      pageSize: 50
    });
  }

  async ensureBookmarkTable(appToken) {
    try {
      const tablesResponse = await this.getTables(appToken);
      
      if (tablesResponse.data && tablesResponse.data.items && tablesResponse.data.items.length > 0) {
        const bookmarkTable = tablesResponse.data.items.find(table => 
          table.name.includes('书签') || table.name.includes('收藏') || table.name.includes('Bookmark')
        );
        
        if (bookmarkTable) {
          return bookmarkTable;
        }
        
        return tablesResponse.data.items[0];
      }
      
      throw new Error('未找到可用的数据表');
    } catch (error) {
      console.error('确保书签表格存在失败:', error);
      throw error;
    }
  }

  async validateTableStructure(appToken, tableId) {
    try {
      const fieldsResponse = await this.getTableFields(appToken, tableId);
      
      if (!fieldsResponse.data || !fieldsResponse.data.items) {
        throw new Error('获取表格字段失败');
      }
      
      const fields = fieldsResponse.data.items;
      const requiredFields = ['标题', 'URL', '描述', '标签', '收藏时间', '状态'];
      const fieldNames = fields.map(field => field.field_name);
      
      const missingFields = requiredFields.filter(required => 
        !fieldNames.includes(required)
      );
      
      if (missingFields.length > 0) {
        console.warn('缺少必需字段:', missingFields);
      }
      
      return {
        isValid: missingFields.length === 0,
        missingFields,
        availableFields: fieldNames
      };
    } catch (error) {
      console.error('验证表格结构失败:', error);
      throw error;
    }
  }

  generateOAuthUrl(clientId, redirectUri) {
    const state = Math.random().toString(36).substring(2, 15);
    localStorage.setItem('lark_oauth_state', state);
    
    const params = new URLSearchParams({
      app_id: clientId,
      redirect_uri: redirectUri,
      scope: 'bitable:app',
      state: state
    });
    
    return `${this.baseURL}/open-apis/authen/v1/authorize?${params.toString()}`;
  }

  async exchangeCodeForToken(code, clientId, clientSecret) {
    try {
      const response = await fetch(`${this.baseURL}/open-apis/authen/v1/oidc/access_token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          grant_type: 'authorization_code',
          client_id: clientId,
          client_secret: clientSecret,
          code: code
        })
      });
      
      const data = await response.json();
      
      if (data.code === 0) {
        await this.saveTokens(data.data.access_token, data.data.refresh_token);
        
        await chrome.storage.sync.set({
          larkClientId: clientId,
          larkClientSecret: clientSecret
        });
        
        return data.data;
      } else {
        throw new Error(data.msg || '获取访问令牌失败');
      }
    } catch (error) {
      console.error('交换授权码失败:', error);
      throw error;
    }
  }

  async logout() {
    try {
      await chrome.storage.sync.remove([
        'larkAccessToken',
        'larkRefreshToken',
        'larkClientId', 
        'larkClientSecret'
      ]);
      
      this.accessToken = null;
      this.refreshToken = null;
      this.clientId = null;
      this.clientSecret = null;
      
      localStorage.removeItem('lark_oauth_state');
      localStorage.removeItem('lark_default_table');
      
    } catch (error) {
      console.error('登出失败:', error);
      throw error;
    }
  }

  isLoggedIn() {
    return !!(this.accessToken && this.refreshToken);
  }
}

if (typeof window !== 'undefined') {
  window.LarkAPI = LarkAPI;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = LarkAPI;
}