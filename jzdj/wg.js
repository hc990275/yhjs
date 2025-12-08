// ==UserScript==
// @name          代驾调度系统助手 (拖拽交互版)
// @namespace     http://tampermonkey.net/
// @version       9.5
// @description   右下角拖拽可调整缩放；右下角拖拽可调整地址库宽高；地址库自动分列；严格电话校验；司机调度秒刷。
// @author        郭
// @match         https://admin.v3.jiuzhoudaijiaapi.cn/*
// @grant         GM_setValue
// @grant         GM_getValue
// @grant         GM_addStyle
// @grant         GM_xmlhttpRequest
// @grant         GM_info
// @grant         GM_openInTab
// @grant         unsafeWindow
// ==/UserScript==

(function() {
    'use strict';

    // --------------- 1. 配置中心 ---------------
    const CONFIG = {
        ORDER: {
            HASH: '#/substituteDrivingOrder',
            TITLE: '订单刷新',
            DEFAULT_INTERVAL: 20,
            BUTTON_SELECTOR: 'button.el-button.el-button--primary.el-button--small i.el-icon-search',
            ALT_SELECTOR: '.el-icon-search'
        },
        DRIVER: {
            HASH: '#/driverAll',
            TITLE: '司机调度',
            DEFAULT_INTERVAL: 1, // 秒刷
            BUTTON_SELECTOR: '.el-icon-refresh',
            ALT_SELECTOR: 'button i.el-icon-refresh'
        },
        DISPATCH: {
            HASH: '#/substituteDrivingDispatch',
            TITLE: '订单指派',
            PRESETS: [2, 3, 5, 10, 20],
            RAPID_INTERVAL: 500
        },
        CLOUD: {
            BLACKLIST_URL: "https://github.abcai.online/share/hc990275%2Fyhjs%2Fmain%2Fjzdj%2Fglk?sign=nfpvws&t=1765094235754"
        },
        CLIPBOARD: { MAX_HISTORY: 20 }
    };

    // --------------- 2. 全局状态 ---------------
    let state = {
        currentHash: window.location.hash,
        isCollapsed: GM_getValue('uiCollapsed', false),
        manualPause: GM_getValue('manualPause', false),
        refreshInterval: 20, 
        countdown: 0,
        timerId: null,
        rapidTimer: null,
        uiPos: JSON.parse(GM_getValue('uiPos', '{"top":"80px","left":"20px"}')),
        uiScale: parseFloat(GM_getValue('uiScale', '1.0')),
        // 布局改为只存宽高，列数自动计算
        layout: JSON.parse(GM_getValue('uiLayout', '{"width": 260, "height": 300}')),
        history: JSON.parse(GM_getValue('clipHistory', '{"phones":[], "addrs":[]}')),
        blacklist: GM_getValue('blacklist', '师傅,马上,联系,收到,好的,电话,不用,微信'),
        currentVersion: GM_info.script.version,
        timeConfig: JSON.parse(GM_getValue('timeConfig', '{"start":"20:00", "end":"22:00"}'))
    };

    // --------------- 3. 核心逻辑 ---------------

    const checkPage = () => {
        state.currentHash = window.location.hash;

        if (isOrderPage()) {
            state.refreshInterval = GM_getValue('orderInterval', CONFIG.ORDER.DEFAULT_INTERVAL);
        } else if (isDriverPage()) {
            let saved = GM_getValue('driverInterval');
            if (!saved) saved = CONFIG.DRIVER.DEFAULT_INTERVAL;
            state.refreshInterval = saved;
        } else if (isDispatchPage()) {
            state.refreshInterval = CONFIG.DISPATCH.RAPID_INTERVAL / 1000; 
            log('进入派单界面，同步并清洗隔离库...', 'info');
            fetchOnlineBlacklist(true);
            setTimeout(applyDistanceByTime, 1500); 
        }

        updateUI(); 
        
        if (isDispatchPage()) {
             if (!state.manualPause) startRapidRefresh();
        } else {
            stopRapidRefresh();
            if (isOrderPage() || isDriverPage()) {
                if (!state.manualPause && !state.timerId) startCountdown();
            } else {
                stopCountdown();
            }
        }
    };

    const isOrderPage = () => state.currentHash.includes(CONFIG.ORDER.HASH);
    const isDispatchPage = () => state.currentHash.includes(CONFIG.DISPATCH.HASH);
    const isDriverPage = () => state.currentHash.includes(CONFIG.DRIVER.HASH);

    const applyDistanceByTime = () => {
        if (!isDispatchPage()) return;
        const now = new Date();
        const currentVal = now.getHours() * 60 + now.getMinutes(); 
        const parseTime = (str) => {
            const parts = str.split(':');
            return parseInt(parts[0]) * 60 + parseInt(parts[1]);
        };
        const startVal = parseTime(state.timeConfig.start);
        const endVal = parseTime(state.timeConfig.end);
        let targetKm = 3; 
        if (currentVal >= startVal && currentVal < endVal) {
            targetKm = 2;
        }
        setSliderValue(targetKm);
    };

    const cleanHistoryWithBlacklist = () => {
        if (!state.history.addrs || state.history.addrs.length === 0) return;
        const blockers = state.blacklist.split(/[,，]/).map(s => s.trim()).filter(s => s);
        if (blockers.length === 0) return;
        const originalCount = state.history.addrs.length;
        state.history.addrs = state.history.addrs.filter(addr => !blockers.some(keyword => addr.includes(keyword)));
        const newCount = state.history.addrs.length;
        if (originalCount !== newCount) {
            GM_setValue('clipHistory', JSON.stringify(state.history));
            updateListsUI();
            log(`已清洗地址库: 移除 ${originalCount - newCount} 条`, 'warning');
        }
    };

    const fetchOnlineBlacklist = (silent = false) => {
        const t = new Date().getTime();
        GM_xmlhttpRequest({
            method: "GET",
            url: CONFIG.CLOUD.BLACKLIST_URL + (CONFIG.CLOUD.BLACKLIST_URL.includes('?') ? '&' : '?') + '_=' + t,
            onload: function(response) {
                if (response.status === 200) {
                    const text = response.responseText;
                    if (text && text.length > 0) {
                        const cleanList = text.replace(/[\r\n\s]+/g, ',').replace(/，/g, ',');
                        state.blacklist = cleanList;
                        GM_setValue('blacklist', cleanList);
                        cleanHistoryWithBlacklist();
                        if(!silent) log('隔离库同步并清洗完成', 'success');
                    }
                }
            }
        });
    };

    const startRapidRefresh = () => {
        if (state.rapidTimer) return;
        state.rapidTimer = setInterval(() => {
            if (state.manualPause) return;
            const btn = document.querySelector('.el-icon-refresh')?.closest('button');
            if (btn) btn.click();
        }, CONFIG.DISPATCH.RAPID_INTERVAL);
    };
    const stopRapidRefresh = () => { if (state.rapidTimer) { clearInterval(state.rapidTimer); state.rapidTimer = null; } };

    const performAction = () => {
        if (state.manualPause) return;
        let selector = null;
        if (isOrderPage()) selector = CONFIG.ORDER.BUTTON_SELECTOR;
        else if (isDriverPage()) selector = CONFIG.DRIVER.BUTTON_SELECTOR;
        let btn = document.querySelector(selector);
        if (!btn && isOrderPage()) btn = document.querySelector(CONFIG.ORDER.ALT_SELECTOR)?.closest('button');
        if (!btn && isDriverPage()) btn = document.querySelector(CONFIG.DRIVER.ALT_SELECTOR)?.closest('button');
        if (btn) {
            btn.click();
            state.countdown = state.refreshInterval; 
        }
    };

    const startCountdown = () => {
        if (state.timerId) clearInterval(state.timerId);
        state.countdown = state.refreshInterval;
        updateStatusText();
        state.timerId = setInterval(() => {
            if (state.manualPause) return;
            state.countdown--;
            updateStatusText(); 
            if (state.countdown <= 0) {
                performAction();
                state.countdown = state.refreshInterval; 
            }
        }, 1000);
    };
    const stopCountdown = () => { if (state.timerId) { clearInterval(state.timerId); state.timerId = null; } updateStatusText(); };

    const parseTextToHistory = (fullText) => {
        if (!fullText || !fullText.trim()) return false;
        const blockers = state.blacklist.split(/[,，]/).map(s => s.trim()).filter(s => s);
        let hasUpdate = false;

        const phoneRegex = /(?:^|[^\d])(1\d{10})(?:$|[^\d])/g;
        let phoneMatch;
        let tempTextForPhone = fullText;
        
        while ((phoneMatch = phoneRegex.exec(tempTextForPhone)) !== null) {
            const num = phoneMatch[1];
            if (/^1\d{10}$/.test(num)) {
                if (!state.history.phones) state.history.phones = [];
                const existIdx = state.history.phones.indexOf(num);
                if (existIdx > -1) state.history.phones.splice(existIdx, 1);
                state.history.phones.unshift(num);
                hasUpdate = true;
                log('提取电话: ' + num, 'success');
            }
        }

        let addrText = fullText.replace(phoneRegex, ' ').trim();
        const segments = addrText.split(/[\r\n,;，；]+/); 
        const symbolRegex = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`·！@#￥%……&*（）—+={}|【】；：‘’“”、，。《》？]/;

        segments.reverse().forEach(seg => {
            const cleanSeg = seg.trim();
            if (!cleanSeg || cleanSeg.length < 2) return;
            const firstChar = cleanSeg.charAt(0);
            if (/[0-9]/.test(firstChar) || /[a-zA-Z]/.test(firstChar) || symbolRegex.test(firstChar)) return; 
            if (blockers.some(keyword => cleanSeg.includes(keyword))) return;

            if (!state.history.addrs) state.history.addrs = [];
            const existIdx = state.history.addrs.indexOf(cleanSeg);
            if (existIdx > -1) state.history.addrs.splice(existIdx, 1);
            state.history.addrs.unshift(cleanSeg);
            hasUpdate = true;
            log('提取地址: ' + cleanSeg.substring(0, 6) + '...', 'info');
        });

        if (state.history.phones && state.history.phones.length > CONFIG.CLIPBOARD.MAX_HISTORY) state.history.phones.length = CONFIG.CLIPBOARD.MAX_HISTORY;
        if (state.history.addrs && state.history.addrs.length > CONFIG.CLIPBOARD.MAX_HISTORY) state.history.addrs.length = CONFIG.CLIPBOARD.MAX_HISTORY;

        return hasUpdate;
    };

    const processClipboard = async () => {
        try {
            const text = await navigator.clipboard.readText();
            if (parseTextToHistory(text)) {
                GM_setValue('clipHistory', JSON.stringify(state.history));
                updateListsUI();
            }
        } catch (e) {}
    };

    const fillInput = (type, value) => {
        if (type === 'phone') {
            if (!/^1\d{10}$/.test(value)) {
                alert('电话不对：必须是11位数字且以1开头');
                return;
            }
        }
        let input = null;
        if (type === 'address') {
             input = document.querySelector('input[id="tipinput"]') || 
                     document.querySelector('input[placeholder*="搜索"]') ||
                     document.querySelector('input[placeholder*="请输入关键字"]');
             if (!input) {
                 const inputs = document.querySelectorAll('input');
                 for (let i = 0; i < inputs.length; i++) {
                     if (!inputs[i].closest('.el-form-item')) { input = inputs[i]; break; }
                 }
             }
        } else if (type === 'phone') {
             input = document.querySelector('input[placeholder*="用户电话"]') || 
                     document.querySelector('input[placeholder*="电话"]');
        }

        if (input) {
            input.value = value;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
            input.style.transition = 'all 0.3s';
            input.style.boxShadow = '0 0 0 2px rgba(103, 194, 58, 0.3)';
            setTimeout(() => input.style.boxShadow = '', 800);
        } else {
            alert(`找不到${type==='address'?'地址':'电话'}框`);
        }
    };

    const setSliderValue = (targetValue) => {
        const MAX_VAL = 20; 
        const calibrationMap = { 2: 1, 3: 2, 5: 4, 10: 10, 20: 20 };
        const calcValue = calibrationMap[targetValue] !== undefined ? calibrationMap[targetValue] : targetValue;
        const sliderDiv = document.querySelector('.el-slider'); 
        if (!sliderDiv) return;
        const runway = sliderDiv.querySelector('.el-slider__runway');
        if (runway) {
            const rect = runway.getBoundingClientRect();
            let percentage = calcValue / MAX_VAL; 
            if (percentage > 1) percentage = 1; if (percentage < 0) percentage = 0;
            const clientX = rect.left + (rect.width * percentage);
            const clientY = rect.top + (rect.height / 2);
            const win = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
            const eventOpts = { bubbles: true, cancelable: true, view: win, clientX: clientX, clientY: clientY };
            try {
                runway.dispatchEvent(new MouseEvent('mousemove', eventOpts));
                runway.dispatchEvent(new MouseEvent('mousedown', eventOpts));
                runway.dispatchEvent(new MouseEvent('mouseup', eventOpts));
                runway.dispatchEvent(new MouseEvent('click', eventOpts));
            } catch (e) { }
        }
    };

    // --------------- 4. UI 界面 ---------------

    const applyLayout = () => {
        const sideCol = document.getElementById('gj-side-col');
        const listBody = document.getElementById('list-addr-body');
        if (sideCol && listBody) {
            sideCol.style.width = state.layout.width + 'px';
            listBody.style.height = state.layout.height + 'px';
        }
    };

    const createWidget = () => {
        const old = document.getElementById('gj-widget');
        if (old) old.remove();

        const widget = document.createElement('div');
        widget.id = 'gj-widget';
        applyPos(widget, state.uiPos);
        widget.style.transform = `scale(${state.uiScale})`;
        widget.style.transformOrigin = 'top left';

        widget.innerHTML = `
            <div id="gj-main-col" style="position:relative;">
                <div class="gj-header">
                    <div style="display:flex;align-items:center;gap:6px;">
                        <span style="font-size:16px;">🤖</span>
                        <span id="gj-title-text">...</span>
                    </div>
                    <span class="gj-toggle">${state.isCollapsed ? '➕' : '➖'}</span>
                </div>
                <div id="gj-main-content" style="display: ${state.isCollapsed ? 'none' : 'block'}"></div>
                <!-- 1. 主界面缩放手柄 -->
                <div id="gj-scale-handle" class="gj-resize-handle" title="拖拽缩放界面"></div>
            </div>
            
            <div id="gj-side-col" style="display:none; width:${state.layout.width}px; position:relative;">
                <div class="gj-side-box" style="flex:1; display:flex; flex-direction:column;">
                    <div class="gj-side-header">
                        <span>📍 地址库 (拖拽右下角调整)</span>
                        <span class="btn-icon-circle" id="btn-refresh-addr" title="刷新/读取剪贴板">↻</span>
                    </div>
                    <div class="gj-list-body" id="list-addr-body" style="height:${state.layout.height}px;"></div>
                </div>
                
                <div class="gj-side-box" style="margin-top:5px; padding:5px;">
                    <input id="gj-magic-input" placeholder="📋 粘贴..." class="gj-magic-input">
                </div>

                <!-- 2. 地址库尺寸手柄 -->
                <div id="gj-size-handle" class="gj-resize-handle" title="拖拽调整宽高"></div>
            </div>
        `;

        document.body.appendChild(widget);
        addStyles();
        setupDrag(widget);          // 移动整个窗口
        setupScaleDrag(widget);     // 拖拽缩放
        setupResizeDrag(widget);    // 拖拽改变尺寸
        
        widget.querySelector('.gj-toggle').addEventListener('click', (e) => {
            e.stopPropagation();
            state.isCollapsed = !state.isCollapsed;
            GM_setValue('uiCollapsed', state.isCollapsed);
            updateUI();
        });

        widget.querySelector('#btn-refresh-addr').addEventListener('click', processClipboard);

        const magicInput = widget.querySelector('#gj-magic-input');
        magicInput.addEventListener('input', (e) => {
            const val = e.target.value;
            if (val && val.trim()) {
                if (/^\d+$/.test(val.trim()) && !/^1\d{10}$/.test(val.trim())) {
                    // 仅数字但非手机号，静默
                }
                if (parseTextToHistory(val)) {
                    GM_setValue('clipHistory', JSON.stringify(state.history));
                    updateListsUI();
                    e.target.value = ''; 
                    e.target.classList.add('success');
                    setTimeout(() => e.target.classList.remove('success'), 500);
                } else {
                    if (/^\d+$/.test(val.trim()) && !/^1\d{10}$/.test(val.trim())) {
                         alert("电话不对：请输入11位以1开头的数字");
                         e.target.value = '';
                    }
                }
            }
        });

        return widget;
    };

    const updateUI = () => {
        let widget = document.getElementById('gj-widget');
        if (!widget) widget = createWidget();

        const titleSpan = document.getElementById('gj-title-text');
        if (isOrderPage()) titleSpan.textContent = CONFIG.ORDER.TITLE;
        else if (isDriverPage()) titleSpan.textContent = CONFIG.DRIVER.TITLE;
        else if (isDispatchPage()) titleSpan.textContent = CONFIG.DISPATCH.TITLE;
        else titleSpan.textContent = "助手待机";

        const mainContent = document.getElementById('gj-main-content');
        const sideCol = document.getElementById('gj-side-col');
        const scaleHandle = document.getElementById('gj-scale-handle');
        
        mainContent.style.display = state.isCollapsed ? 'none' : 'block';
        scaleHandle.style.display = state.isCollapsed ? 'none' : 'block';
        
        if (isDispatchPage() && !state.isCollapsed) {
            sideCol.style.display = 'flex';
            updateListsUI(); 
        } else {
            sideCol.style.display = 'none';
        }

        renderMainContent(mainContent);
        updateStatusText();
    };

    const renderMainContent = (container) => {
        let html = '';
        if (isOrderPage() || isDriverPage()) {
            const btnClass = state.manualPause ? 'btn-resume' : 'btn-pause';
            const btnText = state.manualPause ? '▶ 恢复运行' : '⏸ 暂停刷新';
            const statusColor = state.manualPause ? '#909399' : '#409EFF';
            
            html = `
                <div style="display:flex; justify-content:center; align-items:baseline; margin-bottom:10px;">
                    <span class="gj-timer-text" style="color:${statusColor}">${state.manualPause ? '暂停' : state.countdown + '<span style="font-size:12px;margin-left:2px">s</span>'}</span>
                </div>
                <button id="gj-btn-toggle" class="gj-btn ${btnClass}">${btnText}</button>
                <div class="gj-control-row">
                    <span style="color:#606266;font-size:12px;">刷新间隔</span>
                    <div style="display:flex;align-items:center;">
                        <input type="number" id="gj-input-interval" value="${state.refreshInterval}" class="gj-input-mini">
                        <button id="gj-btn-set" class="gj-btn-icon">🆗</button>
                    </div>
                </div>
            `;
        } else if (isDispatchPage()) {
            const buttonsHtml = CONFIG.DISPATCH.PRESETS.map(num => 
                `<button class="btn-preset" data-val="${num}">${num}</button>`
            ).join('');
            
            html = `
                <div class="gj-group">
                    <button id="btn-auto-addr" class="gj-btn btn-green">📌 填最新地址</button>
                    <button id="btn-auto-phone" class="gj-btn btn-blue">📞 填最新电话</button>
                </div>
                <div class="gj-divider">
                    <span class="gj-label-sm">AI 距离 (${state.timeConfig.start}-${state.timeConfig.end} 2km)</span>
                </div>
                <div class="gj-grid-btns">${buttonsHtml}</div>
                
                <div class="gj-bottom-controls">
                    <button id="btn-sync-cloud" class="gj-btn-text">☁️ 同步配置</button>
                    <span style="font-size:10px;color:#ccc;">缩放: ${(state.uiScale*100).toFixed(0)}%</span>
                </div>
            `;
        } else {
            html = `<div style="padding:20px;color:#999;text-align:center;font-size:13px;">💤 非工作区域</div>`;
        }
        container.innerHTML = html;
        bindEvents();
    };

    const updateListsUI = () => {
        const renderItem = (item, type) => 
            `<div class="gj-list-item" title="${item}" data-val="${item}" data-type="${type}">
                ${type==='address' ? '' : '📞'}
                <span class="gj-item-text">${item}</span>
            </div>`;
        const addrBody = document.getElementById('list-addr-body');
        
        if(addrBody) {
            const list = state.history.addrs || [];
            addrBody.innerHTML = list.map(i => renderItem(i, 'address')).join('') || '<div class="gj-empty">空</div>';
            addrBody.querySelectorAll('.gj-list-item').forEach(el => el.addEventListener('click', () => fillInput('address', el.dataset.val)));
        }
    };

    const bindEvents = () => {
        if (isDispatchPage()) {
            document.querySelectorAll('.btn-preset').forEach(btn => 
                btn.addEventListener('click', (e) => setSliderValue(parseInt(e.target.dataset.val)))
            );
            document.getElementById('btn-auto-addr')?.addEventListener('click', () => {
                if(state.history.addrs && state.history.addrs[0]) fillInput('address', state.history.addrs[0]);
            });
            document.getElementById('btn-auto-phone')?.addEventListener('click', () => {
                if(state.history.phones && state.history.phones[0]) fillInput('phone', state.history.phones[0]);
            });
            document.getElementById('btn-sync-cloud')?.addEventListener('click', () => {
                fetchOnlineBlacklist(false);
            });
        }
        
        if (document.getElementById('gj-btn-toggle')) {
            document.getElementById('gj-btn-toggle').addEventListener('click', () => {
                state.manualPause = !state.manualPause;
                GM_setValue('manualPause', state.manualPause);
                updateUI();
            });
            document.getElementById('gj-btn-set').addEventListener('click', () => {
                const val = parseInt(document.getElementById('gj-input-interval').value);
                if (val > 0) {
                    state.refreshInterval = val;
                    if(isOrderPage()) GM_setValue('orderInterval', val);
                    if(isDriverPage()) GM_setValue('driverInterval', val);
                    performAction(); startCountdown();
                }
            });
        }
    };

    const updateStatusText = () => {
        const text = document.querySelector('.gj-timer-text');
        if (text) {
            if (state.manualPause) { text.textContent = "暂停"; text.style.color = "#909399"; }
            else { 
                text.innerHTML = `${state.countdown}<span style="font-size:16px;margin-left:2px;opacity:0.6">s</span>`; 
                text.style.color = state.countdown <= 3 ? "#F56C6C" : "#409EFF"; 
            }
        }
    };

    const log = (text, type) => { console.log(`[助手] ${text}`); };

    const applyPos = (el, pos) => {
        if (pos.left) { el.style.left = pos.left; el.style.right = 'auto'; }
        else { el.style.right = pos.right || '20px'; el.style.left = 'auto'; }
        if (pos.top) { el.style.top = pos.top; el.style.bottom = 'auto'; }
        else { el.style.bottom = pos.bottom || 'auto'; el.style.top = 'auto'; }
    };

    // 拖拽移动窗口
    const setupDrag = (el) => {
        const header = el.querySelector('.gj-header'); 
        let isDragging = false, startX, startY, rect;
        header.addEventListener('mousedown', e => {
            if(e.target.closest('.gj-toggle')) return;
            isDragging = true; startX = e.clientX; startY = e.clientY;
            rect = el.getBoundingClientRect();
            header.style.cursor = 'grabbing';
            el.style.transition = 'none';
        });
        document.addEventListener('mousemove', e => {
            if (!isDragging) return;
            const dx = (e.clientX - startX) / state.uiScale;
            const dy = (e.clientY - startY) / state.uiScale;
            el.style.left = (rect.left + dx) + 'px';
            el.style.top = (rect.top + dy) + 'px';
            el.style.right = 'auto'; el.style.bottom = 'auto';
        });
        document.addEventListener('mouseup', () => {
            if(isDragging) {
                isDragging = false; header.style.cursor = 'grab';
                el.style.transition = 'transform 0.1s';
                state.uiPos = {left: el.style.left, top: el.style.top};
                GM_setValue('uiPos', JSON.stringify(state.uiPos));
            }
        });
    };

    // 拖拽缩放 (UI Scale)
    const setupScaleDrag = (el) => {
        const handle = el.querySelector('#gj-scale-handle');
        if(!handle) return;
        let isResizing = false, startY, startScale;
        handle.addEventListener('mousedown', e => {
            e.stopPropagation(); e.preventDefault();
            isResizing = true; startY = e.clientY; startScale = state.uiScale;
            document.body.style.cursor = 'nwse-resize';
        });
        document.addEventListener('mousemove', e => {
            if (!isResizing) return;
            const dy = e.clientY - startY;
            // 向下拉增大，向上拉减小
            let newScale = startScale + (dy * 0.005);
            if(newScale < 0.5) newScale = 0.5;
            if(newScale > 3.0) newScale = 3.0;
            state.uiScale = newScale;
            el.style.transform = `scale(${newScale})`;
            // 实时更新UI上的百分比显示
            const label = el.querySelector('.gj-bottom-controls span');
            if(label) label.textContent = `缩放: ${(newScale*100).toFixed(0)}%`;
        });
        document.addEventListener('mouseup', () => {
            if (isResizing) {
                isResizing = false; document.body.style.cursor = 'default';
                GM_setValue('uiScale', state.uiScale);
            }
        });
    };

    // 拖拽改变尺寸 (Address List Size)
    const setupResizeDrag = (el) => {
        const handle = el.querySelector('#gj-size-handle');
        if(!handle) return;
        let isResizing = false, startX, startY, startW, startH;
        handle.addEventListener('mousedown', e => {
            e.stopPropagation(); e.preventDefault();
            isResizing = true; 
            startX = e.clientX; startY = e.clientY;
            startW = state.layout.width; startH = state.layout.height;
            document.body.style.cursor = 'nwse-resize';
        });
        document.addEventListener('mousemove', e => {
            if (!isResizing) return;
            // 因为整体有 scale，所以位移需要除以 scale 才是真实的像素变化
            const dx = (e.clientX - startX) / state.uiScale;
            const dy = (e.clientY - startY) / state.uiScale;
            
            let newW = startW + dx;
            let newH = startH + dy;
            
            if(newW < 150) newW = 150;
            if(newH < 100) newH = 100;
            
            state.layout.width = newW;
            state.layout.height = newH;
            applyLayout();
        });
        document.addEventListener('mouseup', () => {
            if (isResizing) {
                isResizing = false; document.body.style.cursor = 'default';
                GM_setValue('uiLayout', JSON.stringify(state.layout));
            }
        });
    };

    const addStyles = () => {
        GM_addStyle(`
            #gj-widget {
                position: fixed; z-index: 99999;
                display: flex; align-items: flex-start;
                font-family: "Helvetica Neue", Helvetica, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", Arial, sans-serif;
                font-size: 14px; user-select: none;
                filter: drop-shadow(0 4px 12px rgba(0,0,0,0.15));
            }
            #gj-main-col {
                width: 250px; background: #fff; border-radius: 12px; 
                overflow: hidden; display:flex; flex-direction:column;
            }
            #gj-side-col {
                /* width 由 js 动态控制 */
                margin-left: 8px; display: flex; flex-direction: column; gap: 6px;
            }
            .gj-header {
                padding: 12px 16px; 
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: #fff;
                display: flex; justify-content: space-between; align-items: center;
                cursor: grab; font-weight: 600; font-size: 15px;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            }
            .gj-toggle { cursor: pointer; opacity:0.8; transition:opacity 0.2s; font-size:12px; }
            
            #gj-main-content { padding: 16px; background:#fff; position: relative;}
            .gj-timer-text { font-size: 38px; font-weight: 700; line-height:1; letter-spacing: -1px; }
            
            .gj-btn {
                width: 100%; border: none; padding: 10px; border-radius: 8px; 
                cursor: pointer; font-weight: 600; font-size: 14px;
                transition: all 0.2s; box-shadow: 0 2px 6px rgba(0,0,0,0.1);
                display:flex; justify-content:center; align-items:center; gap:5px;
            }
            .gj-btn:active { transform: scale(0.98); }
            .btn-pause { background: #fff1f0; color: #f56c6c; border:1px solid #fde2e2; }
            .btn-resume { background: #f0f9eb; color: #67c23a; border:1px solid #e1f3d8; }
            .btn-green { background: linear-gradient(135deg, #42e695 0%, #3bb2b8 100%); color: white; }
            .btn-blue { background: linear-gradient(135deg, #f56c6c 0%, #f78989 100%); color: white; } 
            
            .gj-control-row { display: flex; justify-content: space-between; align-items: center; margin-top: 15px; padding: 0 2px;}
            .gj-input-mini { 
                width: 45px; border: 1px solid #dcdfe6; border-radius: 6px; 
                text-align: center; padding: 4px; font-size:13px; outline:none;
                background: #f8f9fa; transition: all 0.2s;
            }
            .gj-input-mini:focus { border-color: #409EFF; background: #fff; }
            .gj-btn-icon { border:none; background:transparent; cursor:pointer; font-size:16px; padding:0 5px; }
            .gj-btn-text { border:none; background:transparent; cursor:pointer; font-size:11px; color:#909399; }
            .gj-group { display:flex; flex-direction:column; gap:8px; margin-bottom:12px; }
            .gj-divider { display:flex; align-items:center; margin: 10px 0 6px 0; }
            .gj-divider::before, .gj-divider::after { content:''; flex:1; height:1px; background:#ebeef5; }
            .gj-label-sm { font-size: 11px; color: #909399; margin: 0 8px; white-space:nowrap;}
            .gj-grid-btns { display: grid; grid-template-columns: repeat(5, 1fr); gap: 5px; }
            .btn-preset { 
                background: #f4f6f8; border: 1px solid #e4e7ed; color: #606266; 
                padding: 6px 0; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight:600;
            }
            .btn-preset:hover { background: #ecf5ff; border-color: #b3d8ff; color: #409EFF; }
            .gj-bottom-controls { display:flex; justify-content:space-between; align-items:center; margin-top:12px; padding-top:10px; border-top:1px dashed #ebeef5; }
            
            /* 侧边栏样式 */
            .gj-side-box {
                background: #fff; border-radius: 10px; overflow: hidden;
                box-shadow: 0 2px 8px rgba(0,0,0,0.05); display:flex; flex-direction:column;
            }
            .gj-side-header {
                padding: 8px 10px; font-size: 12px; font-weight: 700; color:#303133;
                background:#fbfbfc; border-bottom:1px solid #f0f0f0;
                display: flex; justify-content: space-between; align-items: center;
            }
            .btn-icon-circle { 
                width:18px; height:18px; border-radius:50%; background:#f0f2f5; 
                display:flex; align-items:center; justify-content:center; 
                cursor:pointer; color:#909399; font-size:12px;
            }
            .btn-icon-circle:hover { background:#409EFF; color:white; }

            .gj-list-body { 
                overflow-y: auto; 
                display: grid;
                /* 自动分列的核心: 最小宽度70px，一行能排几个排几个 */
                grid-template-columns: repeat(auto-fill, minmax(65px, 1fr));
                gap: 1px; background: #f0f2f5; padding: 1px;
                transition: height 0.05s;
            }
            .gj-list-body::-webkit-scrollbar { width: 4px; }
            .gj-list-body::-webkit-scrollbar-thumb { background: #dcdfe6; border-radius: 2px; }
            
            .gj-list-item {
                background: #fff; padding: 6px 2px; 
                cursor: pointer; font-size: 11px; color: #606266;
                display: flex; align-items: center; justify-content: center;
                white-space: nowrap; overflow: hidden; text-overflow: ellipsis; 
            }
            .gj-list-item:hover { background: #ecf5ff; color: #409EFF; }
            .gj-item-text { overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
            .gj-empty { grid-column: 1 / -1; text-align: center; color: #c0c4cc; padding: 20px; font-size: 11px; background: #fff;}
            
            .gj-magic-input {
                width: 100%; box-sizing: border-box; 
                border: 1px solid #dcdfe6; border-radius: 6px; 
                padding: 6px 8px; font-size: 12px; outline: none;
            }
            .gj-magic-input:focus { border-color: #409EFF; }
            .gj-magic-input.success { background: #f0f9eb; border-color: #67c23a; }

            /* 拖拽手柄样式 - 模仿 Windows 右下角 */
            .gj-resize-handle {
                position: absolute;
                bottom: 1px;
                right: 1px;
                width: 12px;
                height: 12px;
                cursor: nwse-resize;
                /* 使用渐变画出三角形防滑纹 */
                background: linear-gradient(135deg, transparent 50%, #909399 50%);
                opacity: 0.5;
                z-index: 10;
                clip-path: polygon(100% 0, 100% 100%, 0 100%);
            }
            .gj-resize-handle:hover {
                background: linear-gradient(135deg, transparent 50%, #409EFF 50%);
                opacity: 1;
            }
        `);
    };

    const init = () => {
        addStyles();
        checkPage();
        window.addEventListener('hashchange', checkPage);
        if(isDispatchPage()) setTimeout(applyDistanceByTime, 2000);

        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                if ((isOrderPage() || isDriverPage()) && !state.manualPause) performAction();
                if (isDispatchPage()) processClipboard();
            }
        });
        window.addEventListener('focus', () => { if (isDispatchPage()) processClipboard(); });
        setTimeout(checkPage, 1000); 
    };

    if (document.readyState === 'complete' || document.readyState === 'interactive') init();
    else window.addEventListener('load', init);
})();