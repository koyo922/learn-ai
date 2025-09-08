console.log('Simple options script starting...');

document.addEventListener('DOMContentLoaded', function() {
  console.log('DOMContentLoaded - Simple options loaded');
  
  // 基础标签页切换
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabPanels = document.querySelectorAll('.tab-panel');
  
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabName = btn.dataset.tab;
      console.log('Tab clicked:', tabName);
      
      tabBtns.forEach(b => b.classList.remove('active'));
      tabPanels.forEach(p => p.classList.remove('active'));
      
      btn.classList.add('active');
      const panel = document.getElementById(tabName + '-tab');
      if (panel) {
        panel.classList.add('active');
      }
    });
  });

  // 授权方式标签页切换
  const authTabs = document.querySelectorAll('.auth-tab');
  const authPanels = document.querySelectorAll('.auth-panel');
  
  authTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const method = tab.dataset.method;
      console.log('Auth method selected:', method);
      
      authTabs.forEach(t => t.classList.remove('active'));
      authPanels.forEach(p => p.classList.remove('active'));
      
      tab.classList.add('active');
      const panel = document.getElementById(method + '-auth');
      if (panel) {
        panel.classList.add('active');
      }
    });
  });

  // OAuth 用户授权处理
  const oauthLoginBtn = document.getElementById('oauthLoginBtn');
  if (oauthLoginBtn) {
    console.log('OAuth login button found');
    oauthLoginBtn.addEventListener('click', async function(e) {
      e.preventDefault();
      console.log('OAuth login button clicked');
      
      const appId = document.getElementById('oauthAppId').value;
      const appSecret = document.getElementById('oauthAppSecret').value;
      
      if (!appId || !appSecret) {
        alert('请输入完整的飞书应用 App ID 和 App Secret');
        return;
      }

      try {
        await handleOAuthLogin(appId, appSecret);
      } catch (error) {
        console.error('OAuth login failed:', error);
        alert('授权失败: ' + error.message);
      }
    });
  }
  
  // 应用凭据登录按钮处理  
  const loginBtn = document.getElementById('loginBtn');
  if (loginBtn) {
    console.log('App credentials login button found');
    loginBtn.addEventListener('click', async function(e) {
      e.preventDefault();
      console.log('App credentials login button clicked');
      
      const clientId = document.getElementById('clientId').value;
      const clientSecret = document.getElementById('clientSecret').value;
      
      if (clientId && clientSecret) {
        console.log('Saving credentials:', { clientId: clientId.substring(0, 10) + '...' });
        
        // 保存凭据
        chrome.storage.sync.set({
          larkClientId: clientId,
          larkClientSecret: clientSecret
        }, () => {
          if (chrome.runtime.lastError) {
            console.error('Save error:', chrome.runtime.lastError);
            alert('保存失败: ' + chrome.runtime.lastError.message);
          } else {
            console.log('Credentials saved successfully');
            alert('凭据已保存！');
            
            // 验证保存结果
            chrome.storage.sync.get(['larkClientId', 'larkClientSecret'], (result) => {
              console.log('Verification - saved data:', { 
                hasClientId: !!result.larkClientId,
                hasClientSecret: !!result.larkClientSecret
              });
            });
          }
        });
      } else {
        alert('请填写完整信息');
      }
    });
  } else {
    console.log('App credentials login button NOT found');
    console.log('Available elements with IDs:', 
      Array.from(document.querySelectorAll('[id]')).map(el => el.id)
    );
  }

  // 简单的按钮处理
  const refreshBtn = document.getElementById('refreshTablesBtn');
  if (refreshBtn) {
    console.log('Refresh button found');
    refreshBtn.addEventListener('click', async function(e) {
      e.preventDefault();
      console.log('Refresh button clicked - sending message to background');
      
      try {
        const response = await chrome.runtime.sendMessage({
          action: 'getTablesList'
        });
        
        console.log('Response received:', response);
        
        if (response && response.success) {
          console.log('Success! Got tables:', response.data);
          updateTableSelect(response.data || []);
          
          if (response.data && response.data.length > 0) {
            alert(`成功获取 ${response.data.length} 个表格`);
          } else {
            alert(response.message || '未找到多维表格，请尝试手动添加表格Token');
          }
        } else {
          console.error('Failed:', response ? response.error : 'No response');
          alert('获取失败: ' + (response ? response.error : 'No response'));
        }
      } catch (error) {
        console.error('Error:', error);
      }
    });
  } else {
    console.log('Refresh button NOT found');
  }

  // 手动添加表格按钮处理
  const addManualTableBtn = document.getElementById('addManualTableBtn');
  if (addManualTableBtn) {
    console.log('Manual table button found');
    addManualTableBtn.addEventListener('click', async function(e) {
      e.preventDefault();
      
      const token = document.getElementById('manualTableToken').value.trim();
      const name = document.getElementById('manualTableName').value.trim() || 'Manual Table';
      
      if (!token) {
        alert('请输入表格Token');
        return;
      }
      
      try {
        // 保存手动添加的表格到本地存储
        const result = await chrome.storage.local.get(['manualTables']);
        const manualTables = result.manualTables || [];
        
        // 检查是否已存在
        const existing = manualTables.find(t => t.app_token === token);
        if (existing) {
          alert('该表格已存在');
          return;
        }
        
        // 添加新表格
        const newTable = {
          app_token: token,
          name: name,
          created_at: new Date().toISOString(),
          manual: true
        };
        
        manualTables.push(newTable);
        await chrome.storage.local.set({ manualTables });
        
        // 更新下拉列表
        updateTableSelectWithManual();
        
        // 清空输入框
        document.getElementById('manualTableToken').value = '';
        document.getElementById('manualTableName').value = '';
        
        alert('表格添加成功！');
        
      } catch (error) {
        console.error('Error adding manual table:', error);
        alert('添加失败: ' + error.message);
      }
    });
  }
  
  // 显示所有按钮元素
  const allButtons = document.querySelectorAll('button');
  console.log('All buttons found:', allButtons.length);
  allButtons.forEach((btn, index) => {
    console.log(`Button ${index}:`, btn.id, btn.className, btn.textContent.trim());
  });
  
  // 更新表格选择下拉框
  function updateTableSelect(tables) {
    const tableSelect = document.getElementById('tableSelect');
    if (!tableSelect) {
      console.log('Table select element not found');
      return;
    }
    
    console.log('Updating table select with tables:', tables);
    
    tableSelect.innerHTML = '<option value="">请选择表格...</option>';
    
    tables.forEach(app => {
      const option = document.createElement('option');
      option.value = app.app_token;
      option.textContent = app.name;
      tableSelect.appendChild(option);
    });
    
    console.log(`Updated table select with ${tables.length} tables`);
  }

  // 更新表格选择下拉框（包含手动添加的表格）
  async function updateTableSelectWithManual() {
    const tableSelect = document.getElementById('tableSelect');
    if (!tableSelect) {
      console.log('Table select element not found');
      return;
    }
    
    console.log('Updating table select with manual tables...');
    
    // 获取手动添加的表格
    const result = await chrome.storage.local.get(['manualTables']);
    const manualTables = result.manualTables || [];
    
    tableSelect.innerHTML = '<option value="">请选择表格...</option>';
    
    // 添加手动表格（标记为手动添加）
    manualTables.forEach(table => {
      const option = document.createElement('option');
      option.value = table.app_token;
      option.textContent = `${table.name} (手动添加)`;
      tableSelect.appendChild(option);
    });
    
    console.log(`Updated table select with ${manualTables.length} manual tables`);
  }
  
  // 页面加载时恢复保存的凭据
  function loadSavedCredentials() {
    console.log('Loading saved credentials...');
    chrome.storage.sync.get(['larkClientId', 'larkClientSecret'], (result) => {
      if (chrome.runtime.lastError) {
        console.error('Load error:', chrome.runtime.lastError);
        return;
      }
      
      console.log('Loaded credentials:', {
        hasClientId: !!result.larkClientId,
        hasClientSecret: !!result.larkClientSecret
      });
      
      const clientIdInput = document.getElementById('clientId');
      const clientSecretInput = document.getElementById('clientSecret');
      
      if (clientIdInput && result.larkClientId) {
        clientIdInput.value = result.larkClientId;
      }
      
      if (clientSecretInput && result.larkClientSecret) {
        clientSecretInput.value = result.larkClientSecret;
      }
    });
  }
  
  // 加载保存的凭据
  loadSavedCredentials();
  
  // 检查登录状态
  checkLoginStatus();
  
  // 加载手动添加的表格
  updateTableSelectWithManual();
});

