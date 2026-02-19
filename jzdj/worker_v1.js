// ============= 在线文本/数据库 管理器 (v15.2 日志删除增强版) =============
// 更新日志：
// 1. 新增日志删除功能 (后端 API + 前端按钮)
// 2. 优化日志列表 UI，整合详情与删除操作

let ADMIN_UUID = null;
let GEMINI_API_KEY = null;
let GEMINI_MODEL = 'models/gemini-2.0-flash';
let FileName = 'CF-Workers-TXT';
const CONTENT_FILE = 'CONTENT.txt';

// ===== 工具函数 =====
function uuidv4() {
    return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, c =>
        (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
    );
}

function getDayStr() {
    const d = new Date();
    const offset = 8;
    const local = new Date(d.getTime() + offset * 3600 * 1000);
    return local.toISOString().split('T')[0];
}

function getTimeStr() {
    const d = new Date();
    const offset = 8;
    const local = new Date(d.getTime() + offset * 3600 * 1000);
    return local.toISOString().replace('T', ' ').split('.')[0];
}

// ===== 主入口 =====
export default {
    async fetch(request, env) {
        ADMIN_UUID = env.ADMIN_UUID || ADMIN_UUID;
        GEMINI_API_KEY = env.GEMINI_API_KEY || null;
        GEMINI_MODEL = env.GEMINI_MODEL || GEMINI_MODEL;
        FileName = env.FILENAME || FileName;

        const url = new URL(request.url);
        const pathname = url.pathname;
        const token = url.searchParams.get('token');

        const corsHeaders = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
        };

        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders });
        }

        if (!ADMIN_UUID) {
            if (pathname.includes('/api/')) return new Response(JSON.stringify({ status: 'error', msg: '请先设置 ADMIN_UUID' }), { headers: corsHeaders });
            return new Response(`<h1>⚠️ 请先设置环境变量 ADMIN_UUID</h1>`, { status: 400, headers: { 'Content-Type': 'text/html;charset=utf-8' } });
        }

        async function checkToken() {
            if (!token) return false;
            const saved = await env.KV.get('GUEST_TOKEN');
            return token === saved;
        }

        // ================= [API] AI 智能去重 =================
        if (pathname.includes('/api/ai_clean') && request.method === 'POST') {
            if (!GEMINI_API_KEY) return new Response(JSON.stringify({ status: 'error', msg: '未配置 GEMINI_API_KEY' }), { headers: corsHeaders });

            try {
                const reqBody = await request.json();
                let selectedModel = reqBody.model;
                if (!selectedModel) {
                    const models = GEMINI_MODEL.split(',');
                    selectedModel = models[0].trim();
                }

                let content = await env.KV.get(CONTENT_FILE) || '';
                const parts = content.split(/(\[BLACKLIST\]|\[ADDRS\]|\[PHONES\])/);
                let addrIndex = parts.indexOf('[ADDRS]');

                if (addrIndex === -1) return new Response(JSON.stringify({ status: 'error', msg: '未找到 [ADDRS] 标签' }), { headers: corsHeaders });

                let rawAddrs = parts[addrIndex + 1] || "";
                let addrs = rawAddrs.split('\n').map(x => x.trim()).filter(x => x);

                if (addrs.length === 0) return new Response(JSON.stringify({ status: 'skip', msg: '地址库为空' }), { headers: corsHeaders });

                const prompt = `
            任务：对地址列表进行严格去重和简化。
            规则：
            1. 全局去重：语义重复的保留一个。
            2. 极简：只留核心地名，去掉省市区。
            3. 格式：仅输出纯JSON字符串数组 ["a","b"]，无其他字符。
            
            数据：
            ${JSON.stringify(addrs)}
            `;

                let finalModelName = selectedModel.trim();
                if (!finalModelName.includes('/')) {
                    finalModelName = 'models/' + finalModelName;
                }

                const apiUrl = `https://generativelanguage.googleapis.com/v1beta/${finalModelName}:generateContent?key=${GEMINI_API_KEY}`;

                const aiResp = await fetch(apiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: prompt }] }],
                        generationConfig: { response_mime_type: "application/json" }
                    })
                });

                const rawText = await aiResp.text();

                if (!aiResp.ok || rawText.trim().startsWith('<')) {
                    return new Response(JSON.stringify({
                        status: 'error',
                        msg: `Google API Error (${aiResp.status}) [Model: ${finalModelName}]: ${rawText.substring(0, 300)}`
                    }), { headers: corsHeaders });
                }

                let aiJson;
                try {
                    aiJson = JSON.parse(rawText);
                } catch (e) {
                    return new Response(JSON.stringify({
                        status: 'error',
                        msg: `JSON 解析失败: ${rawText.substring(0, 100)}`
                    }), { headers: corsHeaders });
                }

                if (aiJson.error) {
                    return new Response(JSON.stringify({
                        status: 'error',
                        msg: `Google 业务报错: ${aiJson.error.message}`
                    }), { headers: corsHeaders });
                }

                if (!aiJson.candidates || !aiJson.candidates[0].content) {
                    return new Response(JSON.stringify({
                        status: 'error',
                        msg: 'Google 返回空内容。'
                    }), { headers: corsHeaders });
                }

                let cleanedText = aiJson.candidates[0].content.parts[0].text;
                let cleanedAddrs = [];

                try {
                    cleanedText = cleanedText.replace(/^```json\s*/, '').replace(/^```\s*/, '').replace(/\s*```$/, '');
                    cleanedAddrs = JSON.parse(cleanedText);
                } catch (e) {
                    if (cleanedText.includes('\n')) {
                        cleanedAddrs = cleanedText.split('\n').map(x => x.trim()).filter(x => x);
                    } else {
                        return new Response(JSON.stringify({
                            status: 'error',
                            msg: `AI 返回格式错误: ${cleanedText.substring(0, 100)}`
                        }), { headers: corsHeaders });
                    }
                }

                cleanedAddrs = [...new Set(cleanedAddrs)];
                const removedItems = addrs.filter(original => !cleanedAddrs.includes(original));
                const removedCount = addrs.length - cleanedAddrs.length;

                const logEntry = {
                    time: getTimeStr(),
                    original_count: addrs.length,
                    new_count: cleanedAddrs.length,
                    removed_count: removedCount,
                    model_used: finalModelName,
                    removed_details: removedItems.slice(0, 500)
                };

                const logKey = `LOG_${getDayStr()}`;
                let dayLogs = await env.KV.get(logKey, { type: 'json' }) || [];
                dayLogs.unshift(logEntry);
                await env.KV.put(logKey, JSON.stringify(dayLogs));

                parts[addrIndex + 1] = '\n' + cleanedAddrs.join('\n') + '\n\n';
                const newContent = parts.join('');

                await env.KV.put(`BACKUP_AI_AUTO_${Date.now()}`, content);
                await env.KV.put(CONTENT_FILE, newContent);

                return new Response(JSON.stringify({
                    status: 'success',
                    msg: `成功！数量变化: ${addrs.length} -> ${cleanedAddrs.length}`,
                    log: logEntry
                }), { headers: corsHeaders });

            } catch (e) {
                return new Response(JSON.stringify({ status: 'error', msg: 'Worker 异常: ' + e.message }), { headers: corsHeaders });
            }
        }

        // ================= [API] 日志删除 (新增) =================
        if (pathname.includes('/api/logs/delete')) {
            const date = url.searchParams.get('date');
            const index = parseInt(url.searchParams.get('index'));

            if (!date || isNaN(index)) {
                return new Response(JSON.stringify({ status: 'error', msg: '参数错误' }), { headers: corsHeaders });
            }

            const logKey = `LOG_${date}`;
            let logs = await env.KV.get(logKey, { type: 'json' }) || [];

            if (index >= 0 && index < logs.length) {
                logs.splice(index, 1);
                await env.KV.put(logKey, JSON.stringify(logs));
                return new Response(JSON.stringify({ status: 'success' }), { headers: corsHeaders });
            } else {
                return new Response(JSON.stringify({ status: 'error', msg: '索引无效' }), { headers: corsHeaders });
            }
        }

        // ================= [API] 备份 & 日志查询 & 其他逻辑 =================

        if (pathname.includes('/api/logs')) {
            const date = url.searchParams.get('date') || getDayStr();
            const logs = await env.KV.get(`LOG_${date}`, { type: 'json' }) || [];
            return new Response(JSON.stringify(logs), { headers: corsHeaders });
        }

        if (url.pathname === '/api/add' && request.method === 'POST') {
            if (!await checkToken()) return new Response(JSON.stringify({ status: 'error', msg: 'Token无效' }), { status: 403, headers: corsHeaders });
            try {
                const req = await request.json();
                const type = req.type;
                const textToAdd = req.data;
                if (!textToAdd) return new Response(JSON.stringify({ status: 'error', msg: '内容为空' }), { headers: corsHeaders });
                if (type === 'addr' && (textToAdd.includes('号') || textToAdd.includes('号'))) return new Response(JSON.stringify({ status: 'skip', msg: '已过滤包含路/街的地址' }), { headers: corsHeaders });

                let content = await env.KV.get(CONTENT_FILE) || '';
                if (!content.includes('[BLACKLIST]')) content = `[BLACKLIST]\n\n[ADDRS]\n\n[PHONES]\n\n` + content;
                let tag = type === 'blacklist' ? '[BLACKLIST]' : (type === 'addr' ? '[ADDRS]' : (type === 'phone' ? '[PHONES]' : ''));
                if (!tag) return new Response(JSON.stringify({ status: 'error', msg: '未知类型' }), { headers: corsHeaders });

                if (content.includes(textToAdd)) return new Response(JSON.stringify({ status: 'skip', msg: '已存在，跳过' }), { headers: corsHeaders });

                if (content.includes(tag)) {
                    const parts = content.split(tag);
                    content = parts[0] + tag + '\n' + textToAdd + parts.slice(1).join(tag);
                } else {
                    content += `\n\n${tag}\n${textToAdd}`;
                }
                await env.KV.put(CONTENT_FILE, content);
                return new Response(JSON.stringify({ status: 'success', msg: '已追加到顶部' }), { headers: corsHeaders });
            } catch (e) { return new Response(JSON.stringify({ status: 'error', msg: e.message }), { headers: corsHeaders }); }
        }

        if (url.pathname === '/api/sync' && request.method === 'POST') {
            if (!await checkToken()) return new Response(JSON.stringify({ status: 'error', msg: 'Token无效' }), { status: 403, headers: corsHeaders });
            const body = await request.text();
            await env.KV.put(CONTENT_FILE, body);
            return new Response(JSON.stringify({ status: 'success', size: body.length }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
        }

        if (pathname === '/' + ADMIN_UUID) {
            if (request.method === 'POST') {
                const body = await request.text();
                if (body.startsWith('GUESTGEN|')) {
                    const custom = body.split('|')[1] || uuidv4();
                    await env.KV.put('GUEST_TOKEN', custom);
                    return new Response(custom);
                }
                await env.KV.put(CONTENT_FILE, body);
                return new Response('saved');
            }
            const content = await env.KV.get(CONTENT_FILE) || '';
            const modelsList = GEMINI_MODEL.split(',').map(m => m.trim()).filter(m => m);
            return new Response(adminPage(content, ADMIN_UUID, modelsList), { headers: { 'Content-Type': 'text/html;charset=utf-8' } });
        }

        // 访客接口
        if (url.pathname === '/txt' && token) {
            if (!await checkToken()) return new Response('Token invalid', { status: 403, headers: corsHeaders });
            const data = await env.KV.get(CONTENT_FILE) || '';
            return new Response(data, { status: 200, headers: { 'Content-Type': 'text/plain;charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-cache' } });
        }
        if (url.pathname === '/sub' && token) {
            if (!await checkToken()) return new Response('Token invalid', { status: 403 });
            const data = await env.KV.get(CONTENT_FILE) || '';
            const output = url.searchParams.get('base64') !== '0' ? btoa(unescape(encodeURIComponent(data))) : data;
            return new Response(output, { status: 200, headers: { 'Content-Type': 'text/plain;charset=utf-8', 'Access-Control-Allow-Origin': '*' } });
        }
        if (url.pathname === '/tvbox' && token) {
            if (!await checkToken()) return new Response('Token invalid', { status: 403 });
            const data = await env.KV.get(CONTENT_FILE) || '';
            return new Response(data, { status: 200, headers: { 'Content-Type': 'application/json;charset=utf-8', 'Access-Control-Allow-Origin': '*' } });
        }
        if (url.pathname === '/clash' && token) {
            if (!await checkToken()) return new Response('Token invalid', { status: 403 });
            const data = await env.KV.get(CONTENT_FILE) || '';
            return new Response(data, { status: 200, headers: { 'Content-Type': 'text/yaml;charset=utf-8', 'Content-Disposition': 'attachment; filename="clash.yaml"', 'Access-Control-Allow-Origin': '*' } });
        }
        if (url.pathname === '/raw' && token) {
            if (!await checkToken()) return new Response('Token invalid', { status: 403 });
            const data = await env.KV.get(CONTENT_FILE) || '';
            return new Response(data, { headers: { 'Content-Type': 'text/plain;charset=utf-8', 'Content-Disposition': 'attachment; filename="config.txt"' } });
        }
        if (url.pathname === '/md' && token) {
            if (!await checkToken()) return new Response('Token invalid', { status: 403 });
            const data = await env.KV.get(CONTENT_FILE) || '';
            return new Response(viewerPageMD(data), { headers: { 'Content-Type': 'text/html;charset=utf-8' } });
        }

        return new Response('Not Found', { status: 404 });
    }
};

// ================= 管理界面 HTML (v15.2) =================
function adminPage(content, adminPath, modelsList) {
    const escaped = content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const modelsJson = JSON.stringify(modelsList);

    return `<!doctype html>
<html lang="zh">
<head>
<meta charset="utf-8">
<title>${FileName} 管理系统</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="[https://cdn.jsdelivr.net/npm/github-markdown-css@5.5.1/github-markdown-light.min.css](https://cdn.jsdelivr.net/npm/github-markdown-css@5.5.1/github-markdown-light.min.css)">
<style>
* { box-sizing: border-box; }
body { margin:0; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto; font-size:14px; background:#f6f8fa; color:#24292f; height:100vh; display:flex; flex-direction:column; }
.header { padding:12px 20px; background:#24292f; color:#fff; display:flex; align-items:center; justify-content:space-between; }
.header h1 { margin:0; font-size:18px; font-weight:600; }
.toolbar { padding:10px 20px; background:#fff; border-bottom:1px solid #d0d7de; display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
.tabs { display:flex; gap:0; }
.tabs button { border-radius:6px 6px 0 0; border:1px solid transparent; border-bottom:none; margin-bottom:-1px; padding:8px 16px; cursor:pointer; background:transparent; font-size:13px; }
.tabs button.active { background:#fff; border-color:#d0d7de; border-bottom-color:#fff; font-weight:600; color:#0969da; }
.action-btn { padding:5px 16px; border:1px solid #d0d7de; border-radius:6px; background:#238636; color:#fff; cursor:pointer; font-size:13px; }
.action-btn:hover { background:#2ea043; }
.ai-btn { background: #8250df; color:#fff; padding:5px 12px; border-radius:6px; border:1px solid #d0d7de; cursor:pointer; font-size:13px; }
.ai-btn:hover { background: #9a67ea; }
.tool-btn { background: #f6f8fa; border:1px solid #d0d7de; padding:5px 12px; border-radius:6px; cursor:pointer; }
.share-btn { padding:5px 12px; border:1px solid #d0d7de; border-radius:6px; background:#f6f8fa; cursor:pointer; font-size:13px; }
#status { margin-left:auto; color:#57606a; font-size:12px; }

.container { flex:1; display:flex; overflow:hidden; position:relative; }
.pane { width:100%; height:100%; display:none; flex-direction:column; }
.pane.active { display:flex; }
#editor { flex:1; width:100%; border:none; padding:16px; resize:none; font-family:"SF Mono",monospace; font-size:13px; line-height:1.5; outline:none; }

.db-container { display:flex; height:100%; padding:10px; gap:10px; background:#f0f2f5; }
.db-col { flex:1; display:flex; flex-direction:column; background:#fff; border:1px solid #d0d7de; border-radius:6px; overflow:hidden; min-width:200px; }
.db-header { padding:10px; background:#f6f8fa; border-bottom:1px solid #d0d7de; font-weight:600; display:flex; justify-content:space-between; align-items:center; }
.db-header .count { font-weight:normal; font-size:12px; color:#57606a; background:#e8eaea; padding:2px 6px; border-radius:10px; }
.db-input-area { padding:10px; border-bottom:1px solid #eee; display:flex; gap:5px; }
.db-input-area input { flex:1; padding:5px; border:1px solid #d0d7de; border-radius:4px; font-size:13px; }
.db-list { flex:1; overflow-y:auto; padding:0; margin:0; list-style:none; }
.db-item { padding:8px 10px; border-bottom:1px solid #f0f0f0; display:flex; justify-content:space-between; align-items:center; font-family:monospace; font-size:13px; }
.db-item:hover { background:#f8f9fa; }
.db-del { color:#cf222e; cursor:pointer; font-size:14px; padding:0 5px; visibility:hidden; }
.db-item:hover .db-del { visibility:visible; }

.modal { display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); z-index:999; justify-content:center; align-items:center; }
.modal-content { background:#fff; width:90%; max-width:800px; max-height:90vh; border-radius:8px; display:flex; flex-direction:column; box-shadow:0 4px 12px rgba(0,0,0,0.15); }
.modal-header { padding:15px; border-bottom:1px solid #eee; display:flex; justify-content:space-between; align-items:center; font-weight:bold; }
.modal-body { padding:15px; overflow-y:auto; flex:1; }
.log-table, .backup-table { width:100%; border-collapse:collapse; font-size:13px; }
.log-table th, .backup-table th { text-align:left; background:#f6f8fa; padding:8px; border-bottom:1px solid #d0d7de; }
.log-table td, .backup-table td { padding:8px; border-bottom:1px solid #eee; }
.close-btn { background:none; border:none; font-size:18px; cursor:pointer; }
.spinner { border: 3px solid #f3f3f3; border-top: 3px solid #8250df; border-radius: 50%; width: 20px; height: 20px; animation: spin 1s linear infinite; display:inline-block; vertical-align:middle; margin-right:5px; }
@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }

#detailModal { z-index: 1000; }
.removed-item { color: #cf222e; text-decoration: line-through; }

#sharePanel { display:none; position:absolute; top:50px; right:20px; width:350px; background:#fff; border:1px solid #d0d7de; border-radius:8px; padding:16px; box-shadow:0 8px 24px rgba(140,149,159,0.2); z-index:100; }
.token-row { display:flex; gap:10px; margin-bottom:15px; }
.token-row input { flex:1; padding:5px; border:1px solid #d0d7de; border-radius:4px; }
.link-list { display:flex; flex-direction:column; gap:8px; }
.link-item { background:#f6f8fa; padding:8px; border-radius:6px; border:1px solid #d0d7de; }
.link-item p { margin:0 0 4px; font-size:11px; font-weight:bold; color:#57606a; }
.link-item input { width:100%; border:none; background:transparent; font-family:monospace; font-size:11px; outline:none; }
select { padding: 5px; border-radius: 4px; border: 1px solid #d0d7de; }
</style>
</head>
<body>

<div class="header">
  <h1>🗃️ ${FileName} 系统</h1>
</div>

<div class="toolbar">
  <div class="tabs">
    <button id="tabDb" class="active" onclick="switchTab('db')">📊 数据库录入</button>
    <button id="tabEdit" onclick="switchTab('edit')">📝 源码编辑</button>
    <button id="tabPreview" onclick="switchTab('preview')">👁️ 预览MD</button>
  </div>
  <button class="action-btn" onclick="save()">💾 保存并去重</button>
  <button class="ai-btn" onclick="openAiModal()">🤖 AI 智能工具</button>
  <button class="share-btn" onclick="toggleShare()">🔗 获取链接</button>
  <span id="status"></span>
</div>

<div id="sharePanel">
  <div style="display:flex;justify-content:space-between;margin-bottom:10px;"><h3>🔐 访客 Token</h3><button onclick="toggleShare()" style="border:none;background:none;cursor:pointer">✕</button></div>
  <div class="token-row">
    <input type="text" id="customToken" placeholder="自定义 Token">
    <button onclick="gen()">更新</button>
  </div>
  <div class="link-list">
    <div class="link-item"><p>📄 纯文本 (油猴同步用)</p><input type="text" id="txtUrl" readonly onclick="this.select()"></div>
    <div class="link-item"><p>📡 订阅 (Base64)</p><input type="text" id="subUrl" readonly onclick="this.select()"></div>
    <div class="link-item"><p>📺 TVBox</p><input type="text" id="tvboxUrl" readonly onclick="this.select()"></div>
    <div class="link-item"><p>📘 Markdown 预览</p><input type="text" id="mdUrl" readonly onclick="this.select()"></div>
  </div>
</div>

<div id="aiModal" class="modal">
    <div class="modal-content">
        <div class="modal-header">
            <span>🤖 AI 智能管理 (v15.2)</span>
            <button class="close-btn" onclick="closeAiModal()">×</button>
        </div>
        <div class="modal-body">
            <div style="display:flex; gap:10px; margin-bottom:15px; border-bottom:1px solid #eee; padding-bottom:10px; align-items: center;">
                <label>选择模型:</label>
                <select id="modelSelect"></select>
                <button class="ai-btn" onclick="runAiClean()">✨ 开始全量清洗</button>
            </div>
            <div style="display:flex; gap:20px;">
                <div style="flex:1;">
                    <h4>📜 AI 清洗日志</h4>
                    <div style="display:flex;gap:5px;margin-bottom:5px;">
                        <input type="date" id="logDate" onchange="loadLogs()">
                        <button onclick="loadLogs()" class="tool-btn">查询</button>
                    </div>
                    <div style="height:300px; overflow-y:auto; border:1px solid #eee; padding:5px;">
                        <table class="log-table">
                            <thead><tr><th>时间</th><th>变化</th><th>移除</th><th>操作</th></tr></thead>
                            <tbody id="logList"></tbody>
                        </table>
                    </div>
                </div>
                </div>
            </div>
            <div id="aiOutput" style="margin-top:10px; padding:10px; background:#f0f0f0; border-radius:5px; font-family:monospace; display:none;"></div>
        </div>
    </div>
</div>

<div id="detailModal" class="modal">
    <div class="modal-content" style="max-width: 500px; height: 600px;">
        <div class="modal-header">
            <span>🗑️ 移除内容详情</span>
            <button class="close-btn" onclick="closeDetailModal()">×</button>
        </div>
        <div class="modal-body">
             <div id="detailList" style="font-family: monospace;"></div>
        </div>
    </div>
</div>

<div class="container">
  <div id="paneDb" class="pane active">
    <div class="db-container">
      <div class="db-col">
        <div class="db-header">🚫 黑名单 <span class="count" id="countBlack">0</span></div>
        <div class="db-input-area">
          <input type="text" id="inBlack" placeholder="回车添加" onkeydown="if(event.key==='Enter') addToList('black', this.value)">
          <button onclick="addToList('black', document.getElementById('inBlack').value)">+</button>
        </div>
        <ul class="db-list" id="listBlack"></ul>
      </div>
      <div class="db-col">
        <div class="db-header">📍 地址库 <span class="count" id="countAddr">0</span></div>
        <div class="db-input-area">
          <input type="text" id="inAddr" placeholder="输入地址" onkeydown="if(event.key==='Enter') addToList('addr', this.value)">
          <button onclick="addToList('addr', document.getElementById('inAddr').value)">+</button>
        </div>
        <ul class="db-list" id="listAddr"></ul>
      </div>
      <div class="db-col">
        <div class="db-header">📞 电话库 <span class="count" id="countPhone">0</span></div>
        <div class="db-input-area">
          <input type="text" id="inPhone" placeholder="输入号码" onkeydown="if(event.key==='Enter') addToList('phone', this.value)">
          <button onclick="addToList('phone', document.getElementById('inPhone').value)">+</button>
        </div>
        <ul class="db-list" id="listPhone"></ul>
      </div>
    </div>
  </div>
  <div id="paneEdit" class="pane"><textarea id="editor">${escaped}</textarea></div>
  <div id="panePreview" class="pane" style="overflow:auto;padding:20px;"><div class="markdown-body" id="preview"></div></div>
</div>

<script src="[https://cdn.jsdelivr.net/npm/marked@12.0.1/marked.min.js](https://cdn.jsdelivr.net/npm/marked@12.0.1/marked.min.js)"></script>
<script>
const SERVER_MODELS = ${modelsJson};

let db = { black: [], addr: [], phone: [], other: [] };
let currentTab = 'db';
const ADMIN_PATH = '/${adminPath}';
let cachedLogs = [];

function initParse() {
  const raw = document.getElementById('editor').value;
  db = { black: [], addr: [], phone: [], other: [] };
  let currentKey = 'other';
  let buffer = [];
  const lines = raw.split('\\n');
  lines.forEach(line => {
      const trim = line.trim();
      if (trim === '[BLACKLIST]') { if(buffer.length) db[currentKey].push(...buffer); buffer = []; currentKey = 'black'; } 
      else if (trim === '[ADDRS]') { if(buffer.length) db[currentKey].push(...buffer); buffer = []; currentKey = 'addr'; } 
      else if (trim === '[PHONES]') { if(buffer.length) db[currentKey].push(...buffer); buffer = []; currentKey = 'phone'; } 
      else { if (trim || currentKey === 'other') { if(currentKey !== 'other' && !trim) return; buffer.push(line); } }
  });
  if(buffer.length) db[currentKey].push(...buffer);
  db.black = [...new Set(db.black)];
  db.phone = [...new Set(db.phone)];
  db.addr = cleanAddrList(db.addr);
  renderList('black'); renderList('addr'); renderList('phone');
}

function cleanAddrList(list) {
    list = list.filter(item => !item.includes('路') && !item.includes('街'));
    const sorted = [...new Set(list)].sort((a, b) => b.length - a.length);
    const result = [];
    sorted.forEach(item => {
        if (!result.some(existing => existing.includes(item))) { result.push(item); }
    });
    return result;
}

function renderList(type) {
  const ul = document.getElementById(type === 'black' ? 'listBlack' : (type === 'addr' ? 'listAddr' : 'listPhone'));
  const countSpan = document.getElementById(type === 'black' ? 'countBlack' : (type === 'addr' ? 'countAddr' : 'countPhone'));
  const list = db[type];
  countSpan.textContent = list.length;
  let html = '';
  list.forEach((item, index) => {
      html += \`<li class="db-item"><span>\${item.replace(/</g,'&lt;')}</span> <span class="db-del" onclick="delItem('\${type}', \${index})">✕</span></li>\`;
  });
  ul.innerHTML = html;
}

function addToList(type, value) {
  const val = value.trim();
  if(!val) return;
  if (type === 'addr') {
      const isContained = db.addr.some(existing => existing.includes(val));
      if (isContained) { alert('已存在包含此内容的更完整地址，跳过'); return; }
      db.addr = db.addr.filter(existing => !val.includes(existing));
  } else {
      if (db[type].includes(val)) { db[type] = db[type].filter(item => item !== val); }
  }
  db[type].unshift(val);
  renderList(type);
  const inputId = type === 'black' ? 'inBlack' : (type === 'addr' ? 'inAddr' : 'inPhone');
  document.getElementById(inputId).value = '';
}

function delItem(type, index) { db[type].splice(index, 1); renderList(type); }

function buildRaw() {
  const b = [...new Set(db.black)].join('\\n');
  const p = [...new Set(db.phone)].join('\\n');
  const a = cleanAddrList(db.addr).join('\\n');
  const o = db.other.length ? db.other.join('\\n') + '\\n\\n' : '';
  return \`\${o}[BLACKLIST]\\n\${b}\\n\\n[ADDRS]\\n\${a}\\n\\n[PHONES]\\n\${p}\`.trim();
}

function switchTab(t) {
  if (currentTab === 'db' && t !== 'db') document.getElementById('editor').value = buildRaw();
  if (t === 'db') initParse();
  if (t === 'preview') document.getElementById('preview').innerHTML = marked.parse(document.getElementById('editor').value);
  currentTab = t;
  document.querySelectorAll('.tabs button').forEach(b => b.classList.remove('active'));
  document.getElementById(t === 'db' ? 'tabDb' : (t === 'edit' ? 'tabEdit' : 'tabPreview')).classList.add('active');
  document.querySelectorAll('.pane').forEach(p => p.classList.remove('active'));
  document.getElementById(t === 'db' ? 'paneDb' : (t === 'edit' ? 'paneEdit' : 'panePreview')).classList.add('active');
}

function save() {
  const status = document.getElementById('status');
  status.textContent = '保存中...';
  let content = document.getElementById('editor').value;
  if (currentTab === 'db') { content = buildRaw(); document.getElementById('editor').value = content; }
  fetch(location.href, {method:'POST', body:content})
    .then(r=>{if(r.ok)status.textContent='✅ 已保存';else throw new Error()})
    .catch(()=>status.textContent='❌ 保存失败');
}

function toggleShare() {
    const p = document.getElementById('sharePanel');
    p.style.display = p.style.display === 'block' ? 'none' : 'block';
}

function gen() {
    const c = document.getElementById('customToken').value;
    fetch(location.href, {method:'POST', body:'GUESTGEN|'+c}).then(r=>r.text()).then(t=>{
        const base = location.href.split('/').slice(0,-1).join('/');
        document.getElementById('txtUrl').value = base + '/txt?token=' + t;
        document.getElementById('subUrl').value = base + '/sub?token=' + t;
        document.getElementById('tvboxUrl').value = base + '/tvbox?token=' + t;
        document.getElementById('mdUrl').value = base + '/md?token=' + t;
        alert('Token 已更新');
    });
}

function openAiModal() {
    document.getElementById('aiModal').style.display = 'flex';
    document.getElementById('logDate').valueAsDate = new Date();
    
    const sel = document.getElementById('modelSelect');
    sel.innerHTML = '';
    SERVER_MODELS.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m;
        opt.text = m.replace('models/', '');
        sel.appendChild(opt);
    });

    });

    loadLogs();
}
function closeAiModal() { document.getElementById('aiModal').style.display = 'none'; }
function closeDetailModal() { document.getElementById('detailModal').style.display = 'none'; }

function showDetail(index) {
    const log = cachedLogs[index];
    if(!log || !log.removed_details) { alert('此日志无详细信息或格式太旧'); return; }
    
    const listDiv = document.getElementById('detailList');
    let html = '<h4>以下内容已被 AI 移除或改写：</h4><ul>';
    if(log.removed_details.length === 0) {
        html += '<li>(无移除内容，仅重排或格式化)</li>';
    } else {
        log.removed_details.forEach(item => {
            html += \`<li class="removed-item">\${item}</li>\`;
        });
    }
    html += '</ul>';
    listDiv.innerHTML = html;
    document.getElementById('detailModal').style.display = 'flex';
}

// 删除日志 (Frontend)
async function deleteLog(date, index) {
    if(!confirm('确定删除这条日志吗？')) return;
    const res = await fetch(ADMIN_PATH + '/api/logs/delete?date=' + date + '&index=' + index);
    const json = await res.json();
    if(json.status === 'success') {
        loadLogs(); // 刷新
    } else {
        alert('删除失败: ' + json.msg);
    }
}

async function runAiClean() {
    const btn = document.querySelector('.ai-btn');
    const out = document.getElementById('aiOutput');
    const modelSel = document.getElementById('modelSelect');
    const originalText = btn.innerText;
    
    const selectedModel = modelSel.value;

    if(!confirm('确定要使用 ' + selectedModel + ' 进行全量清洗吗？\\n注意：数据量大时请耐心等待。')) return;

    btn.innerHTML = '<span class="spinner"></span> AI 思考中...';
    btn.disabled = true;
    out.style.display = 'block';
    out.innerHTML = '正在连接 ' + selectedModel + '...';

    try {
        const res = await fetch(ADMIN_PATH + '/api/ai_clean', { 
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ model: selectedModel })
        });
        
        const text = await res.text();

        if(text.trim().startsWith('<') || !res.ok) {
            let errorPreview = text.replace(/<[^>]*>?/gm, '').substring(0, 300); 
            throw new Error('API Error:\\n' + errorPreview);
        }

        let json;
        try {
            json = JSON.parse(text);
        } catch (e) {
            throw new Error('JSON Parse Error:\\n' + text.substring(0,100));
        }
        
        if(json.status === 'success') {
            out.innerHTML = \`<span style="color:green">\${json.msg}</span>\`;
            setTimeout(() => {
                alert('清洗完成！点击确定刷新页面。');
                location.reload(); 
            }, 500);
        } else {
            out.innerHTML = \`<span style="color:red">错误: \${json.msg}</span>\`;
        }
    } catch(e) {
        alert('🔴 错误:\\n' + e.message);
        out.innerHTML = \`<span style="color:red">失败: \${e.message}</span>\`;
    } finally {
        btn.innerText = originalText;
        btn.disabled = false;
        loadLogs();
    }
}



async function loadLogs() {
    const date = document.getElementById('logDate').value;
    const tbody = document.getElementById('logList');
    tbody.innerHTML = '<tr><td colspan="4">加载中...</td></tr>';
    try {
        const res = await fetch(ADMIN_PATH + '/api/logs?date=' + date);
        cachedLogs = await res.json(); 
        
        if(!cachedLogs || cachedLogs.length === 0) { tbody.innerHTML = '<tr><td colspan="4">当日无日志</td></tr>'; return; }
        
        let html = '';
        cachedLogs.forEach((item, index) => {
            const removed = item.removed_count !== undefined ? item.removed_count : item.removed;
            const model = item.model_used ? \`<br><span style="font-size:10px;color:#888">\${item.model_used.replace('models/', '')}</span>\` : '';
            
            html += \`<tr>
                <td>\${item.time.split(' ')[1]}\${model}</td>
                <td>\${item.original_count} -> \${item.new_count}</td>
                <td style="color:red">-\${removed}</td>
                <td>
                    <button class="tool-btn" onclick="showDetail(\${index})">👁️</button>
                    <button class="tool-btn" style="color:red" onclick="deleteLog('\${date}', \${index})">✕</button>
                </td>
            </tr>\`;
        });
        tbody.innerHTML = html;
    } catch(e) { tbody.innerHTML = '<tr><td colspan="4">加载失败</td></tr>'; }
}

initParse();
</script></body></html>`;
}

function viewerPageMD(markdown) {
    const escaped = markdown.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$');
    return `<!doctype html>
<html lang="zh"><head><meta charset="utf-8"><title>${FileName}</title>
<link rel="stylesheet" href="[https://cdn.jsdelivr.net/npm/github-markdown-css@5.5.1/github-markdown-light.min.css](https://cdn.jsdelivr.net/npm/github-markdown-css@5.5.1/github-markdown-light.min.css)">
<style>.container{max-width:980px;margin:0 auto;padding:32px}</style>
</head><body><div class="container"><article class="markdown-body" id="content"></article></div>
<script src="[https://cdn.jsdelivr.net/npm/marked@12.0.1/marked.min.js](https://cdn.jsdelivr.net/npm/marked@12.0.1/marked.min.js)"></script>
<script>
const m=\`${escaped}\`;
document.getElementById('content').innerHTML = marked.parse(m);
</script></body></html>`;
}