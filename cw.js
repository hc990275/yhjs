// ============================================
// 财务表-寿光锋鸟财务统计
// Cloudflare Worker - KV绑定名称: cw
// ============================================

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  const url = new URL(request.url);
  
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // 路由处理
    if (url.pathname === '/' || url.pathname === '/index.html') {
      // 主页 - 分享模式（只读）
      return handleIndexPage(true);
    } else if (url.pathname === '/admin') {
      // 管理后台 - 编辑模式
      return handleIndexPage(false);
    } else if (url.pathname === '/api/records' && request.method === 'GET') {
      return handleGetRecords(request, corsHeaders);
    } else if (url.pathname === '/api/records' && request.method === 'POST') {
      return handleAddRecord(request, corsHeaders);
    } else if (url.pathname.startsWith('/api/records/') && request.method === 'GET') {
      const id = url.pathname.split('/api/records/')[1];
      return handleGetRecord(id, corsHeaders);
    } else if (url.pathname.startsWith('/api/records/') && request.method === 'PUT') {
      const id = url.pathname.split('/api/records/')[1];
      return handleUpdateRecord(request, id, corsHeaders);
    } else if (url.pathname.startsWith('/api/records/') && request.method === 'DELETE') {
      const id = url.pathname.split('/api/records/')[1];
      return handleDeleteRecord(id, corsHeaders);
    } else if (url.pathname === '/api/statistics') {
      return handleGetStatistics(request, corsHeaders);
    } else if (url.pathname === '/api/export') {
      return handleExportData(request, corsHeaders);
    } else if (url.pathname === '/api/import' && request.method === 'POST') {
      return handleImportData(request, corsHeaders);
    } else if (url.pathname === '/api/clear' && request.method === 'DELETE') {
      return handleClearData(corsHeaders);
    } else {
      return new Response('Not Found', { status: 404 });
    }
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

// ============================================
// API 函数
// ============================================

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// 解析月份范围参数
function parseMonthFilter(url) {
  const startMonth = url.searchParams.get('startMonth');
  const endMonth = url.searchParams.get('endMonth');
  return { startMonth, endMonth };
}

// 检查日期是否在月份范围内
function isDateInRange(dateStr, startMonth, endMonth) {
  if (!dateStr) return false;
  const recordMonth = dateStr.substring(0, 7);
  if (startMonth && recordMonth < startMonth) return false;
  if (endMonth && recordMonth > endMonth) return false;
  return true;
}

