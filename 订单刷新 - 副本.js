// ==UserScript==
// @name          代驾订单/司机列表自动调度 (高级控制 - 长条)
// @namespace     http://tampermonkey.net/
// @version       1.6
// @description   在指定页面自动执行操作 (搜索/刷新), 可自定义订单刷新时间, 快捷设置, 手动启停 (长条显示), 增加状态显示和图标控制
// @author        郭 + You (合并) + Gemini
// @match         https://admin.v3.jiuzhoudaijiaapi.cn/*
// @grant         GM_setValue
// @grant         GM_getValue
// @grant         GM_addStyle
// ==/UserScript==

(function() {
    'use strict';

    // --------------- 配置参数 ---------------
    const CONFIG = {
        SEARCH: {
            REFRESH_INTERVAL: GM_getValue('searchInterval_ms', 20000),
            BUTTON_SELECTOR: 'button.el-button.el-button--primary.el-button--small i.el-icon-search',
            PAGE_HASH: '#/substituteDrivingOrder',
            INIT_DELAY: 2000
        },
        REFRESH: {
            INTERVAL: 1000,
            REFRESH_ICON_SELECTOR: '.el-icon-refresh',
            PAGE_HASHES: ['#/driverAll']
        }
    };
    const QUICK_INTERVALS_SECONDS = [1, 2, 5, 10, 20, 40];

    // --------------- 变量 ---------------
    let searchTimer = null;
    let refreshTimer = null;
    let intervalInput = null;
    let statusSpan = null;
    let toggleAutoActionsBtn = null;
    let refreshStatusDisplay = null; // New element for refresh status
    let manualStopActive = GM_getValue('manualStopActive', false);

    // --------------- 函数 ---------------

    // --- UI & Settings Functions ---
    const applyNewSearchInterval = (seconds) => {
        if (isNaN(seconds) || seconds < 1) {
            statusSpan.textContent = '无效值!';
            statusSpan.style.color = 'red';
            setTimeout(() => statusSpan.textContent = '', 3000);
            return false;
        }

        const newIntervalMs = seconds * 1000;
        CONFIG.SEARCH.REFRESH_INTERVAL = newIntervalMs;
        GM_setValue('searchInterval_ms', newIntervalMs);
        if (intervalInput) intervalInput.value = seconds;

        statusSpan.textContent = `已设为 ${seconds} 秒`;
        statusSpan.style.color = 'green';
        console.log(`[设置] 订单刷新间隔已更新为: ${seconds} 秒`);
        setTimeout(() => statusSpan.textContent = '', 3000);

        if (!manualStopActive && isTargetPage(CONFIG.SEARCH.PAGE_HASH) && document.visibilityState === 'visible') {
            stopAutoSearch();
            startAutoSearch(true);
            console.log('[系统] 自动搜索已按新间隔重启');
        } else {
            if (manualStopActive) console.log('[系统] 间隔已更新, 但自动操作当前为手动停止状态.');
            else if (!isTargetPage(CONFIG.SEARCH.PAGE_HASH)) console.log('[系统] 间隔已更新, 但当前不在订单页面.');
            else console.log('[系统] 间隔已更新, 但页面当前不可见.');
        }
        return true;
    };

    const updateToggleButtonAppearance = () => {
        if (!toggleAutoActionsBtn) return;
        toggleAutoActionsBtn.innerHTML = manualStopActive ? '<span class="icon-play">?</span>' : '<span class="icon-stop">■</span>';
        toggleAutoActionsBtn.title = manualStopActive ? '点击继续自动刷新' : '点击停止自动刷新';

        if (manualStopActive) {
            toggleAutoActionsBtn.classList.remove('active-stop');
            toggleAutoActionsBtn.classList.add('active-resume');
        } else {
            toggleAutoActionsBtn.classList.remove('active-resume');
            toggleAutoActionsBtn.classList.add('active-stop');
        }
    };

    const updateRefreshStatusDisplay = () => {
        if (!refreshStatusDisplay) return;

        if (manualStopActive) {
            refreshStatusDisplay.textContent = '手动停止';
            refreshStatusDisplay.style.backgroundColor = '#ffcccc'; // Light red
            refreshStatusDisplay.style.color = '#cc0000'; // Darker red
        } else if (document.hidden) {
            refreshStatusDisplay.textContent = '页面隐藏停止';
            refreshStatusDisplay.style.backgroundColor = '#ffffcc'; // Light yellow
            refreshStatusDisplay.style.color = '#cc9900'; // Darker yellow
        } else if (searchTimer) {
            refreshStatusDisplay.textContent = '正在刷新订单';
            refreshStatusDisplay.style.backgroundColor = '#ccffcc'; // Light green
            refreshStatusDisplay.style.color = '#006600'; // Darker green
        } else if (refreshTimer) {
            refreshStatusDisplay.textContent = '正在刷新司机';
            refreshStatusDisplay.style.backgroundColor = '#ccffcc'; // Light green
            refreshStatusDisplay.style.color = '#006600'; // Darker green
        } else {
            refreshStatusDisplay.textContent = '未在目标页面';
            refreshStatusDisplay.style.backgroundColor = '#e0e0e0'; // Gray
            refreshStatusDisplay.style.color = '#666666'; // Darker gray
        }
    };

    const createSettingsUI = () => {
        const container = document.createElement('div');
        container.id = 'custom-script-controls-container';

        let quickButtonsHTML = QUICK_INTERVALS_SECONDS.map(s =>
            `<button class="quick-interval-btn" data-seconds="${s}">${s}s</button>`
        ).join('');

        container.innerHTML = `
            <div id="status-display-group">
                <span id="refreshStatusDisplay"></span>
            </div>
            <div id="interval-config-group">
                <label for="searchIntervalInput">订单刷新 (秒):</label>
                <input type="number" id="searchIntervalInput" min="1">
                <button id="setSearchIntervalBtn">设置</button>
                <span id="intervalStatus"></span>
            </div>
            <div id="quick-set-buttons-group">
                <span>快捷: </span>${quickButtonsHTML}
            </div>
            <div id="master-control-group">
                <button id="toggleAutoActionsBtn"></button>
            </div>
        `;
        document.body.appendChild(container);
        addCustomStyles(); // Apply styles

        intervalInput = document.getElementById('searchIntervalInput');
        statusSpan = document.getElementById('intervalStatus');
        toggleAutoActionsBtn = document.getElementById('toggleAutoActionsBtn');
        refreshStatusDisplay = document.getElementById('refreshStatusDisplay'); // Get new element
        const setSearchIntervalBtn = document.getElementById('setSearchIntervalBtn');

        intervalInput.value = CONFIG.SEARCH.REFRESH_INTERVAL / 1000;

        setSearchIntervalBtn.addEventListener('click', () => {
            applyNewSearchInterval(parseInt(intervalInput.value, 10));
        });

        document.querySelectorAll('.quick-interval-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const seconds = parseInt(e.target.dataset.seconds, 10);
                applyNewSearchInterval(seconds);
            });
        });

        toggleAutoActionsBtn.addEventListener('click', () => {
            manualStopActive = !manualStopActive;
            GM_setValue('manualStopActive', manualStopActive);
            handleCurrentPageOrVisibilityState(); // Re-evaluate state, which will update appearance and status
        });
        updateToggleButtonAppearance();
        updateRefreshStatusDisplay();
    };

    const addCustomStyles = () => {
        GM_addStyle(`
            #custom-script-controls-container {
                position: fixed; top: 15px; left: 50%; transform: translateX(-50%);
                background-color: #ffffff; padding: 8px 12px;
                border: 1px solid #cccccc;
                border-radius: 8px; z-index: 10000; font-size: 13px;
                box-shadow: 0 3px 10px rgba(0,0,0,0.12);
                display: flex;
                flex-wrap: nowrap;
                align-items: center;
                width: auto;
                max-width: 95vw;
            }
            #custom-script-controls-container > div[id$="-group"] {
                display: flex;
                align-items: center;
                margin-right: 12px;
                padding: 0 5px;
            }
            #custom-script-controls-container > div[id$="-group"]:last-child {
                margin-right: 0;
            }

            #custom-script-controls-container label { margin-right: 5px; font-weight: bold; white-space: nowrap; }
            #custom-script-controls-container input[type="number"] {
                width: 50px; padding: 5px; font-size: 13px; border: 1px solid #bbb;
                border-radius: 4px; margin-right: 5px; text-align: center;
            }
            #custom-script-controls-container button {
                margin: 0 2px;
                padding: 5px 8px;
                font-size: 13px; border: 1px solid #b0b0b0;
                border-radius: 4px; background-color: #f0f0f0; cursor: pointer; transition: background-color 0.2s;
                white-space: nowrap;
            }
            #custom-script-controls-container button:hover { background-color: #e0e0e0; }
            #custom-script-controls-container #setSearchIntervalBtn { background-color: #e6f3ff; border-color: #b3d9ff;}
            #custom-script-controls-container #setSearchIntervalBtn:hover { background-color: #d1e9ff; }
            #custom-script-controls-container .quick-interval-btn { background-color: #f9f9f9; }

            /* Toggle button specific styles */
            #custom-script-controls-container #toggleAutoActionsBtn {
                width: 30px; height: 30px; padding: 0; border-radius: 50%; /* Make it round */
                display: flex; justify-content: center; align-items: center;
            }
            #custom-script-controls-container #toggleAutoActionsBtn .icon-play {
                color: #006600; /* Dark green for play */
                font-size: 18px; /* Larger icon */
                line-height: 1; /* Adjust vertical alignment */
                transform: translateX(1px); /* optical adjustment for triangle */
            }
            #custom-script-controls-container #toggleAutoActionsBtn .icon-stop {
                color: #cc0000; /* Dark red for stop */
                font-size: 18px;
                line-height: 1;
            }
            #custom-script-controls-container #toggleAutoActionsBtn.active-stop { background-color: #ffe0e0; border-color: #ffc0c0; }
            #custom-script-controls-container #toggleAutoActionsBtn.active-stop:hover { background-color: #ffcfcf; }
            #custom-script-controls-container #toggleAutoActionsBtn.active-resume { background-color: #e0ffe0; border-color: #c0ffc0; }
            #custom-script-controls-container #toggleAutoActionsBtn.active-resume:hover { background-color: #cffccf; }

            #custom-script-controls-container #intervalStatus {
                display: inline-block; margin-left: 8px; font-weight: bold; min-width:70px; white-space: nowrap;
            }
            #quick-set-buttons-group > span { white-space: nowrap; margin-right: 3px; }

            /* Refresh Status Display */
            #refreshStatusDisplay {
                padding: 4px 8px;
                border-radius: 4px;
                font-weight: bold;
                white-space: nowrap;
                margin-right: 10px;
                min-width: 100px;
                text-align: center;
                transition: background-color 0.3s, color 0.3s;
            }
        `);
    };

    // --- Core Logic Control ---
    const stopAllTimersAndLog = (reason) => {
        const wasSearching = searchTimer !== null;
        const wasRefreshing = refreshTimer !== null;
        stopAutoSearch();
        stopAutoRefresh();
        if (wasSearching || wasRefreshing) {
            console.log(`[系统] ${reason}. Relevant timers stopped.`);
        }
        updateRefreshStatusDisplay(); // Update status when timers stop
    };

    const handleCurrentPageOrVisibilityState = () => {
        updateToggleButtonAppearance();
        if (manualStopActive) {
            stopAllTimersAndLog("Manual stop is active");
            updateRefreshStatusDisplay(); // Ensure status is updated
            return;
        }
        if (document.hidden) {
            stopAllTimersAndLog("Page hidden");
            updateRefreshStatusDisplay(); // Ensure status is updated
            return;
        }
        if (isTargetPage(CONFIG.SEARCH.PAGE_HASH)) {
            stopAutoRefresh();
            if (!searchTimer) {
                console.log('[系统] On search page. Attempting to start auto search.');
                startAutoSearch();
            }
        } else if (isTargetPage(CONFIG.REFRESH.PAGE_HASHES)) {
            stopAutoSearch();
            if (!refreshTimer) {
                console.log('[系统] On refresh page. Attempting to start auto refresh.');
                startAutoRefresh();
            }
        } else {
            stopAllTimersAndLog("Not on a target page");
        }
        updateRefreshStatusDisplay(); // Update status after evaluating page state
    };

    // --- Generic Functions ---
    const isTargetPage = (pageHashes) => {
        const currentHash = window.location.hash;
        if (Array.isArray(pageHashes)) {
            return pageHashes.includes(currentHash);
        }
        return currentHash === pageHashes;
    };

    const safeClick = (selector, actionName) => {
        try {
            const element = document.querySelector(selector);
            if (element) {
                element.click();
                console.log(`[成功] 已执行 ${actionName} ${new Date().toLocaleTimeString()}`);
                return true;
            } else {
                console.warn(`[警告] ${actionName} 按钮未找到 (选择器: ${selector})`);
                return false;
            }
        } catch (e) {
            console.error(`[错误] ${actionName} 失败:`, e);
            return false;
        }
    };

    // --- Search Related Functions ---
    const findSearchButton = () => {
        if (!isTargetPage(CONFIG.SEARCH.PAGE_HASH)) return null;
        const button = document.querySelector(CONFIG.SEARCH.BUTTON_SELECTOR)?.closest('button');
        if (button && getComputedStyle(button).display !== 'none' && button.offsetParent !== null) {
            return button;
        }
        return null;
    };

    const doSearchClick = () => {
        if (!isTargetPage(CONFIG.SEARCH.PAGE_HASH)) {
            stopAutoSearch();
            return;
        }
        const button = findSearchButton();
        if (button) {
            button.click();
            console.log(`[成功] 已执行搜索 ${new Date().toLocaleTimeString()} (间隔: ${CONFIG.SEARCH.REFRESH_INTERVAL / 1000}s)`);
        } else {
            console.warn('[警告] 搜索按钮未找到, 将在下次间隔时重试...');
        }
    };

    const startAutoSearch = (isIntervalChange = false) => {
        if (searchTimer) return;
        if (!isTargetPage(CONFIG.SEARCH.PAGE_HASH)) return;
        if (manualStopActive || document.hidden) return;

        console.log(`[系统] 启动自动搜索，间隔: ${CONFIG.SEARCH.REFRESH_INTERVAL / 1000} 秒`);
        searchTimer = setInterval(doSearchClick, CONFIG.SEARCH.REFRESH_INTERVAL);
        setTimeout(doSearchClick, isIntervalChange ? 100 : 1000);
        console.log('[系统] 自动搜索已启动');
        updateRefreshStatusDisplay(); // Update status when search starts
    };

    const stopAutoSearch = () => {
        if (searchTimer) {
            clearInterval(searchTimer);
            searchTimer = null;
            console.log('[系统] 自动搜索已停止');
            updateRefreshStatusDisplay(); // Update status when search stops
        }
    };

    // --- Refresh Related Functions ---
    const doRefreshClick = () => safeClick(CONFIG.REFRESH.REFRESH_ICON_SELECTOR, '刷新');

    const startAutoRefresh = () => {
        if (refreshTimer) return;
        if (!isTargetPage(CONFIG.REFRESH.PAGE_HASHES)) return;
        if (manualStopActive || document.hidden) return;

        refreshTimer = setInterval(doRefreshClick, CONFIG.REFRESH.INTERVAL);
        setTimeout(doRefreshClick, 1000);
        console.log('[系统] 自动刷新已启动');
        updateRefreshStatusDisplay(); // Update status when refresh starts
    };

    const stopAutoRefresh = () => {
        if (refreshTimer) {
            clearInterval(refreshTimer);
            refreshTimer = null;
            console.log('[系统] 自动刷新已停止');
            updateRefreshStatusDisplay(); // Update status when refresh stops
        }
    };

    // --------------- Initialization ---------------
    const init = () => {
        createSettingsUI();
        window.addEventListener('hashchange', () => {
            console.log('[系统] Hash changed to:', window.location.hash);
            stopAllTimersAndLog("Hash changed");
            if (isTargetPage(CONFIG.SEARCH.PAGE_HASH)) {
                setTimeout(handleCurrentPageOrVisibilityState, CONFIG.SEARCH.INIT_DELAY);
            } else {
                handleCurrentPageOrVisibilityState();
            }
        });
        document.addEventListener('visibilitychange', () => {
            console.log(`[系统] Page visibility changed to: ${document.hidden ? 'hidden' : 'visible'}`);
            handleCurrentPageOrVisibilityState();
        });
        console.log('[系统] 初始页面检查, Hash:', window.location.hash);
        if (isTargetPage(CONFIG.SEARCH.PAGE_HASH)) {
            setTimeout(handleCurrentPageOrVisibilityState, CONFIG.SEARCH.INIT_DELAY);
        } else {
            handleCurrentPageOrVisibilityState();
        }
        console.log('[系统] 脚本初始化完成');
    };

    // --------------- 启动 ---------------
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        setTimeout(init, 500);
    } else {
        window.addEventListener('load', () => setTimeout(init, 500), { once: true });
    }

})();