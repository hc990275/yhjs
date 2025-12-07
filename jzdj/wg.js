// ==UserScript==
// @name          代驾调度系统助手 V7.0 (一体化座舱版)
// @namespace     http://tampermonkey.net/
// @version       7.0
// @description   UI全面美化：地址/电话库紧贴主面板右侧；自动截断长文本；修复电话识别Bug；页面标题自定义命名。
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
        CLIPBOARD: {
            MAX_HISTORY: 6 // 列表显示条数（不用太多，够用就行）
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
        // UI 位置记忆 (只记主坐标即可，因为是一体的)
        uiPos: JSON.parse(GM_getValue('uiPos', '{"top":"80px","left":"20px"}')),
        // 数据
        history: JSON.parse(GM_getValue('clipHistory', '{"phones":[], "addrs":[]}')),
        blacklist: GM_getValue('blacklist', '师傅,马上,联系,收到,好的,电话,不用,微信')
    };

    // --------------- 3. 核心逻辑 ---------------

    const checkPage = () => {
        state.currentHash = window.location.hash;

        // 设置刷新间隔 & 标题逻辑
        if (isOrderPage()) {
            state.refreshInterval = GM_getValue('orderInterval', CONFIG.ORDER.DEFAULT_INTERVAL);
        } else if (isDriverPage()) {
            state.refreshInterval = GM_getValue('driverInterval', CONFIG.DRIVER.DEFAULT_INTERVAL);
        } else if (isDispatchPage()) {
            state.refreshInterval = CONFIG.DISPATCH.RAPID_INTERVAL / 1000;
        }

        updateUI(); // 重绘或更新UI

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
    const stopRapidRefresh = () => { if (state.rapidTimer) { clearInterval(state.rapidTimer); state.rapidTimer = null; } };

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
    const stopCountdown = () => { if (state.timerId) { clearInterval(state.timerId); state.timerId = null; } updateStatusText(); };

    // [逻辑] 剪贴板处理 (修复电话逻辑)
    const processClipboard = async () => {
        try {
            const text = await navigator.clipboard.readText();
            if (!text || !text.trim()) return;

            const cleanText = text.trim();
            const lastAddr = state.history.addrs[0];
            const lastPhone = state.history.phones[0];

            // 1. 提取纯数字 (修复：先去除非数字字符)
            const pureNum = cleanText.replace(/\D/g, '');

            // 2. 判断逻辑：必须是11位数字，且以1开头
            const isPhone = /^1\d{10}$/.test(pureNum);

            if (isPhone) {
                // 存入电话库
                // 防抖：如果和上一条一样，不存
                if (pureNum !== lastPhone) {
                    state.history.phones.unshift(pureNum);
                    if (state.history.phones.length > CONFIG.CLIPBOARD.MAX_HISTORY) state.history.phones.pop();
                    log('捕获电话: ' + pureNum, 'success');
                }
            } else {
                // 隔离库检查 (黑名单)
                const blockers = state.blacklist.split(/[,，]/).map(s => s.trim()).filter(s => s);
                const isBlocked = blockers.some(keyword => cleanText.includes(keyword));

                if (isBlocked) {
                    log('已拦截垃圾信息', 'error');
                    return;
                }

                // 存入地址库
                if (cleanText !== lastAddr) {
                    state.history.addrs.unshift(cleanText);
                    if (state.history.addrs.length > CONFIG.CLIPBOARD.MAX_HISTORY) state.history.addrs.pop();
                    log('捕获地址', 'info');
                }
            }

            GM_setValue('clipHistory', JSON.stringify(state.history));
            updateListsUI(); // 局部刷新列表

        } catch (e) {}
    };

    const fillInput = (type, value) => {
        let input = null;
        if (type === 'address') {
             input = document.querySelector('input[id="tipinput"]') ||
                     document.querySelector('input[placeholder*="搜索"]') ||
                     document.querySelector('input[placeholder*="请输入关键字"]');
             if (!input) { // 兜底查找
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
            // 动画反馈
            input.style.transition = 'background 0.3s';
            input.style.backgroundColor = '#e1f3d8';
            setTimeout(() => input.style.backgroundColor = '', 500);
            log(`已填入: ${value.substring(0,8)}...`, 'success');
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

    // --------------- 4. UI 界面 (一体化设计) ---------------

    const createWidget = () => {
        const old = document.getElementById('gj-widget');
        if (old) old.remove();

        const widget = document.createElement('div');
        widget.id = 'gj-widget';
        applyPos(widget, state.uiPos);

        // 主框架：左侧控制 + 右侧数据库 (仅在指派页显示右侧)
        widget.innerHTML = `
            <div id="gj-main-col">
                <div class="gj-header">
                    <span id="gj-title-text">...</span>
                    <span class="gj-toggle">${state.isCollapsed ? '▼' : '▲'}</span>
                </div>
                <div id="gj-main-content" style="display: ${state.isCollapsed ? 'none' : 'block'}"></div>
            </div>
            <div id="gj-side-col" style="display:none;">
                <!-- 地址库 -->
                <div class="gj-side-box">
                    <div class="gj-side-header green">
                        <span>📍 地址库</span>
                        <span class="btn-icon" id="btn-refresh-addr">↻</span>
                    </div>
                    <div class="gj-list-body" id="list-addr-body"></div>
                </div>
                <!-- 电话库 -->
                <div class="gj-side-box" style="margin-top:5px;">
                    <div class="gj-side-header red">
                        <span>📞 电话库</span>
                        <span class="btn-icon" id="btn-refresh-phone">↻</span>
                    </div>
                    <div class="gj-list-body" id="list-phone-body"></div>
                </div>
            </div>
        `;

        document.body.appendChild(widget);
        addStyles();
        setupDrag(widget);

        // 折叠事件
        widget.querySelector('.gj-toggle').addEventListener('click', (e) => {
            e.stopPropagation();
            state.isCollapsed = !state.isCollapsed;
            GM_setValue('uiCollapsed', state.isCollapsed);
            updateUI();
        });

        // 绑定手动刷新按钮
        widget.querySelector('#btn-refresh-addr').addEventListener('click', processClipboard);
        widget.querySelector('#btn-refresh-phone').addEventListener('click', processClipboard);

        return widget;
    };

    const updateUI = () => {
        let widget = document.getElementById('gj-widget');
        if (!widget) widget = createWidget();

        // 1. 设置标题
        const titleSpan = document.getElementById('gj-title-text');
        if (isOrderPage()) titleSpan.textContent = CONFIG.ORDER.TITLE;
        else if (isDriverPage()) titleSpan.textContent = CONFIG.DRIVER.TITLE;
        else if (isDispatchPage()) titleSpan.textContent = CONFIG.DISPATCH.TITLE;
        else titleSpan.textContent = "助手待机";

        // 2. 控制内容显隐
        const mainContent = document.getElementById('gj-main-content');
        const sideCol = document.getElementById('gj-side-col');

        mainContent.style.display = state.isCollapsed ? 'none' : 'block';

        // 侧边栏（地址/电话库）仅在“订单指派”页面且未折叠时显示
        if (isDispatchPage() && !state.isCollapsed) {
            sideCol.style.display = 'block';
            updateListsUI(); // 刷新列表内容
        } else {
            sideCol.style.display = 'none';
        }

        // 3. 渲染主控台内容
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
                    <span style="font-size:11px;color:#666;">间隔:</span>
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
                    <button id="btn-auto-addr" class="btn-big green">填最新地址</button>
                    <button id="btn-auto-phone" class="btn-big red">填最新电话</button>
                </div>
                <div class="gj-label-sm">⚡ AI距离 (极速)</div>
                <div class="gj-grid-btns">${buttonsHtml}</div>
                <div style="margin-top:8px;text-align:right;">
                    <span id="btn-blacklist-cfg" class="link-btn">⚙️ 隔离库</span>
                </div>
                <!-- 隔离设置 (隐藏式) -->
                <div id="gj-blacklist-area" style="display:none; margin-top:5px; border-top:1px dashed #ddd; padding-top:5px;">
                    <textarea id="blacklist-input" rows="3" style="width:100%;font-size:10px;border:1px solid #eee;">${state.blacklist}</textarea>
                    <button id="btn-save-blacklist" class="btn-xs full">保存设置</button>
                </div>
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
        const phoneBody = document.getElementById('list-phone-body');

        if(addrBody) {
            addrBody.innerHTML = state.history.addrs.map(i => renderItem(i, 'address')).join('') || '<div class="gj-empty">- 空 -</div>';
            addrBody.querySelectorAll('.gj-list-item').forEach(el => el.addEventListener('click', () => fillInput('address', el.dataset.val)));
        }
        if(phoneBody) {
            phoneBody.innerHTML = state.history.phones.map(i => renderItem(i, 'phone')).join('') || '<div class="gj-empty">- 空 -</div>';
            phoneBody.querySelectorAll('.gj-list-item').forEach(el => el.addEventListener('click', () => fillInput('phone', el.dataset.val)));
        }
    };

    const bindEvents = () => {
        if (isDispatchPage()) {
            document.querySelectorAll('.btn-preset').forEach(btn =>
                btn.addEventListener('click', (e) => setSliderValue(parseInt(e.target.dataset.val)))
            );
            document.getElementById('btn-auto-addr')?.addEventListener('click', () => {
                if(state.history.addrs[0]) fillInput('address', state.history.addrs[0]);
            });
            document.getElementById('btn-auto-phone')?.addEventListener('click', () => {
                if(state.history.phones[0]) fillInput('phone', state.history.phones[0]);
            });
            // 隔离设置
            const area = document.getElementById('gj-blacklist-area');
            document.getElementById('btn-blacklist-cfg')?.addEventListener('click', () => area.style.display = area.style.display==='none'?'block':'none');
            document.getElementById('btn-save-blacklist')?.addEventListener('click', () => {
                const val = document.getElementById('blacklist-input').value;
                state.blacklist = val; GM_setValue('blacklist', val);
                area.style.display = 'none'; log('隔离库已更新', 'success');
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

    // --- 样式与拖拽 ---
    const applyPos = (el, pos) => {
        if (pos.left) { el.style.left = pos.left; el.style.right = 'auto'; }
        else { el.style.right = pos.right || '20px'; el.style.left = 'auto'; }
        if (pos.top) { el.style.top = pos.top; el.style.bottom = 'auto'; }
        else { el.style.bottom = pos.bottom || 'auto'; el.style.top = 'auto'; }
    };

    const setupDrag = (el) => {
        const header = el.querySelector('.gj-header'); // 只允许拖动左侧主标题栏
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
                font-size: 13px; user-select: none;
            }
            #gj-main-col {
                width: 140px; background: #fff; border-radius: 6px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.15); border: 1px solid #ebeef5; overflow: hidden;
            }
            #gj-side-col {
                width: 160px; margin-left: 5px; display: flex; flex-direction: column; gap: 5px;
            }
            .gj-header {
                padding: 8px 10px; background: #F5F7FA; border-bottom: 1px solid #EBEEF5;
                display: flex; justify-content: space-between; align-items: center;
                cursor: grab; font-weight: bold; color: #606266; font-size: 12px;
            }
            .gj-side-box {
                background: #fff; border-radius: 6px; border: 1px solid #ebeef5; overflow: hidden;
                box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            }
            .gj-side-header {
                padding: 5px 8px; font-size: 11px; font-weight: bold; display: flex; justify-content: space-between;
            }
            .green { background: #f0f9eb; color: #67c23a; }
            .red { background: #fef0f0; color: #f56c6c; }

            #gj-main-content { padding: 10px; }
            .gj-timer-box { font-size: 26px; font-weight: bold; color: #409EFF; text-align: center; margin-bottom: 5px; }
            .gj-row { display: flex; align-items: center; justify-content: center; margin-top: 5px; gap: 3px; }
            .gj-input-mini { width: 35px; border: 1px solid #dcdfe6; border-radius: 3px; text-align: center; padding: 2px; }

            .btn-pause, .btn-resume { width: 100%; border: none; padding: 5px; border-radius: 4px; cursor: pointer; color: white; font-weight: bold;}
            .btn-pause { background: #F56C6C; } .btn-resume { background: #67C23A; }

            .btn-big { width: 100%; border: 1px solid; border-radius: 4px; padding: 6px; margin-bottom: 5px; cursor: pointer; font-weight: bold; font-size: 12px; }
            .btn-big.green { background: #f0f9eb; border-color: #c2e7b0; color: #67c23a; }
            .btn-big.green:hover { background: #67c23a; color: white; }
            .btn-big.red { background: #fef0f0; border-color: #fbc4c4; color: #f56c6c; }
            .btn-big.red:hover { background: #f56c6c; color: white; }

            .gj-grid-btns { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 4px; margin-top: 3px; }
            .btn-preset { background: #ECF5FF; border: 1px solid #B3D8FF; color: #409EFF; padding: 4px 0; border-radius: 4px; cursor: pointer; font-size: 11px; }
            .btn-preset:hover { background: #409EFF; color: white; }

            .gj-list-body { max-height: 150px; overflow-y: auto; background: #fff; }
            .gj-list-item {
                padding: 4px 8px; border-bottom: 1px solid #f0f0f0; cursor: pointer; font-size: 12px; color: #555;
                white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 160px;
            }
            .gj-list-item:hover { background: #ecf5ff; color: #409EFF; }
            .gj-empty { text-align: center; color: #ccc; padding: 5px; font-size: 11px; }

            .btn-icon { cursor: pointer; font-size: 12px; padding: 0 3px; }
            .btn-icon:hover { font-weight: bold; }
            .btn-xs { font-size: 10px; padding: 1px 5px; border: 1px solid #ddd; background: #fff; border-radius: 3px; cursor: pointer; }
            .btn-xs.full { width: 100%; margin-top: 3px; }
            .gj-label-sm { font-size: 10px; color: #999; margin-top: 5px; }
            .link-btn { font-size: 10px; color: #909399; cursor: pointer; text-decoration: underline; }
            .gj-toggle { cursor: pointer; padding: 0 5px; }
        `);
    };

    const init = () => {
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