// 获取所有记录
async function handleGetRecords(request, corsHeaders) {
  try {
    const url = new URL(request.url);
    const { startMonth, endMonth } = parseMonthFilter(url);
    
    const keys = await cw.list({ prefix: 'record_' });
    let records = [];

    for (const key of keys.keys) {
      const record = await cw.get(key.name, { type: 'json' });
      if (record) {
        if (startMonth || endMonth) {
          if (isDateInRange(record.date, startMonth, endMonth)) {
            records.push(record);
          }
        } else {
          records.push(record);
        }
      }
    }

    records.sort((a, b) => {
      if (!a.date) return 1;
      if (!b.date) return -1;
      return a.date.localeCompare(b.date);
    });

    return new Response(JSON.stringify({
      success: true,
      data: records,
      total: records.length,
      filter: { startMonth, endMonth }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

// 添加记录
async function handleAddRecord(request, corsHeaders) {
  try {
    const data = await request.json();
    
    const id = generateId();
    const record = {
      id,
      date: data.date || '',
      detail1: data.detail1 || '',
      detail2: data.detail2 || '',
      purpose: data.purpose || '',
      incomeDeposit: parseFloat(data.incomeDeposit) || 0,
      incomeDepositDate: data.incomeDepositDate || '',
      incomeBalance: parseFloat(data.incomeBalance) || 0,
      incomeBalanceDate: data.incomeBalanceDate || '',
      expenseDeposit: parseFloat(data.expenseDeposit) || 0,
      expenseDepositDate: data.expenseDepositDate || '',
      expenseBalance: parseFloat(data.expenseBalance) || 0,
      expenseBalanceDate: data.expenseBalanceDate || '',
      remarks: data.remarks || '',
      createdAt: new Date().toISOString()
    };

    await cw.put('record_' + id, JSON.stringify(record));

    return new Response(JSON.stringify({ success: true, data: record }), {
      status: 201,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

// 获取单条记录
async function handleGetRecord(id, corsHeaders) {
  try {
    const record = await cw.get('record_' + id, { type: 'json' });
    
    if (!record) {
      return new Response(JSON.stringify({ success: false, error: '记录不存在' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ success: true, data: record }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

// 更新记录
async function handleUpdateRecord(request, id, corsHeaders) {
  try {
    const existingRecord = await cw.get('record_' + id, { type: 'json' });
    
    if (!existingRecord) {
      return new Response(JSON.stringify({ success: false, error: '记录不存在' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const data = await request.json();
    
    const updatedRecord = {
      ...existingRecord,
      ...data,
      incomeDeposit: data.incomeDeposit !== undefined ? parseFloat(data.incomeDeposit) || 0 : existingRecord.incomeDeposit,
      incomeBalance: data.incomeBalance !== undefined ? parseFloat(data.incomeBalance) || 0 : existingRecord.incomeBalance,
      expenseDeposit: data.expenseDeposit !== undefined ? parseFloat(data.expenseDeposit) || 0 : existingRecord.expenseDeposit,
      expenseBalance: data.expenseBalance !== undefined ? parseFloat(data.expenseBalance) || 0 : existingRecord.expenseBalance,
      updatedAt: new Date().toISOString()
    };

    await cw.put('record_' + id, JSON.stringify(updatedRecord));

    return new Response(JSON.stringify({ success: true, data: updatedRecord }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

// 删除记录
async function handleDeleteRecord(id, corsHeaders) {
  try {
    const record = await cw.get('record_' + id);
    
    if (!record) {
      return new Response(JSON.stringify({ success: false, error: '记录不存在' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    await cw.delete('record_' + id);

    return new Response(JSON.stringify({ success: true, message: '删除成功' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

// 统计
async function handleGetStatistics(request, corsHeaders) {
  try {
    const url = new URL(request.url);
    const { startMonth, endMonth } = parseMonthFilter(url);
    
    const keys = await cw.list({ prefix: 'record_' });
    let totalIncome = 0;
    let totalExpense = 0;
    let count = 0;

    for (const key of keys.keys) {
      const record = await cw.get(key.name, { type: 'json' });
      if (record) {
        if (startMonth || endMonth) {
          if (!isDateInRange(record.date, startMonth, endMonth)) {
            continue;
          }
        }
        
        totalIncome += (parseFloat(record.incomeDeposit) || 0) + (parseFloat(record.incomeBalance) || 0);
        totalExpense += (parseFloat(record.expenseDeposit) || 0) + (parseFloat(record.expenseBalance) || 0);
        count++;
      }
    }

    return new Response(JSON.stringify({
      success: true,
      data: {
        totalRecords: count,
        totalIncome,
        totalExpense,
        balance: totalIncome - totalExpense
      },
      filter: { startMonth, endMonth }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

// 导入
async function handleImportData(request, corsHeaders) {
  try {
    const data = await request.json();
    const records = data.records;

    if (!Array.isArray(records) || records.length === 0) {
      return new Response(JSON.stringify({ success: false, error: '没有数据' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    let successCount = 0;
    let errorCount = 0;

    for (const row of records) {
      try {
        const id = generateId();
        
        const record = {
          id,
          date: formatDateValue(row['日期'] || row.date || ''),
          detail1: String(row['明细一'] || row['明细1'] || row.detail1 || ''),
          detail2: String(row['明细二'] || row['明细2'] || row.detail2 || ''),
          purpose: String(row['用于'] || row['用途'] || row.purpose || ''),
          incomeDeposit: parseFloat(row['收入定金'] || row['收入-定金'] || row.incomeDeposit || 0) || 0,
          incomeDepositDate: formatDateValue(row['收入定金日期'] || row['收入-定金日期'] || row.incomeDepositDate || ''),
          incomeBalance: parseFloat(row['收入尾款'] || row['收入-尾款'] || row.incomeBalance || 0) || 0,
          incomeBalanceDate: formatDateValue(row['收入尾款日期'] || row['收入-尾款日期'] || row.incomeBalanceDate || ''),
          expenseDeposit: parseFloat(row['支出定金'] || row['支出-定金'] || row.expenseDeposit || 0) || 0,
          expenseDepositDate: formatDateValue(row['支出定金日期'] || row['支出-定金日期'] || row.expenseDepositDate || ''),
          expenseBalance: parseFloat(row['支出尾款'] || row['支出-尾款'] || row.expenseBalance || 0) || 0,
          expenseBalanceDate: formatDateValue(row['支出尾款日期'] || row['支出-尾款日期'] || row.expenseBalanceDate || ''),
          remarks: String(row['备注'] || row.remarks || ''),
          createdAt: new Date().toISOString()
        };

        await cw.put('record_' + id, JSON.stringify(record));
        successCount++;
      } catch (err) {
        errorCount++;
      }
    }

    return new Response(JSON.stringify({ 
      success: true, 
      message: '导入完成！成功 ' + successCount + ' 条，失败 ' + errorCount + ' 条',
      successCount,
      errorCount
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

// 清空
async function handleClearData(corsHeaders) {
  try {
    const keys = await cw.list({ prefix: 'record_' });
    let count = 0;
    
    for (const key of keys.keys) {
      await cw.delete(key.name);
      count++;
    }

    return new Response(JSON.stringify({ success: true, message: '已清空 ' + count + ' 条记录' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

// 导出
async function handleExportData(request, corsHeaders) {
  try {
    const url = new URL(request.url);
    const { startMonth, endMonth } = parseMonthFilter(url);
    
    const keys = await cw.list({ prefix: 'record_' });
    let records = [];

    for (const key of keys.keys) {
      const record = await cw.get(key.name, { type: 'json' });
      if (record) {
        if (startMonth || endMonth) {
          if (isDateInRange(record.date, startMonth, endMonth)) {
            records.push(record);
          }
        } else {
          records.push(record);
        }
      }
    }

    records.sort((a, b) => (a.date || '').localeCompare(b.date || ''));

    return new Response(JSON.stringify({ success: true, data: records }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

// 日期格式化
function formatDateValue(val) {
  if (!val) return '';
  
  if (typeof val === 'number') {
    const date = new Date((val - 25569) * 86400 * 1000);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + d;
  }
  
  if (typeof val === 'object' && val instanceof Date) {
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const d = String(val.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + d;
  }
  
  const str = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  if (/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(str)) {
    const parts = str.split('/');
    return parts[0] + '-' + parts[1].padStart(2, '0') + '-' + parts[2].padStart(2, '0');
  }
  
  try {
    const date = new Date(str);
    if (!isNaN(date.getTime())) {
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      return y + '-' + m + '-' + d;
    }
  } catch (e) {}
  
  return str;
}

// ============================================
// 前端页面
// ============================================

function handleIndexPage(isShareMode) {
  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>财务表-寿光锋鸟财务统计</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.0/font/bootstrap-icons.css" rel="stylesheet">
  <script src="https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"></script>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    :root {
      --primary: #4f46e5;
      --success: #10b981;
      --danger: #ef4444;
      --warning: #f59e0b;
      --info: #3b82f6;
      --dark: #1e293b;
      --gray: #64748b;
      --light: #f1f5f9;
      --white: #ffffff;
      --border: #e2e8f0;
    }
    
    html, body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'PingFang SC', 'Microsoft YaHei', sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      font-size: 14px;
    }
    
    .app {
      padding: 10px;
      max-width: 100%;
      overflow-x: hidden;
    }
    
    .header {
      background: var(--white);
      border-radius: 12px;
      padding: 15px;
      margin-bottom: 15px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.15);
    }
    
    .header-title {
      color: var(--primary);
      font-size: 1.2rem;
      font-weight: 700;
      margin-bottom: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      text-align: center;
    }
    
    .header-btns {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      justify-content: center;
    }
    
    .btn {
      padding: 8px 12px;
      border: none;
      border-radius: 8px;
      font-size: 0.8rem;
      font-weight: 600;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
      transition: all 0.2s;
      white-space: nowrap;
      flex: 1 1 auto;
      min-width: 70px;
      max-width: 120px;
    }
    
    @media (min-width: 576px) {
      .btn {
        flex: 0 0 auto;
        padding: 8px 14px;
        font-size: 0.85rem;
        min-width: auto;
        max-width: none;
      }
      .header-title {
        font-size: 1.4rem;
      }
    }
    
    @media (max-width: 400px) {
      .btn {
        padding: 6px 8px;
        font-size: 0.75rem;
        min-width: 55px;
      }
      .btn i {
        display: none;
      }
      .header-title {
        font-size: 1rem;
      }
    }
    
    .btn-primary { background: var(--primary); color: var(--white); }
    .btn-success { background: var(--success); color: var(--white); }
    .btn-info { background: var(--info); color: var(--white); }
    .btn-warning { background: var(--warning); color: var(--white); }
    .btn-danger { background: var(--danger); color: var(--white); }
    .btn-light { background: var(--light); color: var(--dark); }
    .btn-secondary { background: #6b7280; color: var(--white); }
    
    .btn:active { transform: scale(0.95); }
    
    .filter-card {
      background: var(--white);
      border-radius: 12px;
      padding: 15px;
      margin-bottom: 15px;
      box-shadow: 0 4px 15px rgba(0,0,0,0.1);
    }
    
    .filter-row {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      align-items: center;
    }
    
    .filter-group {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    
    .filter-group label {
      font-size: 0.85rem;
      color: var(--gray);
      white-space: nowrap;
    }
    
    .filter-group input[type="month"] {
      padding: 8px 10px;
      border: 2px solid var(--border);
      border-radius: 8px;
      font-size: 0.85rem;
      width: 140px;
    }
    
    .filter-group input:focus {
      outline: none;
      border-color: var(--primary);
    }
    
    .filter-actions {
      display: flex;
      gap: 8px;
      margin-left: auto;
    }
    
    @media (max-width: 576px) {
      .filter-row {
        flex-direction: column;
        align-items: stretch;
      }
      .filter-group {
        width: 100%;
      }
      .filter-group input[type="month"] {
        flex: 1;
      }
      .filter-actions {
        margin-left: 0;
        justify-content: center;
      }
    }
    
    .stats {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 10px;
      margin-bottom: 15px;
    }
    
    @media (min-width: 768px) {
      .stats { grid-template-columns: repeat(4, 1fr); }
    }
    
    .stat-card {
      background: var(--white);
      border-radius: 12px;
      padding: 15px;
      box-shadow: 0 4px 15px rgba(0,0,0,0.1);
    }
    
    .stat-icon {
      width: 36px;
      height: 36px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.1rem;
      margin-bottom: 8px;
      color: var(--white);
    }
    
    .stat-card.income .stat-icon { background: var(--success); }
    .stat-card.expense .stat-icon { background: var(--danger); }
    .stat-card.balance .stat-icon { background: var(--primary); }
    .stat-card.count .stat-icon { background: var(--warning); }
    
    .stat-label { font-size: 0.8rem; color: var(--gray); }
    .stat-value { font-size: 1.2rem; font-weight: 700; color: var(--dark); }
    
    .add-form-card {
      background: var(--white);
      border-radius: 12px;
      margin-bottom: 15px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.1);
      overflow: hidden;
      display: none;
    }
    
    .add-form-card.show { display: block; }
    
    .add-form-header {
      background: var(--primary);
      color: var(--white);
      padding: 12px 15px;
      font-weight: 600;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    
    .add-form-body {
      padding: 15px;
    }
    
    .form-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 12px;
    }
    
    @media (min-width: 576px) {
      .form-grid { grid-template-columns: repeat(2, 1fr); }
    }
    
    @media (min-width: 992px) {
      .form-grid { grid-template-columns: repeat(4, 1fr); }
    }
    
    .form-group {
      display: flex;
      flex-direction: column;
    }
    
    .form-group label {
      font-size: 0.75rem;
      color: var(--gray);
      margin-bottom: 4px;
      font-weight: 500;
    }
    
    .form-group input {
      padding: 10px 12px;
      border: 2px solid var(--border);
      border-radius: 8px;
      font-size: 0.9rem;
      width: 100%;
      transition: border-color 0.2s;
    }
    
    .form-group input:focus {
      outline: none;
      border-color: var(--primary);
    }
    
    .form-group.income input {
      background: #f0fdf4;
      border-color: #86efac;
    }
    
    .form-group.expense input {
      background: #fef2f2;
      border-color: #fca5a5;
    }
    
    .form-actions {
      display: flex;
      gap: 10px;
      margin-top: 15px;
      padding-top: 15px;
      border-top: 1px solid var(--border);
    }
    
    .form-actions .btn {
      flex: 1;
      padding: 12px;
      font-size: 1rem;
      max-width: none;
    }
    
    .table-card {
      background: var(--white);
      border-radius: 12px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.1);
      overflow: hidden;
    }
    
    .table-header {
      background: var(--dark);
      color: var(--white);
      padding: 12px 15px;
      font-weight: 600;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 0.9rem;
    }
    
    .table-wrapper {
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
    }
    
    .data-table {
      width: 100%;
      min-width: 1200px;
      border-collapse: collapse;
      font-size: 0.8rem;
    }
    
    .data-table th {
      background: var(--light);
      padding: 10px 8px;
      text-align: center;
      font-weight: 600;
      border: 1px solid var(--border);
      white-space: nowrap;
      position: sticky;
      top: 0;
      z-index: 10;
    }
    
    .data-table th.income-h { background: #dcfce7; color: #166534; }
    .data-table th.expense-h { background: #fee2e2; color: #991b1b; }
    .data-table th.sum-h { background: #e0e7ff; color: #3730a3; }
    
    .data-table td {
      padding: 10px 8px;
      text-align: center;
      border: 1px solid var(--border);
    }
    
    .data-table tbody tr:hover { background: #f8fafc; }
    
    .data-table .income-val { color: var(--success); font-weight: 600; }
    .data-table .expense-val { color: var(--danger); font-weight: 600; }
    .data-table .positive { color: var(--success); font-weight: 700; }
    .data-table .negative { color: var(--danger); font-weight: 700; }
    
    .data-table .editable {
      cursor: pointer;
      transition: background 0.2s;
    }
    
    .data-table .editable:hover { background: #fef3c7; }
    
    .data-table .edit-input {
      width: 100%;
      padding: 5px;
      border: 2px solid var(--primary);
      border-radius: 4px;
      text-align: center;
      font-size: 0.8rem;
    }
    
    .table-footer {
      padding: 12px 15px;
      text-align: center;
      color: var(--gray);
      font-size: 0.85rem;
      border-top: 1px solid var(--border);
    }
    
    .empty-state {
      padding: 50px 20px;
      text-align: center;
      color: var(--gray);
    }
    
    .empty-state i { font-size: 3rem; margin-bottom: 15px; opacity: 0.5; }
    
    .modal {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.6);
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      padding: 15px;
    }
    
    .modal.show { display: flex; }
    
    .modal-box {
      background: var(--white);
      border-radius: 16px;
      width: 100%;
      max-width: 500px;
      max-height: 90vh;
      overflow-y: auto;
      animation: slideUp 0.3s ease;
    }
    
    @keyframes slideUp {
      from { opacity: 0; transform: translateY(20px); }
      to { opacity: 1; transform: translateY(0); }
    }
    
    .modal-header {
      padding: 15px 20px;
      border-bottom: 1px solid var(--border);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    
    .modal-header h3 {
      font-size: 1.1rem;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    
    .modal-close {
      background: none;
      border: none;
      font-size: 1.5rem;
      cursor: pointer;
      color: var(--gray);
      line-height: 1;
    }
    
    .modal-body { padding: 20px; }
    
    .modal-footer {
      padding: 15px 20px;
      border-top: 1px solid var(--border);
      display: flex;
      gap: 10px;
      justify-content: flex-end;
    }
    
    .upload-area {
      border: 3px dashed var(--border);
      border-radius: 12px;
      padding: 30px 20px;
      text-align: center;
      cursor: pointer;
      transition: all 0.2s;
      background: var(--light);
    }
    
    .upload-area:hover, .upload-area.dragover {
      border-color: var(--info);
      background: #eff6ff;
    }
    
    .upload-area i { font-size: 2.5rem; color: var(--info); margin-bottom: 10px; }
    .upload-area p { color: var(--gray); font-size: 0.9rem; }
    
    .file-info {
      background: #f0fdf4;
      border: 1px solid #86efac;
      border-radius: 8px;
      padding: 10px 15px;
      margin-top: 15px;
      display: none;
      align-items: center;
      gap: 8px;
      color: var(--success);
    }
    
    .file-info.show { display: flex; }
    
    .preview-box {
      max-height: 200px;
      overflow: auto;
      margin-top: 15px;
      border: 1px solid var(--border);
      border-radius: 8px;
      display: none;
    }
    
    .preview-box.show { display: block; }
    
    .preview-table {
      width: 100%;
      font-size: 0.75rem;
      border-collapse: collapse;
    }
    
    .preview-table th {
      background: var(--light);
      padding: 8px;
      text-align: left;
      position: sticky;
      top: 0;
    }
    
    .preview-table td {
      padding: 6px 8px;
      border-bottom: 1px solid var(--border);
    }
    
    .tips-box {
      background: #fefce8;
      border: 1px solid #fde047;
      border-radius: 8px;
      padding: 12px;
      margin-top: 15px;
      font-size: 0.8rem;
      color: #854d0e;
    }
    
    .toast-box {
      position: fixed;
      top: 15px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 2000;
      display: flex;
      flex-direction: column;
      gap: 10px;
      width: calc(100% - 30px);
      max-width: 350px;
    }
    
    .toast {
      padding: 12px 16px;
      border-radius: 10px;
      color: var(--white);
      font-size: 0.9rem;
      display: flex;
      align-items: center;
      gap: 8px;
      box-shadow: 0 4px 15px rgba(0,0,0,0.2);
      animation: toastIn 0.3s ease;
    }
    
    @keyframes toastIn {
      from { opacity: 0; transform: translateY(-20px); }
      to { opacity: 1; transform: translateY(0); }
    }
    
    .toast.success { background: var(--success); }
    .toast.error { background: var(--danger); }
    .toast.info { background: var(--info); }
    .toast.warning { background: var(--warning); }
    
    .admin-only { display: none; }
    .admin-mode .admin-only { display: inline-flex; }
    .admin-mode .share-only { display: none; }
    
    .loading {
      display: flex;
      justify-content: center;
      align-items: center;
      padding: 40px;
    }
    
    .spinner {
      width: 40px;
      height: 40px;
      border: 4px solid var(--border);
      border-top-color: var(--primary);
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }
    
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    
    .filter-tag {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      background: #dbeafe;
      color: #1e40af;
      padding: 4px 10px;
      border-radius: 20px;
      font-size: 0.8rem;
      margin-left: 10px;
    }
    
    .filter-tag .clear-filter {
      cursor: pointer;
      font-weight: bold;
    }
    
    .mode-badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 0.7rem;
      margin-left: 8px;
      font-weight: normal;
    }
    
    .mode-badge.admin {
      background: var(--danger);
      color: white;
    }
    
    .mode-badge.view {
      background: var(--info);
      color: white;
    }
  </style>
</head>
<body class="${isShareMode ? '' : 'admin-mode'}">
  <div class="toast-box" id="toastBox"></div>

  <div class="app">
    <div class="header">
      <div class="header-title">
        <i class="bi bi-cash-coin"></i>
        财务表-寿光锋鸟财务统计
        ${isShareMode ? '<span class="mode-badge view">只读</span>' : '<span class="mode-badge admin">管理</span>'}
      </div>
      <div class="header-btns">
        <button class="btn btn-primary admin-only" onclick="toggleAddForm()">
          <i class="bi bi-plus-circle"></i> 添加
        </button>
        <button class="btn btn-info admin-only" onclick="openImportModal()">
          <i class="bi bi-upload"></i> 导入
        </button>
        <button class="btn btn-success admin-only" onclick="exportExcel()">
          <i class="bi bi-download"></i> 导出
        </button>
        <button class="btn btn-light" onclick="loadData()">
          <i class="bi bi-arrow-clockwise"></i> 刷新
        </button>
      </div>
    </div>

    <div class="filter-card">
      <div class="filter-row">
        <div class="filter-group">
          <label><i class="bi bi-calendar-range"></i> 起始月份</label>
          <input type="month" id="startMonth" placeholder="选择起始月份">
        </div>
        <div class="filter-group">
          <label>至</label>
          <input type="month" id="endMonth" placeholder="选择结束月份">
        </div>
        <div class="filter-actions">
          <button class="btn btn-primary" onclick="applyFilter()">
            <i class="bi bi-search"></i> 查询
          </button>
          <button class="btn btn-light" onclick="clearFilter()">
            <i class="bi bi-x-lg"></i> 清除
          </button>
        </div>
      </div>
    </div>

    <div class="stats">
      <div class="stat-card income">
        <div class="stat-icon"><i class="bi bi-arrow-down"></i></div>
        <div class="stat-label">总收入</div>
        <div class="stat-value" id="statIncome">￥0</div>
      </div>
      <div class="stat-card expense">
        <div class="stat-icon"><i class="bi bi-arrow-up"></i></div>
        <div class="stat-label">总支出</div>
        <div class="stat-value" id="statExpense">￥0</div>
      </div>
      <div class="stat-card balance">
        <div class="stat-icon"><i class="bi bi-wallet2"></i></div>
        <div class="stat-label">总利润</div>
        <div class="stat-value" id="statBalance">￥0</div>
      </div>
      <div class="stat-card count">
        <div class="stat-icon"><i class="bi bi-file-text"></i></div>
        <div class="stat-label">记录数</div>
        <div class="stat-value" id="statCount">0</div>
      </div>
    </div>

    <div class="add-form-card admin-only" id="addFormCard">
      <div class="add-form-header">
        <span><i class="bi bi-plus-lg"></i> 添加记录</span>
        <button class="btn btn-light" style="padding: 4px 10px; font-size: 0.8rem;" onclick="toggleAddForm()">收起</button>
      </div>
      <div class="add-form-body">
        <form id="addForm" onsubmit="return handleAddSubmit(event)">
          <div class="form-grid">
            <div class="form-group">
              <label>日期 *</label>
              <input type="date" id="fDate" required>
            </div>
            <div class="form-group">
              <label>明细一</label>
              <input type="text" id="fDetail1" placeholder="输入明细一">
            </div>
            <div class="form-group">
              <label>明细二</label>
              <input type="text" id="fDetail2" placeholder="输入明细二">
            </div>
            <div class="form-group">
              <label>用于</label>
              <input type="text" id="fPurpose" placeholder="输入用途">
            </div>
            <div class="form-group income">
              <label>收入-定金</label>
              <input type="number" step="0.01" id="fIncomeDeposit" placeholder="0">
            </div>
            <div class="form-group income">
              <label>收入-定金日期</label>
              <input type="date" id="fIncomeDepositDate">
            </div>
            <div class="form-group income">
              <label>收入-尾款</label>
              <input type="number" step="0.01" id="fIncomeBalance" placeholder="0">
            </div>
            <div class="form-group income">
              <label>收入-尾款日期</label>
              <input type="date" id="fIncomeBalanceDate">
            </div>
            <div class="form-group expense">
              <label>支出-定金</label>
              <input type="number" step="0.01" id="fExpenseDeposit" placeholder="0">
            </div>
            <div class="form-group expense">
              <label>支出-定金日期</label>
              <input type="date" id="fExpenseDepositDate">
            </div>
            <div class="form-group expense">
              <label>支出-尾款</label>
              <input type="number" step="0.01" id="fExpenseBalance" placeholder="0">
            </div>
            <div class="form-group expense">
              <label>支出-尾款日期</label>
              <input type="date" id="fExpenseBalanceDate">
            </div>
            <div class="form-group" style="grid-column: 1 / -1;">
              <label>备注</label>
              <input type="text" id="fRemarks" placeholder="输入备注">
            </div>
          </div>
          <div class="form-actions">
            <button type="button" class="btn btn-light" onclick="resetAddForm()">
              <i class="bi bi-x-lg"></i> 清空
            </button>
            <button type="submit" class="btn btn-primary">
              <i class="bi bi-check-lg"></i> 保存记录
            </button>
          </div>
        </form>
      </div>
    </div>

    <div class="table-card">
      <div class="table-header">
        <span>
          <i class="bi bi-table"></i> 财务明细
          <span id="filterTag"></span>
        </span>
        <span class="admin-only" style="font-size: 0.75rem; opacity: 0.7;">双击编辑</span>
      </div>
      <div class="table-wrapper" id="tableWrapper">
        <div class="loading"><div class="spinner"></div></div>
      </div>
      <div class="table-footer" id="tableFooter"></div>
    </div>
  </div>

  <div class="modal" id="importModal">
    <div class="modal-box">
      <div class="modal-header">
        <h3><i class="bi bi-file-earmark-excel" style="color: var(--success);"></i> 导入Excel</h3>
        <button class="modal-close" onclick="closeImportModal()">&times;</button>
      </div>
      <div class="modal-body">
        <div class="upload-area" id="uploadArea" onclick="document.getElementById('fileInput').click()">
          <i class="bi bi-cloud-arrow-up"></i>
          <p><strong>点击选择文件</strong> 或拖拽到这里</p>
          <p style="font-size: 0.8rem; margin-top: 5px;">支持 .xlsx .xls .csv</p>
          <input type="file" id="fileInput" accept=".xlsx,.xls,.csv" style="display:none" onchange="handleFileSelect(event)">
        </div>
        <div class="file-info" id="fileInfo">
          <i class="bi bi-file-check"></i>
          <span id="fileName"></span>
          <span style="margin-left: auto;" id="rowCount"></span>
        </div>
        <div class="preview-box" id="previewBox">
          <table class="preview-table">
            <thead id="previewHead"></thead>
            <tbody id="previewBody"></tbody>
          </table>
        </div>
        <div class="tips-box">
          <strong>支持的列名：</strong><br>
          日期、明细一、明细二、用于、收入定金、收入定金日期、收入尾款、收入尾款日期、支出定金、支出定金日期、支出尾款、支出尾款日期、备注
        </div>
        <div style="margin-top: 15px;">
          <a href="javascript:void(0)" onclick="downloadTemplate()" style="color: var(--success); font-weight: 600; text-decoration: none;">
            <i class="bi bi-download"></i> 下载模板
          </a>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-light" onclick="closeImportModal()">取消</button>
        <button class="btn btn-danger" id="clearBtn" style="display: none;" onclick="clearAllData()">
          <i class="bi bi-trash"></i> 清空数据
        </button>
        <button class="btn btn-success" id="importBtn" onclick="startImport()" disabled>
          <i class="bi bi-upload"></i> 开始导入
        </button>
      </div>
    </div>
  </div>

  <div class="modal" id="deleteModal">
    <div class="modal-box" style="max-width: 350px;">
      <div class="modal-header">
        <h3>确认删除</h3>
        <button class="modal-close" onclick="closeDeleteModal()">&times;</button>
      </div>
      <div class="modal-body" style="text-align: center;">
        <i class="bi bi-exclamation-triangle" style="font-size: 3rem; color: var(--warning);"></i>
        <p style="margin-top: 15px;">确定要删除这条记录吗？</p>
      </div>
      <div class="modal-footer">
        <button class="btn btn-light" onclick="closeDeleteModal()">取消</button>
        <button class="btn btn-danger" onclick="confirmDelete()">
          <i class="bi bi-trash"></i> 删除
        </button>
      </div>
    </div>
  </div>

  <script>
    let allRecords = [];
    let importData = [];
    let deleteId = null;
    let editingCell = null;
    let currentFilter = { startMonth: '', endMonth: '' };
    const isAdminMode = ${!isShareMode};

    document.addEventListener('DOMContentLoaded', function() {
      if (isAdminMode) {
        document.getElementById('fDate').value = getToday();
      }
      loadData();
      if (isAdminMode) {
        initUpload();
      }
    });

    function getToday() {
      const d = new Date();
      return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
    }

    function toast(msg, type) {
      type = type || 'success';
      const box = document.getElementById('toastBox');
      const div = document.createElement('div');
      div.className = 'toast ' + type;
      const icons = {success:'check-circle', error:'x-circle', info:'info-circle', warning:'exclamation-triangle'};
      div.innerHTML = '<i class="bi bi-' + icons[type] + '"></i> ' + msg;
      box.appendChild(div);
      setTimeout(function() {
        div.style.opacity = '0';
        div.style.transform = 'translateY(-20px)';
        setTimeout(function() { div.remove(); }, 300);
      }, 3000);
    }

    function applyFilter() {
      const startMonth = document.getElementById('startMonth').value;
      const endMonth = document.getElementById('endMonth').value;
      
      if (startMonth && endMonth && startMonth > endMonth) {
        toast('起始月份不能大于结束月份', 'warning');
        return;
      }
      
      currentFilter = { startMonth, endMonth };
      loadData();
      updateFilterTag();
    }

    function clearFilter() {
      document.getElementById('startMonth').value = '';
      document.getElementById('endMonth').value = '';
      currentFilter = { startMonth: '', endMonth: '' };
      loadData();
      updateFilterTag();
    }

    function updateFilterTag() {
      const tag = document.getElementById('filterTag');
      if (currentFilter.startMonth || currentFilter.endMonth) {
        let text = '';
        if (currentFilter.startMonth && currentFilter.endMonth) {
          text = currentFilter.startMonth + ' 至 ' + currentFilter.endMonth;
        } else if (currentFilter.startMonth) {
          text = currentFilter.startMonth + ' 起';
        } else {
          text = '至 ' + currentFilter.endMonth;
        }
        tag.innerHTML = '<span class="filter-tag">' + text + ' <span class="clear-filter" onclick="clearFilter()">×</span></span>';
      } else {
        tag.innerHTML = '';
      }
    }

    function buildApiUrl(base) {
      let url = base;
      const params = [];
      if (currentFilter.startMonth) params.push('startMonth=' + currentFilter.startMonth);
      if (currentFilter.endMonth) params.push('endMonth=' + currentFilter.endMonth);
      if (params.length > 0) url += '?' + params.join('&');
      return url;
    }

    async function loadData() {
      try {
        const [recRes, statRes] = await Promise.all([
          fetch(buildApiUrl('/api/records')),
          fetch(buildApiUrl('/api/statistics'))
        ]);
        
        const recData = await recRes.json();
        const statData = await statRes.json();

        if (recData.success) {
          allRecords = recData.data;
          renderTable(allRecords);
        }

        if (statData.success) {
          document.getElementById('statIncome').textContent = '￥' + formatNum(statData.data.totalIncome);
          document.getElementById('statExpense').textContent = '￥' + formatNum(statData.data.totalExpense);
          document.getElementById('statBalance').textContent = '￥' + formatNum(statData.data.balance);
          document.getElementById('statCount').textContent = statData.data.totalRecords;
        }
      } catch (err) {
        toast('加载失败: ' + err.message, 'error');
      }
    }

    function calcRecordTotals(r) {
      const incomeTotal = (parseFloat(r.incomeDeposit) || 0) + (parseFloat(r.incomeBalance) || 0);
      const expenseTotal = (parseFloat(r.expenseDeposit) || 0) + (parseFloat(r.expenseBalance) || 0);
      return {
        totalIncome: incomeTotal,
        totalExpense: expenseTotal,
        profit: incomeTotal - expenseTotal
      };
    }

    function renderTable(records) {
      const wrapper = document.getElementById('tableWrapper');
      const footer = document.getElementById('tableFooter');
      
      if (records.length === 0) {
        wrapper.innerHTML = '<div class="empty-state"><i class="bi bi-inbox"></i><p>暂无记录</p></div>';
        footer.textContent = '';
        return;
      }

      let html = '<table class="data-table"><thead>';
      html += '<tr>';
      html += '<th rowspan="2">日期</th>';
      html += '<th colspan="3">用途</th>';
      html += '<th colspan="4" class="income-h">收入</th>';
      html += '<th colspan="4" class="expense-h">支出</th>';
      html += '<th rowspan="2" class="sum-h">本单收入</th>';
      html += '<th rowspan="2" class="sum-h">本单支出</th>';
      html += '<th rowspan="2" class="sum-h">本单利润</th>';
      html += '<th rowspan="2">备注</th>';
      if (isAdminMode) html += '<th rowspan="2">操作</th>';
      html += '</tr>';
      html += '<tr>';
      html += '<th>明细一</th><th>明细二</th><th>用于</th>';
      html += '<th class="income-h">定金</th><th class="income-h">定金日期</th>';
      html += '<th class="income-h">尾款</th><th class="income-h">尾款日期</th>';
      html += '<th class="expense-h">定金</th><th class="expense-h">定金日期</th>';
      html += '<th class="expense-h">尾款</th><th class="expense-h">尾款日期</th>';
      html += '</tr></thead><tbody>';

      records.forEach(function(r) {
        const ec = isAdminMode ? 'editable' : '';
        const totals = calcRecordTotals(r);
        
        html += '<tr data-id="' + r.id + '">';
        html += '<td class="' + ec + '" data-field="date">' + (r.date || '') + '</td>';
        html += '<td class="' + ec + '" data-field="detail1">' + (r.detail1 || '') + '</td>';
        html += '<td class="' + ec + '" data-field="detail2">' + (r.detail2 || '') + '</td>';
        html += '<td class="' + ec + '" data-field="purpose">' + (r.purpose || '') + '</td>';
        html += '<td class="' + ec + ' income-val" data-field="incomeDeposit">' + fmtMoney(r.incomeDeposit) + '</td>';
        html += '<td class="' + ec + '" data-field="incomeDepositDate">' + (r.incomeDepositDate || '') + '</td>';
        html += '<td class="' + ec + ' income-val" data-field="incomeBalance">' + fmtMoney(r.incomeBalance) + '</td>';
        html += '<td class="' + ec + '" data-field="incomeBalanceDate">' + (r.incomeBalanceDate || '') + '</td>';
        html += '<td class="' + ec + ' expense-val" data-field="expenseDeposit">' + fmtMoney(r.expenseDeposit) + '</td>';
        html += '<td class="' + ec + '" data-field="expenseDepositDate">' + (r.expenseDepositDate || '') + '</td>';
        html += '<td class="' + ec + ' expense-val" data-field="expenseBalance">' + fmtMoney(r.expenseBalance) + '</td>';
        html += '<td class="' + ec + '" data-field="expenseBalanceDate">' + (r.expenseBalanceDate || '') + '</td>';
        html += '<td class="income-val">' + fmtMoney(totals.totalIncome) + '</td>';
        html += '<td class="expense-val">' + fmtMoney(totals.totalExpense) + '</td>';
        html += '<td class="' + (totals.profit >= 0 ? 'positive' : 'negative') + '">' + fmtMoney(totals.profit) + '</td>';
        html += '<td class="' + ec + '" data-field="remarks">' + (r.remarks || '') + '</td>';
        if (isAdminMode) {
          html += '<td><button class="btn btn-danger" style="padding:5px 10px;font-size:0.75rem;max-width:none;" onclick="showDeleteModal(\\'' + r.id + '\\')"><i class="bi bi-trash"></i></button></td>';
        }
        html += '</tr>';
      });

      html += '</tbody></table>';
      wrapper.innerHTML = html;
      footer.textContent = '共 ' + records.length + ' 条记录';

      if (isAdminMode) {
        document.querySelectorAll('.editable').forEach(function(cell) {
          cell.addEventListener('dblclick', startCellEdit);
        });
      }
    }

    function startCellEdit(e) {
      if (editingCell) return;
      
      const cell = e.target;
      if (cell.tagName !== 'TD') return;
      
      const field = cell.dataset.field;
      const row = cell.closest('tr');
      const id = row.dataset.id;
      const oldVal = cell.textContent;

      editingCell = { cell: cell, field: field, id: id, oldVal: oldVal };

      const isDate = field.toLowerCase().includes('date');
      const isNum = ['incomeDeposit','incomeBalance','expenseDeposit','expenseBalance'].indexOf(field) >= 0;

      const input = document.createElement('input');
      input.className = 'edit-input';
      input.type = isDate ? 'date' : (isNum ? 'number' : 'text');
      if (isNum) input.step = '0.01';
      input.value = isNum ? (parseFloat(oldVal) || 0) : oldVal;
      
      cell.textContent = '';
      cell.appendChild(input);
      input.focus();
      input.select();

      input.addEventListener('blur', saveCellEdit);
      input.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') saveCellEdit();
        if (e.key === 'Escape') cancelCellEdit();
      });
    }

    async function saveCellEdit() {
      if (!editingCell) return;
      
      const { cell, field, id, oldVal } = editingCell;
      const input = cell.querySelector('input');
      if (!input) return;
      
      const newVal = input.value;
      editingCell = null;

      if (newVal === oldVal) {
        cell.textContent = oldVal;
        return;
      }

      try {
        const body = {};
        body[field] = newVal;
        
        const res = await fetch('/api/records/' + id, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });

        const data = await res.json();
        
        if (data.success) {
          toast('已保存');
          loadData();
        } else {
          cell.textContent = oldVal;
          toast('保存失败: ' + (data.error || ''), 'error');
        }
      } catch (err) {
        cell.textContent = oldVal;
        toast('保存失败: ' + err.message, 'error');
      }
    }

    function cancelCellEdit() {
      if (!editingCell) return;
      editingCell.cell.textContent = editingCell.oldVal;
      editingCell = null;
    }

    function toggleAddForm() {
      const card = document.getElementById('addFormCard');
      if (card.classList.contains('show')) {
        card.classList.remove('show');
      } else {
        card.classList.add('show');
        document.getElementById('fDate').focus();
      }
    }

    function resetAddForm() {
      document.getElementById('addForm').reset();
      document.getElementById('fDate').value = getToday();
    }

    async function handleAddSubmit(e) {
      e.preventDefault();
      
      const data = {
        date: document.getElementById('fDate').value,
        detail1: document.getElementById('fDetail1').value,
        detail2: document.getElementById('fDetail2').value,
        purpose: document.getElementById('fPurpose').value,
        incomeDeposit: document.getElementById('fIncomeDeposit').value,
        incomeDepositDate: document.getElementById('fIncomeDepositDate').value,
        incomeBalance: document.getElementById('fIncomeBalance').value,
        incomeBalanceDate: document.getElementById('fIncomeBalanceDate').value,
        expenseDeposit: document.getElementById('fExpenseDeposit').value,
        expenseDepositDate: document.getElementById('fExpenseDepositDate').value,
        expenseBalance: document.getElementById('fExpenseBalance').value,
        expenseBalanceDate: document.getElementById('fExpenseBalanceDate').value,
        remarks: document.getElementById('fRemarks').value
      };

      try {
        const res = await fetch('/api/records', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });

        const result = await res.json();
        
        if (result.success) {
          toast('添加成功！');
          resetAddForm();
          loadData();
        } else {
          toast('添加失败: ' + (result.error || ''), 'error');
        }
      } catch (err) {
        toast('添加失败: ' + err.message, 'error');
      }
      
      return false;
    }

    function showDeleteModal(id) {
      deleteId = id;
      document.getElementById('deleteModal').classList.add('show');
    }

    function closeDeleteModal() {
      document.getElementById('deleteModal').classList.remove('show');
      deleteId = null;
    }

    async function confirmDelete() {
      if (!deleteId) return;
      
      try {
        const res = await fetch('/api/records/' + deleteId, { method: 'DELETE' });
        const data = await res.json();
        
        if (data.success) {
          toast('删除成功');
          closeDeleteModal();
          loadData();
        } else {
          toast('删除失败: ' + (data.error || ''), 'error');
        }
      } catch (err) {
        toast('删除失败: ' + err.message, 'error');
      }
    }

    async function exportExcel() {
      try {
        const res = await fetch(buildApiUrl('/api/export'));
        const result = await res.json();

        if (!result.success) {
          toast('导出失败', 'error');
          return;
        }

        const records = result.data;
        
        const h1 = ['日期', '用途', '', '', '收入', '', '', '', '支出', '', '', '', '本单收入', '本单支出', '本单利润', '备注'];
        const h2 = ['', '明细一', '明细二', '用于', '定金', '定金日期', '尾款', '尾款日期', '定金', '定金日期', '尾款', '尾款日期', '', '', '', ''];
        
        const rows = records.map(function(r) {
          const totals = calcRecordTotals(r);
          return [
            r.date || '',
            r.detail1 || '',
            r.detail2 || '',
            r.purpose || '',
            r.incomeDeposit || 0,
            r.incomeDepositDate || '',
            r.incomeBalance || 0,
            r.incomeBalanceDate || '',
            r.expenseDeposit || 0,
            r.expenseDepositDate || '',
            r.expenseBalance || 0,
            r.expenseBalanceDate || '',
            totals.totalIncome,
            totals.totalExpense,
            totals.profit,
            r.remarks || ''
          ];
        });

        const ws = XLSX.utils.aoa_to_sheet([h1, h2].concat(rows));
        
        ws['!merges'] = [
          { s: { r: 0, c: 0 }, e: { r: 1, c: 0 } },
          { s: { r: 0, c: 1 }, e: { r: 0, c: 3 } },
          { s: { r: 0, c: 4 }, e: { r: 0, c: 7 } },
          { s: { r: 0, c: 8 }, e: { r: 0, c: 11 } },
          { s: { r: 0, c: 12 }, e: { r: 1, c: 12 } },
          { s: { r: 0, c: 13 }, e: { r: 1, c: 13 } },
          { s: { r: 0, c: 14 }, e: { r: 1, c: 14 } },
          { s: { r: 0, c: 15 }, e: { r: 1, c: 15 } }
        ];

        ws['!cols'] = [
          {wch:12},{wch:12},{wch:12},{wch:12},
          {wch:10},{wch:12},{wch:10},{wch:12},
          {wch:10},{wch:12},{wch:10},{wch:12},
          {wch:12},{wch:12},{wch:12},{wch:15}
        ];

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, '财务记录');
        
        let fileName = '财务表-寿光锋鸟-' + getToday();
        if (currentFilter.startMonth || currentFilter.endMonth) {
          fileName += '-筛选';
        }
        XLSX.writeFile(wb, fileName + '.xlsx');
        
        toast('导出成功！');
      } catch (err) {
        toast('导出失败: ' + err.message, 'error');
      }
    }

    function initUpload() {
      const area = document.getElementById('uploadArea');
      if (!area) return;
      
      area.addEventListener('dragover', function(e) {
        e.preventDefault();
        area.classList.add('dragover');
      });
      
      area.addEventListener('dragleave', function() {
        area.classList.remove('dragover');
      });
      
      area.addEventListener('drop', function(e) {
        e.preventDefault();
        area.classList.remove('dragover');
        if (e.dataTransfer.files.length > 0) {
          processFile(e.dataTransfer.files[0]);
        }
      });
    }

    function handleFileSelect(e) {
      if (e.target.files.length > 0) {
        processFile(e.target.files[0]);
      }
    }

    function processFile(file) {
      const ext = file.name.split('.').pop().toLowerCase();
      if (['xlsx', 'xls', 'csv'].indexOf(ext) < 0) {
        toast('请上传 Excel 或 CSV 文件', 'error');
        return;
      }

      document.getElementById('fileName').textContent = file.name;
      
      const reader = new FileReader();
      reader.onload = function(e) {
        try {
          const data = new Uint8Array(e.target.result);
          const wb = XLSX.read(data, { type: 'array', cellDates: true });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const json = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false });

          if (json.length === 0) {
            toast('文件中没有数据', 'warning');
            return;
          }

          importData = json;
          
          document.getElementById('rowCount').textContent = json.length + ' 条';
          document.getElementById('fileInfo').classList.add('show');

          const keys = Object.keys(json[0]);
          document.getElementById('previewHead').innerHTML = '<tr>' + keys.map(function(k){return '<th>'+k+'</th>';}).join('') + '</tr>';
          document.getElementById('previewBody').innerHTML = json.slice(0, 5).map(function(row) {
            return '<tr>' + keys.map(function(k){return '<td>'+(row[k]||'')+'</td>';}).join('') + '</tr>';
          }).join('');
          document.getElementById('previewBox').classList.add('show');

          document.getElementById('importBtn').disabled = false;
          document.getElementById('clearBtn').style.display = 'inline-flex';

          toast('解析成功！', 'success');
        } catch (err) {
          toast('解析失败: ' + err.message, 'error');
        }
      };
      reader.readAsArrayBuffer(file);
    }

    async function startImport() {
      if (importData.length === 0) return;

      const btn = document.getElementById('importBtn');
      btn.disabled = true;
      btn.innerHTML = '<i class="bi bi-arrow-repeat" style="animation: spin 1s linear infinite;"></i> 导入中...';

      try {
        const res = await fetch('/api/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ records: importData })
        });

        const data = await res.json();

        if (data.success) {
          toast(data.message);
          setTimeout(function() {
            closeImportModal();
            loadData();
          }, 1000);
        } else {
          toast(data.error || '导入失败', 'error');
        }
      } catch (err) {
        toast('导入失败: ' + err.message, 'error');
      }

      btn.disabled = false;
      btn.innerHTML = '<i class="bi bi-upload"></i> 开始导入';
    }

    async function clearAllData() {
      if (!confirm('确定要清空所有数据吗？此操作不可恢复！')) return;

      try {
        const res = await fetch('/api/clear', { method: 'DELETE' });
        const data = await res.json();

        if (data.success) {
          toast(data.message);
          loadData();
        } else {
          toast(data.error, 'error');
        }
      } catch (err) {
        toast('清空失败: ' + err.message, 'error');
      }
    }

    function downloadTemplate() {
      const tpl = [{
        '日期': '2024-01-01',
        '明细一': '张三',
        '明细二': '材料采购',
        '用于': '项目A',
        '收入定金': 5000,
        '收入定金日期': '2024-01-01',
        '收入尾款': 10000,
        '收入尾款日期': '2024-01-15',
        '支出定金': 0,
        '支出定金日期': '',
        '支出尾款': 0,
        '支出尾款日期': '',
        '备注': '示例'
      }];

      const ws = XLSX.utils.json_to_sheet(tpl);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, '模板');
      XLSX.writeFile(wb, '财务记录模板.xlsx');
      toast('模板下载成功！');
    }

    function openImportModal() {
      document.getElementById('importModal').classList.add('show');
      resetImportModal();
    }

    function closeImportModal() {
      document.getElementById('importModal').classList.remove('show');
      resetImportModal();
    }

    function resetImportModal() {
      importData = [];
      document.getElementById('fileInput').value = '';
      document.getElementById('fileInfo').classList.remove('show');
      document.getElementById('previewBox').classList.remove('show');
      document.getElementById('importBtn').disabled = true;
      document.getElementById('clearBtn').style.display = 'none';
    }

    function fmtMoney(v) {
      var n = parseFloat(v) || 0;
      return n === 0 ? '' : n.toFixed(2);
    }

    function formatNum(v) {
      return (parseFloat(v) || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    ['importModal', 'deleteModal'].forEach(function(id) {
      var el = document.getElementById(id);
      if (el) {
        el.addEventListener('click', function(e) {
          if (e.target.id === id) {
            document.getElementById(id).classList.remove('show');
          }
        });
      }
    });
  </script>
</body>
</html>`;

  return new Response(html, { 
    headers: { 'Content-Type': 'text/html; charset=utf-8' } 
  });
}
