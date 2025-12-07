// ==UserScript==
// @name          代驾调度系统助手 V6.0 (三屏联动+隔离库)
// @namespace     http://tampermonkey.net/
// @version       6.0
// @description   UI重构：主控台缩小，地址/电话分离为独立悬浮窗；新增隔离库(黑名单)过滤垃圾信息；保留极速刷新与距离校准。
// @author        郭 + You + Gemini Consultant
// @match         https://admin.v3.jiuzhoudaijiaapi.cn/*
// @grant         GM_setValue
// @grant         GM_getValue
// @grant         GM_addStyle
// @grant         unsafeWindow
// ==/UserScript==

(function() {
    'use strict';

    // --------------- 1. 配置中心 ---------------
    const CONFIG = {
        ORDER: {
            HASH: '#/substituteDrivingOrder',
            DEFAULT_INTERVAL: 20,
            BUTTON_SELECTOR: 'button.el-button.el-button--primary.el-button--small i.el-icon-search',
            ALT_SELECTOR: '.el-icon-search'
        },
        DRIVER: {
            HASH: '#/driverAll',
            DEFAULT_INTERVAL: 30,
            BUTTON_SELECTOR: '.el-icon-refresh',
            ALT_SELECTOR: 'button i.el-icon-refresh'
        },
        DISPATCH: {
            HASH: '#/substituteDrivingDispatch',
            PRESETS: [2, 3, 5, 10, 20],
            RAPID_INTERVAL: 500
        },
        CLIPBOARD: {
            MAX_HISTORY: 15 // 列表显示更多条目
        }
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
        // UI 位置记忆
        posMain: JSON.parse(GM_getValue('posMain', '{"top":"80px","left":"20px"}')),
        posAddr: JSON.parse(GM_getValue('posAddr', '{"top":"80px","right":"20px"}')),
        posPhone: JSON.parse(GM_getValue('posPhone', '{"bottom":"20px","right":"20px"}')),
        // 数据
        history: JSON.parse(GM_getValue('clipHistory', '{"phones":[], "addrs":[]}')),
        blacklist: GM_getValue('blacklist', '师傅,马上,联系,收到,好的,电话,不用') // 默认屏蔽词
    };

    // --------------- 3. 核心逻辑 ---------------

    const checkPage = () => {
        state.currentHash = window.location.hash;

        // 刷新频率逻辑
        if (isOrderPage()) {
            state.refreshInterval = GM_getValue('orderInterval', CONFIG.ORDER.DEFAULT_INTERVAL);
        } else if (isDriverPage()) {
            state.refreshInterval = GM_getValue('driverInterval', CONFIG.DRIVER.DEFAULT_INTERVAL);
        } else if (isDispatchPage()) {
            state.refreshInterval = CONFIG.DISPATCH.RAPID_INTERVAL / 1000;
        }

        updateAllUI(); // 更新所有界面

        // 极速刷新控制
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

    // [逻辑] 刷新系统
    const startRapidRefresh = () => {
        if (state.rapidTimer) return;
        state.rapidTimer = setInterval(() => {
            if (state.manualPause) return;
            const btn = document.querySelector('.el-icon-refresh')?.closest('button');
            if (btn) btn.click();
        }, CONFIG.DISPATCH.RAPID_INTERVAL);
    };
    const stopRapidRefresh = () => {
        if (state.rapidTimer) { clearInterval(state.rapidTimer); state.rapidTimer = null; }
    };
    const performAction = (reason) => {
        if (state.manualPause) return;
        let selector = null;
        if (isOrderPage()) selector = CONFIG.ORDER.BUTTON_SELECTOR;
        else if (isDriverPage()) selector = CONFIG.DRIVER.BUTTON_SELECTOR;
        if (!selector) return;

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
    const stopCountdown = () => {
        if (state.timerId) { clearInterval(state.timerId); state.timerId = null; }
        updateStatusText();
    };

    // [逻辑] 剪贴板 + 隔离库
    const processClipboard = async () => {
        try {
            const text = await navigator.clipboard.readText();
            if (!text || !text.trim()) return;

            const cleanText = text.trim();
            const lastAddr = state.history.addrs[0];
            const lastPhone = state.history.phones[0];

            // 防抖
            if (cleanText === lastAddr || cleanText === lastPhone) return;

            // 1. 判断是否电话 (1开头，11位数字)
            const purePhone = cleanText.replace(/\D/g, '');
            const isPhone = /^1\d{10}$/.test(purePhone);

            if (isPhone) {
                if (purePhone !== lastPhone) {
                    state.history.phones.unshift(purePhone);
                    if (state.history.phones.length > CONFIG.CLIPBOARD.MAX_HISTORY) state.history.phones.pop();
                    log('捕获电话', 'info');
                }
            } else {
                // 2. 隔离库检查 (黑名单)
                // 用逗号或中文逗号分隔关键词
                const blockers = state.blacklist.split(/[,，]/).map(s => s.trim()).filter(s => s);
                const isBlocked = blockers.some(keyword => cleanText.includes(keyword));

                if (isBlocked) {
                    log(`已拦截垃圾信息: ${cleanText.substring(0,6)}...`, 'error');
                    return; // 直接结束，不存入地址库
                }

                if (cleanText !== lastAddr) {
                    state.history.addrs.unshift(cleanText);
                    if (state.history.addrs.length > CONFIG.CLIPBOARD.MAX_HISTORY) state.history.addrs.pop();
                    log('捕获地址', 'info');
                }
            }

            GM_setValue('clipHistory', JSON.stringify(state.history));
            updateListsUI(); // 刷新列表UI

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
        } else if (type === 'phone') {
             input = document.querySelector('input[placeholder*="用户电话"]') ||
                     document.querySelector('input[placeholder*="电话"]');
        }

        if (input) {
            input.value = value;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
            input.style.backgroundColor = '#e1f3d8';
            setTimeout(() => input.style.backgroundColor = '', 500);
            log(`已填入${type}`, 'success');
        } else {
            alert(`找不到${type === 'address'?'地址':'电话'}输入框`);
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

    // --------------- 4. UI 界面 (三屏联动) ---------------

    // 创建或更新所有 UI
    const updateAllUI = () => {
        // 主控台
        if (!document.getElementById('gj-main-panel')) createMainPanel();
        else updateMainContent();

        // 仅在调度页显示 独立库
        if (isDispatchPage() && !state.isCollapsed) {
            if (!document.getElementById('gj-addr-panel')) createAddrPanel();
            if (!document.getElementById('gj-phone-panel')) createPhonePanel();
            updateListsUI();
        } else {
            // 不在调度页或折叠时，隐藏两个副库
            document.getElementById('gj-addr-panel')?.remove();
            document.getElementById('gj-phone-panel')?.remove();
        }
    };

    // --- 1. 主控台 UI ---
    const createMainPanel = () => {
        const div = document.createElement('div');
        div.id = 'gj-main-panel';
        div.className = 'gj-float-window';
        applyPos(div, state.posMain);

        div.innerHTML = `
            <div class="gj-header">
                <span>🤖 调度 V6.0</span>
                <span class="gj-toggle">${state.isCollapsed ? '▼' : '▲'}</span>
            </div>
            <div class="gj-body" id="gj-main-body" style="display: ${state.isCollapsed ? 'none' : 'block'}"></div>
        `;
        document.body.appendChild(div);
        setupDrag(div, 'posMain');

        div.querySelector('.gj-toggle').addEventListener('click', (e) => {
            e.stopPropagation();
            state.isCollapsed = !state.isCollapsed;
            GM_setValue('uiCollapsed', state.isCollapsed);
            div.querySelector('#gj-main-body').style.display = state.isCollapsed ? 'none' : 'block';
            updateAllUI(); // 触发副屏显隐
        });
        updateMainContent();
    };

    const updateMainContent = () => {
        const body = document.getElementById('gj-main-body');
        if (!body) return;

        let html = '';
        if (isOrderPage() || isDriverPage()) {
            // 订单/司机页 UI
            const btnClass = state.manualPause ? 'btn-resume' : 'btn-pause';
            const btnText = state.manualPause ? '▶ 恢复' : '⏸ 暂停';
            html = `
                <div class="gj-status-box">
                    <div class="gj-countdown" id="gj-timer-display">--</div>
                </div>
                <button id="gj-btn-toggle" class="${btnClass}">${btnText}</button>
                <div class="gj-setting-row">
                    <span>间隔:</span>
                    <input type="number" id="gj-input-interval" value="${state.refreshInterval}" style="width:40px">
                    <button id="gj-btn-set" class="btn-xs">OK</button>
                </div>
            `;
        } else if (isDispatchPage()) {
            // 调度页 UI (只留控制按钮)
            const buttonsHtml = CONFIG.DISPATCH.PRESETS.map(num =>
                `<button class="btn-preset" data-val="${num}">${num}km</button>`
            ).join('');

            html = `
                <div style="margin-bottom:8px">
                    <button id="btn-auto-addr" class="btn-clipboard btn-addr">📍 填最新地址</button>
                    <button id="btn-auto-phone" class="btn-clipboard btn-phone">📞 填最新电话</button>
                </div>
                <div class="gj-label-row">⚡ AI距离 <span style="font-size:9px;color:#999">(极速)</span></div>
                <div class="gj-grid-btns">${buttonsHtml}</div>
                <div style="margin-top:8px;border-top:1px dashed #eee;padding-top:5px;text-align:right;">
                    <button id="btn-blacklist-cfg" class="btn-xs">⚙️ 隔离设置</button>
                </div>
                <!-- 隔离设置弹窗 (嵌入式) -->
                <div id="gj-blacklist-area" style="display:none; margin-top:5px;">
                    <textarea id="blacklist-input" rows="3" style="width:100%;font-size:11px;" placeholder="输入屏蔽词，用逗号隔开">${state.blacklist}</textarea>
                    <button id="btn-save-blacklist" class="btn-xs" style="width:100%;margin-top:2px;background:#f4f4f5;">保存隔离库</button>
                </div>
            `;
        } else {
            html = `<div style="text-align:center;color:#999;">待机中...</div>`;
        }

        body.innerHTML = html;
        bindMainEvents();
        updateStatusText();
    };

    // --- 2. 地址库 UI (独立悬浮) ---
    const createAddrPanel = () => {
        const div = document.createElement('div');
        div.id = 'gj-addr-panel';
        div.className = 'gj-float-window gj-list-window';
        applyPos(div, state.posAddr);

        div.innerHTML = `
            <div class="gj-header" style="background:#f0f9eb;color:#67c23a;">
                <span>📍 地址库</span>
                <button id="btn-read-addr" class="btn-xs">刷新</button>
            </div>
            <div class="gj-list-body" id="list-addr-body"></div>
        `;
        document.body.appendChild(div);
        setupDrag(div, 'posAddr');
        // 绑定刷新
        div.querySelector('#btn-read-addr').addEventListener('click', processClipboard);
    };

    // --- 3. 电话库 UI (独立悬浮) ---
    const createPhonePanel = () => {
        const div = document.createElement('div');
        div.id = 'gj-phone-panel';
        div.className = 'gj-float-window gj-list-window';
        applyPos(div, state.posPhone);

        div.innerHTML = `
            <div class="gj-header" style="background:#fef0f0;color:#f56c6c;">
                <span>📞 电话库</span>
                <button id="btn-read-phone" class="btn-xs">刷新</button>
            </div>
            <div class="gj-list-body" id="list-phone-body"></div>
        `;
        document.body.appendChild(div);
        setupDrag(div, 'posPhone');
        // 绑定刷新
        div.querySelector('#btn-read-phone').addEventListener('click', processClipboard);
    };

    // 更新列表内容
    const updateListsUI = () => {
        const addrBody = document.getElementById('list-addr-body');
        const phoneBody = document.getElementById('list-phone-body');

        const renderItem = (item, type) =>
            `<div class="gj-list-item" data-val="${item}" data-type="${type}">${item}</div>`;

        if (addrBody) {
            addrBody.innerHTML = state.history.addrs.map(i => renderItem(i, 'address')).join('') || '<div class="gj-empty">无记录</div>';
            addrBody.querySelectorAll('.gj-list-item').forEach(el =>
                el.addEventListener('click', () => fillInput('address', el.dataset.val))
            );
        }
        if (phoneBody) {
            phoneBody.innerHTML = state.history.phones.map(i => renderItem(i, 'phone')).join('') || '<div class="gj-empty">无记录</div>';
            phoneBody.querySelectorAll('.gj-list-item').forEach(el =>
                el.addEventListener('click', () => fillInput('phone', el.dataset.val))
            );
        }
    };

    // 事件绑定
    const bindMainEvents = () => {
        if (isDispatchPage()) {
            document.querySelectorAll('.btn-preset').forEach(btn => {
                btn.addEventListener('click', (e) => setSliderValue(parseInt(e.target.dataset.val)));
            });
            document.getElementById('btn-auto-addr')?.addEventListener('click', () => {
                if(state.history.addrs[0]) fillInput('address', state.history.addrs[0]);
            });
            document.getElementById('btn-auto-phone')?.addEventListener('click', () => {
                if(state.history.phones[0]) fillInput('phone', state.history.phones[0]);
            });

            // 隔离库设置
            const cfgArea = document.getElementById('gj-blacklist-area');
            document.getElementById('btn-blacklist-cfg')?.addEventListener('click', () => {
                cfgArea.style.display = cfgArea.style.display === 'none' ? 'block' : 'none';
            });
            document.getElementById('btn-save-blacklist')?.addEventListener('click', () => {
                const val = document.getElementById('blacklist-input').value;
                state.blacklist = val;
                GM_setValue('blacklist', val);
                alert("✅ 隔离库已保存，垃圾信息将被拦截。");
                cfgArea.style.display = 'none';
            });
        }
        // 普通页事件
        if (document.getElementById('gj-btn-toggle')) {
            document.getElementById('gj-btn-toggle').addEventListener('click', () => {
                state.manualPause = !state.manualPause;
                GM_setValue('manualPause', state.manualPause);
                updateMainContent();
                if(!isDispatchPage()) { if (state.manualPause) stopCountdown(); else startCountdown(); }
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
        const display = document.getElementById('gj-timer-display');
        if (display && !state.manualPause) {
             display.textContent = `${state.countdown} s`;
             display.style.color = state.countdown <= 3 ? "#F56C6C" : "#409EFF";
        } else if (display && state.manualPause) {
             display.textContent = "已暂停";
             display.style.color = "#909399";
        }
    };

    const log = (text, type = 'normal') => { console.log(`[调度助手] ${text}`); };

    // --- 辅助功能 ---
    const applyPos = (el, pos) => {
        if (pos.left) { el.style.left = pos.left; el.style.right = 'auto'; }
        else { el.style.right = pos.right || '20px'; el.style.left = 'auto'; }
        if (pos.top) { el.style.top = pos.top; el.style.bottom = 'auto'; }
        else { el.style.bottom = pos.bottom || '20px'; el.style.top = 'auto'; }
    };

    const setupDrag = (el, storageKey) => {
        const header = el.querySelector('.gj-header');
        let isDragging = false, startX, startY, rect;
        header.addEventListener('mousedown', e => {
            isDragging = true; startX = e.clientX; startY = e.clientY;
            rect = el.getBoundingClientRect();
            header.style.cursor = 'grabbing';
        });
        document.addEventListener('mousemove', e => {
            if (!isDragging) return;
            el.style.left = (rect.left + e.clientX - startX) + 'px';
            el.style.top = (rect.top + e.clientY - startY) + 'px';
            el.style.right = 'auto'; el.style.bottom = 'auto';
        });
        document.addEventListener('mouseup', () => {
            if(isDragging) {
                isDragging = false; header.style.cursor = 'grab';
                const newPos = {left: el.style.left, top: el.style.top};
                state[storageKey] = newPos;
                GM_setValue(storageKey, JSON.stringify(newPos));
            }
        });
    };

    const addStyles = () => {
        GM_addStyle(`
            .gj-float-window {
                position: fixed; z-index: 9999;
                background: white; border-radius: 6px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                font-family: sans-serif; font-size: 13px;
                border: 1px solid #EBEEF5; user-select: none;
                width: 180px; /* 默认宽度 */
            }
            #gj-main-panel { width: 160px; } /* 主控台小一点 */
            .gj-list-window { width: 220px; } /* 列表窗宽一点 */

            .gj-header {
                padding: 8px 10px; background: #F5F7FA; border-bottom: 1px solid #EBEEF5;
                display: flex; justify-content: space-between; align-items: center;
                cursor: grab; font-weight: bold; color: #606266; font-size: 12px;
            }
            .gj-body, .gj-list-body { padding: 8px; }
            .gj-list-body { max-height: 200px; overflow-y: auto; }

            /* 列表项 */
            .gj-list-item {
                padding: 5px; border-bottom: 1px solid #eee; cursor: pointer;
                white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 12px;
            }
            .gj-list-item:hover { background: #ecf5ff; color: #409EFF; }
            .gj-empty { color: #ccc; text-align: center; font-size: 12px; }

            /* 按钮 */
            .gj-grid-btns { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; }
            .btn-preset { background: #ECF5FF; border: 1px solid #B3D8FF; color: #409EFF; padding: 4px; border-radius: 4px; cursor: pointer; font-size:12px; }
            .btn-preset:hover { background: #409EFF; color: white; }

            .btn-clipboard { width: 100%; padding: 6px; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; font-size:12px; margin-bottom: 4px; display:block;}
            .btn-addr { background: #f0f9eb; color: #67c23a; border: 1px solid #c2e7b0; }
            .btn-phone { background: #fef0f0; color: #f56c6c; border: 1px solid #fbc4c4; }
            .btn-xs { font-size:10px; padding:2px 6px; cursor:pointer; background:#fff; border:1px solid #ddd; border-radius:3px; }

            .gj-toggle { cursor: pointer; padding: 0 5px; }
            .gj-countdown { font-size: 24px; font-weight: bold; color: #409EFF; text-align:center;}
            .btn-pause { background: #F56C6C; color: white; width:100%; border:none; padding:5px; border-radius:4px; cursor:pointer;}
            .btn-resume { background: #67C23A; color: white; width:100%; border:none; padding:5px; border-radius:4px; cursor:pointer;}
            .gj-setting-row { margin-top:5px; display:flex; justify-content:center; align-items:center; gap:3px;}
        `);
    };

    const init = () => {
        addStyles();
        checkPage();
        window.addEventListener('hashchange', checkPage);
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