// 检查登录状态并更新UI
async function checkLoginStatus() {
  try {
    const result = await chrome.storage.sync.get(['authMethod', 'larkAccessToken']);
    console.log('Current auth status:', result);
    
    if (result.authMethod === 'oauth' && result.larkAccessToken) {
      console.log('User is logged in via OAuth');
      updateUIAfterLogin();
    }
  } catch (error) {
    console.error('Error checking login status:', error);
  }
}

// 更新UI状态
function updateUIAfterLogin() {
  console.log('Updating UI after successful login');
  
  // 隐藏登录区域，显示已登录状态
  const loginSection = document.getElementById('login-section');
  const accountInfo = document.getElementById('account-info');
  
  if (loginSection) {
    loginSection.style.display = 'none';
  }
  
  if (accountInfo) {
    accountInfo.style.display = 'block';
    
    // 更新用户信息显示
    const userName = document.getElementById('userName');
    const userEmail = document.getElementById('userEmail');
    
    if (userName) userName.textContent = '已授权用户';
    if (userEmail) userEmail.textContent = 'OAuth 2.0 授权';
  }
}

// OAuth 授权处理函数
async function handleOAuthLogin(appId, appSecret) {
  console.log('Starting OAuth flow for app:', appId);
  
  // 生成随机state用于安全验证
  const state = generateRandomString(32);
  await chrome.storage.local.set({ oauthState: state });
  
  // 构建授权URL
  const redirectUri = chrome.identity.getRedirectURL();
  const scope = 'bitable:app'; // 多维表格权限
  
  const authUrl = `https://open.feishu.cn/open-apis/authen/v1/authorize?` +
    `client_id=${appId}&` +
    `redirect_uri=${encodeURIComponent(redirectUri)}&` +
    `response_type=code&` +
    `scope=${scope}&` +
    `state=${state}`;
  
  console.log('Auth URL:', authUrl);
  console.log('Redirect URI:', redirectUri);
  
  try {
    // 打开授权窗口
    const responseUrl = await chrome.identity.launchWebAuthFlow({
      url: authUrl,
      interactive: true
    });
    
    console.log('Auth response URL:', responseUrl);
    
    // 解析授权码
    const url = new URL(responseUrl);
    const code = url.searchParams.get('code');
    const returnedState = url.searchParams.get('state');
    const error = url.searchParams.get('error');
    
    if (error) {
      throw new Error(`授权失败: ${error}`);
    }
    
    if (!code) {
      throw new Error('未获取到授权码');
    }
    
    // 验证state
    const savedState = await chrome.storage.local.get(['oauthState']);
    if (returnedState !== savedState.oauthState) {
      throw new Error('状态验证失败，可能存在安全风险');
    }
    
    // 交换访问令牌
    const tokenData = await exchangeCodeForToken(appId, appSecret, code, redirectUri);
    
    // 保存令牌
    await chrome.storage.sync.set({
      larkAccessToken: tokenData.access_token,
      larkRefreshToken: tokenData.refresh_token,
      larkTokenExpires: Date.now() + (tokenData.expires_in * 1000),
      larkAppId: appId,
      authMethod: 'oauth'
    });
    
    console.log('OAuth login successful');
    alert('授权成功！现在可以访问您的多维表格了。');
    
    // 更新UI状态而不是刷新页面
    updateUIAfterLogin();
    
  } catch (error) {
    console.error('OAuth flow error:', error);
    throw error;
  }
}

// 用授权码交换访问令牌
async function exchangeCodeForToken(appId, appSecret, code, redirectUri) {
  console.log('Exchanging code for token...');
  
  const response = await fetch('https://open.feishu.cn/open-apis/authen/v1/access_token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      app_id: appId,
      app_secret: appSecret,
      code: code,
      redirect_uri: redirectUri
    })
  });
  
  const data = await response.json();
  console.log('Token exchange response:', data);
  
  if (data.code !== 0) {
    throw new Error(`获取访问令牌失败: ${data.msg}`);
  }
  
  return data.data;
}

// 生成随机字符串
function generateRandomString(length) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

console.log('Simple options script initialized.');