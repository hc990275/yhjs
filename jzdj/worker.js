/**
 * Cloudflare Worker for Text/Database Management (GitHub Storage Version)
 * Version: 2.0.0
 * Features:
 *  - GitHub File Storage (Replaces KV)
 *  - Admin Management UI
 *  - Guest/API Access via Token
 */

let ADMIN_UUID = null;
let GITHUB_TOKEN = null;
let GITHUB_USER = 'hc990275';
let GITHUB_REPO = 'CloudFlare-worker';
let GITHUB_PATH = 'txt/content.txt'; // User specified folder 'txt'
let GUEST_TOKEN = null;

const FileName = 'CF-Workers-TXT';

// ===== Helper Functions =====
function uuidv4() {
    return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, c =>
        (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
    );
}

// GitHub API Helpers
async function fetchGithubFile() {
    const url = `https://api.github.com/repos/${GITHUB_USER}/${GITHUB_REPO}/contents/${GITHUB_PATH}`;
    const headers = {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'User-Agent': 'Cloudflare-Worker'
    };
    const res = await fetch(url, { headers });
    if (!res.ok) {
        if (res.status === 404) return { content: '', sha: null }; // File not found, treat as empty
        throw new Error(`GitHub API Error: ${res.status} ${res.statusText}`);
    }
    const data = await res.json();
    // Content is base64 encoded
    const content = decodeURIComponent(escape(atob(data.content.replace(/\n/g, ''))));
    return { content, sha: data.sha };
}

async function updateGithubFile(content, sha, message = 'Update from Worker') {
    const url = `https://api.github.com/repos/${GITHUB_USER}/${GITHUB_REPO}/contents/${GITHUB_PATH}`;
    const headers = {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'User-Agent': 'Cloudflare-Worker',
        'Content-Type': 'application/json'
    };
    const body = {
        message: message,
        content: btoa(unescape(encodeURIComponent(content))),
        sha: sha // Required if updating existing file
    };
    const res = await fetch(url, { method: 'PUT', headers, body: JSON.stringify(body) });
    if (!res.ok) {
        const err = await res.text();
        throw new Error(`GitHub API Update Error: ${res.status} ${err}`);
    }
    return await res.json();
}

