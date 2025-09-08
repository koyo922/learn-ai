document.addEventListener('DOMContentLoaded', function() {
  console.log('Lark Bookmarks Options loaded');
  
  // 标签页切换功能
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabPanels = document.querySelectorAll('.tab-panel');
  
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabName = btn.dataset.tab;
      
      // 移除所有活跃状态
      tabBtns.forEach(b => b.classList.remove('active'));
      tabPanels.forEach(p => p.classList.remove('active'));
      
      // 设置当前活跃状态
      btn.classList.add('active');
      document.getElementById(tabName + '-tab').classList.add('active');
    });
  });
  
  // 登录按钮功能
  const loginBtn = document.getElementById('loginBtn');
  const clientIdInput = document.getElementById('clientId');
  const clientSecretInput = document.getElementById('clientSecret');
  
  // 表格管理按钮
  const refreshTablesBtn = document.getElementById('refreshTablesBtn');
  const tableSelect = document.getElementById('tableSelect');
  const checkStructureBtn = document.getElementById('checkStructureBtn');
  
  if (loginBtn) {
    loginBtn.addEventListener('click', function(e) {
      e.preventDefault();
      console.log('Login button clicked!');
      handleLogin();
    });
    console.log('Login button found and event listener added');
  } else {
    console.error('Login button not found!');
  }
  
  // 表格管理按钮事件
  if (refreshTablesBtn) {
    refreshTablesBtn.addEventListener('click', function(e) {
      e.preventDefault();
      console.log('Refresh tables button clicked!');
      refreshTablesList();
    });
  }
  
  if (checkStructureBtn) {
    checkStructureBtn.addEventListener('click', function(e) {
      e.preventDefault();
      console.log('Check structure button clicked!');
      checkTableStructure();
    });
  }
  
  // 加载已保存的设置
  loadSettings();
  
  function handleLogin() {
    const clientId = clientIdInput.value.trim();
    const clientSecret = clientSecretInput.value.trim();
    
    if (!clientId || !clientSecret) {
      showMessage('请填写完整的App ID和App Secret', 'error');
      return;
    }
    
    console.log('Login attempt:', { clientId, clientSecret: '***' });
    showMessage('正在连接飞书账户...', 'info');
    
    // 保存到存储
    chrome.storage.sync.set({
      larkClientId: clientId,
      larkClientSecret: clientSecret
    }, () => {
      showMessage('应用凭据已保存！', 'success');
      console.log('Credentials saved successfully');
    });
  }
  
  function loadSettings() {
    if (!clientIdInput || !clientSecretInput) {
      console.error('Input elements not found!');
      return;
    }
    
    chrome.storage.sync.get(['larkClientId', 'larkClientSecret'], (result) => {
      if (chrome.runtime.lastError) {
        console.error('Storage error:', chrome.runtime.lastError);
        return;
      }
      
      if (result.larkClientId) {
        clientIdInput.value = result.larkClientId;
      }
      if (result.larkClientSecret) {
        clientSecretInput.value = result.larkClientSecret;
      }
      console.log('Settings loaded:', result);
    });
  }
  
  function showMessage(text, type) {
    // 简单的消息提示
    const message = document.createElement('div');
    message.textContent = text;
    message.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 12px 20px;
      background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6'};
      color: white;
      border-radius: 4px;
      z-index: 1000;
    `;
    
    document.body.appendChild(message);
    
    setTimeout(() => {
      document.body.removeChild(message);
    }, 3000);
  }
  
  async function refreshTablesList() {
    try {
      showMessage('正在获取表格列表...', 'info');
      console.log('Sending message to background script...');
      
      // 通过background script获取表格列表
      const response = await chrome.runtime.sendMessage({
        action: 'getTablesList'
      });
      
      console.log('Tables response received:', response);
      
      if (response && response.success) {
        updateTableSelect(response.data || []);
        showMessage(`成功获取 ${(response.data || []).length} 个表格`, 'success');
      } else {
        const errorMsg = response ? response.error : 'Background script无响应';
        console.error('API error:', errorMsg);
        showMessage('获取表格列表失败: ' + errorMsg, 'error');
      }
      
    } catch (error) {
      console.error('Refresh tables error:', error);
      showMessage('通信错误: ' + error.message, 'error');
    }
  }
  
  function updateTableSelect(tables) {
    if (!tableSelect) return;
    
    tableSelect.innerHTML = '<option value="">请选择表格...</option>';
    
    tables.forEach(app => {
      const option = document.createElement('option');
      option.value = app.app_token;
      option.textContent = app.name;
      tableSelect.appendChild(option);
    });
    
    console.log(`Updated table select with ${tables.length} tables`);
  }
  
  function checkTableStructure() {
    const selectedTable = tableSelect.value;
    if (!selectedTable) {
      showMessage('请先选择一个表格', 'error');
      return;
    }
    
    showMessage('表格结构检查功能开发中...', 'info');
    console.log('Checking structure for table:', selectedTable);
  }
});
