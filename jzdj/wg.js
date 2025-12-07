// ==UserScript==
// @name          代驾调度系统助手
// @namespace     http://tampermonkey.net/
// @version       9.1
// @description   启动自动比对云端版本号；根据时间段自动设置初始距离(2km/3km)；移除电话库，地址库双列显示；保留剪贴板智能解析。
// @author        郭
// @match         https://admin.v3.jiuzhoudaijiaapi.cn/*
// @updateURL     https://github.abcai.online/share/hc990275%2Fyhjs%2Fmain%2Fjzdj%2Fwg.js?sign=voi9t7&t=1765094363251
// @downloadURL   https://github.abcai.online/share/hc990275%2Fyhjs%2Fmain%2Fjzdj%2Fwg.js?sign=voi9t7&t=1765094363251
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
            DEFAULT_INTERVAL: 30, 
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
            // 云端文件格式：第一行版本号，第二行开始时间(HH:mm)，第三行结束时间(HH:mm)
            VERSION_CHECK_URL: "https://github.abcai.online/share/hc990275%2Fyhjs%2Fmain%2Fjzdj%2Fbb?sign=65b8wq&t=1765094665264",
            SCRIPT_DOWNLOAD_URL: "https://github.abcai.online/share/hc990275%2Fyhjs%2Fmain%2Fjzdj%2Fwg.js?sign=voi9t7&t=1765094363251",
            BLACKLIST_URL: "https://github.abcai.online/share/hc990275%2Fyhjs%2Fmain%2Fjzdj%2Fglk?sign=nfpvws&t=1765094235754"
        },
        CLIPBOARD: { MAX_HISTORY: 20 } // 地址库容量增加
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
        // 移除电话历史，只保留地址
        history: JSON.parse(GM_getValue('clipHistory', '{"addrs":[]}')),
        blacklist: GM_getValue('blacklist', '师傅,马上,联系,收到,好的,电话,不用,微信'),
        currentVersion: GM_info.script.version,
        newVersionAvailable: null,
        // 时间配置，默认值防止首次读取失败
        timeConfig: JSON.parse(GM_getValue('timeConfig', '{"start":"20:00", "end":"22:00"}'))
    };

    // --------------- 3. 核心逻辑 ---------------

    const checkPage = () => {
        state.currentHash = window.location.hash;

        if (isOrderPage()) {
            state.refreshInterval = GM_getValue('orderInterval', CONFIG.ORDER.DEFAULT_INTERVAL);
        } else if (isDriverPage()) {
            state.refreshInterval = GM_getValue('driverInterval', CONFIG.DRIVER.DEFAULT_INTERVAL);
        } else if (isDispatchPage()) {
            state.refreshInterval = CONFIG.DISPATCH.RAPID_INTERVAL / 1000; 
            fetchOnlineBlacklist(true);
            // 每次切换到指派页面检测一次是否需要设置距离（针对页面内路由跳转的情况）
            // 如果是F5刷新，init()里已经执行过了，这里多执行一次无妨，因为会有延时
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

    // [逻辑] 云端配置检测 (版本 + 时间段)
    const checkCloudConfig = () => {
        log(`读取云端配置...`, 'info');
        GM_xmlhttpRequest({
            method: "GET",
            url: CONFIG.CLOUD.VERSION_CHECK_URL,
            onload: function(response) {
                if (response.status === 200) {
                    const text = response.responseText.trim();
                    const lines = text.split(/[\r\n]+/); // 按行分割
                    
                    // 1. 解析版本号
                    if (lines.length > 0) {
                        const cloudVerStr = lines[0].trim();
                        const cloudVer = parseFloat(cloudVerStr);
                        const localVer = parseFloat(state.currentVersion);
                        if (!isNaN(cloudVer) && cloudVer > localVer) {
                            state.newVersionAvailable = cloudVerStr;
                            updateUI();
                        }
                    }

                    // 2. 解析时间段
                    if (lines.length >= 3) {
                        const newTimeConfig = {
                            start: lines[1].trim(),
                            end: lines[2].trim()
                        };
                        // 简单的格式校验
                        if (newTimeConfig.start.includes(':') && newTimeConfig.end.includes(':')) {
                            state.timeConfig = newTimeConfig;
                            GM_setValue('timeConfig', JSON.stringify(newTimeConfig));
                            log(`时间段已更新: ${newTimeConfig.start} - ${newTimeConfig.end}`, 'success');
                        }
                    }
                }
            }
        });
    };

    // [逻辑] 根据时间设置距离 (刷新页面时触发)
    const applyDistanceByTime = () => {
        if (!isDispatchPage()) return;
        
        const now = new Date();
        const currentH = now.getHours();
        const currentM = now.getMinutes();
        const currentVal = currentH * 60 + currentM; // 当前分钟数

        const parseTime = (str) => {
            const parts = str.split(':');
            return parseInt(parts[0]) * 60 + parseInt(parts[1]);
        };

        const startVal = parseTime(state.timeConfig.start);
        const endVal = parseTime(state.timeConfig.end);

        // 逻辑：20:00(含) 到 22:00(不含) 之间
        // 如果跨天（比如 23:00 到 02:00），逻辑需要调整，这里假设是同天的时间段
        let targetKm = 3; // 默认3公里
        
        if (currentVal >= startVal && currentVal < endVal) {
            targetKm = 2;
            log(`当前是高峰时段 (${state.timeConfig.start}-${state.timeConfig.end})，自动设为 2km`, 'success');
        } else {
            targetKm = 3;
            log(`当前是平时时段，自动设为 3km`, 'info');
        }

        setSliderValue(targetKm);
    };

    const fetchOnlineBlacklist = (silent = false) => {
        GM_xmlhttpRequest({
            method: "GET",
            url: CONFIG.CLOUD.BLACKLIST_URL,
            onload: function(response) {
                if (response.status === 200) {
                    const text = response.responseText;
                    if (text && text.length > 0) {
                        const cleanList = text.replace(/[\r\n\s]+/g, ',').replace(/，/g, ',');
                        state.blacklist = cleanList;
                        GM_setValue('blacklist', cleanList);
                        if(!silent) log('隔离库已更新', 'success');
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

    const performAction = (reason) => {
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
                performAction("定时触发");
                state.countdown = state.refreshInterval; 
            }
        }, 1000);
    };
    const stopCountdown = () => { if (state.timerId) { clearInterval(state.timerId); state.timerId = null; } updateStatusText(); };

    // [逻辑] 解析文本 (只提取地址)
    const parseTextToHistory = (fullText) => {
        if (!fullText || !fullText.trim()) return false;
        
        const blockers = state.blacklist.split(/[,，]/).map(s => s.trim()).filter(s => s);
        let hasUpdate = false;

        // 1. 移除所有手机号 (避免干扰，但不存储)
        const phoneRegex = /(?:^|[^\d])(1\d{10})(?:$|[^\d])/g;
        let addrText = fullText.replace(phoneRegex, ' ').trim();

        // 2. 提取地址
        const segments = addrText.split(/[\r\n,;，；]+/); // 按常见分隔符切分

        segments.reverse().forEach(seg => {
            const cleanSeg = seg.trim();
            if (!cleanSeg || cleanSeg.length < 2) return;
            if (/^\d+$/.test(cleanSeg)) return; 
            if (blockers.some(keyword => cleanSeg.includes(keyword))) return;

            // 兼容旧数据结构，如果没有addrs属性
            if (!state.history.addrs) state.history.addrs = [];

            const existIdx = state.history.addrs.indexOf(cleanSeg);
            if (existIdx > -1) state.history.addrs.splice(existIdx, 1);
            state.history.addrs.unshift(cleanSeg);
            hasUpdate = true;
            log('提取地址: ' + cleanSeg.substring(0, 6) + '...', 'info');
        });

        // 3. 截断长度
        if (state.history.addrs.length > CONFIG.CLIPBOARD.MAX_HISTORY) state.history.addrs.length = CONFIG.CLIPBOARD.MAX_HISTORY;

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
        }
        if (input) {
            input.value = value;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
            input.style.transition = 'background 0.3s';
            input.style.backgroundColor = '#e1f3d8';
            setTimeout(() => input.style.backgroundColor = '', 500);
        } else {
            alert(`找不到地址框`);
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
                
                // 更新UI显示，不提示弹窗，只在控制台
                // log(`已设置距离为 ${targetValue}km`, 'info');
            } catch (e) { }
        }
    };

    // --------------- 4. UI 界面 ---------------

    const createWidget = () => {
        const old = document.getElementById('gj-widget');
        if (old) old.remove();

        const widget = document.createElement('div');
        widget.id = 'gj-widget';
        applyPos(widget, state.uiPos);
        widget.style.transform = `scale(${state.uiScale})`;
        widget.style.transformOrigin = 'top left';

        widget.innerHTML = `
            <div id="gj-main-col">
                <div id="gj-update-bar" style="display:none; background:#f56c6c; color:white; padding:8px; text-align:center; font-weight:bold; cursor:pointer;">
                    🚀 发现新版本 V<span id="gj-new-ver"></span> (点击更新)
                </div>
                <div class="gj-header">
                    <span id="gj-title-text" style="font-size:14px">...</span>
                    <span class="gj-toggle">${state.isCollapsed ? '▼' : '▲'}</span>
                </div>
                <div id="gj-main-content" style="display: ${state.isCollapsed ? 'none' : 'block'}"></div>
            </div>
            <div id="gj-side-col" style="display:none;">
                <div class="gj-side-box">
                    <div class="gj-side-header green">
                        <span>📍 地址库 (点击填)</span>
                        <span class="btn-icon" id="btn-refresh-addr" title="读取剪贴板">↻</span>
                    </div>
                    <div class="gj-list-body" id="list-addr-body"></div>
                </div>
                <!-- 电话库已隐藏 -->
                <div class="gj-side-box" style="margin-top:5px; padding:5px;">
                    <input id="gj-magic-input" placeholder="📋 在此粘贴... (自动解析)" style="width:100%; box-sizing:border-box; border:1px solid #ddd; border-radius:4px; padding:4px; font-size:12px;">
                </div>
            </div>
        `;

        document.body.appendChild(widget);
        addStyles();
        setupDrag(widget);
        
        widget.querySelector('.gj-toggle').addEventListener('click', (e) => {
            e.stopPropagation();
            state.isCollapsed = !state.isCollapsed;
            GM_setValue('uiCollapsed', state.isCollapsed);
            updateUI();
        });

        widget.querySelector('#gj-update-bar').addEventListener('click', () => {
            if (confirm(`检测到新版本 V${state.newVersionAvailable}，是否前往更新？`)) {
                GM_openInTab(CONFIG.CLOUD.SCRIPT_DOWNLOAD_URL, { active: true });
            }
        });

        widget.querySelector('#btn-refresh-addr').addEventListener('click', processClipboard);

        // 万能框输入事件
        const magicInput = widget.querySelector('#gj-magic-input');
        magicInput.addEventListener('input', (e) => {
            const val = e.target.value;
            if (val && val.trim()) {
                if (parseTextToHistory(val)) {
                    GM_setValue('clipHistory', JSON.stringify(state.history));
                    updateListsUI();
                    e.target.value = ''; 
                    e.target.style.background = '#f0f9eb';
                    setTimeout(() => e.target.style.background = '#fff', 300);
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

        const updateBar = document.getElementById('gj-update-bar');
        if (state.newVersionAvailable) {
            updateBar.style.display = 'block';
            document.getElementById('gj-new-ver').textContent = state.newVersionAvailable;
        } else {
            updateBar.style.display = 'none';
        }

        const mainContent = document.getElementById('gj-main-content');
        const sideCol = document.getElementById('gj-side-col');
        
        mainContent.style.display = state.isCollapsed ? 'none' : 'block';
        
        if (isDispatchPage() && !state.isCollapsed) {
            sideCol.style.display = 'block';
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
            const btnText = state.manualPause ? '▶ 恢复' : '⏸ 暂停';
            html = `
                <div class="gj-timer-box">${state.countdown}s</div>
                <button id="gj-btn-toggle" class="${btnClass}">${btnText}</button>
                <div class="gj-row">
                    <span>间隔:</span>
                    <input type="number" id="gj-input-interval" value="${state.refreshInterval}" class="gj-input-mini">
                    <button id="gj-btn-set" class="btn-xs">OK</button>
                </div>
            `;
        } else if (isDispatchPage()) {
            const buttonsHtml = CONFIG.DISPATCH.PRESETS.map(num => 
                `<button class="btn-preset" data-val="${num}">${num}</button>`
            ).join('');
            
            html = `
                <div class="gj-group">
                    <button id="btn-auto-addr" class="btn-big green">📌 填最新地址</button>
                </div>
                <div class="gj-label-sm">⚡ AI距离 (F5刷新自动调 ${state.timeConfig.start}-${state.timeConfig.end})</div>
                <div class="gj-grid-btns">${buttonsHtml}</div>
                
                <div class="gj-bottom-controls">
                    <div style="flex:1; display:flex; align-items:center; gap:5px;">
                        <span style="font-size:11px">🔍缩放:</span>
                        <input type="number" id="gj-scale-input" value="${state.uiScale}" step="0.1" min="0.5" max="3.0" style="width:40px;text-align:center;border:1px solid #ddd;border-radius:4px;font-size:12px;">
                        <button id="btn-set-scale" class="btn-xs">OK</button>
                    </div>
                    <button id="btn-sync-cloud" class="btn-xs">☁️ 同步</button>
                </div>
                <div style="font-size:9px;color:#ccc;text-align:center;margin-top:4px;">当前 V${state.currentVersion}</div>
            `;
        } else {
            html = `<div style="padding:10px;color:#999;text-align:center;">非工作区</div>`;
        }
        container.innerHTML = html;
        bindEvents();
    };

    const updateListsUI = () => {
        const renderItem = (item, type) => 
            `<div class="gj-list-item" title="${item}" data-val="${item}" data-type="${type}">${item}</div>`;
        const addrBody = document.getElementById('list-addr-body');
        
        if(addrBody) {
            // 安全检查，确保 addrs 存在
            const list = state.history.addrs || [];
            addrBody.innerHTML = list.map(i => renderItem(i, 'address')).join('') || '<div class="gj-empty">- 空 -</div>';
            addrBody.querySelectorAll('.gj-list-item').forEach(el => el.addEventListener('click', () => fillInput('address', el.dataset.val)));
        }
    };

    const bindEvents = () => {
        if (isDispatchPage()) {
            document.getElementById('btn-set-scale')?.addEventListener('click', () => {
                const val = parseFloat(document.getElementById('gj-scale-input').value);
                if(val && val >= 0.5 && val <= 3.0) {
                    state.uiScale = val;
                    GM_setValue('uiScale', val);
                    document.getElementById('gj-widget').style.transform = `scale(${val})`;
                } else {
                    alert('请输入 0.5 到 3.0 之间的数值');
                }
            });

            document.querySelectorAll('.btn-preset').forEach(btn => 
                btn.addEventListener('click', (e) => setSliderValue(parseInt(e.target.dataset.val)))
            );
            document.getElementById('btn-auto-addr')?.addEventListener('click', () => {
                if(state.history.addrs[0]) fillInput('address', state.history.addrs[0]);
            });
            document.getElementById('btn-sync-cloud')?.addEventListener('click', () => {
                fetchOnlineBlacklist(false);
                checkCloudConfig();
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
                    performAction("设置更新"); startCountdown();
                }
            });
        }
    };

    const updateStatusText = () => {
        const box = document.querySelector('.gj-timer-box');
        if (box) {
            if (state.manualPause) { box.textContent = "暂停"; box.style.color = "#909399"; }
            else { box.textContent = `${state.countdown}s`; box.style.color = state.countdown <= 3 ? "#F56C6C" : "#409EFF"; }
        }
    };

    const log = (text, type) => { console.log(`[助手] ${text}`); };

    const applyPos = (el, pos) => {
        if (pos.left) { el.style.left = pos.left; el.style.right = 'auto'; }
        else { el.style.right = pos.right || '20px'; el.style.left = 'auto'; }
        if (pos.top) { el.style.top = pos.top; el.style.bottom = 'auto'; }
        else { el.style.bottom = pos.bottom || 'auto'; el.style.top = 'auto'; }
    };

    const setupDrag = (el) => {
        const header = el.querySelector('.gj-header'); 
        let isDragging = false, startX, startY, rect;
        header.addEventListener('mousedown', e => {
            isDragging = true; startX = e.clientX; startY = e.clientY;
            rect = el.getBoundingClientRect();
            header.style.cursor = 'grabbing';
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
                state.uiPos = {left: el.style.left, top: el.style.top};
                GM_setValue('uiPos', JSON.stringify(state.uiPos));
            }
        });
    };

    const addStyles = () => {
        GM_addStyle(`
            #gj-widget {
                position: fixed; z-index: 10000;
                display: flex; align-items: flex-start;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                font-size: 14px; user-select: none;
            }
            #gj-main-col {
                width: 240px; background: #fff; border-radius: 8px; 
                box-shadow: 0 5px 15px rgba(0,0,0,0.2); border: 1px solid #ebeef5; overflow: hidden;
            }
            #gj-side-col {
                width: 300px; /* 增加宽度以适应双列 */
                margin-left: 5px; display: flex; flex-direction: column; gap: 5px;
            }
            .gj-header {
                padding: 10px 12px; background: #F5F7FA; border-bottom: 1px solid #EBEEF5;
                display: flex; justify-content: space-between; align-items: center;
                cursor: grab; font-weight: bold; color: #606266; font-size: 15px; 
            }
            .gj-side-box {
                background: #fff; border-radius: 8px; border: 1px solid #ebeef5; overflow: hidden;
                box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            }
            .gj-side-header {
                padding: 6px 10px; font-size: 13px; font-weight: bold; display: flex; justify-content: space-between;
            }
            .green { background: #f0f9eb; color: #67c23a; }
            .red { background: #fef0f0; color: #f56c6c; }
            
            #gj-main-content { padding: 12px; }
            .gj-timer-box { font-size: 36px; font-weight: bold; color: #409EFF; text-align: center; margin-bottom: 8px; }
            .gj-row { display: flex; align-items: center; justify-content: center; margin-top: 8px; gap: 5px; }
            .gj-input-mini { width: 50px; border: 1px solid #dcdfe6; border-radius: 4px; text-align: center; padding: 4px; font-size:14px;}
            
            .btn-pause, .btn-resume { width: 100%; border: none; padding: 8px; border-radius: 6px; cursor: pointer; color: white; font-weight: bold; font-size: 14px;}
            .btn-pause { background: #F56C6C; } .btn-resume { background: #67C23A; }
            
            .btn-big { width: 100%; border: 1px solid; border-radius: 6px; padding: 10px; margin-bottom: 6px; cursor: pointer; font-weight: bold; font-size: 14px; }
            .btn-big.green { background: #f0f9eb; border-color: #c2e7b0; color: #67c23a; }
            .btn-big.green:hover { background: #67c23a; color: white; }

            .gj-grid-btns { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px; margin-top: 5px; }
            .btn-preset { background: #ECF5FF; border: 1px solid #B3D8FF; color: #409EFF; padding: 8px 0; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight:bold;}
            .btn-preset:hover { background: #409EFF; color: white; }

            /* 地址库双列布局 */
            .gj-list-body { 
                height: 300px; /* 增加高度 */
                overflow-y: auto; background: #fff; 
                display: grid;
                grid-template-columns: 1fr 1fr; /* 双列 */
                gap: 1px;
                background-color: #f0f0f0; /* 边框色 */
            }
            .gj-list-item {
                background: #fff;
                padding: 8px 6px; 
                cursor: pointer; font-size: 12px; color: #333;
                white-space: nowrap; overflow: hidden; text-overflow: ellipsis; 
            }
            .gj-list-item:hover { background: #ecf5ff; color: #409EFF; }
            .gj-empty { grid-column: 1 / -1; text-align: center; color: #ccc; padding: 10px; font-size: 12px; background: #fff; }
            
            .btn-icon { cursor: pointer; font-size: 14px; padding: 0 5px; }
            .btn-xs { font-size: 12px; padding: 3px 8px; border: 1px solid #ddd; background: #fff; border-radius: 4px; cursor: pointer; }
            .gj-label-sm { font-size: 12px; color: #999; margin-top: 8px; }
            .gj-toggle { cursor: pointer; padding: 0 8px; font-size: 14px; }
            .gj-bottom-controls { display:flex; justify-content:space-between; align-items:center; margin-top:10px; padding-top:8px; border-top:1px dashed #eee; }
        `);
    };

    const init = () => {
        addStyles();
        checkCloudConfig(); // 启动时获取版本和时间配置
        checkPage();
        window.addEventListener('hashchange', checkPage);
        // 首次加载如果是在指派页，延迟触发一下时间距离逻辑，确保DOM加载
        if(isDispatchPage()) setTimeout(applyDistanceByTime, 2000);

        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                if ((isOrderPage() || isDriverPage()) && !state.manualPause) performAction("切屏回刷");
                if (isDispatchPage()) processClipboard();
            }
        });
        window.addEventListener('focus', () => { if (isDispatchPage()) processClipboard(); });
        setTimeout(checkPage, 1000); 
    };

    if (document.readyState === 'complete' || document.readyState === 'interactive') init();
    else window.addEventListener('load', init);
})();