export default {
    async fetch(request, env) {
        ADMIN_UUID = env.ADMIN_UUID || ADMIN_UUID;
        GITHUB_TOKEN = env.GITHUB_TOKEN || null;
        GITHUB_USER = env.GITHUB_USER || GITHUB_USER;
        GITHUB_REPO = env.GITHUB_REPO || GITHUB_REPO;
        GITHUB_PATH = env.GITHUB_PATH || GITHUB_PATH;
        GUEST_TOKEN = env.GUEST_TOKEN || null;

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

        if (!ADMIN_UUID || !GITHUB_TOKEN) {
            return new Response(`<h1>⚠️ 请先设置环境变量 ADMIN_UUID 和 GITHUB_TOKEN</h1>`, { status: 500, headers: { 'Content-Type': 'text/html;charset=utf-8' } });
        }

        async function checkToken() {
            if (!token) return false;
            // You can implement dynamic token check here if needed, for now using env var
            return token === GUEST_TOKEN;
        }

        // ================= [API] Data Operations (GitHub backed) =================

        // Append Data
        if (url.pathname === '/api/add' && request.method === 'POST') {
            if (!await checkToken()) return new Response(JSON.stringify({ status: 'error', msg: 'Token无效' }), { status: 403, headers: corsHeaders });
            try {
                const req = await request.json();
                const type = req.type;
                const textToAdd = req.data;
                if (!textToAdd) return new Response(JSON.stringify({ status: 'error', msg: '内容为空' }), { headers: corsHeaders });

                // Fetch current content
                const { content: currentContent, sha } = await fetchGithubFile();

                let content = currentContent;
                if (!content.includes('[BLACKLIST]')) content = `[BLACKLIST]\n\n[ADDRS]\n\n[PHONES]\n\n` + content;
                let tag = type === 'blacklist' ? '[BLACKLIST]' : (type === 'addr' ? '[ADDRS]' : (type === 'phone' ? '[PHONES]' : ''));
                if (!tag) return new Response(JSON.stringify({ status: 'error', msg: '未知类型' }), { headers: corsHeaders });

                if (type === 'addr' && (textToAdd.includes('路') || textToAdd.includes('街') || textToAdd.includes('号'))) return new Response(JSON.stringify({ status: 'skip', msg: '已过滤包含路/街/号的地址' }), { headers: corsHeaders });

                if (content.includes(textToAdd)) return new Response(JSON.stringify({ status: 'skip', msg: '已存在，跳过' }), { headers: corsHeaders });

                if (content.includes(tag)) {
                    const parts = content.split(tag);
                    content = parts[0] + tag + '\n' + textToAdd + parts.slice(1).join(tag);
                } else {
                    content += `\n\n${tag}\n${textToAdd}`;
                }

                // Update GitHub
                await updateGithubFile(content, sha, `API Add: ${type}`);
                return new Response(JSON.stringify({ status: 'success', msg: '已追加到顶部' }), { headers: corsHeaders });
            } catch (e) { return new Response(JSON.stringify({ status: 'error', msg: e.message }), { headers: corsHeaders }); }
        }

        // Full Sync (Overwrite)
        if (url.pathname === '/api/sync' && request.method === 'POST') {
            if (!await checkToken()) return new Response(JSON.stringify({ status: 'error', msg: 'Token无效' }), { status: 403, headers: corsHeaders });
            const body = await request.text();
            try {
                const { sha } = await fetchGithubFile();
                await updateGithubFile(body, sha, 'API Full Sync');
                return new Response(JSON.stringify({ status: 'success', size: body.length }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            } catch (e) {
                return new Response(JSON.stringify({ status: 'error', msg: e.message }), { headers: corsHeaders });
            }
        }

        // Admin Dashboard Route
        if (pathname === '/' + ADMIN_UUID) {
            if (request.method === 'POST') {
                const body = await request.text();
                // Guest Token generation logic removed or needs alternate storage if strict GitHub only
                // For simplified GitHub version, we assume GUEST_TOKEN is an Env Var usually.
                // If you want to store GUEST_TOKEN in file, you'd need a separate file or parse it from main file.
                // Here we focus on data content update.

                try {
                    const { sha } = await fetchGithubFile();
                    await updateGithubFile(body, sha, 'Admin Dashboard Save');
                    return new Response('saved');
                } catch (e) {
                    return new Response('Save failed: ' + e.message, { status: 500 });
                }
            }
            try {
                const { content } = await fetchGithubFile();
                // For guest token display, we just use the Env var one. 
                return new Response(adminPage(content, ADMIN_UUID, GUEST_TOKEN), { headers: { 'Content-Type': 'text/html;charset=utf-8' } });
            } catch (e) {
                return new Response(`Error fetching from GitHub: ${e.message}`, { status: 500 });
            }
        }

        // Guest Access Routes
        if (url.pathname === '/txt' && token) {
            if (!await checkToken()) return new Response('Token invalid', { status: 403, headers: corsHeaders });
            try {
                const { content } = await fetchGithubFile();
                return new Response(content, { status: 200, headers: { 'Content-Type': 'text/plain;charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-cache' } });
            } catch (e) { return new Response('Error', { status: 500 }); }
        }

        // Download raw config
        if (url.pathname === '/raw' && token) {
            if (!await checkToken()) return new Response('Token invalid', { status: 403 });
            try {
                const { content } = await fetchGithubFile();
                return new Response(content, { headers: { 'Content-Type': 'text/plain;charset=utf-8', 'Content-Disposition': 'attachment; filename="config.txt"' } });
            } catch (e) { return new Response('Error', { status: 500 }); }
        }

        // Markdown viewer
        if (url.pathname === '/md' && token) {
            if (!await checkToken()) return new Response('Token invalid', { status: 403 });
            try {
                const { content } = await fetchGithubFile();
                return new Response(viewerPageMD(content), { headers: { 'Content-Type': 'text/html;charset=utf-8' } });
            } catch (e) { return new Response('Error', { status: 500 }); }
        }

        return new Response('Not Found', { status: 404 });
    }
};

// ================= Admin UI (Simplified) =================
function adminPage(content, adminPath, guestToken) {
    const escaped = content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    return `<!doctype html>
<html lang="zh">
<head>
<meta charset="utf-8">
<title>${FileName} 管理系统</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/github-markdown-css@5.5.1/github-markdown-light.min.css">
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

#sharePanel { display:none; position:absolute; top:50px; right:20px; width:350px; background:#fff; border:1px solid #d0d7de; border-radius:8px; padding:16px; box-shadow:0 8px 24px rgba(140,149,159,0.2); z-index:100; }
.link-list { display:flex; flex-direction:column; gap:8px; }
.link-item { background:#f6f8fa; padding:8px; border-radius:6px; border:1px solid #d0d7de; }
.link-item p { margin:0 0 4px; font-size:11px; font-weight:bold; color:#57606a; }
.link-item input { width:100%; border:none; background:transparent; font-family:monospace; font-size:11px; outline:none; }
</style>
</head>
<body>

<div class="header">
  <h1>🗃️ ${FileName} 系统 (GitHub)</h1>
</div>

<div class="toolbar">
  <div class="tabs">
    <button id="tabDb" class="active" onclick="switchTab('db')">📊 数据库录入</button>
    <button id="tabEdit" onclick="switchTab('edit')">📝 源码编辑</button>
    <button id="tabPreview" onclick="switchTab('preview')">👁️ 预览MD</button>
  </div>
  <button class="action-btn" onclick="save()">💾 保存并去重</button>
  <button class="share-btn" onclick="toggleShare()">🔗 获取链接</button>
  <span id="status"></span>
</div>

<div id="sharePanel">
  <div style="display:flex;justify-content:space-between;margin-bottom:10px;"><h3>🔐 访问链接</h3><button onclick="toggleShare()" style="border:none;background:none;cursor:pointer">✕</button></div>
  <div class="link-list">
    <div class="link-item"><p> 当前 Token (Env)</p><input type="text" value="${guestToken || '未设置'}" readonly></div>
    <div class="link-item"><p>📄 纯文本 (油猴同步用)</p><input type="text" id="txtUrl" readonly onclick="this.select()"></div>
    <div class="link-item"><p>📘 Markdown 预览</p><input type="text" id="mdUrl" readonly onclick="this.select()"></div>
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

<script src="https://cdn.jsdelivr.net/npm/marked@12.0.1/marked.min.js"></script>
<script>
let db = { black: [], addr: [], phone: [], other: [] };
let currentTab = 'db';
const ADMIN_PATH = '/${adminPath}';
const GUEST_TOKEN = '${guestToken || ''}';

// Initialize links
const base = location.href.split('/').slice(0,-1).join('/');
if (GUEST_TOKEN) {
    document.getElementById('txtUrl').value = base + '/txt?token=' + GUEST_TOKEN;
    document.getElementById('mdUrl').value = base + '/md?token=' + GUEST_TOKEN;
}

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

initParse();
</script></body></html>`;
}

function viewerPageMD(markdown) {
    const escaped = markdown.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$');
    return `<!doctype html>
<html lang="zh"><head><meta charset="utf-8"><title>${FileName}</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/github-markdown-css@5.5.1/github-markdown-light.min.css">
<style>.container{max-width:980px;margin:0 auto;padding:32px}</style>
</head><body><div class="container"><article class="markdown-body" id="content"></article></div>
<script src="https://cdn.jsdelivr.net/npm/marked@12.0.1/marked.min.js"></script>
<script>
const m=\`${escaped}\`;
document.getElementById('content').innerHTML = marked.parse(m);
</script></body></html>`;
}