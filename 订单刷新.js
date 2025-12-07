// ==UserScript==
// @name          代驾调度系统助手 V5.0 (剪贴板历史库+智能分流)
// @namespace     http://tampermonkey.net/
// @version       5.0
// @description   新增本地剪贴板历史库，自动区分电话/地址并存储；点击列表直接填单；修复切屏回来不自动刷新的Bug。
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
            MAX_HISTORY: 10 // 历史记录保存条数
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
        uiPos: JSON.parse(GM_getValue('uiPos', '{"top":"80px","right":"20px"}')),
        // 剪贴板历史数据 (从本地存储读取)
        history: JSON.parse(GM_getValue('clipHistory', '{"phones":[], "addrs":[]}'))
    };

    // --------------- 3. 核心逻辑 ---------------

    // [逻辑] 页面检测
    const checkPage = () => {
        state.currentHash = window.location.hash;

        // 设置刷新间隔
        if (isOrderPage()) {
            state.refreshInterval = GM_getValue('orderInterval', CONFIG.ORDER.DEFAULT_INTERVAL);
        } else if (isDriverPage()) {
            state.refreshInterval = GM_getValue('driverInterval', CONFIG.DRIVER.DEFAULT_INTERVAL);
        } else if (isDispatchPage()) {
            state.refreshInterval = CONFIG.DISPATCH.RAPID_INTERVAL / 1000;
        }

        updateUILayout();

        // 调度页极速刷新控制
        if (isDispatchPage()) {
             if (!state.manualPause) startRapidRefresh();
        } else {
            stopRapidRefresh();
            // 普通页倒计时控制
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

    // [逻辑] 刷新与倒计时
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
            log(`刷新成功: ${reason}`, 'success');
            state.countdown = state.refreshInterval;
        } else {
            // 如果没找到按钮，可能是DOM没加载完，不报错，只是跳过
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

    // [逻辑] 剪贴板库管理 (核心升级)
    const processClipboard = async () => {
        try {
            const text = await navigator.clipboard.readText();
            if (!text || !text.trim()) return;

            const cleanText = text.trim();
            // 简单的防抖：如果最新一条和当前一样，就不存
            const lastAddr = state.history.addrs[0];
            const lastPhone = state.history.phones[0];
            if (cleanText === lastAddr || cleanText === lastPhone) return;

            // --- 智能分类逻辑 ---
            // 规则：11位数字且1开头 = 电话；其他 = 地址
            const isPhone = /^1\d{10}$/.test(cleanText.replace(/\D/g, '')); // 先去掉非数字再判断

            if (isPhone) {
                // 存入电话库 (只存清洗后的数字)
                const purePhone = cleanText.replace(/\D/g, '');
                if (purePhone !== lastPhone) {
                    state.history.phones.unshift(purePhone);
                    if (state.history.phones.length > CONFIG.CLIPBOARD.MAX_HISTORY) state.history.phones.pop();
                    log('捕获新电话', 'info');
                }
            } else {
                // 存入地址库 (地址绝不可能是11位纯数字)
                if (cleanText !== lastAddr) {
                    state.history.addrs.unshift(cleanText);
                    if (state.history.addrs.length > CONFIG.CLIPBOARD.MAX_HISTORY) state.history.addrs.pop();
                    log('捕获新地址', 'info');
                }
            }

            // 保存并刷新UI
            GM_setValue('clipHistory', JSON.stringify(state.history));
            updateClipboardUI();

        } catch (e) {
            // 可能是没权限或没焦点，忽略
        }
    };

    const fillInput = (type, value) => {
        let input = null;
        if (type === 'address') {
             input = document.querySelector('input[id="tipinput"]') ||
                     document.querySelector('input[placeholder*="搜索"]') ||
                     document.querySelector('input[placeholder*="请输入关键字"]');
             // 备用策略
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
            // 视觉反馈
            input.style.backgroundColor = '#e1f3d8';
            setTimeout(() => input.style.backgroundColor = '', 500);
            log(`已填入${type === 'address'?'地址':'电话'}`, 'success');
        } else {
            alert(`找不到${type === 'address'?'地址':'电话'}输入框`);
        }
    };

    // [逻辑] 滑块控制
    const setSliderValue = (targetValue) => {
        const MAX_VAL = 20;
        const calibrationMap = { 2: 1, 3: 2, 5: 4, 10: 10, 20: 20 };
        const calcValue = calibrationMap[targetValue] !== undefined ? calibrationMap[targetValue] : targetValue;

        const sliderDiv = document.querySelector('.el-slider');
        if (!sliderDiv) return log('未找到滑块');
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

    const createUI = () => {
        const old = document.getElementById('gj-helper-ui');
        if (old) old.remove();

        const container = document.createElement('div');
        container.id = 'gj-helper-ui';

        if (state.uiPos.left) {
            container.style.left = state.uiPos.left;
            container.style.right = 'auto';
        } else {
            container.style.right = state.uiPos.right || '20px';
            container.style.left = 'auto';
        }
        container.style.top = state.uiPos.top || '80px';

        container.innerHTML = `
            <div class="gj-header">
                <span class="gj-title">🤖 调度助手 V5.0</span>
                <span class="gj-toggle">${state.isCollapsed ? '▼' : '▲'}</span>
            </div>
            <div class="gj-body" style="display: ${state.isCollapsed ? 'none' : 'block'}">
                <div id="gj-dynamic-content"></div>
                <div class="gj-footer">
                    <span id="gj-msg">准备就绪</span>
                </div>
            </div>
        `;

        document.body.appendChild(container);
        addStyles();
        setupDragAndEvents(container);
        updateUILayout();
    };

    const updateUILayout = () => {
        const contentDiv = document.getElementById('gj-dynamic-content');
        if (!contentDiv || state.isCollapsed) return;

        let html = '';

        if (isOrderPage() || isDriverPage()) {
            const pageName = isOrderPage() ? "订单刷新" : "司机列表";
            const btnClass = state.manualPause ? 'btn-resume' : 'btn-pause';
            const btnText = state.manualPause ? '▶ 恢复' : '⏸ 暂停';

            html = `
                <div class="gj-section">
                    <div class="gj-status-box">
                        <div class="gj-label">${pageName}</div>
                        <div class="gj-countdown" id="gj-timer-display">--</div>
                    </div>
                    <div class="gj-controls">
                        <button id="gj-btn-toggle" class="${btnClass}">${btnText}</button>
                    </div>
                    <div class="gj-setting-row">
                        <span>间隔(秒):</span>
                        <input type="number" id="gj-input-interval" value="${state.refreshInterval}" style="width:50px">
                        <button id="gj-btn-set" class="btn-small">保存</button>
                    </div>
                </div>
            `;
        } else if (isDispatchPage()) {
            const buttonsHtml = CONFIG.DISPATCH.PRESETS.map(num =>
                `<button class="btn-preset" data-val="${num}">${num}km</button>`
            ).join('');

            // 构建剪贴板历史列表HTML
            const renderList = (items, type) => {
                if (items.length === 0) return '<div class="clip-empty">暂无记录</div>';
                return items.map(item => `
                    <div class="clip-item ${type}" title="${item}" data-type="${type}" data-val="${item}">
                        ${item}
                    </div>
                `).join('');
            };

            html = `
                <div class="gj-section">
                    <div class="gj-label-row">
                        <span>📋 地址库 (自动识别)</span>
                        <button id="btn-force-read" class="btn-xs">读取最新</button>
                    </div>
                    <div id="list-addr" class="clip-list-box">
                        ${renderList(state.history.addrs, 'address')}
                    </div>
                    <button id="btn-auto-addr" class="btn-clipboard btn-addr">📍 填入最新地址</button>
                </div>

                <div class="gj-section">
                    <div class="gj-label-row">📞 电话库 (11位数字)</div>
                    <div id="list-phone" class="clip-list-box">
                        ${renderList(state.history.phones, 'phone')}
                    </div>
                    <button id="btn-auto-phone" class="btn-clipboard btn-phone">📞 填入最新电话</button>
                </div>

                <div class="gj-section">
                    <div class="gj-label-row">⚡ AI 距离 (极速刷新中)</div>
                    <div class="gj-grid-btns">
                        ${buttonsHtml}
                    </div>
                </div>
            `;
        } else {
            html = `<div class="gj-section" style="text-align:center;color:#999;">脚本待机中...</div>`;
        }

        contentDiv.innerHTML = html;
        bindDynamicEvents();
        updateStatusText();
    };

    // 动态更新剪贴板部分的UI (避免整个重绘)
    const updateClipboardUI = () => {
        if (!isDispatchPage() || state.isCollapsed) return;
        const addrBox = document.getElementById('list-addr');
        const phoneBox = document.getElementById('list-phone');

        const renderList = (items, type) => {
            if (items.length === 0) return '<div class="clip-empty">暂无记录</div>';
            return items.map(item => `
                <div class="clip-item ${type}" title="${item}" data-type="${type}" data-val="${item}">
                    ${item}
                </div>
            `).join('');
        };

        if (addrBox) {
            addrBox.innerHTML = renderList(state.history.addrs, 'address');
            // 重新绑定列表点击事件
            addrBox.querySelectorAll('.clip-item').forEach(el => {
                el.addEventListener('click', () => fillInput('address', el.dataset.val));
            });
        }
        if (phoneBox) {
            phoneBox.innerHTML = renderList(state.history.phones, 'phone');
            phoneBox.querySelectorAll('.clip-item').forEach(el => {
                el.addEventListener('click', () => fillInput('phone', el.dataset.val));
            });
        }
    };

    const bindDynamicEvents = () => {
        if (isOrderPage() || isDriverPage()) {
            document.getElementById('gj-btn-toggle')?.addEventListener('click', () => {
                state.manualPause = !state.manualPause;
                GM_setValue('manualPause', state.manualPause);
                updateUILayout();
                if(!isDispatchPage()) {
                    if (state.manualPause) stopCountdown(); else startCountdown();
                }
            });

            document.getElementById('gj-btn-set')?.addEventListener('click', () => {
                const val = parseInt(document.getElementById('gj-input-interval').value);
                if (val > 0) {
                    state.refreshInterval = val;
                    if(isOrderPage()) GM_setValue('orderInterval', val);
                    if(isDriverPage()) GM_setValue('driverInterval', val);
                    performAction("设置更新");
                    startCountdown();
                }
            });
        }
        if (isDispatchPage()) {
            document.querySelectorAll('.btn-preset').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const val = parseInt(e.target.dataset.val);
                    setSliderValue(val);
                });
            });

            // 列表项点击事件 (初始绑定)
            document.querySelectorAll('.clip-item').forEach(el => {
                el.addEventListener('click', () => {
                    fillInput(el.dataset.type, el.dataset.val);
                });
            });

            // 自动填入最新按钮
            document.getElementById('btn-auto-addr')?.addEventListener('click', () => {
                if(state.history.addrs.length > 0) fillInput('address', state.history.addrs[0]);
                else alert("地址库为空");
            });
            document.getElementById('btn-auto-phone')?.addEventListener('click', () => {
                if(state.history.phones.length > 0) fillInput('phone', state.history.phones[0]);
                else alert("电话库为空");
            });

            // 强制读取按钮
            document.getElementById('btn-force-read')?.addEventListener('click', processClipboard);
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

    const setupDragAndEvents = (el) => {
        const header = el.querySelector('.gj-header');
        const toggle = el.querySelector('.gj-toggle');
        toggle.addEventListener('click', (e) => {
            e.stopPropagation();
            state.isCollapsed = !state.isCollapsed;
            GM_setValue('uiCollapsed', state.isCollapsed);
            createUI();
        });
        let isDragging = false, startX, startY, initLeft, initTop;
        header.addEventListener('mousedown', e => {
            isDragging = true;
            startX = e.clientX; startY = e.clientY;
            const rect = el.getBoundingClientRect();
            initLeft = rect.left; initTop = rect.top;
            header.style.cursor = 'grabbing';
        });
        document.addEventListener('mousemove', e => {
            if (!isDragging) return;
            el.style.left = (initLeft + e.clientX - startX) + 'px';
            el.style.top = (initTop + e.clientY - startY) + 'px';
            el.style.right = 'auto';
        });
        document.addEventListener('mouseup', () => {
            if(isDragging) {
                isDragging = false;
                header.style.cursor = 'grab';
                state.uiPos = {left: el.style.left, top: el.style.top};
                GM_setValue('uiPos', JSON.stringify(state.uiPos));
            }
        });
    };

    const log = (text, type = 'normal') => {
        const msg = document.getElementById('gj-msg');
        if(msg) msg.textContent = text;
        console.log(`[调度助手] ${text}`);
    };

    const addStyles = () => {
        GM_addStyle(`
            #gj-helper-ui {
                position: fixed; z-index: 9999;
                width: 240px;
                background: white; border-radius: 8px;
                box-shadow: 0 4px 15px rgba(0,0,0,0.2);
                font-family: sans-serif; font-size: 13px;
                border: 1px solid #EBEEF5;
                user-select: none;
            }
            .gj-header { padding: 10px 15px; background: #F5F7FA; border-bottom: 1px solid #EBEEF5; display: flex; justify-content: space-between; cursor: grab; font-weight: bold; color: #606266; }
            .gj-body { padding: 10px; max-height: 80vh; overflow-y: auto; }
            .gj-section { display: flex; flex-direction: column; gap: 8px; margin-bottom: 10px; border-bottom: 1px solid #f0f0f0; padding-bottom: 10px; }
            .gj-section:last-child { border-bottom: none; margin-bottom: 0; padding-bottom: 0; }
            .gj-status-box { text-align: center; margin-bottom: 5px; }
            .gj-label { font-size: 12px; color: #909399; }
            .gj-countdown { font-size: 28px; font-weight: bold; color: #409EFF; font-family: monospace;}
            .gj-controls button { width: 100%; padding: 8px; border-radius: 4px; border: none; cursor: pointer; font-weight: bold; }
            .btn-pause { background: #F56C6C; color: white; }
            .btn-resume { background: #67C23A; color: white; }
            .btn-small { padding: 4px 8px; border: 1px solid #DCDFE6; background: white; cursor: pointer; border-radius: 4px;}
            .gj-setting-row { display: flex; align-items: center; justify-content: center; gap: 5px; margin-top: 5px; }

            .gj-label-row { font-weight: bold; color: #303133; margin-bottom: 4px; font-size: 12px; display: flex; justify-content: space-between; align-items: center;}
            .btn-xs { font-size:10px; padding:2px 6px; cursor:pointer; background:#fff; border:1px solid #ddd; border-radius:3px; }

            /* 列表样式 */
            .clip-list-box {
                max-height: 85px; /* 约显示3-4条 */
                overflow-y: auto;
                border: 1px solid #eee;
                border-radius: 4px;
                background: #fafafa;
            }
            .clip-item {
                padding: 4px 6px;
                border-bottom: 1px solid #eee;
                cursor: pointer;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
                font-size: 12px;
                color: #555;
            }
            .clip-item:hover { background-color: #ecf5ff; color: #409EFF; }
            .clip-item.address { border-left: 3px solid #67C23A; }
            .clip-item.phone { border-left: 3px solid #F56C6C; }
            .clip-empty { padding: 10px; text-align: center; color: #ccc; font-size: 12px; }

            .gj-grid-btns { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
            .btn-preset { background: #ECF5FF; border: 1px solid #B3D8FF; color: #409EFF; padding: 6px 0; border-radius: 4px; cursor: pointer; transition: all 0.2s; }
            .btn-preset:hover { background: #409EFF; color: white; }

            .btn-clipboard {
                width: 100%; padding: 6px 10px; border: none; border-radius: 4px; margin-top: 2px;
                cursor: pointer; font-weight: bold; text-align: center; display: block;
                transition: opacity 0.2s;
            }
            .btn-clipboard:hover { opacity: 0.8; }
            .btn-addr { background-color: #f0f9eb; color: #67c23a; border: 1px solid #c2e7b0; }
            .btn-phone { background-color: #fef0f0; color: #f56c6c; border: 1px solid #fbc4c4; }

            .gj-hint { font-size: 11px; color: #C0C4CC; text-align: center; margin-top: 5px; }
            .gj-footer { margin-top: 10px; padding-top: 5px; border-top: 1px dashed #EBEEF5; font-size: 11px; color: #999; text-align: center;}
            .gj-toggle { cursor: pointer; padding: 0 5px; }
        `);
    };

    const init = () => {
        createUI();
        checkPage();
        window.addEventListener('hashchange', checkPage);

        // 🌟 修复: 页面切回可见时，立即执行逻辑
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                // 1. 如果在订单页，强制刷新一次
                if ((isOrderPage() || isDriverPage()) && !state.manualPause) {
                    performAction("切屏回刷");
                }
                // 2. 如果在调度页，自动读取剪贴板
                if (isDispatchPage()) {
                    processClipboard();
                }
            }
        });

        // 窗口获得焦点时也读一次剪贴板
        window.addEventListener('focus', () => {
            if (isDispatchPage()) processClipboard();
        });

        setTimeout(checkPage, 1000);
    };

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        init();
    } else {
        window.addEventListener('load', init);
    }
})();