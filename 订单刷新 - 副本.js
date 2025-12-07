// ==UserScript==
// @name          代驾订单/司机列表自动调度 (高级控制 - 长条 - 状态和图标 - 右上角固定 - 简化状态显示)
// @namespace     http://tampermonkey.net/
// @version       1.9 // 版本号增加，方便识别更新，表示UI和状态显示调整
// @description   在指定页面自动执行操作 (搜索/刷新), 可自定义订单刷新时间, 快捷设置, 手动启停, 增加状态显示及图标控制 (长条显示在右上角)
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
    let statusSpan = null; // 这个现在是状态和控制按钮的组合显示区域
    let manualStopActive = GM_getValue('manualStopActive', false);
    let currentAutoActionStatus = 'stopped'; // 'searching', 'refreshing', 'stopped'

    // --------------- 函数 ---------------

    // --- UI & Settings Functions ---
    const applyNewSearchInterval = (seconds) => {
        if (isNaN(seconds) || seconds < 1) {
            const originalStatusText = statusSpan.textContent;
            const originalStatusColor = statusSpan.style.color;
            statusSpan.textContent = '无效值!';
            statusSpan.style.color = 'red';
            setTimeout(() => {
                statusSpan.textContent = originalStatusText;
                statusSpan.style.color = originalStatusColor;
            }, 3000);
            return false;
        }

        const newIntervalMs = seconds * 1000;
        CONFIG.SEARCH.REFRESH_INTERVAL = newIntervalMs;
        GM_setValue('searchInterval_ms', newIntervalMs);
        if (intervalInput) intervalInput.value = seconds;

        const originalStatusText = statusSpan.textContent;
        const originalStatusColor = statusSpan.style.color;
        statusSpan.textContent = `已设为 ${seconds} 秒`;
        statusSpan.style.color = 'green';
        console.log(`[设置] 订单刷新间隔已更新为: ${seconds} 秒`);
        setTimeout(() => {
            statusSpan.textContent = originalStatusText;
            statusSpan.style.color = originalStatusColor;
            updateStatusDisplay(); // 恢复到当前工作状态显示
        }, 3000);


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

    const updateStatusDisplay = () => {
        if (!statusSpan) return;

        let statusText = '';
        let statusColor = '';
        let iconClass = '';
        let buttonText = '';

        if (manualStopActive) {
            statusText = '已暂停';
            statusColor = '#909399'; // 灰色
            buttonText = '点我继续刷新';
            iconClass = 'el-icon-video-play'; // 播放图标
        } else if (currentAutoActionStatus === 'searching') {
            statusText = `正在刷新订单 (${CONFIG.SEARCH.REFRESH_INTERVAL / 1000}s)`;
            statusColor = '#409EFF'; // 蓝色
            buttonText = '点我停止刷新';
            iconClass = 'el-icon-video-pause'; // 暂停图标
        } else if (currentAutoActionStatus === 'refreshing') {
            statusText = `正在刷新司机列表 (${CONFIG.REFRESH.INTERVAL / 1000}s)`;
            statusColor = '#67C23A'; // 绿色
            buttonText = '点我停止刷新';
            iconClass = 'el-icon-video-pause'; // 暂停图标
        } else { // 脚本处于非活动页面或未启动状态
            statusText = '未运行'; // 简化状态，避免“空闲/停止”
            statusColor = '#F56C6C'; // 红色
            buttonText = '点我继续刷新';
            iconClass = 'el-icon-video-play'; // 播放图标
        }

        statusSpan.innerHTML = ''; // 清空内容
        statusSpan.style.color = statusColor;

        const button = document.createElement('button');
        button.id = 'toggleAutoActionsBtn';
        button.classList.add(manualStopActive ? 'active-resume' : 'active-stop');
        const icon = document.createElement('i');
        icon.className = iconClass;
        button.appendChild(icon);
        button.appendChild(document.createTextNode(' ' + buttonText));

        button.addEventListener('click', () => {
            manualStopActive = !manualStopActive;
            GM_setValue('manualStopActive', manualStopActive);
            if (manualStopActive) {
                stopAllTimersAndLog("手动停止");
            } else {
                console.log("[控制] 手动恢复自动操作。重新评估页面状态。");
                handleCurrentPageOrVisibilityState();
            }
            updateStatusDisplay(); // 更新显示状态
        });

        statusSpan.appendChild(button);
        const statusTextNode = document.createTextNode(` | 状态: ${statusText}`);
        statusSpan.appendChild(statusTextNode);
    };


    const createSettingsUI = () => {
        const container = document.createElement('div');
        container.id = 'custom-script-controls-container';

        let quickButtonsHTML = QUICK_INTERVALS_SECONDS.map(s =>
            `<button class="quick-interval-btn" data-seconds="${s}">${s}s</button>`
        ).join('');

        container.innerHTML = `
            <div id="top-row-controls">
                <div id="interval-config-group">
                    <label for="searchIntervalInput">订单刷新 (秒):</label>
                    <input type="number" id="searchIntervalInput" min="1">
                    <button id="setSearchIntervalBtn">设置</button>
                </div>
                <div id="master-control-group">
                    <span id="intervalStatus"></span>
                </div>
            </div>
            <div id="quick-set-buttons-group">
                <span>快捷: </span>${quickButtonsHTML}
            </div>
        `;
        document.body.appendChild(container);
        addCustomStyles(); // 应用样式

        intervalInput = document.getElementById('searchIntervalInput');
        statusSpan = document.getElementById('intervalStatus'); // 状态和按钮结合的区域
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

        updateStatusDisplay(); // 初始化状态显示
    };

    const addCustomStyles = () => {
        GM_addStyle(`
            #custom-script-controls-container {
                position: fixed;
                top: 24px;
                right: 640px !important;
                left: auto;
                transform: none;
                background-color: #ffffff;
                padding: 8px 12px;
                border: 1px solid #cccccc;
                border-radius: 8px;
                z-index: 10000;
                font-size: 13px;
                box-shadow: 0 3px 10px rgba(0,0,0,0.12);
                display: flex; /* 主容器变为 flex 列 */
                flex-direction: column; /* 子元素垂直堆叠 */
                align-items: flex-start; /* 子元素左对齐 */
                width: auto;
                max-width: 95vw;
            }

            #top-row-controls {
                display: flex;
                flex-wrap: nowrap;
                align-items: center;
                margin-bottom: 8px; /* 上行与快捷按钮组之间的间距 */
                width: 100%; /* 占据父容器的全部宽度 */
                justify-content: space-between; /* 将停止/继续按钮推到最右边 */
            }

            #interval-config-group {
                display: flex;
                align-items: center;
                margin-right: 12px; /* 组内间距 */
                padding: 0 5px;
            }

            #master-control-group {
                display: flex;
                align-items: center;
                padding: 0 5px;
            }

            #quick-set-buttons-group {
                display: flex;
                align-items: center;
                padding: 0 5px;
                width: 100%;
                margin-top: 5px; /* 快捷按钮组上方的间距 */
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
                display: flex;
                align-items: center;
            }
            #custom-script-controls-container button i {
                margin-right: 4px;
            }
            #custom-script-controls-container button:hover { background-color: #e0e0e0; }
            #custom-script-controls-container #setSearchIntervalBtn { background-color: #e6f3ff; border-color: #b3d9ff;}
            #custom-script-controls-container #setSearchIntervalBtn:hover { background-color: #d1e9ff; }
            #custom-script-controls-container .quick-interval-btn { background-color: #f9f9f9; }

            /* 调整 #toggleAutoActionsBtn 样式，因为它现在是动态创建到 #intervalStatus 内部 */
            #intervalStatus #toggleAutoActionsBtn.active-stop { background-color: #ffe0e0; border-color: #ffc0c0; }
            #intervalStatus #toggleAutoActionsBtn.active-stop:hover { background-color: #ffcfcf; }
            #intervalStatus #toggleAutoActionsBtn.active-resume { background-color: #e0ffe0; border-color: #c0ffc0; }
            #intervalStatus #toggleAutoActionsBtn.active-resume:hover { background-color: #cffccf; }

            #intervalStatus {
                display: flex; /* 让按钮和文本在同一行 */
                align-items: center;
                margin-left: 8px;
                font-weight: bold;
                min-width: 220px; /* 确保有足够空间显示按钮和状态文本 */
                white-space: nowrap;
                text-align: left;
            }
            #quick-set-buttons-group > span { white-space: nowrap; margin-right: 3px; }

            /* Element UI 图标的基础样式，确保图标能显示 */
            /* 实际的 Unicode 编码可能需要根据Element UI版本核对 */
            .el-icon-video-play:before { content: "\\e628"; font-family: 'element-icons'; }
            .el-icon-video-pause:before { content: "\\e62a"; font-family: 'element-icons'; }
            /* 如果页面没有加载 Element UI 的字体，可能需要添加以下 @font-face 规则：*/
            /*
            @font-face {
              font-family: 'element-icons';
              src: url('https://unpkg.com/element-ui/lib/theme-chalk/fonts/element-icons.woff') format('woff'),
                   url('https://unpkg.com/element-ui/lib/theme-chalk/fonts/element-icons.ttf') format('truetype');
              font-weight: normal;
              font-style: normal;
            }
            */
        `);
    };

    // --- Core Logic Control ---
    const stopAllTimersAndLog = (reason) => {
        const wasSearching = searchTimer !== null;
        const wasRefreshing = refreshTimer !== null;
        stopAutoSearch();
        stopAutoRefresh();
        if (wasSearching || wasRefreshing) {
            console.log(`[系统] ${reason}. 相关定时器已停止。`);
        }
        currentAutoActionStatus = 'stopped';
        updateStatusDisplay();
    };

    const handleCurrentPageOrVisibilityState = () => {
        if (manualStopActive) {
            stopAllTimersAndLog("手动停止已激活");
            updateStatusDisplay(); // 确保状态显示为“已暂停”
            return;
        }
        if (document.hidden) {
            stopAllTimersAndLog("页面不可见");
            return;
        }
        if (isTargetPage(CONFIG.SEARCH.PAGE_HASH)) {
            stopAutoRefresh(); // 在订单页面时停止司机列表刷新
            if (!searchTimer) {
                console.log('[系统] 当前在订单页面。尝试启动自动搜索。');
                startAutoSearch();
            }
            currentAutoActionStatus = 'searching';
        } else if (isTargetPage(CONFIG.REFRESH.PAGE_HASHES)) {
            stopAutoSearch(); // 在司机列表页面时停止订单搜索
            if (!refreshTimer) {
                console.log('[系统] 当前在司机页面。尝试启动自动刷新。');
                startAutoRefresh();
            }
            currentAutoActionStatus = 'refreshing';
        } else {
            stopAllTimersAndLog("不在目标页面");
        }
        updateStatusDisplay();
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
        // 检查按钮是否可见且可交互
        if (button && getComputedStyle(button).display !== 'none' && button.offsetParent !== null) {
            return button;
        }
        return null;
    };

    const doSearchClick = () => {
        if (!isTargetPage(CONFIG.SEARCH.PAGE_HASH)) {
            stopAutoSearch();
            updateStatusDisplay(); // 页面改变时更新状态
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
        setTimeout(doSearchClick, isIntervalChange ? 100 : 1000); // 立即点击或稍后点击
        console.log('[系统] 自动搜索已启动');
        currentAutoActionStatus = 'searching';
        updateStatusDisplay();
    };

    const stopAutoSearch = () => {
        if (searchTimer) {
            clearInterval(searchTimer);
            searchTimer = null;
            console.log('[系统] 自动搜索已停止');
            // 不需要在这里设置 currentAutoActionStatus 为 stopped，因为 handleCurrentPageOrVisibilityState 会统一处理
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
        currentAutoActionStatus = 'refreshing';
        updateStatusDisplay();
    };

    const stopAutoRefresh = () => {
        if (refreshTimer) {
            clearInterval(refreshTimer);
            refreshTimer = null;
            console.log('[系统] 自动刷新已停止');
            // 不需要在这里设置 currentAutoActionStatus 为 stopped，因为 handleCurrentPageOrVisibilityState 会统一处理
        }
    };

    // --------------- 初始化 ---------------
    const init = () => {
        createSettingsUI();
        window.addEventListener('hashchange', () => {
            console.log('[系统] Hash 改变为:', window.location.hash);
            stopAllTimersAndLog("Hash 改变"); // 立即停止所有定时器
            // 为订单页面添加小延迟，确保元素加载完成
            if (isTargetPage(CONFIG.SEARCH.PAGE_HASH)) {
                setTimeout(handleCurrentPageOrVisibilityState, CONFIG.SEARCH.INIT_DELAY);
            } else {
                handleCurrentPageOrVisibilityState();
            }
        });
        document.addEventListener('visibilitychange', () => {
            console.log(`[系统] 页面可见性改变为: ${document.hidden ? '隐藏' : '可见'}`);
            handleCurrentPageOrVisibilityState();
        });
        console.log('[系统] 初始页面检查, Hash:', window.location.hash);
        // 初始检查，为订单页面添加延迟
        if (isTargetPage(CONFIG.SEARCH.PAGE_HASH)) {
            setTimeout(handleCurrentPageOrVisibilityState, CONFIG.SEARCH.INIT_DELAY);
        } else {
            handleCurrentPageOrVisibilityState();
        }
        console.log('[系统] 脚本初始化完成');
    };

    // --------------- 启动 ---------------
    // 使用 'load' 事件确保 DOM 和资源加载完成，并添加少量延迟
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        setTimeout(init, 500);
    } else {
        window.addEventListener('load', () => setTimeout(init, 500), { once: true });
    }

})();