// ==UserScript==
// @name          代驾订单/司机列表自动调度 (UI美化版 - 可拖拽 - 可折叠)
// @namespace     http://tampermonkey.net/
// @version       2.0
// @description   功能不变，界面大升级：支持任意拖拽、折叠隐藏、记忆位置、更现代的UI风格。
// @author        郭 + You + Gemini (UI Optimization)
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

    // --------------- 状态变量 ---------------
    let searchTimer = null;
    let refreshTimer = null;
    let intervalInput = null;
    let statusSpan = null;
    let manualStopActive = GM_getValue('manualStopActive', false);
    let currentAutoActionStatus = 'stopped';
    let isCollapsed = GM_getValue('uiCollapsed', false); // UI折叠状态

    // --------------- UI 逻辑 ---------------

    // 1. 创建 UI 容器
    const createSettingsUI = () => {
        // 移除旧容器（防止重复）
        const oldContainer = document.getElementById('custom-script-controls-container');
        if (oldContainer) oldContainer.remove();

        const container = document.createElement('div');
        container.id = 'custom-script-controls-container';

        // 恢复上次保存的位置
        const savedPos = JSON.parse(GM_getValue('uiPosition', '{"top":"20px","right":"20px"}'));
        container.style.top = savedPos.top;
        container.style.right = savedPos.right;
        if(savedPos.left) container.style.left = savedPos.left; // 兼容拖拽后的 left

        // 构建 HTML 结构 (Header + Content)
        let quickButtonsHTML = QUICK_INTERVALS_SECONDS.map(s =>
            `<button class="quick-interval-btn" data-seconds="${s}">${s}s</button>`
        ).join('');

        const toggleIcon = isCollapsed ? '▼' : '▲';
        const displayStyle = isCollapsed ? 'none' : 'block';

        container.innerHTML = `
            <div id="panel-header">
                <span class="header-title">🚕 自动调度控制台</span>
                <div class="header-controls">
                    <span id="collapse-btn" title="折叠/展开">${toggleIcon}</span>
                </div>
            </div>
            <div id="panel-content" style="display: ${displayStyle};">
                <div class="control-row">
                    <div class="input-group">
                        <label>刷新间隔(秒)</label>
                        <input type="number" id="searchIntervalInput" min="1">
                        <button id="setSearchIntervalBtn" class="primary-btn">应用</button>
                    </div>
                </div>

                <div class="control-row quick-row">
                    <span class="label-text">快捷:</span>
                    <div class="btn-group">${quickButtonsHTML}</div>
                </div>

                <div class="status-bar">
                   <div id="intervalStatus"></div>
                </div>
            </div>
        `;

        document.body.appendChild(container);
        addCustomStyles();
        makeDraggable(container); // 启用拖拽

        // 绑定元素
        intervalInput = document.getElementById('searchIntervalInput');
        statusSpan = document.getElementById('intervalStatus');
        const setSearchIntervalBtn = document.getElementById('setSearchIntervalBtn');
        const collapseBtn = document.getElementById('collapse-btn');
        const panelContent = document.getElementById('panel-content');

        // 初始化数值
        intervalInput.value = CONFIG.SEARCH.REFRESH_INTERVAL / 1000;

        // 事件监听
        setSearchIntervalBtn.addEventListener('click', () => {
            applyNewSearchInterval(parseInt(intervalInput.value, 10));
        });

        document.querySelectorAll('.quick-interval-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const seconds = parseInt(e.target.dataset.seconds, 10);
                applyNewSearchInterval(seconds);
            });
        });

        // 折叠逻辑
        collapseBtn.addEventListener('click', () => {
            isCollapsed = !isCollapsed;
            GM_setValue('uiCollapsed', isCollapsed);
            panelContent.style.display = isCollapsed ? 'none' : 'block';
            collapseBtn.textContent = isCollapsed ? '▼' : '▲';
        });

        updateStatusDisplay();
    };

    // 2. 拖拽功能实现
    const makeDraggable = (element) => {
        const header = element.querySelector('#panel-header');
        let isDragging = false;
        let startX, startY, initialLeft, initialTop;

        header.addEventListener('mousedown', (e) => {
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            const rect = element.getBoundingClientRect();
            initialLeft = rect.left;
            initialTop = rect.top;
            header.style.cursor = 'grabbing';
            e.preventDefault(); // 防止选中文本
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;

            // 计算新位置
            const newLeft = initialLeft + dx;
            const newTop = initialTop + dy;

            element.style.left = `${newLeft}px`;
            element.style.top = `${newTop}px`;
            element.style.right = 'auto'; // 清除 right 属性，避免冲突
        });

        document.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                header.style.cursor = 'grab';
                // 保存位置
                const pos = {
                    left: element.style.left,
                    top: element.style.top,
                    right: 'auto'
                };
                GM_setValue('uiPosition', JSON.stringify(pos));
            }
        });
    };

    // 3. 样式表 (CSS)
    const addCustomStyles = () => {
        GM_addStyle(`
            #custom-script-controls-container {
                position: fixed;
                z-index: 10000;
                background-color: #fff;
                border-radius: 8px;
                box-shadow: 0 4px 15px rgba(0,0,0,0.15);
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
                font-size: 13px;
                width: 280px;
                border: 1px solid #ebeef5;
                transition: height 0.3s ease;
                overflow: hidden;
            }

            /* 标题栏 (拖拽区) */
            #panel-header {
                background-color: #f5f7fa;
                padding: 10px 15px;
                border-bottom: 1px solid #ebeef5;
                display: flex;
                justify-content: space-between;
                align-items: center;
                cursor: grab;
                user-select: none;
            }
            .header-title { font-weight: bold; color: #606266; }
            #collapse-btn { cursor: pointer; color: #909399; font-size: 12px; padding: 2px 5px;}
            #collapse-btn:hover { color: #409EFF; background: #ecf5ff; border-radius: 4px; }

            /* 内容区 */
            #panel-content { padding: 15px; }

            .control-row { margin-bottom: 12px; display: flex; align-items: center; }
            .input-group { display: flex; align-items: center; width: 100%; }
            .input-group label { margin-right: 8px; color: #606266; white-space: nowrap; }

            input[type="number"] {
                flex: 1;
                padding: 6px;
                border: 1px solid #dcdfe6;
                border-radius: 4px;
                margin-right: 8px;
                outline: none;
                transition: border-color 0.2s;
            }
            input[type="number"]:focus { border-color: #409EFF; }

            button {
                border: none;
                cursor: pointer;
                border-radius: 4px;
                font-size: 12px;
                padding: 6px 12px;
                transition: all 0.2s;
            }

            .primary-btn { background-color: #409EFF; color: white; }
            .primary-btn:hover { background-color: #66b1ff; }

            /* 快捷按钮组 */
            .quick-row { flex-wrap: wrap; margin-bottom: 15px; }
            .label-text { color: #909399; margin-right: 8px; font-size: 12px; }
            .btn-group { display: flex; gap: 5px; flex-wrap: wrap; }
            .quick-interval-btn {
                background-color: #f4f4f5;
                color: #606266;
                border: 1px solid #dcdfe6;
                padding: 4px 8px;
            }
            .quick-interval-btn:hover { color: #409EFF; border-color: #c6e2ff; background-color: #ecf5ff; }

            /* 状态栏 & 底部按钮 */
            .status-bar {
                border-top: 1px solid #ebeef5;
                padding-top: 10px;
                display: flex;
                justify-content: center;
            }

            #intervalStatus { width: 100%; }

            /* 状态显示内部布局 */
            .status-wrapper {
                display: flex;
                flex-direction: column;
                gap: 8px;
            }
            .status-text { font-weight: bold; text-align: center; display: block; margin-bottom: 5px;}

            /* 大号启停按钮 */
            .action-btn {
                width: 100%;
                padding: 8px 0;
                font-weight: bold;
                display: flex;
                justify-content: center;
                align-items: center;
                gap: 5px;
            }
            .action-btn.is-active { background-color: #f56c6c; color: white; } /* 停止红色 */
            .action-btn.is-active:hover { background-color: #f78989; }

            .action-btn.is-paused { background-color: #67c23a; color: white; } /* 恢复绿色 */
            .action-btn.is-paused:hover { background-color: #85ce61; }

            /* Element UI 图标字体hack (如果网页没加载element字体) */
             @font-face {
              font-family: 'element-icons';
              src: url('https://unpkg.com/element-ui/lib/theme-chalk/fonts/element-icons.woff') format('woff'),
                   url('https://unpkg.com/element-ui/lib/theme-chalk/fonts/element-icons.ttf') format('truetype');
            }
            [class^="el-icon-"], [class*=" el-icon-"] { font-family: 'element-icons' !important; }
        `);
    };

    // --------------- 核心逻辑 (逻辑部分保持稳健，适配新UI) ---------------

    const applyNewSearchInterval = (seconds) => {
        if (isNaN(seconds) || seconds < 1) {
            alert('请输入有效的秒数！');
            return false;
        }

        const newIntervalMs = seconds * 1000;
        CONFIG.SEARCH.REFRESH_INTERVAL = newIntervalMs;
        GM_setValue('searchInterval_ms', newIntervalMs);
        if (intervalInput) intervalInput.value = seconds;

        // 视觉反馈
        const btn = document.getElementById('setSearchIntervalBtn');
        const originText = btn.textContent;
        btn.textContent = "已保存";
        btn.style.backgroundColor = "#67C23A";
        setTimeout(() => {
            btn.textContent = originText;
            btn.style.backgroundColor = ""; // 恢复
        }, 1500);

        console.log(`[设置] 间隔更新为: ${seconds} 秒`);

        // 重启逻辑
        if (!manualStopActive && isTargetPage(CONFIG.SEARCH.PAGE_HASH) && document.visibilityState === 'visible') {
            stopAutoSearch();
            startAutoSearch(true);
        }
        updateStatusDisplay();
        return true;
    };

    const updateStatusDisplay = () => {
        if (!statusSpan) return;

        let statusText = '';
        let statusColor = '';
        let btnText = '';
        let btnClass = '';
        let iconClass = '';

        if (manualStopActive) {
            statusText = '🔴 已手动暂停';
            statusColor = '#909399';
            btnText = '恢复自动刷新';
            btnClass = 'is-paused'; // 绿色按钮用于恢复
            iconClass = 'el-icon-video-play';
        } else if (currentAutoActionStatus === 'searching') {
            statusText = `🔵 订单刷新中 (${CONFIG.SEARCH.REFRESH_INTERVAL / 1000}s)`;
            statusColor = '#409EFF';
            btnText = '暂停刷新';
            btnClass = 'is-active'; // 红色按钮用于停止
            iconClass = 'el-icon-video-pause';
        } else if (currentAutoActionStatus === 'refreshing') {
            statusText = `🟢 司机列表刷新中 (${CONFIG.REFRESH.INTERVAL / 1000}s)`;
            statusColor = '#67C23A';
            btnText = '暂停刷新';
            btnClass = 'is-active';
            iconClass = 'el-icon-video-pause';
        } else {
            statusText = '⚪ 待机中 (非目标页)';
            statusColor = '#F56C6C';
            btnText = '强制开始'; // 实际上点击只是切换手动状态，逻辑由页面检测决定
            btnClass = 'is-paused';
            iconClass = 'el-icon-video-play';
        }

        statusSpan.innerHTML = `
            <div class="status-wrapper">
                <span class="status-text" style="color:${statusColor}">${statusText}</span>
                <button id="toggleBtn" class="action-btn ${btnClass}">
                    <i class="${iconClass}"></i> ${btnText}
                </button>
            </div>
        `;

        document.getElementById('toggleBtn').addEventListener('click', () => {
            manualStopActive = !manualStopActive;
            GM_setValue('manualStopActive', manualStopActive);
            if (manualStopActive) {
                stopAllTimersAndLog("手动停止");
            } else {
                handleCurrentPageOrVisibilityState();
            }
            updateStatusDisplay();
        });
    };

    // --- 定时器与页面逻辑 (保持原逻辑) ---
    const stopAllTimersAndLog = (reason) => {
        stopAutoSearch();
        stopAutoRefresh();
        currentAutoActionStatus = 'stopped';
        updateStatusDisplay();
        if(reason) console.log(`[系统] 停止原因: ${reason}`);
    };

    const handleCurrentPageOrVisibilityState = () => {
        if (manualStopActive) {
            stopAllTimersAndLog();
            return;
        }
        if (document.hidden) {
            stopAllTimersAndLog("页面隐藏");
            return;
        }

        if (isTargetPage(CONFIG.SEARCH.PAGE_HASH)) {
            stopAutoRefresh();
            if (!searchTimer) startAutoSearch();
        } else if (isTargetPage(CONFIG.REFRESH.PAGE_HASHES)) {
            stopAutoSearch();
            if (!refreshTimer) startAutoRefresh();
        } else {
            stopAllTimersAndLog("非目标页面");
        }
    };

    const isTargetPage = (hashes) => {
        const current = window.location.hash;
        return Array.isArray(hashes) ? hashes.includes(current) : current === hashes;
    };

    const safeClick = (selector) => {
        const el = document.querySelector(selector);
        if (el) { el.click(); return true; }
        return false;
    };

    // 搜索逻辑
    const doSearchClick = () => {
        if (!isTargetPage(CONFIG.SEARCH.PAGE_HASH)) { stopAutoSearch(); return; }

        // 尝试查找按钮
        let btn = document.querySelector(CONFIG.SEARCH.BUTTON_SELECTOR);
        // 如果找不到，尝试找父级button（兼容element ui结构）
        if(!btn) {
             const icon = document.querySelector('.el-icon-search');
             if(icon) btn = icon.closest('button');
        }

        if (btn && btn.offsetParent !== null) {
            btn.click();
            console.log(`[搜索] ${new Date().toLocaleTimeString()}`);
        }
    };

    const startAutoSearch = (immediate = false) => {
        if (searchTimer) return;
        if (!isTargetPage(CONFIG.SEARCH.PAGE_HASH)) return;

        console.log(`[系统] 启动搜索 (间隔 ${CONFIG.SEARCH.REFRESH_INTERVAL}ms)`);
        searchTimer = setInterval(doSearchClick, CONFIG.SEARCH.REFRESH_INTERVAL);
        if (immediate) setTimeout(doSearchClick, 500);

        currentAutoActionStatus = 'searching';
        updateStatusDisplay();
    };

    const stopAutoSearch = () => {
        if (searchTimer) { clearInterval(searchTimer); searchTimer = null; }
    };

    // 刷新逻辑
    const doRefreshClick = () => safeClick(CONFIG.REFRESH.REFRESH_ICON_SELECTOR);

    const startAutoRefresh = () => {
        if (refreshTimer) return;
        refreshTimer = setInterval(doRefreshClick, CONFIG.REFRESH.INTERVAL);
        currentAutoActionStatus = 'refreshing';
        updateStatusDisplay();
    };

    const stopAutoRefresh = () => {
        if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
    };

    // --------------- 初始化 ---------------
    const init = () => {
        createSettingsUI();

        // Hash 和 可见性监听
        window.addEventListener('hashchange', () => {
            stopAllTimersAndLog();
            setTimeout(handleCurrentPageOrVisibilityState, 1500); // 留出Vue渲染时间
        });
        document.addEventListener('visibilitychange', handleCurrentPageOrVisibilityState);

        // 初始运行
        setTimeout(handleCurrentPageOrVisibilityState, 1500);
        console.log('[系统] 增强版UI脚本已加载');
    };

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        setTimeout(init, 500);
    } else {
        window.addEventListener('load', () => setTimeout(init, 500), { once: true });
    }
})();