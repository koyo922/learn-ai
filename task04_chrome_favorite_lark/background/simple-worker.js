console.log('Simple service worker starting...');

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Received message:', message);
  
  if (message.action === 'getTablesList') {
    console.log('Processing getTablesList request...');
    getTablesList().then(result => {
      console.log('getTablesList result:', result);
      sendResponse(result);
    }).catch(error => {
      console.error('getTablesList error:', error);
      sendResponse({ success: false, error: error.message });
    });
    return true; // 保持异步响应通道开放
  }
  
  return true;
});

async function getTablesList() {
  try {
    console.log('Getting stored credentials...');
    
    // 获取存储的凭据
    const result = await chrome.storage.sync.get(['larkClientId', 'larkClientSecret']);
    console.log('Stored credentials:', { 
      hasClientId: !!result.larkClientId, 
      hasClientSecret: !!result.larkClientSecret 
    });
    
    if (!result.larkClientId || !result.larkClientSecret) {
      return { success: false, error: '请先配置飞书应用凭据' };
    }
    
    console.log('Getting access token...');
    
    // 获取access token
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
    
    console.log('Token response status:', tokenResponse.status);
    console.log('Token response headers:', Object.fromEntries(tokenResponse.headers.entries()));
    
    const tokenText = await tokenResponse.text();
    console.log('Token response text:', tokenText);
    
    let tokenData;
    try {
      tokenData = JSON.parse(tokenText);
    } catch (e) {
      console.error('Failed to parse token response as JSON:', e);
      return { success: false, error: '令牌响应格式错误: ' + tokenText.substring(0, 100) };
    }
    
    console.log('Token response parsed:', tokenData);
    
    if (tokenData.code !== 0) {
      return { success: false, error: '获取访问令牌失败: ' + tokenData.msg };
    }
    
    console.log('Getting apps list...');
    
    // 尝试不同的API端点
    const endpoints = [
      'https://open.feishu.cn/open-apis/bitable/v1/apps',
      'https://open.feishu.cn/open-apis/drive/v1/files',
      'https://open.feishu.cn/open-apis/sheets/v3/spreadsheets'
    ];
    
    let appsResponse;
    let currentEndpoint;
    
    // 尝试多个端点
    for (const endpoint of endpoints) {
      console.log(`Trying endpoint: ${endpoint}`);
      currentEndpoint = endpoint;
      
      appsResponse = await fetch(endpoint, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${tokenData.tenant_access_token}`,
          'Content-Type': 'application/json'
        }
      });
      
      console.log(`Response status for ${endpoint}: ${appsResponse.status}`);
      
      if (appsResponse.status !== 404) {
        break; // 找到有效的端点
      }
    }
    
    // 如果所有端点都返回404
    if (appsResponse.status === 404) {
      return { 
        success: false, 
        error: '所有API端点都返回404。请检查:\n1. 飞书应用是否已申请"多维表格"权限\n2. App ID和Secret是否正确\n3. 应用是否已发布' 
      };
    }
    
    console.log('Apps response status:', appsResponse.status);
    console.log('Apps response headers:', Object.fromEntries(appsResponse.headers.entries()));
    
    const appsText = await appsResponse.text();
    console.log('Apps response text:', appsText);
    
    let appsData;
    try {
      appsData = JSON.parse(appsText);
    } catch (e) {
      console.error('Failed to parse apps response as JSON:', e);
      return { success: false, error: '表格响应格式错误: ' + appsText.substring(0, 100) };
    }
    
    console.log('Apps response parsed:', appsData);
    console.log('Using endpoint:', currentEndpoint);
    
    // 根据不同的API端点处理响应
    let apps = [];
    
    if (currentEndpoint.includes('/bitable/v1/apps')) {
      if (appsData.code !== 0) {
        return { success: false, error: '获取多维表格失败: ' + appsData.msg };
      }
      apps = appsData.data?.items || [];
    } else if (currentEndpoint.includes('/drive/v1/files')) {
      if (appsData.code !== 0) {
        return { success: false, error: '获取云文档失败: ' + appsData.msg };
      }
      // 过滤出多维表格文件
      const allFiles = appsData.data?.files || [];
      apps = allFiles.filter(file => file.type === 'bitable').map(file => ({
        app_token: file.token,
        name: file.name
      }));
    } else if (currentEndpoint.includes('/sheets/v3/spreadsheets')) {
      // 这是表格API，需要不同的处理
      if (appsResponse.status === 200) {
        apps = [{
          app_token: 'test_token',
          name: '测试表格 (API探测成功)'
        }];
      }
    }
    
    console.log(`Found ${apps.length} apps using ${currentEndpoint}`);
    
    return { success: true, data: apps, endpoint: currentEndpoint };
    
  } catch (error) {
    console.error('Get tables error:', error);
    return { success: false, error: '网络错误: ' + error.message };
  }
}

console.log('Simple service worker initialized.');