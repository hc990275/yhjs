// ==UserScript==
// @name          代驾调度系统助手
// @namespace     http://tampermonkey.net/
// @version       2.6.0
// @description   【三界面独立面板】订单管理默认收起，指派/司机界面默认展开，三界面独立存储互不干扰。
// @author        郭
// @match         https://admin.v3.jiuzhoudaijiaapi.cn/*
// @connect       txt.abcai.online
// @connect       abcai.online
// @connect       *
// @grant         GM_setValue
// @grant         GM_getValue
// @grant         GM_addStyle
// @grant         GM_xmlhttpRequest
// @grant         GM_info
// @grant         GM_openInTab
// @grant         GM_setClipboard
// @grant         unsafeWindow
// @require       https://cdn.jsdelivr.net/npm/pinyin-match/dist/main.js
// ==/UserScript==

(function () {
    'use strict';

    // --------------- 1. 配置中心 ---------------
    const CONFIG = {
        // 【抓取与排除配置】
        SCRAPE: {
            PHONE_COL_INDEX: 3,   // [左] 乘客电话 (第3列)
            ADDR_COL_INDEX: 7,    // [主] 乘客起点 (第7列)
            EXCLUDE_COL_INDEX: 2,     // [左] 订单来源 (第2列)
            EXCLUDE_NAMES: ['新腾讯出行', '盛大', '腾讯出行', '盛大大地模式'],
            CANCEL_COL_INDEX: 1,  // [左] 订单状态 (第1列)
            CANCEL_KEYWORDS: ['乘客取消', '后台销单'] // 消单关键词
        },
        ORDER: {
            HASH: '#/substituteDrivingOrder',
            TITLE: '订单管理',
            DEFAULT_INTERVAL: 20,
            BUTTON_SELECTOR: 'button.el-button.el-button--primary.el-button--small i.el-icon-search',
            ALT_SELECTOR: '.el-icon-search'
        },
        DRIVER: {
            HASH: '#/driverAll',
            TITLE: '司机调度',
            DEFAULT_INTERVAL: 1,
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
            FALLBACK_BLACKLIST_URL: "https://github.abcai.online/share/hc990275%2Fyhjs%2Fmain%2Fjzdj%2Fglk?sign=yf2kve&t=1767326208607",
            SYNC_URL: GM_getValue('cloud_sync_url', 'https://txt.abcai.online'),
            SYNC_TOKEN: GM_getValue('cloud_sync_token', '990299')
        },
        STORAGE: {
            MAX_ITEMS: 800000
        }
    };

    // --------------- 2. 全局状态 ---------------
    const safeParse = (key, def) => {
        try {
            return JSON.parse(GM_getValue(key, def));
        } catch (e) { return JSON.parse(def); }
    };
    let state = {
        currentHash: window.location.hash,
        // [修改] 三界面独立的面板折叠状态，互不干扰
        orderCollapsed: GM_getValue('orderCollapsed', true),   // 订单管理：默认收起
        dispatchCollapsed: GM_getValue('dispatchCollapsed', false),  // 订单指派：默认展开
        driverCollapsed: GM_getValue('driverCollapsed', false),  // 司机调度：默认展开
        manualPause: GM_getValue('manualPause', false),
        driverManualPause: GM_getValue('driverManualPause', false), // [新增] 司机调度独立暂停状态
        isScrapingEnabled: GM_getValue('scrapeEnabled', false),
        autoRemark: GM_getValue('autoRemark', false), // [新增] 自动备注拉群
        debugMode: GM_getValue('debugMode', false), // [持久化] 调试模式
        debugTimer: null,

        refreshInterval: 20,
        countdown: 0,
        timerId: null,
        scrapeObserver: null,

        posKey: 'posMain',
        scaleKey: 'uiScale',
        posMain: safeParse('posMain', '{"top":"80px","left":"20px"}'),
        posAddr: safeParse('posAddr', '{"top":"80px","left":"300px"}'),
        uiScale: parseFloat(GM_getValue('uiScale', '1.0')),
        layout: safeParse('uiLayout', '{"width": 280, "height": 350}'),
        colWidth: parseInt(GM_getValue('addrColWidth', 80)),
        cancelColIndex: parseInt(GM_getValue('cancelColIndex', -1)), // [新增] 消单列号配置

        db: {
            addrs: safeParse('dbAddrs', '[]'),
            phones: safeParse('dbPhones', '[]')
        },

        blacklist: GM_getValue('blacklist', '位置，电话，司机，请您，收到，偏远地区，已派单，代驾，师傅，安全，感谢，马上，联系，好的'),

        viewTab: GM_getValue('viewTab', 'address'),
        searchText: '',
        currentVersion: GM_info.script.version,
        timeConfig: safeParse('timeConfig', '{"start":"20:00", "end":"22:00"}'),
        theme: GM_getValue('theme', 'light')
    };

    const migrateOldData = () => {
        const oldHistory = safeParse('clipHistory', null);
        if (oldHistory) {
            if (oldHistory.addrs) oldHistory.addrs.forEach(a => addToDB('address', a));
            if (oldHistory.phones) oldHistory.phones.forEach(p => addToDB('phone', p));
            GM_setValue('clipHistory', '');
        }
    };

    const log = (text, type = 'info') => {
        const styles = {
            'info': 'color: #409EFF; font-weight: bold;',
            'success': 'color: #67C23A; font-weight: bold;',
            'warning': 'color: #E6A23C; font-weight: bold;',
            'error': 'color: #F56C6C; font-weight: bold;'
        };
        console.log(`%c[助手] ${text}`, styles[type] || styles['info']);
    };

    // --------------- 3. 核心逻辑 ---------------

    const reloadDB = () => {
        const oldLenAddr = state.db.addrs.length;
        state.db.addrs = safeParse('dbAddrs', '[]');
        state.db.phones = safeParse('dbPhones', '[]');
        if (oldLenAddr !== state.db.addrs.length && isDispatchPage()) {
            updateListsUI();
            log(`🔄 数据库已同步 | 地址: ${state.db.addrs.length} | 电话: ${state.db.phones.length}`, 'info');
        }
    };

    const checkPage = () => {
        state.currentHash = window.location.hash;
        reloadDB();

        // [修改] 动态化各界面的面板位置与缩放存储Key
        state.posKey = isOrderPage() ? 'posMain_order' : isDispatchPage() ? 'posMain_dispatch' : isDriverPage() ? 'posMain_driver' : 'posMain';
        state.scaleKey = isOrderPage() ? 'uiScale_order' : isDispatchPage() ? 'uiScale_dispatch' : isDriverPage() ? 'uiScale_driver' : 'uiScale';
        state.posMain = safeParse(state.posKey, '{"top":"80px","left":"20px"}');
        state.uiScale = parseFloat(GM_getValue(state.scaleKey, '1.0'));

        if (isOrderPage()) {
            state.refreshInterval = GM_getValue('orderInterval', CONFIG.ORDER.DEFAULT_INTERVAL);
            setupTableObserver();
        } else {
            disconnectTableObserver();
        }

        if (isDriverPage()) {
            let saved = GM_getValue('driverInterval');
            if (!saved) saved = CONFIG.DRIVER.DEFAULT_INTERVAL;
            state.refreshInterval = saved;

            // 修复初次加载时互相冲突的状态
            if (state.driverApiDark && state.driverCssDark) {
                state.driverApiDark = false;
                GM_setValue('driverApiDark', false);
            }

            applyDriverMapTheme(); // 应用司机页地图主题
        }

        if (isDispatchPage()) {
            state.refreshInterval = CONFIG.DISPATCH.RAPID_INTERVAL / 1000;
            log('进入派单界面 (终极修正版)', 'info');
            setTimeout(applyDistanceByTime, 1500);
        }

        updateUI();
        if (isDispatchPage()) {
            if (!state.manualPause) startRapidRefresh();
        } else {
            stopRapidRefresh();
        }

        if (isDriverPage()) {
            if (!state.driverManualPause) startDriverRefresh();
            else stopDriverRefresh();
        } else {
            stopDriverRefresh();
        }

        if (isOrderPage()) {
            if (!state.manualPause && !state.timerId) startCountdown();
        } else {
            stopCountdown();
        }
    };

    const isOrderPage = () => state.currentHash.includes(CONFIG.ORDER.HASH);
    const isDispatchPage = () => state.currentHash.includes(CONFIG.DISPATCH.HASH);
    const isDriverPage = () => state.currentHash.includes(CONFIG.DRIVER.HASH);

    // [新增] 统一判断当前页面是否暂停
    const isPaused = () => {
        if (isOrderPage()) return state.manualPause;
        if (isDriverPage()) return state.driverManualPause;
        return false;
    };

    // [新增] 返回当前界面的面板折叠状态
    const getCollapsed = () => {
        if (isOrderPage()) return state.orderCollapsed;
        if (isDispatchPage()) return state.dispatchCollapsed;
        if (isDriverPage()) return state.driverCollapsed;
        return false;
    };
    // [新增] 设置当前界面的面板折叠状态并持久化
    const setCollapsed = (val) => {
        if (isOrderPage()) { state.orderCollapsed = val; GM_setValue('orderCollapsed', val); }
        else if (isDispatchPage()) { state.dispatchCollapsed = val; GM_setValue('dispatchCollapsed', val); }
        else if (isDriverPage()) { state.driverCollapsed = val; GM_setValue('driverCollapsed', val); }
    };

    // ==============================================
    //        核心修正：防重复抓取 + 本地存储
    // ==============================================

    const setupTableObserver = () => {
        if (state.scrapeObserver) return;
        const targetNode = document.body;
        const config = { childList: true, subtree: true };
        let timeout = null;
        state.scrapeObserver = new MutationObserver((mutationsList) => {
            if (!state.isScrapingEnabled) return;
            let hasTableChange = false;
            for (let mutation of mutationsList) {
                if (mutation.target.classList &&
                    (mutation.target.classList.contains('el-table__row') ||
                        mutation.target.nodeName === 'TBODY')) {
                    hasTableChange = true;
                    break;
                }
            }
            if (timeout) clearTimeout(timeout);
            timeout = setTimeout(() => { scanOrderPage(); }, 800);
        });
        state.scrapeObserver.observe(targetNode, config);
    };

    const disconnectTableObserver = () => {
        if (state.scrapeObserver) {
            state.scrapeObserver.disconnect();
            state.scrapeObserver = null;
        }
    };

    // 核心扫描函数
    const scanOrderPage = () => {
        if (!isOrderPage() || !state.isScrapingEnabled) return;
        const idxExclude = CONFIG.SCRAPE.EXCLUDE_COL_INDEX;
        const idxPhone = CONFIG.SCRAPE.PHONE_COL_INDEX;
        const idxAddr = CONFIG.SCRAPE.ADDR_COL_INDEX;
        const excludeKeywords = CONFIG.SCRAPE.EXCLUDE_NAMES || [];

        // [Fix] 同时获取主表格与固定列表格的行，用于合并数据
        const mainRows = Array.from(document.querySelectorAll('.el-table__body-wrapper .el-table__row'));
        const fixedRows = Array.from(document.querySelectorAll('.el-table__fixed .el-table__fixed-body-wrapper .el-table__row'));
        const fixedRightRows = Array.from(document.querySelectorAll('.el-table__fixed-right .el-table__fixed-body-wrapper .el-table__row'));

        let newCount = 0;

        // 辅助函数：获取某行某列的文本（优先取主表，空则取固定表）
        const getCellText = (rowIndex, colIndex) => {
            let text = '';
            // 1. 尝试主表
            if (mainRows[rowIndex] && mainRows[rowIndex].cells[colIndex]) {
                text = mainRows[rowIndex].cells[colIndex].innerText.trim();
            }
            // 2. 如果为空，尝试左侧固定表
            if (!text && fixedRows[rowIndex] && fixedRows[rowIndex].cells[colIndex]) {
                text = fixedRows[rowIndex].cells[colIndex].innerText.trim();
            }
            // 3. 如果仍为空，尝试右侧固定表
            // 注意：右侧固定表的 colIndex 可能不对应，ElementUI通常是克隆对应列
            // 但也可能是按 visbile columns 排列。这里假设索引一致或能通过 querySelector 找到。
            // 简单起见，如果 colIndex 很大，尝试右侧表对应的“倒数”索引？
            // ElementUI 右侧固定表通常包含完整的 tr，但只显示部分 td。
            // 直接尝试索引读取。
            if (!text && fixedRightRows[rowIndex] && fixedRightRows[rowIndex].cells[colIndex]) {
                text = fixedRightRows[rowIndex].cells[colIndex].innerText.trim();
            }
            return text;
        };

        const getCellNumber = (rowIndex, colIndex) => {
            const txt = getCellText(rowIndex, colIndex);
            return txt.replace(/\D/g, '');
        };

        mainRows.forEach((row, rowIndex) => {
            // 使用 getCellText 获取关键数据

            // 0. [新增] 消单自动剔除
            // 优先使用 CONFIG 配置，如果没有配置则使用手动设置
            const idxCancel = CONFIG.SCRAPE.CANCEL_COL_INDEX !== null ? CONFIG.SCRAPE.CANCEL_COL_INDEX : state.cancelColIndex;
            if (idxCancel !== -1) {
                const statusText = getCellText(rowIndex, idxCancel);
                const cancelKeywords = CONFIG.SCRAPE.CANCEL_KEYWORDS || ['乘客取消', '后台销单'];
                if (cancelKeywords.some(kw => statusText.includes(kw))) {
                    if (idxPhone !== null) {
                        const rawPhone = getCellNumber(rowIndex, idxPhone);
                        if (/^1\d{10}$/.test(rawPhone)) {
                            removeFromDB('phone', rawPhone);
                        }
                    }
                    return; // 消单行不进行后续抓取
                }
            }

            // 1. 排除逻辑 (来源过滤)
            if (idxExclude !== null) {
                const checkText = getCellText(rowIndex, idxExclude);
                const excludeKeywords = CONFIG.SCRAPE.EXCLUDE_NAMES || [];
                // 检查是否包含屏蔽关键词
                if (excludeKeywords.some(kw => checkText.includes(kw))) {
                    // [新增] 如果是屏蔽来源，尝试从库中删除该行地址（如果之前误录入）
                    if (idxAddr !== null) {
                        const addrToRemove = getCellText(rowIndex, idxAddr);
                        if (addrToRemove && addrToRemove.length > 1) {
                            removeFromDB('address', addrToRemove);
                        }
                    }
                    return; // 跳过此行，不录入
                }
            }

            // 2. 抓取电话
            if (idxPhone !== null) {
                const cleanNum = getCellNumber(rowIndex, idxPhone);
                if (/^1\d{10}$/.test(cleanNum)) {
                    if (!state.db.phones.includes(cleanNum)) {
                        if (addToDB('phone', cleanNum, idxPhone)) newCount++;
                    }
                }
            }

            // 3. 抓取地址
            if (idxAddr !== null) {
                const addrText = getCellText(rowIndex, idxAddr);
                if (addrText && addrText.length > 1) {
                    const blockers = state.blacklist.split(/[,，]/).map(s => s.trim()).filter(s => s);
                    if (!blockers.some(b => addrText.includes(b))) {
                        if (!/^\d{4}-\d{2}-\d{2}/.test(addrText)) {
                            if (!state.db.addrs.includes(addrText)) {
                                if (addToDB('address', addrText, idxAddr)) newCount++;
                            }
                        }
                    }
                }
            }
        });
        if (newCount > 0) updateListsUI();

        // 4. [修改] 调试模式：显示合并后的列信息
        if (state.debugMode) {
            debugRowInfo(mainRows, fixedRows, fixedRightRows);
        }
    };

    // [修改] 调试列信息 (接受所有表引用)
    const debugRowInfo = (mainRows, fixedRows, fixedRightRows) => {
        if (!mainRows || mainRows.length === 0) return;
        const rowIndex = 0; // 只看第一行

        // 找出最大的列数
        let maxCols = 0;
        if (mainRows[0]) maxCols = Math.max(maxCols, mainRows[0].cells.length);
        if (fixedRows[0]) maxCols = Math.max(maxCols, fixedRows[0].cells.length);

        let debugText = `=== 🛠️ 调试模式: 综合行数据 (Index 0) ===\n`;

        for (let i = 0; i < maxCols; i++) {
            let parts = [];
            // 主表
            if (mainRows[0] && mainRows[0].cells[i]) {
                const txt = mainRows[0].cells[i].innerText.replace(/[\r\n]+/g, ' ').trim();
                if (txt) parts.push(`[主]${txt}`);
            }
            // 左固定
            if (fixedRows[0] && fixedRows[0].cells[i]) {
                const txt = fixedRows[0].cells[i].innerText.replace(/[\r\n]+/g, ' ').trim();
                if (txt) parts.push(`[左]${txt}`);
            }
            // 右固定
            if (fixedRightRows[0] && fixedRightRows[0].cells[i]) {
                const txt = fixedRightRows[0].cells[i].innerText.replace(/[\r\n]+/g, ' ').trim();
                if (txt) parts.push(`[右]${txt}`);
            }

            if (parts.length > 0) {
                debugText += `[列 ${i}]: ${parts.join(' | ').substring(0, 30)}\n`;
            } else {
                // debugText += `[列 ${i}]: (空)\n`; // 可选：不显示空列以减少干扰
            }
        }

        const debugPanel = document.getElementById('gj-debug-console');
        if (debugPanel) {
            debugPanel.textContent = debugText;
        } else {
            console.log(debugText);
        }
    };

    // ==============================================
    //        核心存储函数
    // ==============================================
    const addToDB = (type, value, sourceIdx = null) => {
        if (!value) return false;
        const storageKey = type === 'address' ? 'dbAddrs' : 'dbPhones';

        let currentList = [];
        try {
            const raw = GM_getValue(storageKey, '[]');
            currentList = JSON.parse(raw);
        } catch (e) { currentList = []; }

        const existingIndex = currentList.indexOf(value);
        let isReorder = false;

        // 如果存在，先删除（实现置顶）
        if (existingIndex > -1) {
            currentList.splice(existingIndex, 1);
            isReorder = true;
        }

        currentList.unshift(value);

        if (currentList.length > CONFIG.STORAGE.MAX_ITEMS) {
            currentList.length = CONFIG.STORAGE.MAX_ITEMS;
        }

        GM_setValue(storageKey, JSON.stringify(currentList));
        if (type === 'address') state.db.addrs = currentList;
        else state.db.phones = currentList;

        if (sourceIdx !== null) {
            log(`💾 [已保存] ${type === 'address' ? '地址' : '电话'}: ${value} (来源: 第${sourceIdx + 1}列)`, 'success');
        } else if (isReorder) {
            // 手动填充时会触发置顶
            log(`🔄 [已置顶] ${type === 'address' ? '地址' : '电话'}: ${value}`, 'warning');
        } else {
            log(`🆕 [新录入] ${type === 'address' ? '地址' : '电话'}: ${value}`, 'success');
        }
        return true;
    };

    // [新增] 从本地库移除
    const removeFromDB = (type, value) => {
        if (!value) return;
        const storageKey = type === 'address' ? 'dbAddrs' : 'dbPhones';
        const list = type === 'address' ? state.db.addrs : state.db.phones;

        const idx = list.indexOf(value);
        if (idx > -1) {
            list.splice(idx, 1);
            GM_setValue(storageKey, JSON.stringify(list));
            log(`🗑️ [自动剔除] 发现消单/取消, 已移除${type === 'address' ? '地址' : '电话'}: ${value}`, 'warning');
            updateListsUI();
        }
    };

    // ==============================================
    //               云端同步 / 数据库
    // ==============================================

    // 【关键修复】清洗数据库，去除不合理的长度限制
    const cleanDBWithBlacklist = () => {
        let currentAddrs = safeParse('dbAddrs', '[]');
        if (!currentAddrs || currentAddrs.length === 0) return;

        const blockers = state.blacklist.split(/[,，]/).map(s => s.trim()).filter(s => s);
        const originalCount = currentAddrs.length;

        const keptAddrs = [];
        const removedAddrs = [];

        currentAddrs.forEach(addr => {
            // 1. 黑名单检查
            const hit = blockers.find(keyword => addr.includes(keyword));
            if (hit) {
                removedAddrs.push({ addr: addr, reason: `黑名单: ${hit}` });
            } else {
                keptAddrs.push(addr);
            }
            // 2. 【已移除】原先的汉字>6检查已彻底删除，确保长地址不丢失
        });

        if (removedAddrs.length > 0) {
            console.groupCollapsed(`🗑️ [自动清洗] 移除了 ${removedAddrs.length} 条无效地址`);
            removedAddrs.forEach(item => console.log(`❌ 删除: "${item.addr}" (原因: ${item.reason})`));
            console.groupEnd();

            GM_setValue('dbAddrs', JSON.stringify(keptAddrs));
            state.db.addrs = keptAddrs;
            updateListsUI();
        }
    };

    const pullFromCloud = (isAuto = false) => {
        const url = CONFIG.CLOUD.SYNC_URL;
        const token = CONFIG.CLOUD.SYNC_TOKEN;

        if (!url || !token) {
            if (!isAuto) {
                alert('请先点击 ⚙️ 设置 Worker 域名和 Token');
                setupCloudConfig();
            }
            return;
        }

        const targetUrl = `${url.replace(/\/$/, '')}/txt?token=${token}`;
        if (!isAuto) log('正在全量拉取(覆盖模式)...', 'info');
        GM_xmlhttpRequest({
            method: "GET",
            url: targetUrl + '&t=' + new Date().getTime(),
            onload: function (response) {
                if (response.status === 200) {
                    const text = response.responseText;
                    if (!text) return;

                    let rawAddrsCount = 0;
                    let importedPhones = 0;

                    // 1. 导入数据
                    if (text.includes('[BLACKLIST]') || text.includes('[ADDRS]') || text.includes('[PHONES]')) {
                        const sections = text.split(/\[(BLACKLIST|ADDRS|PHONES)\]/);
                        for (let i = 1; i < sections.length; i += 2) {
                            const type = sections[i];
                            const content = sections[i + 1];
                            const lines = content.split(/[\r\n]+/).map(s => s.trim()).filter(s => s);
                            if (type === 'BLACKLIST') {
                                state.blacklist = lines.join(',');
                                GM_setValue('blacklist', state.blacklist);
                            } else if (type === 'ADDRS') {
                                state.db.addrs = lines;
                                GM_setValue('dbAddrs', JSON.stringify(state.db.addrs));
                                rawAddrsCount = lines.length;
                            } else if (type === 'PHONES') {
                                state.db.phones = lines;
                                GM_setValue('dbPhones', JSON.stringify(state.db.phones));
                                importedPhones = lines.length;
                            }
                        }
                    } else {
                        const lines = text.split(/[\r\n]+/).map(s => s.trim()).filter(s => s);
                        state.db.addrs = lines;
                        GM_setValue('dbAddrs', JSON.stringify(state.db.addrs));
                        rawAddrsCount = lines.length;
                    }

                    // 2. 本地清洗
                    cleanDBWithBlacklist();
                    const finalAddrsCount = state.db.addrs.length;
                    const diff = rawAddrsCount - finalAddrsCount;

                    updateListsUI();

                    if (!isAuto) {
                        // 3. 弹窗并询问是否反向同步
                        let msg = `☁️ 拉取成功！\n\n- 云端原始地址: ${rawAddrsCount} 条\n- 本地有效地址: ${finalAddrsCount} 条\n- 过滤垃圾数据: ${diff} 条\n\n`;
                        if (diff > 0) {
                            msg += `⚠️ 云端包含 ${diff} 条本地黑名单数据(垃圾信息)。\n是否将清洗后的干净数据覆盖回云端，以保持数量一致？`;
                            if (confirm(msg)) {
                                pushToCloud();
                            }
                        } else {
                            alert(msg + "数据完全一致。");
                        }
                    } else {
                        log(`[自动同步] 地址: ${finalAddrsCount} (原始${rawAddrsCount}) / 电话: ${importedPhones}`, 'success');
                    }
                } else {
                    if (!isAuto) alert('❌ 拉取失败: ' + response.statusText);
                }
            },
            onerror: function (e) {
                if (!isAuto) alert('❌ 网络错误');
            }
        });
    };

    const pushToCloud = () => {
        const url = CONFIG.CLOUD.SYNC_URL;
        const token = CONFIG.CLOUD.SYNC_TOKEN;
        if (!url || !token) { alert('请先设置云端'); setupCloudConfig(); return; }

        const targetUrl = `${url.replace(/\/$/, '')}/api/sync?token=${token}`;
        const blData = state.blacklist.split(/[,，]/).map(s => s.trim()).filter(s => s).join('\n');
        const addrData = (state.db.addrs || []).join('\n');
        const phoneData = (state.db.phones || []).join('\n');
        const fileContent = `[BLACKLIST]\n${blData}\n\n[ADDRS]\n${addrData}\n\n[PHONES]\n${phoneData}`;

        log('正在上传清洗后的数据...', 'info');
        GM_xmlhttpRequest({
            method: "POST",
            url: targetUrl,
            data: fileContent,
            headers: { "Content-Type": "text/plain" },
            onload: function (response) {
                if (response.status === 200) {
                    const msg = '✅ 上传成功！云端已更新为最新清洗版。';
                    log(msg, 'success');
                    alert(msg);
                } else {
                    alert('❌ 上传失败: ' + response.responseText);
                }
            },
            onerror: function (e) { alert('❌ 网络错误'); }
        });
    };

    const applyDistanceByTime = () => {
        if (!isDispatchPage()) return;

        // 现已改为全天默认 3 公里，不再随时间改变
        let defaultTargetKm = 3;

        const setDispatchMode = (modeKeywords) => {
            const els = document.querySelectorAll('label, span, div, button');
            for (let el of els) {
                const txt = el.innerText || '';
                if (modeKeywords.some(k => txt.includes(k)) && txt.length < 15) {
                    if (el.tagName === 'LABEL' || !el.querySelector('input[type="radio"]')) {
                        try { el.click(); } catch (e) { }
                        break;
                    }
                }
            }
        };

        const checkHasDispatchInput = () => {
            // [新增] 检查是否存在下拉地址选择框（正在选择中），如果正在选择则视为尚未确定目标
            const sugBox = document.querySelector('.el-autocomplete-suggestion, .amap-sug-result, .el-select-dropdown');
            if (sugBox && sugBox.style.display !== 'none' && sugBox.offsetParent !== null) {
                return false; // 还在选地址中，暂停扫描派单
            }

            let hasVal = false;
            const addressInputs = document.querySelectorAll('.input-place input.el-input__inner');
            for (let el of addressInputs) {
                if (el.value && el.value.trim().length > 0) {
                    hasVal = true;
                    break;
                }
            }
            if (!hasVal) {
                const tipInput = document.getElementById('tipinput');
                if (tipInput && tipInput.value && tipInput.value.trim().length > 0) hasVal = true;
            }
            return hasVal;
        };

        const hasDispatchTarget = checkHasDispatchInput();

        if (typeof window._gjDispatchState === 'undefined') {
            window._gjDispatchState = { lastMode: '' };
        }

        if (!hasDispatchTarget) {
            if (window._gjDispatchState.lastMode !== 'Idle') {
                setDispatchMode(['AI智能', 'AI智能指派', '智能指派', 'AI指派']);
                setTimeout(() => setSliderValue(defaultTargetKm), 500);
                log('🧹 检测到关键表单为空，已自动恢复 [AI智能] 模式和默认距离', 'success');
                window._gjDispatchState.lastMode = 'Idle';
            }
        } else {
            let hasDriver = false;
            const bodyText = document.body.innerText || '';
            if (bodyText.includes('暂无相关司机') || bodyText.includes('没有符合条件的司机') || bodyText.includes('暂无数据')) {
                hasDriver = false;
            } else {
                let driverFoundWithin3km = false;

                const items = document.querySelectorAll('div, li, tr');
                for (let el of items) {
                    if (el.closest && el.closest('.gj-window')) continue; // [修复] 排除助手面板自身里的文字干扰
                    const t = el.innerText || '';
                    if (t.includes('自动备注') || el.children.length === 0) continue;

                    const distMatch = t.match(/([\d.]+)\s*km\s*\/\s*([\d.]+)\s*km/i);
                    if (distMatch) {
                        const straight = parseFloat(distMatch[1]);
                        const actual = parseFloat(distMatch[2]);
                        if (straight < 3 || actual < 3) {
                            driverFoundWithin3km = true;
                        }
                    } else if (t.includes('距') && t.includes('km')) {
                        const singleMatch = t.match(/([\d.]+)\s*km/);
                        if (singleMatch) {
                            const dist = parseFloat(singleMatch[1]);
                            if (dist < 3) driverFoundWithin3km = true;
                        }
                    }
                }
                hasDriver = driverFoundWithin3km;
            }

            // [已删除] 根据司机距离自动切换模式的逻辑
        }
    };

    const fetchOnlineBlacklist = (silent = false) => {
        const t = new Date().getTime();
        if (CONFIG.CLOUD.SYNC_URL && CONFIG.CLOUD.SYNC_TOKEN) {
            const cloudUrl = `${CONFIG.CLOUD.SYNC_URL.replace(/\/$/, '')}/txt?token=${CONFIG.CLOUD.SYNC_TOKEN}`;
            GM_xmlhttpRequest({
                method: "GET",
                url: cloudUrl + '&t=' + t,
                onload: function (response) {
                    if (response.status === 200) {
                        const text = response.responseText;
                        if (text && text.includes('[BLACKLIST]')) {
                            const sections = text.split(/\[(BLACKLIST|ADDRS|PHONES)\]/);
                            for (let i = 1; i < sections.length; i += 2) {
                                if (sections[i] === 'BLACKLIST') {
                                    const bl = sections[i + 1].split(/[\r\n]+/).map(s => s.trim()).filter(s => s).join(',');
                                    if (bl) {
                                        state.blacklist = bl;
                                        GM_setValue('blacklist', bl);
                                        cleanDBWithBlacklist();
                                        if (!silent) log('✅ 已从 Worker 覆盖黑名单', 'success');
                                        return;
                                    }
                                }
                            }
                        }
                    }
                    fetchGithubFallback(silent, t);
                },
                onerror: () => fetchGithubFallback(silent, t)
            });
        } else {
            fetchGithubFallback(silent, t);
        }
    };

    const fetchGithubFallback = (silent, t) => {
        GM_xmlhttpRequest({
            method: "GET",
            url: CONFIG.CLOUD.FALLBACK_BLACKLIST_URL + '&_=' + t,
            onload: function (response) {
                if (response.status === 200) {
                    const text = response.responseText;
                    if (text && text.length > 0) {
                        const cleanList = text.replace(/[\r\n\s]+/g, ',').replace(/，/g, ',');
                        state.blacklist = cleanList;
                        GM_setValue('blacklist', cleanList);
                        cleanDBWithBlacklist();
                        if (!silent) log('✅ 已从 GitHub 同步黑名单', 'success');
                    }
                }
            }
        });
    };

    const setupCloudConfig = () => {
        const currentUrl = CONFIG.CLOUD.SYNC_URL || '';
        const currentToken = CONFIG.CLOUD.SYNC_TOKEN || '';

        const url = prompt("请输入 Worker 域名 (不带末尾斜杠)\n例如: https://txt.abcai.online", currentUrl);
        if (url !== null) {
            const cleanUrl = url.trim().replace(/\/$/, '');
            GM_setValue('cloud_sync_url', cleanUrl);
            CONFIG.CLOUD.SYNC_URL = cleanUrl;

            const token = prompt("请输入访客 Token", currentToken);
            if (token !== null) {
                GM_setValue('cloud_sync_token', token.trim());
                CONFIG.CLOUD.SYNC_TOKEN = token.trim();
                alert("✅ 配置已保存！请刷新页面生效。");
                location.reload();
            }
        }
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
        if (isPaused()) return; // [修改] 使用统一暂停判断
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
            if (isPaused()) return; // [修改] 使用统一暂停判断
            state.countdown--;
            updateStatusText();
            if (state.countdown <= 0) {
                performAction();
                state.countdown = state.refreshInterval;
            }
        }, 1000);
    };
    const stopCountdown = () => { if (state.timerId) { clearInterval(state.timerId); state.timerId = null; } updateStatusText(); };

    // ==============================================
    //        司机调度页专有扫描与刷新引擎 (由 wgfz 迁移)
    // ==============================================
    let justAcceptedTracker = {};
    const excludeWords = ["未服务", "听单中", "抢单中", "刚接单", "前往接驾", "等待中", "途中", "中途等待", "支付方式", "当前在线", "实时监控", "空闲师傅", "干活中", "即将完成"];

    const getVal = (text) => {
        const regex = new RegExp(text + "\\s*-\\s*(\\d+)");
        const match = document.body.innerText.match(regex);
        return match ? parseInt(match[1]) : 0;
    };

    const scanDrivers = () => {
        let currentScan = {};
        let soonFinishedDrivers = []; // [新增] 即将完成的司机列表
        const now = Date.now();
        const candidates = document.querySelectorAll('div, li, tr');

        for (let el of candidates) {
            let text = el.innerText || "";
            text = text.trim();

            // 提取逻辑复用
            const extractDriverInfo = (txt) => {
                let phoneMatch = txt.match(/1[3-9]\d{9}/);
                let phone = phoneMatch ? phoneMatch[0] : "";
                let name = "未知";
                let nameMatches = txt.match(/[\u4e00-\u9fa5]{2,4}/g);
                if (nameMatches) {
                    for (let n of nameMatches) {
                        if (!excludeWords.includes(n)) { name = n; break; }
                    }
                }
                return { name, phone };
            };

            // 1. 扫描刚接单 (现有逻辑)
            if (text.includes("刚接单") && !text.includes("刚接单 -") && !text.includes("当前在线") && text.length > 5 && text.length < 100) {
                const info = extractDriverInfo(text);
                let key = info.name + info.phone;
                if (key !== "未知") currentScan[key] = info;
            }

            // 2. [新增] 扫描即将完成 (待选支付方式)
            if (text.includes("待选支付方式") && !text.includes("待选支付方式 -") && text.length > 5 && text.length < 100) {
                const info = extractDriverInfo(text);
                if (info.name !== "未知") soonFinishedDrivers.push(info);
            }
        }

        for (let key in currentScan) {
            if (!justAcceptedTracker[key]) justAcceptedTracker[key] = { name: currentScan[key].name, phone: currentScan[key].phone, startTime: now };
        }
        for (let key in justAcceptedTracker) {
            if (!currentScan[key]) delete justAcceptedTracker[key];
        }

        let overtimeDrivers = [];
        for (let key in justAcceptedTracker) {
            if ((now - justAcceptedTracker[key].startTime) > 5000) overtimeDrivers.push(justAcceptedTracker[key]);
        }

        return { overtimeDrivers, soonFinishedDrivers };
    };

    const startDriverRefresh = () => {
        if (state.driverTimerId) return;
        state.driverTimerId = setInterval(() => {
            if (state.driverManualPause || !isDriverPage()) return;

            let refreshBtn = document.querySelector('i[class*="refresh"], button[class*="refresh"]');
            if (!refreshBtn) {
                const elements = document.querySelectorAll('i, span, div, button');
                for (let el of elements) {
                    if (el.innerText && el.innerText.trim() === '') {
                        refreshBtn = el;
                        break;
                    }
                }
            }
            if (refreshBtn) refreshBtn.click();
            setTimeout(() => {
                const mainContent = document.getElementById('gj-main-content');
                if (mainContent) renderMainContent(mainContent);
            }, 400);
        }, 1000);
    };

    const stopDriverRefresh = () => {
        if (state.driverTimerId) {
            clearInterval(state.driverTimerId);
            state.driverTimerId = null;
        }
    };

    // 处理剪贴板文本
    const parseTextToDB = (fullText) => {
        if (!fullText || !fullText.trim()) return false;
        let hasUpdate = false;
        const phoneRegex = /(?:^|[^\d])(1\d{10})(?:$|[^\d])/g;
        let phoneMatch;
        let tempTextForPhone = fullText;
        while ((phoneMatch = phoneRegex.exec(tempTextForPhone)) !== null) {
            const num = phoneMatch[1];
            if (/^1\d{10}$/.test(num)) {
                if (addToDB('phone', num)) hasUpdate = true;
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
            if (addToDB('address', cleanSeg)) hasUpdate = true;
        });
        if (hasUpdate) cleanDBWithBlacklist();
        return hasUpdate;
    };

    const showPhoneAlert = (msg, originalText, badPhone) => {
        let overlay = document.getElementById('gj-phone-alert');
        if (overlay) overlay.remove();

        overlay = document.createElement('div');
        overlay.id = 'gj-phone-alert';
        overlay.style.cssText = `
            position: fixed; top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0,0,0,0.5); z-index: 999999;
            display: flex; align-items: center; justify-content: center;
        `;

        const box = document.createElement('div');
        box.style.cssText = `
            background: #fff; border-radius: 8px; padding: 20px; width: 300px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.2); text-align: center; color: #333;
        `;

        const displayPhone = badPhone || originalText;
        box.innerHTML = `
            <div style="font-size:18px; color:#F56C6C; font-weight:bold; margin-bottom:10px;">☎️ 电话错误</div>
            <div style="font-size:14px; margin-bottom:10px;">${msg}</div>
            <div style="font-size:13px; color:#F56C6C; font-weight:bold; margin-bottom:8px; background:#fff0f0; padding:8px; border-radius:4px; word-break:break-all; border:1px solid #ffccc7;">
                ${displayPhone}
            </div>
            <div style="font-size:11px; color:#999; margin-bottom:15px;">点击下方按钮将复制上方号码</div>
            <button id="gj-phone-alert-btn" style="
                background: #409EFF; color: #fff; border: none; padding: 8px 20px;
                border-radius: 4px; cursor: pointer; font-size: 14px; font-weight: bold;
                width: 100%; transition: background 0.2s;
            ">确认复制信息并关闭</button>
        `;

        overlay.appendChild(box);
        document.body.appendChild(overlay);

        document.getElementById('gj-phone-alert-btn').addEventListener('click', () => {
            const copyText = msg;
            try {
                if (typeof GM_setClipboard !== 'undefined') {
                    GM_setClipboard(copyText, 'text');
                } else {
                    const textArea = document.createElement("textarea");
                    textArea.value = copyText;
                    textArea.style.position = "fixed";
                    textArea.style.left = "-999999px";
                    textArea.style.top = "-999999px";
                    document.body.appendChild(textArea);
                    textArea.focus();
                    textArea.select();
                    document.execCommand('copy');
                    textArea.remove();
                }
            } catch (err) {
                console.error('Copy failed', err);
            }
            overlay.remove();
        });
    };

    const processClipboard = async (fillTarget = null) => {
        log(`[流程开始] 准备从剪贴板填充: ${fillTarget === 'address' ? '地址' : fillTarget === 'phone' ? '电话' : '自动'}`, 'info');
        reloadDB();

        let clipText = '';
        try {
            clipText = await navigator.clipboard.readText();
            log(`📋 剪贴板读取成功: "${clipText.substring(0, 50)}${clipText.length > 50 ? '...' : ''}"`, 'success');
        } catch (e) {
            log(`❌ 剪贴板读取失败: ${e.message}`, 'error');
        }

        // ── 填入地址 ──────────────────────────────────────────────
        if (fillTarget === 'address') {
            // 判断剪贴板是否包含有效地址：含中文字符且不是纯数字串
            const hasChinese = /[\u4e00-\u9fa5]/.test(clipText);
            const isOnlyDigits = /^\d+$/.test(clipText.trim());
            // 如果剪贴板有含中文的地址信息，就解析入库再填入
            if (clipText && hasChinese && !isOnlyDigits) {
                parseTextToDB(clipText);
                updateListsUI();
            }
            // 填入本地库最新地址（第一条 = 最新录入）
            if (state.db.addrs && state.db.addrs.length > 0) {
                fillInput('address', state.db.addrs[0]);
            } else {
                log('📍 本地地址库为空，无法自动填入', 'info');
            }
            return;
        }

        // ── 填入电话 ──────────────────────────────────────────────
        if (fillTarget === 'phone') {
            // 第一优先：原始文本中直接有11位连续手机号
            let validMatch = clipText.match(/(?:^|[^\d])(1\d{10})(?:$|[^\d])/);
            let phoneToFill = validMatch ? validMatch[1] : null;

            // 第二优先：去除所有空格后检测（支持 "135 6366 4166" 等带空格格式）
            if (!phoneToFill) {
                const noSpaceText = clipText.replace(/\s+/g, '');
                const noSpaceMatch = noSpaceText.match(/(?:^|[^\d])(1\d{10})(?:$|[^\d])/);
                if (noSpaceMatch) {
                    phoneToFill = noSpaceMatch[1];
                }
            }

            if (phoneToFill) {
                // 有合法11位手机号，直接填入（不需要再解析入库）
                fillInput('phone', phoneToFill);
                // 顺带把干净号码存入本地库
                parseTextToDB(phoneToFill);
                updateListsUI();
            } else {
                // 没有合法手机号——检查是否有"接近手机号"的数字串（去除空格后判断），提示错误
                const cleanDigits = clipText.replace(/\D/g, '');
                const possiblePhones = clipText.match(/\b1[\d ]{9,14}\b/g) || [];
                let invalidNum = '';

                // 优先取去空格后的数字串（如 "133 3333 3333" → "13333333333" 但位数仍不对时）
                if (cleanDigits.startsWith('1') && cleanDigits.length >= 7 && cleanDigits.length <= 15) {
                    invalidNum = cleanDigits;
                } else if (possiblePhones.length > 0) {
                    invalidNum = possiblePhones[0].replace(/\s+/g, '');
                } else if (cleanDigits.length >= 7 && cleanDigits.length <= 15 && cleanDigits.length / (clipText.length || 1) > 0.4) {
                    invalidNum = cleanDigits;
                }

                if (invalidNum) {
                    const diff = invalidNum.length - 11;
                    const diffMsg = diff > 0 ? `多${diff}位` : `少${Math.abs(diff)}位`;
                    showPhoneAlert(`您的电话号码${diffMsg}，请您核查电话信息。`, clipText, invalidNum);
                    return;
                }

                // 剪贴板无任何数字电话信息 → 回退到本地库最新电话
                if (state.db.phones && state.db.phones.length > 0) {
                    log('📞 剪贴板无有效电话，使用本地库最新电话', 'info');
                    fillInput('phone', state.db.phones[0]);
                } else {
                    log('📞 本地电话库为空，无法自动填入', 'info');
                }
            }
            return;
        }

        // ── 无指定目标（自动/后台调用）：仅解析入库，不触发填入也不弹窗 ──
        if (clipText) {
            parseTextToDB(clipText);
            updateListsUI();
            log(`📊 [本地库统计] 📍地址: ${state.db.addrs.length} | 📞电话: ${state.db.phones.length}`, 'info');
        }
    };

    const handleFileImport = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (!confirm(`确认导入文件 "${file.name}" 到本地库吗？\n将会自动清洗（含违禁词）。`)) {
            e.target.value = '';
            return;
        }
        const reader = new FileReader();
        reader.onload = (event) => {
            const content = event.target.result;
            const lines = content.split(/[\r\n]+/);
            let updateCount = 0;
            lines.forEach(line => {
                if (parseTextToDB(line)) updateCount++;
            });
            updateListsUI();
            alert(`✅ 导入处理完成！`);
        };
        reader.readAsText(file);
        e.target.value = '';
    };

    const fillInput = (type, value) => {
        log(`✍️ 准备填入 ${type === 'address' ? '地址' : '电话'}: "${value}"`, 'info');
        let input = null;
        if (type === 'address') {
            input = document.getElementById('tipinput');
            if (!input) {
                const inputs = document.querySelectorAll('input');
                for (let i = 0; i < inputs.length; i++) {
                    const el = inputs[i];
                    if (el.closest('.gj-window')) continue;
                    if (!el.closest('.el-form-item') && el.type === 'text') {
                        input = el; break;
                    }
                }
            }
            if (!input) {
                const keywords = ['起点', '出发', '搜索', '关键字'];
                const allInputs = document.querySelectorAll('input');
                for (let i = 0; i < allInputs.length; i++) {
                    const el = allInputs[i];
                    if (el.closest('.gj-window')) continue;
                    const ph = (el.placeholder || '').toLowerCase();
                    if (keywords.some(k => ph.includes(k))) {
                        input = el; break;
                    }
                }
            }
        } else if (type === 'phone') {
            const inputs = document.querySelectorAll('input');
            for (let i = 0; i < inputs.length; i++) {
                const el = inputs[i];
                if (el.closest('.gj-window')) continue;
                const ph = (el.placeholder || '').toLowerCase();
                if (ph.includes('用户电话') || ph.includes('电话') || el.type === 'tel') {
                    input = el;
                    break;
                }
            }
        }
        if (input) {
            log(`✅ 找到输入框 (类型:${input.type}, Placeholder:${input.placeholder})`, 'success');
            input.value = value;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
            input.click();
            input.focus();
            input.style.transition = 'all 0.3s';
            input.style.boxShadow = '0 0 0 2px rgba(103, 194, 58, 0.3)';
            setTimeout(() => input.style.boxShadow = '', 800);
            log(`🚀 已触发输入事件`, 'success');
        } else {
            log(`❌ 未找到目标输入框! 请检查页面状态`, 'error');
        }
    };

    // --- 拼音库加载 (GM_xmlhttpRequest + eval 方案，彻底绕过 TM 沙盒隔离) ---
    // 原因: @require 的库在 TM 沙盒内无法通过 window 暴露，script 标签注入是异步且不可靠的。
    // 方案: 用 GM_xmlhttpRequest 拉取库文件，用 new Function() 在私有作用域 eval，存入 _PM。
    let _PM = null; // 模块级私有变量，isMatch 可同步访问
    const loadPinyinMatch = () => {
        // Step 1: 优先尝试 @require 在沙盒里注册的直接变量
        try { if (typeof PinyinMatch !== 'undefined') { _PM = PinyinMatch; log('✅ PinyinMatch 来自 @require 沙盒', 'success'); return; } } catch (e) { }
        // Step 2: 尝试 unsafeWindow（页面上已有注入）
        try { const uw = typeof unsafeWindow !== 'undefined' ? unsafeWindow : null; if (uw?.PinyinMatch) { _PM = uw.PinyinMatch; log('✅ PinyinMatch 来自 unsafeWindow', 'success'); return; } } catch (e) { }
        // Step 3: GM_xmlhttpRequest 拉取 + eval 到私有作用域（最可靠）
        GM_xmlhttpRequest({
            method: 'GET',
            url: 'https://cdn.jsdelivr.net/npm/pinyin-match/dist/main.js',
            onload: (res) => {
                try {
                    const mod = { exports: {} };
                    // NOTE: new Function() 在独立作用域执行，不污染页面全局
                    new Function('module', 'exports', res.responseText)(mod, mod.exports);
                    _PM = mod.exports;
                    if (_PM && typeof _PM.match === 'function') {
                        log('✅ PinyinMatch 已通过 GM_xmlhttpRequest+eval 加载，拼音搜索就绪', 'success');
                    } else {
                        log('⚠️ PinyinMatch eval 完成但 match 不可用，请检查库版本', 'warning');
                    }
                } catch (e) { log('❌ PinyinMatch eval 失败: ' + e.message, 'error'); }
            },
            onerror: () => log('❌ PinyinMatch CDN 拉取失败，拼音搜索退为中文包含匹配', 'error')
        });
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
    // 拼音 + 汉字双重匹配（依赖模块级 _PM，由 init 时的 loadPinyinMatch 填充）
    const isMatch = (dbItem, inputKey, type) => {
        if (!inputKey) return true;
        const cleanKey = inputKey.trim();
        if (!cleanKey) return true;

        if (type === 'phone') {
            const cleanPhoneKey = cleanKey.replace(/\s+/g, '');
            if (dbItem.includes(cleanPhoneKey)) return true;
            if (cleanPhoneKey.includes(dbItem)) return true;
            if (/^\d+$/.test(cleanPhoneKey) && cleanPhoneKey.length >= 4) {
                const pattern = cleanPhoneKey.split('').join('.*');
                try { return new RegExp(pattern).test(dbItem); } catch (e) { }
            }
            return false;
        }

        // --- 地址类型匹配 ---
        const keywords = cleanKey.split(/\s+/);
        return keywords.every(k => {
            // 1. 中文直接包含（最快，无库依赖）
            if (dbItem.includes(k)) return true;
            // 2. PinyinMatch 拼音匹配（_PM 由 init 时异步填充）
            if (_PM && typeof _PM.match === 'function') {
                try {
                    const res = _PM.match(dbItem, k); // match(汉字文本, 拼音/关键词)
                    if (res && res.length > 0) return true;
                } catch (e) { }
            }
            // 3. 降级：纯字母时不区分大小写正则兜底
            if (/^[a-zA-Z]+$/.test(k)) {
                try { if (new RegExp(k, 'i').test(dbItem)) return true; } catch (e) { }
            }
            return false;
        });
    };
    const applyLayout = () => {
        const addrWidget = document.getElementById('gj-widget-addr');
        const listBody = document.getElementById('list-addr-body');
        if (addrWidget && listBody) {
            addrWidget.style.width = state.layout.width + 'px';
            listBody.style.height = state.layout.height + 'px';
            listBody.style.setProperty('--gj-col-width', state.colWidth + 'px');
        }
    };
    const toggleTheme = () => {
        state.theme = state.theme === 'light' ? 'dark' : 'light';
        GM_setValue('theme', state.theme);
        updateUI();
        applyGlobalTheme();
    };
    const applyGlobalTheme = () => {
        const doc = document.documentElement;
        if (state.theme === 'dark') {
            doc.classList.add('gj-global-dark');
        } else {
            doc.classList.remove('gj-global-dark');
        }
    };

    // [新增] 司机调度页地图主题控制 (仅黑化地图版)
    const applyDriverMapTheme = () => {
        if (!isDriverPage()) {
            document.body.classList.remove('dark-map-active');
            let styleCss = document.getElementById('gj-driver-theme-css');
            if (styleCss) styleCss.remove();
            return;
        }

        let styleCss = document.getElementById('gj-driver-theme-css');
        if (state.driverCssDark) {
            document.body.classList.add('dark-map-active');
            if (!styleCss) {
                styleCss = document.createElement('style');
                styleCss.id = 'gj-driver-theme-css';
                styleCss.innerHTML = `
                    /* 核心修改：只针对 canvas (高德地图) 及其容器应用反色滤镜 */
                    body.dark-map-active canvas {
                        filter: invert(0.9) hue-rotate(180deg) brightness(0.85) contrast(1.1) !important;
                    }
                    /* 防止地图底层的白色div漏出来刺眼 */
                    body.dark-map-active .amap-container,
                    body.dark-map-active .amap-layer {
                        background-color: #111 !important;
                    }
                `;
                document.head.appendChild(styleCss);
                log('🕶️ 已挂载强制 CSS 滤镜获取纯净黑夜模式', 'success');
            }
        } else {
            document.body.classList.remove('dark-map-active');
            if (styleCss) styleCss.remove();
        }
    };

    const createMainWidget = () => {
        let widget = document.getElementById('gj-widget-main');
        if (widget) widget.remove();
        widget = document.createElement('div');
        widget.id = 'gj-widget-main';
        widget.className = state.theme === 'dark' ? 'gj-dark gj-window' : 'gj-light gj-window';
        applyPos(widget, state.posMain);
        widget.style.transform = `scale(${state.uiScale})`;
        widget.style.transformOrigin = 'top left';
        // 恢复上次保存的主窗口宽度
        const mainSizeKey = state.posKey + '_size';
        const savedMainSize = safeParse(mainSizeKey, 'null');
        if (savedMainSize && savedMainSize.w) widget.style.width = savedMainSize.w + 'px';

        widget.innerHTML = `
            <div class="gj-header"></div>
            <div id="gj-main-content" style="display: ${getCollapsed() ? 'none' : 'block'}"></div>
            <div id="gj-scale-handle" class="gj-resize-handle" title="拖拽调整宽高"></div>
        `;
        document.body.appendChild(widget);
        setupDrag(widget, state.posKey);
        setupScaleDrag(widget, state.posKey);
        return widget;
    };

    const createAddrWidget = () => {
        let widget = document.getElementById('gj-widget-addr');
        if (widget) widget.remove();
        if (!isDispatchPage()) return null;

        widget = document.createElement('div');
        widget.id = 'gj-widget-addr';
        widget.className = state.theme === 'dark' ? 'gj-dark gj-window' : 'gj-light gj-window';
        applyPos(widget, state.posAddr);
        widget.style.transform = `scale(${state.uiScale})`;
        widget.style.transformOrigin = 'top left';
        widget.style.width = state.layout.width + 'px';
        const activeTabClass = (tab) => state.viewTab === tab ? 'active-tab' : '';
        widget.innerHTML = `
            <div class="gj-header gj-drag-header">
                <div class="gj-tabs">
                    <span class="gj-tab ${activeTabClass('address')}" data-tab="address">📍 地址库</span>
                    <span class="gj-tab ${activeTabClass('phone')}" data-tab="phone">📞 电话库</span>
                </div>
                <div style="display:flex; gap:4px;">
                    <span class="btn-icon-circle" id="btn-refresh-addr" title="刷新并自动填入最新地址">↻</span>
                </div>
            </div>
            <div class="gj-toolbar">
                <input type="text" id="gj-search-input" placeholder="输入搜索..." value="${state.searchText}">
                <span id="gj-btn-clear" class="btn-clear" title="清空搜索" style="display:${state.searchText ? 'block' : 'none'}">✕</span>
            </div>

            <div class="gj-list-body" id="list-addr-body" style="height:${state.layout.height}px;"></div>

            <div style="padding:5px 8px;
            font-size:11px; display:flex; align-items:center; gap:5px; border-top:1px dashed var(--gj-border);">
                <span style="color:var(--gj-text-mute);white-space:nowrap;">列宽:</span>
                <input type="range" id="gj-col-slider" min="50" max="250" value="${state.colWidth}" style="flex:1;" title="拖动改变显示字数">
            </div>

            <div id="gj-size-handle" class="gj-resize-handle" title="拖拽调整宽高"></div>
        `;

        document.body.appendChild(widget);
        setupDrag(widget, 'posAddr');
        setupResizeDrag(widget);

        widget.querySelector('#btn-refresh-addr').addEventListener('click', () => processClipboard(null));

        widget.querySelectorAll('.gj-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                state.viewTab = e.target.dataset.tab;
                GM_setValue('viewTab', state.viewTab);
                updateUI();
                updateListsUI();
            });
        });

        const searchInput = widget.querySelector('#gj-search-input');
        const clearBtn = widget.querySelector('#gj-btn-clear');
        searchInput.addEventListener('input', (e) => {
            state.searchText = e.target.value;
            clearBtn.style.display = state.searchText ? 'block' : 'none';
            updateListsUI();
        });
        clearBtn.addEventListener('click', () => {
            state.searchText = '';
            searchInput.value = '';
            clearBtn.style.display = 'none';
            updateListsUI();
            searchInput.focus();
        });
        const slider = widget.querySelector('#gj-col-slider');
        slider.addEventListener('input', (e) => {
            state.colWidth = parseInt(e.target.value);
            document.getElementById('list-addr-body').style.setProperty('--gj-col-width', state.colWidth + 'px');
        });
        slider.addEventListener('change', (e) => {
            GM_setValue('addrColWidth', state.colWidth);
        });
        return widget;
    };

    const bindHeaderEvents = (widget) => {
        const toggleBtn = widget.querySelector('.gj-toggle');
        if (toggleBtn) {
            toggleBtn.onclick = (e) => {
                e.stopPropagation();
                setCollapsed(!getCollapsed());
                updateUI();
            };
        }
        const darkBtn = widget.querySelector('#gj-btn-lamp');
        if (darkBtn) {
            darkBtn.onclick = (e) => {
                e.stopPropagation();
                state.driverCssDark = !state.driverCssDark;
                GM_setValue('driverCssDark', state.driverCssDark);
                applyDriverMapTheme();
                updateUI();
            };
        }
        const themeIcon = widget.querySelector('#gj-theme-toggle');
        if (themeIcon) {
            themeIcon.onclick = (e) => {
                e.stopPropagation();
                toggleTheme();
            };
        }
        const headerPauseBtn = widget.querySelector('#gj-header-pause');
        if (headerPauseBtn) {
            headerPauseBtn.onclick = (e) => {
                e.stopPropagation();
                if (isOrderPage()) {
                    state.manualPause = !state.manualPause;
                    GM_setValue('manualPause', state.manualPause);
                } else if (isDriverPage()) {
                    state.driverManualPause = !state.driverManualPause;
                    GM_setValue('driverManualPause', state.driverManualPause);
                }
                updateUI();
            };
        }
    };

    const updateUI = () => {
        // [修复] 始终重建 widget，确保 setupDrag 闭包中的 posKey 与当前页面一致
        let mainWidget = createMainWidget();

        const header = mainWidget.querySelector('.gj-header');
        if (header) {
            const toggleIcon = getCollapsed() ? '➕' : '➖';
            if (isDriverPage()) {
                const lampText = state.driverCssDark ? '☀️ 开灯' : '🌙 关灯';
                const lampColor = state.driverCssDark ? '#ffd700' : '#fff';
                header.innerHTML = `
                    <div style="display:flex; align-items:center; cursor:grab;">
                        <span class="gj-toggle" style="margin-right:10px; cursor:pointer;">${toggleIcon}</span>
                        <span style="font-size:13px; font-weight:bold; color:#ffd700;">🚕 实时监控</span>
                    </div>
                    <div style="display:flex; align-items:center; gap:8px;">
                         <button class="dark-mode-btn" id="gj-btn-lamp" style="background:#444; color:${lampColor}; border:1px solid #666; border-radius:4px; padding:2px 6px; font-size:12px; cursor:pointer; outline:none;">${lampText}</button>
                    </div>
                `;
            } else {
                const themeIcon = state.theme === 'light' ? '🌙' : '🌞';
                const isPausedPage = isPaused();
                const pauseIcon = isPausedPage ? '▶' : '⏸';
                const textColor = isPausedPage ? '#F56C6C' : '#67C23A';

                let title = "助手待机";
                if (isOrderPage()) title = CONFIG.ORDER.TITLE;
                else if (isDispatchPage()) title = CONFIG.DISPATCH.TITLE;

                header.innerHTML = `
                    <div style="display:flex; align-items:center; cursor:grab;">
                        <span class="gj-toggle" style="margin-right:10px; cursor:pointer;">${toggleIcon}</span>
                        <span style="font-weight:bold;font-size:15px;">🤖 ${title}</span>
                    </div>
                    <div style="display:flex; align-items:center; gap:8px;">
                        ${isOrderPage() ? `<span id="gj-header-timer" style="font-weight:bold; color:${textColor}; font-size:13px; min-width:24px; text-align:right;">${isPausedPage ? '停' : state.countdown + 's'}</span>` : ''}
                        ${(isOrderPage()) ? `<div id="gj-header-pause" style="cursor:pointer; display:flex; align-items:center; gap:4px; margin-right:6px;"><span style="color:${isPausedPage ? '#909399' : '#67C23A'};font-size:16px;font-weight:bold;">${pauseIcon}</span><span style="font-weight:bold;font-size:13px;color:${textColor};">启停</span></div>` : ''}
                        <span id="gj-theme-toggle" style="cursor:pointer; font-size:14px;">${themeIcon}</span>
                        <span class="gj-v-tag" style="font-size:10px; opacity:0.5;">v${state.currentVersion}</span>
                    </div>
                `;
            }
            bindHeaderEvents(mainWidget);
        }

        const cls = state.theme === 'dark' ? 'gj-dark gj-window' : 'gj-light gj-window';
        if (mainWidget) mainWidget.className = cls + (isDriverPage() ? ' gj-driver-style' : '');

        if (isDispatchPage() && !getCollapsed()) {
            mainWidget.style.background = 'transparent';
            mainWidget.style.pointerEvents = 'none';
            if (header) {
                header.style.pointerEvents = 'auto';
                header.style.borderRadius = '12px 12px 0 0';
            }
        } else {
            mainWidget.style.background = '';
            mainWidget.style.pointerEvents = '';
            if (header) {
                header.style.pointerEvents = '';
                header.style.borderRadius = '';
            }
        }

        const mainContent = document.getElementById('gj-main-content');
        const scaleHandle = document.getElementById('gj-scale-handle');
        if (mainContent) {
            mainContent.style.display = getCollapsed() ? 'none' : 'block';
            if (isDispatchPage() && !getCollapsed()) {
                mainContent.style.padding = '0';
                mainContent.style.background = 'transparent';
            } else {
                mainContent.style.padding = '';
                mainContent.style.background = '';
            }
        }
        if (scaleHandle) {
            scaleHandle.style.display = getCollapsed() ? 'none' : 'block';
            scaleHandle.style.pointerEvents = 'auto';
        }
        if (mainContent) renderMainContent(mainContent);
        if (isDispatchPage()) updateListsUI();
        updateStatusText();
    };

    const renderMainContent = (container) => {
        let html = '';
        const debugPanelHtml = state.debugMode ?
            `<div id="gj-debug-panel" style="margin-top:6px;padding:6px;background:#2c2c2c;color:#a6e22e;font-size:10px;border-radius:4px;max-height:150px;overflow-y:auto;word-wrap:break-word;font-family:monospace;white-space:pre-wrap;text-align:left;-webkit-user-select:all;user-select:all;" title="您可以直接选中复制这里的全部内容发给我">等待提取结构变化...</div>` : '';

        const cancelColValue = state.cancelColIndex === -1 ? '' : state.cancelColIndex;

        if (isOrderPage() || isDriverPage()) {
            const paused = isPaused(); // [修改] 获取当前页面的暂停状态
            const btnClass = paused ? 'btn-resume' : 'btn-pause';
            const btnText = paused ? '▶ 恢复运行' : '⏸ 暂停刷新';
            const statusColor = paused ? 'var(--gj-text-sec)' : '#409EFF';

            const scrapeClass = state.isScrapingEnabled ? 'btn-resume' : 'btn-preset';
            const scrapeText = state.isScrapingEnabled ? '👁️ 自动抓取: 开启' : '🙈 自动抓取: 关闭';
            const scrapeStyle = state.isScrapingEnabled ? 'border:1px solid #e1f3d8;background:#f0f9eb;color:#67c23a;' : 'border:1px solid var(--gj-border);background:var(--gj-bg-sec);color:var(--gj-text-mute);';

            if (isDriverPage()) {
                const tingDan = getVal("听单中");
                const daiXuan = getVal("待选支付方式");
                const working = getVal("抢单中") + getVal("刚接单") + getVal("前往接驾") + getVal("等待中") + getVal("途中") + getVal("中途等待");
                const totalOnline = tingDan + working + daiXuan;
                const { overtimeDrivers, soonFinishedDrivers } = scanDrivers();

                html = `
                    <style>
                        @keyframes alertBlink {
                            0% { opacity: 1; background-color: rgba(255,0,0,0.8); }
                            50% { opacity: 0.5; background-color: rgba(150,0,0,0.8); }
                            100% { opacity: 1; background-color: rgba(255,0,0,0.8); }
                        }
                    </style>
                    <div style="display:flex; justify-content:space-between; margin-bottom:5px;"><span>🟢 空闲师傅:</span><b style="color:#ff4444; font-size:16px;">${tingDan}</b></div>
                    <div style="display:flex; flex-direction:column; margin-bottom:5px;">
                        <div style="display:flex; justify-content:space-between;"><span>🔵 即将完成:</span><b style="color:#ff4444;">${daiXuan}</b></div>
                        ${soonFinishedDrivers.length > 0 ? `<div style="font-size:12px; color:#409EFF; text-align:left; padding-left:14px; margin-top:2px;">• ${soonFinishedDrivers.map(d => d.name).join(' ')}</div>` : ''}
                    </div>
                    <div style="display:flex; justify-content:space-between; margin-bottom:5px;"><span>🔴 干活中:</span><b style="color:#ff4444;">${working}</b></div>
                    <div style="margin-top:8px; padding-top:8px; border-top:1px dashed #555; font-size:12px; color:#ff4444; text-align:left; font-weight:bold;">
                        🔥 总上线(活跃): ${totalOnline} 人
                    </div>
                `;

                if (overtimeDrivers.length > 0) {
                    html += `<div style="margin-top:10px; border-top:2px solid #ff0000; padding-top:8px;">
                        <div style="color:#ff4444; font-weight:bold; font-size:12px; margin-bottom:5px; text-align:left;">⚠️ 刚接单未动 (>5秒):</div>`;
                    overtimeDrivers.forEach(d => {
                        let displayStr = d.name;
                        if (d.phone) displayStr += ` (${d.phone})`;
                        html += `<div style="color:#fff; font-size:12px; padding:4px 6px; margin-bottom:4px; border-radius:4px; animation: alertBlink 1.5s infinite; text-align:center; box-shadow:0 0 5px red;">
                            ${displayStr}
                        </div>`;
                    });
                    html += `</div>`;
                }
            } else { // This block handles isOrderPage()
                html = `
                    <div style="display:flex; justify-content:center; align-items:baseline; margin-bottom:10px;">
                        <span class="gj-timer-text" style="color:${statusColor}">${paused ? '暂停' : state.countdown + '<span style="font-size:12px;margin-left:2px">s</span>'}</span>
                    </div>

                    <button id="gj-btn-toggle" class="gj-btn ${btnClass}">${btnText}</button>

                  ${isOrderPage() ? `<button id="gj-btn-scrape" class="gj-btn" style="margin-top:8px; ${scrapeStyle}">${scrapeText}</button>` : ''}

                <div class="gj-control-row">
                    <span style="color:var(--gj-text-sec);font-size:12px;">刷新间隔</span>
                    <div style="display:flex;align-items:center;">
                        <input type="number" id="gj-input-interval" value="${state.refreshInterval}" class="gj-input-mini">
                        <button id="gj-btn-set" class="gj-btn-icon">🆗</button>
                    </div>
                </div>
            `;
            }

            // Common debug and cloud settings for Order and Driver pages
            html += `
                <div class="gj-control-row" style="margin-top:8px;border-top:1px dashed var(--gj-border);padding-top:8px; flex-wrap:wrap; gap:4px;">
                     ${isOrderPage() ? `
                     <label style="font-size:12px;display:flex;align-items:center;cursor:pointer;margin-right:8px;" title="开启后会在此收集页面变化进行分析">
                        <input type="checkbox" id="gj-chk-debug" ${state.debugMode ? 'checked' : ''} style="margin-right:4px;">
                        🐛 调试模式(持续记录)
                     </label>
                     ` : ''}
                </div>
                ${isOrderPage() ? debugPanelHtml : ''}

                ${isOrderPage() ? `
                <div class="gj-control-row" style="margin-top:10px; border-top:1px dashed var(--gj-border); padding-top:10px; justify-content: space-around;">
                    <span class="btn-icon-circle" id="btn-cloud-setting" title="配置云端Worker" style="background:rgba(64,158,255,0.6)">⚙️</span>
                    <span class="btn-icon-circle" id="btn-cloud-pull" title="⬇️ 覆盖下载(以云端为准)" style="background:rgba(230,162,60,0.6)">⬇</span>
                    <span class="btn-icon-circle" id="btn-cloud-push" title="⬆️ 上传本地数据" style="background:rgba(245,108,108,0.6)">⬆</span>
                    <label class="btn-icon-circle" title="导入本地文件(txt/csv)" style="background:rgba(103,194,58,0.6)">
                        📂<input type="file" id="gj-file-import" style="display:none" accept=".txt,.csv">
                    </label>
                </div>
                ` : ''}
            `;
        } else if (isDispatchPage()) {
            const buttonsHtml = CONFIG.DISPATCH.PRESETS.map(num =>
                `<button class="btn-preset" data-val="${num}">${num}</button>`
            ).join('');

            const activeTabClass = (tab) => state.viewTab === tab ? 'active-tab' : '';

            html = `
                <div style="background: var(--gj-bg-main); padding: 0 16px 16px 16px; border-radius: 0 0 12px 12px; pointer-events: auto;">
                    <div style="display:flex;gap:10px;margin-bottom:10px;height:40px;position:relative;">
                        <button id="btn-auto-addr" class="gj-btn btn-green">📌 填最新地址</button>
                        <button id="btn-auto-phone" class="gj-btn btn-blue">📞 填最新电话</button>
                        <div id="gj-user-check-result" style="display:none; position:absolute; left:-240px; top: 0px; width: 220px; padding: 10px; font-size:13px; text-align:center; border-radius:8px; box-shadow:0 4px 12px var(--gj-shadow); z-index:99999; background:#fff;"></div>
                    </div>
                    <div style="display:flex;gap:10px;margin-bottom:10px;height:40px;">
                        <button id="btn-quick-dispatch" class="gj-btn" style="background:#67c23a; color:#fff;">⚡ 一键派单</button>
                        <button id="btn-hall-dispatch" class="gj-btn" style="background:#e6a23c; color:#fff;">🏠 放入大厅</button>
                    </div>
                    <div style="margin-bottom:8px;">
                        <button id="btn-clear-form" class="gj-btn" style="background:linear-gradient(135deg,#ff6b6b,#ee5a24);color:#fff;height:34px;font-size:13px;">🗑️ 一键清空地址&amp;电话</button>
                    </div>
                    <!-- [移动] 自动备注开关到指派页面 -->
                    <div class="gj-control-row" style="margin-top:6px; justify-content:center; gap:10px;">
                         <label style="font-size:12px;display:flex;align-items:center;cursor:pointer;color:var(--gj-text-sec);" title="新客户自动备注拉群">
                            <input type="checkbox" id="gj-chk-auto-remark" ${state.autoRemark ? 'checked' : ''} style="margin-right:4px;">
                            📝 自动备注
                         </label>
                    </div>
                    <div class="gj-divider">
                        <span class="gj-label-sm">AI 距离 (全天默认 3km)</span>
                    </div>
                    <div class="gj-grid-btns">${buttonsHtml}</div>
                </div>

                <!-- 镂空透明区域 -->
                <div style="height: 65px; background: transparent; pointer-events: none;"></div>

                <div id="gj-inline-addr-container" style="background: var(--gj-bg-main); padding: 16px; border-radius: 12px; pointer-events: auto;">
                    <div class="gj-toolbar" style="margin-bottom: 5px; border-radius: 4px;">
                        <input type="text" id="gj-search-input" placeholder="输入搜索..." value="${state.searchText}">
                        <span id="gj-btn-clear" class="btn-clear" title="清空搜索" style="display:${state.searchText ? 'block' : 'none'}">✕</span>
                    </div>
                    <div class="gj-list-body" id="list-addr-body" style="height: 180px; resize: vertical; overflow-y: auto; --gj-col-width:${state.colWidth}px;"></div>
                    <div style="padding:5px 8px; font-size:11px; display:flex; align-items:center; gap:5px; margin-top: 5px;">
                        <span style="color:var(--gj-text-mute);white-space:nowrap;">列宽:</span>
                        <input type="range" id="gj-col-slider" min="50" max="250" value="${state.colWidth}" style="flex:1;" title="拖动改变显示字数">
                    </div>
                </div>
            `;
        } else {
            html = `<div style="padding:20px;color:var(--gj-text-mute);text-align:center;font-size:13px;">💤 非工作区域</div>`;
        }
        container.innerHTML = html;
        bindEvents();
    };

    const updateListsUI = () => {
        const addrBody = document.getElementById('list-addr-body');
        if (!addrBody) return;

        // --- 性能优化：只有在搜索时才渲染列表 ---
        if (!state.searchText) {
            addrBody.innerHTML = `
                <div style="display:flex; justify-content:center; gap:20px; margin-bottom: 20px; padding-bottom: 15px; border-bottom: 1px dashed var(--gj-border);">
                    <span style="font-size:13px; font-weight:bold; color:var(--gj-text-regular);">📍 地址库 <b style="color:#f56c6c;">(${state.db.addrs ? state.db.addrs.length : 0})</b></span>
                    <span style="font-size:13px; font-weight:bold; color:var(--gj-text-regular);">📞 电话库 <b style="color:#f56c6c;">(${state.db.phones ? state.db.phones.length : 0})</b></span>
                </div>
                <div class="gj-empty">请尝试输入汉字或拼音进行搜索</div>
            `;
            return;
        }

        let filteredList = [];
        const MAX_ITEMS = 500; // 搜索结果上限，防止 DOM 崩溃

        const pList = (state.db.phones || []).filter(item => isMatch(item, state.searchText, 'phone')).map(item => ({ val: item, type: 'phone', icon: '📞' }));
        const aList = (state.db.addrs || []).filter(item => isMatch(item, state.searchText, 'address')).map(item => ({ val: item, type: 'address', icon: '📍' }));

        // 合并结果并截断
        filteredList = [...pList, ...aList].slice(0, MAX_ITEMS);

        const renderItem = (item) => {
            return `<div class="gj-list-item" title="${item.val}" data-val="${item.val}" data-type="${item.type}">
                <span style="margin-right:4px;">${item.icon}</span>
                <span class="gj-item-text">${item.val}</span>
            </div>`;
        };

        if (filteredList.length === 0) {
            addrBody.innerHTML = `<div class="gj-empty">无匹配结果<br>请尝试其他关键词</div>`;
        } else {
            addrBody.innerHTML = filteredList.map(i => renderItem(i)).join('');
            addrBody.querySelectorAll('.gj-list-item').forEach(el =>
                el.addEventListener('click', () => fillInput(el.dataset.type, el.dataset.val))
            );
        }
    };

    const queryAndMarkNewUser = () => {
        let totalOrders = null;
        const thCells = document.querySelectorAll('th');
        let totalOrderColIdx = -1;
        thCells.forEach((th, idx) => {
            if (th.innerText.includes('总下单')) totalOrderColIdx = idx;
        });

        if (totalOrderColIdx >= 0) {
            const rows = document.querySelectorAll('.el-table__body-wrapper .el-table__row');
            if (rows.length > 0) {
                const targetCell = rows[0].cells[totalOrderColIdx];
                if (targetCell) totalOrders = parseInt(targetCell.innerText.trim()) || 0;
            }
        }

        const resultDiv = document.getElementById('gj-user-check-result');
        if (totalOrders === null) {
            // 自动模式下找不到时不显示黄色警告，避免频繁打扰
            // 但是如果之前有结果需要清空或者隐藏
            if (resultDiv) { resultDiv.style.display = 'none'; }
            return;
        }

        if (totalOrders === 0) {
            let filled = false;
            if (state.autoRemark) {
                const remarkTextareas = document.querySelectorAll('textarea');
                remarkTextareas.forEach(ta => {
                    const label = ta.closest('.el-form-item')?.querySelector('.el-form-item__label');
                    if ((label && label.textContent.includes('备注')) || (ta.placeholder || '').includes('备注')) {
                        if (!ta.value.includes('拉群')) {
                            ta.value = ta.value ? ta.value + ' 拉群' : '拉群';
                            ta.dispatchEvent(new Event('input', { bubbles: true }));
                            ta.dispatchEvent(new Event('change', { bubbles: true }));
                        }
                        filled = true;
                    }
                });
            }
            if (resultDiv) {
                resultDiv.style.display = 'block';
                resultDiv.style.background = '#d4edda';
                resultDiv.style.color = '#155724';
                if (state.autoRemark) {
                    resultDiv.textContent = `✅ 新客户！总下单量=0，${filled ? '已自动备注"拉群"' : '未找到备注输入框'}`;
                } else {
                    resultDiv.textContent = `✅ 新客户！总下单量=0，请手动备注"拉群"`;
                }
            }
        } else {
            if (resultDiv) { resultDiv.style.display = 'block'; resultDiv.style.background = '#e2e3e5'; resultDiv.style.color = '#383d41'; resultDiv.textContent = `📊 老客户，历史下单 ${totalOrders} 次`; }
        }
    };

    // 本处已删除老旧残余的 checkNoDriverAndSwitch 和 watchDispatchFormClear


    const bindEvents = () => {
        document.getElementById('btn-cloud-setting')?.addEventListener('click', setupCloudConfig);
        document.getElementById('btn-cloud-pull')?.addEventListener('click', () => pullFromCloud(false));
        document.getElementById('btn-cloud-push')?.addEventListener('click', pushToCloud);
        document.getElementById('gj-file-import')?.addEventListener('change', handleFileImport);

        // [已删除] 订单指派页面主题按键代理相关逻辑
        if (isDispatchPage()) {
            document.querySelectorAll('.btn-preset').forEach(btn =>
                btn.addEventListener('click', (e) => setSliderValue(parseInt(e.target.dataset.val)))
            );

            document.getElementById('btn-auto-addr')?.addEventListener('click', () => {
                processClipboard('address');
            });
            document.getElementById('btn-auto-phone')?.addEventListener('click', () => {
                processClipboard('phone');
            });

            document.getElementById('btn-clear-form')?.addEventListener('click', () => {
                const fireEvents = (el) => {
                    el.value = '';
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                    // 触发 Vue/ElementUI 的清空事件
                    el.dispatchEvent(new Event('compositionend', { bubbles: true }));
                };
                let cleared = 0;
                // 清空地址输入框
                const addrInput = document.getElementById('tipinput');
                if (addrInput) { fireEvents(addrInput); cleared++; }
                // 备选：.input-place 里的所有文本输入
                document.querySelectorAll('.input-place input.el-input__inner').forEach(el => {
                    if (el.value) { fireEvents(el); cleared++; }
                });
                // 清空电话输入框
                document.querySelectorAll('input').forEach(el => {
                    if (el.closest('.gj-window')) return;
                    const ph = (el.placeholder || '');
                    if ((ph.includes('用户电话') || ph.includes('电话')) && el.value) {
                        fireEvents(el); cleared++;
                    }
                });
                // 清空结果提示框
                const resultDiv = document.getElementById('gj-user-check-result');
                if (resultDiv) resultDiv.style.display = 'none';
                log(`🗑️ 已清空 ${cleared} 个输入框`, 'success');
            });

            const searchInput = document.getElementById('gj-search-input');
            const clearBtn = document.getElementById('gj-btn-clear');

            const clearSearch = () => {
                state.searchText = '';
                if (searchInput) searchInput.value = '';
                if (clearBtn) clearBtn.style.display = 'none';
                updateListsUI();
            };

            document.getElementById('btn-quick-dispatch')?.addEventListener('click', () => {
                const createBtn = Array.from(document.querySelectorAll('button')).find(btn => btn.innerText.includes('创建订单'));
                if (createBtn) {
                    createBtn.click();
                    log('🚀 一键派单：已点击创建订单', 'success');
                    clearSearch(); // [新增] 派单后自动清空搜索
                } else {
                    log('❌ 找不到创建订单按钮', 'error');
                }
            });

            document.getElementById('btn-hall-dispatch')?.addEventListener('click', () => {
                const modeLabels = Array.from(document.querySelectorAll('label.el-radio-button'));
                const hallBtn = modeLabels.find(label => label.innerText.includes('抢单大厅'));
                if (hallBtn) hallBtn.click();

                setTimeout(() => {
                    const createBtn = Array.from(document.querySelectorAll('button')).find(btn => btn.innerText.includes('创建订单'));
                    if (createBtn) {
                        createBtn.click();
                        clearSearch(); // [新增] 派单后自动清空搜索
                    }

                    setTimeout(() => {
                        const aiBtn = modeLabels.find(label => label.innerText.includes('AI智能'));
                        if (aiBtn) aiBtn.click();
                        log('🏠 放入大厅完成并切回AI智能', 'success');
                    }, 500);
                }, 300);
            });

            if (searchInput) {
                searchInput.addEventListener('input', (e) => {
                    state.searchText = e.target.value;
                    if (clearBtn) clearBtn.style.display = state.searchText ? 'block' : 'none';
                    updateListsUI();
                });
            }
            if (clearBtn) {
                clearBtn.addEventListener('click', () => {
                    clearSearch();
                    if (searchInput) searchInput.focus();
                });
            }

            const colSlider = document.getElementById('gj-col-slider');
            if (colSlider) {
                colSlider.addEventListener('input', (e) => {
                    state.colWidth = parseInt(e.target.value);
                    const listBody = document.getElementById('list-addr-body');
                    if (listBody) listBody.style.setProperty('--gj-col-width', state.colWidth + 'px');
                });
                colSlider.addEventListener('change', (e) => {
                    GM_setValue('addrColWidth', state.colWidth);
                });
            }

            // 回收旧的 observer
            if (window._gjDispatchObserver) {
                window._gjDispatchObserver.disconnect();
                window._gjDispatchObserver = null;
            }

            // 自动检测 "收用户信息" 生成的用户表格
            const targetNode = document.body;
            const config = { childList: true, subtree: true };
            let autoCheckTimeout = null;

            window._gjDispatchObserver = new MutationObserver((mutationsList) => {
                if (!isDispatchPage()) return;
                let hasTableChange = false;
                for (let mutation of mutationsList) {
                    if (mutation.type === 'childList') {
                        // 寻找新增的表格或行
                        if (mutation.target.classList &&
                            (mutation.target.classList.contains('el-table__row') ||
                                mutation.target.nodeName === 'TBODY' ||
                                mutation.target.classList.contains('el-table__body-wrapper'))) {
                            hasTableChange = true;
                            break;
                        }
                    }
                }
                if (hasTableChange) {
                    if (autoCheckTimeout) clearTimeout(autoCheckTimeout);
                    autoCheckTimeout = setTimeout(() => { queryAndMarkNewUser(); }, 500);
                }
            });
            window._gjDispatchObserver.observe(targetNode, config);

            const watchDispatchPhone = () => {
                const phoneInputs = document.querySelectorAll('input');
                phoneInputs.forEach(el => {
                    const ph = (el.placeholder || '');
                    if (ph.includes('用户电话') || ph.includes('电话')) {
                        el.addEventListener('input', () => {
                            // 当输入内容改变时，清空上一次的查询结果，避免残留
                            const resultDiv = document.getElementById('gj-user-check-result');
                            if (resultDiv) resultDiv.style.display = 'none';
                        });
                    }
                });
            };
            setTimeout(watchDispatchPhone, 1500);

            // [已删除] 自动备注切换绑定 (指派页面)
            const chkAutoRemark = document.getElementById('gj-chk-auto-remark');
            if (window._gjDispatchLoop) clearInterval(window._gjDispatchLoop);
            window._gjDispatchLoop = setInterval(() => {
                if (!isDispatchPage()) return;
                applyDistanceByTime();
            }, 1000);
        }

        if (document.getElementById('gj-btn-toggle')) {
            document.getElementById('gj-btn-toggle').addEventListener('click', () => {
                // [修改] 根据页面类型切换对应的暂停状态
                if (isOrderPage()) {
                    state.manualPause = !state.manualPause;
                    GM_setValue('manualPause', state.manualPause);
                } else if (isDriverPage()) {
                    state.driverManualPause = !state.driverManualPause;
                    GM_setValue('driverManualPause', state.driverManualPause);
                }
                updateUI();
            });
            const scrapeBtn = document.getElementById('gj-btn-scrape');
            if (scrapeBtn) {
                scrapeBtn.addEventListener('click', () => {
                    state.isScrapingEnabled = !state.isScrapingEnabled;
                    GM_setValue('scrapeEnabled', state.isScrapingEnabled);
                    updateUI();

                    if (state.isScrapingEnabled) {
                        scanOrderPage();
                    }
                });
            }

            document.getElementById('gj-btn-set').addEventListener('click', () => {
                const val = parseInt(document.getElementById('gj-input-interval').value);
                if (val > 0) {
                    state.refreshInterval = val;
                    if (isOrderPage()) GM_setValue('orderInterval', val);
                    if (isDriverPage()) GM_setValue('driverInterval', val);
                    performAction(); startCountdown();
                }
            });

            // [新增] 调试模式切换
            const chkDebug = document.getElementById('gj-chk-debug');
            if (chkDebug) {
                chkDebug.addEventListener('change', (e) => {
                    state.debugMode = e.target.checked;
                    GM_setValue('debugMode', state.debugMode);
                    updateUI(); // 触发重绘以显示/隐藏面板
                    if (state.debugMode) scanOrderPage();
                });
            }

            // [新增] 司机页地图主题切换监听
            const chkApiDark = document.getElementById('gj-chk-api-dark');
            const chkCssDark = document.getElementById('gj-chk-css-dark');

            if (chkApiDark) {
                chkApiDark.addEventListener('change', (e) => {
                    state.driverApiDark = e.target.checked;
                    GM_setValue('driverApiDark', state.driverApiDark);
                    // 互斥逻辑
                    if (state.driverApiDark && state.driverCssDark) {
                        state.driverCssDark = false;
                        GM_setValue('driverCssDark', false);
                        if (chkCssDark) chkCssDark.checked = false; // 同步UI状态
                    }
                    applyDriverMapTheme();
                });
            }

            if (chkCssDark) {
                chkCssDark.addEventListener('change', (e) => {
                    state.driverCssDark = e.target.checked;
                    GM_setValue('driverCssDark', state.driverCssDark);
                    // 互斥逻辑
                    if (state.driverCssDark && state.driverApiDark) {
                        state.driverApiDark = false;
                        GM_setValue('driverApiDark', false);
                        if (chkApiDark) chkApiDark.checked = false; // 同步UI状态
                    }
                    applyDriverMapTheme();
                });
            }

            // [新增] 消单列号配置
            const inputCancelCol = document.getElementById('gj-input-cancel-col');
            if (inputCancelCol) {
                inputCancelCol.addEventListener('change', (e) => {
                    const val = parseInt(e.target.value);
                    if (!isNaN(val)) {
                        state.cancelColIndex = val;
                        GM_setValue('cancelColIndex', val);
                        log(`🚫 消单列已设置为: ${val}`, 'info');
                    } else {
                        state.cancelColIndex = -1;
                        GM_setValue('cancelColIndex', -1);
                    }
                });
            }
        }
    };

    const updateStatusText = () => {
        const text = document.querySelector('.gj-timer-text');
        const headerTimer = document.getElementById('gj-header-timer');
        const paused = isPaused();
        if (text) {
            if (paused) {
                text.textContent = "暂停";
                text.style.color = "var(--gj-text-sec)";
            }
            else {
                text.innerHTML = `${state.countdown}<span style="font-size:16px;margin-left:2px;opacity:0.6">s</span>`;
                text.style.color = state.countdown <= 3 ? "#F56C6C" : "#409EFF";
            }
        }
        if (headerTimer) {
            if (paused) {
                headerTimer.textContent = "停";
                headerTimer.style.color = "var(--gj-text-sec)";
            } else {
                headerTimer.textContent = state.countdown + "s";
                headerTimer.style.color = state.countdown <= 3 ? "#F56C6C" : "#67C23A";
            }
        }
    };
    const applyPos = (el, pos) => {
        if (pos.left) {
            el.style.left = pos.left;
            el.style.right = 'auto';
        }
        else {
            el.style.right = pos.right || '20px';
            el.style.left = 'auto';
        }
        if (pos.top) {
            el.style.top = pos.top; el.style.bottom = 'auto';
        }
        else {
            el.style.bottom = pos.bottom || 'auto'; el.style.top = 'auto';
        }
    };

    const setupDrag = (el, posKey) => {
        const header = el.querySelector('.gj-header');
        let isDragging = false, startX, startY, rect;
        header.addEventListener('mousedown', e => {
            if (e.target.closest('.gj-toggle') || e.target.closest('#gj-theme-toggle') || e.target.closest('.gj-tab') || e.target.closest('input') || e.target.closest('label') || e.target.closest('.btn-icon-circle')) return;
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
            if (isDragging) {
                isDragging = false; header.style.cursor = 'grab';
                el.style.transition = 'transform 0.1s';
                const newPos = { left: el.style.left, top: el.style.top };
                state[posKey] = newPos;
                GM_setValue(posKey, JSON.stringify(newPos));
            }
        });
    };

    const setupScaleDrag = (el, posKey) => {
        // 左右拖变宽、上下拖变高；用独立 key 保存，不污染 state.layout
        const handle = el.querySelector('#gj-scale-handle');
        if (!handle) return;
        const sizeKey = (posKey || state.posKey) + '_size';
        let isResizing = false, startX, startY, startW, startH;
        handle.addEventListener('mousedown', e => {
            e.stopPropagation(); e.preventDefault();
            isResizing = true;
            startX = e.clientX; startY = e.clientY;
            startW = el.offsetWidth;
            startH = el.offsetHeight;
            document.body.style.cursor = 'nwse-resize';
        });
        document.addEventListener('mousemove', e => {
            if (!isResizing) return;
            const dx = (e.clientX - startX) / state.uiScale;
            const dy = (e.clientY - startY) / state.uiScale;
            let newW = startW + dx;
            let newH = startH + dy;
            if (newW < 150) newW = 150;
            if (newH < 80) newH = 80;
            el.style.width = newW + 'px';
            el.style.minHeight = newH + 'px';
        });
        document.addEventListener('mouseup', () => {
            if (isResizing) {
                isResizing = false; document.body.style.cursor = 'default';
                GM_setValue(sizeKey, JSON.stringify({ w: Math.round(el.offsetWidth), h: Math.round(el.offsetHeight) }));
            }
        });
    };

    const setupResizeDrag = (el) => {
        const handle = el.querySelector('#gj-size-handle');
        if (!handle) return;
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
            const dx = (e.clientX - startX) / state.uiScale;
            const dy = (e.clientY - startY) / state.uiScale;

            let newW = startW + dx;
            let newH = startH + dy;

            if (newW < 200) newW = 200;
            if (newH < 150) newH = 150;

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
            html.gj-global-dark {
                filter: invert(0.92) hue-rotate(180deg) !important;
                background-color: #111 !important;
            }
            html.gj-global-dark img,
            html.gj-global-dark video,
            html.gj-global-dark iframe,
            html.gj-global-dark .el-image,
            html.gj-global-dark .gj-window {
                filter: invert(1) hue-rotate(180deg) !important;
            }
            :root {
                --gj-bg-main: #ffffff;
                --gj-bg-sec: #f0f2f5;
                --gj-bg-input: #f8f9fa;
                --gj-text-main: #303133;
                --gj-text-sec: #606266;
                --gj-text-mute: #909399;
                --gj-border: #dcdfe6;
                --gj-hover: #ecf5ff;
                --gj-hover-text: #409EFF;
                --gj-shadow: rgba(0,0,0,0.1);
                --gj-header-bg: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            }
            .gj-dark {
                --gj-bg-main: #1a1a1a;
                --gj-bg-sec: #2d2d2d;
                --gj-bg-input: #333333;
                --gj-text-main: #e0e0e0;
                --gj-text-sec: #b0b0b0;
                --gj-text-mute: #666666;
                --gj-border: #444444;
                --gj-hover: #404040;
                --gj-hover-text: #66b1ff;
                --gj-shadow: rgba(0,0,0,0.5);
                --gj-header-bg: linear-gradient(135deg, #3a4b8a 0%, #4a2b6e 100%);
            }
            .gj-window {
                position: fixed;
                z-index: 99999;
                display: flex; flex-direction: column;
                font-family: "Helvetica Neue", Helvetica, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", Arial, sans-serif;
                font-size: 14px; user-select: none;
                filter: drop-shadow(0 4px 12px var(--gj-shadow));
                color: var(--gj-text-main);
                background: var(--gj-bg-main);
                border-radius: 12px;
                overflow: hidden;
            }
            #gj-widget-main { width: 250px;
            }
            .gj-header {
                padding: 10px 12px;
                background: var(--gj-header-bg);
                color: #fff;
                display: flex; justify-content: space-between; align-items: center;
                cursor: grab; font-weight: 600; font-size: 14px;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            }
            .gj-toggle, #gj-theme-toggle { cursor: pointer;
            opacity:0.8; transition:opacity 0.2s; font-size:14px; }
            .gj-toggle:hover, #gj-theme-toggle:hover { opacity:1;
            }
            #gj-main-content { padding: 16px; background:var(--gj-bg-main);
            position: relative;}
            .gj-timer-text { font-size: 38px; font-weight: 700; line-height:1;
            letter-spacing: -1px; }
            .gj-btn {
                width: 100%;
                border: none; padding: 10px; border-radius: 8px;
                cursor: pointer; font-weight: 600; font-size: 14px;
                transition: all 0.2s; box-shadow: 0 2px 6px rgba(0,0,0,0.1);
                display:flex; justify-content:center; align-items:center; gap:5px;
            }
            .gj-btn:active { transform: scale(0.98);
            }
            .btn-pause { background: #fff1f0; color: #f56c6c;
            border:1px solid #fde2e2; }
            .gj-dark .btn-pause { background: #4a1b1b;
            color: #ff6b6b; border:1px solid #632b2b; }
            .btn-resume { background: #f0f9eb;
            color: #67c23a; border:1px solid #e1f3d8; }
            .gj-dark .btn-resume { background: #1b4a24;
            color: #67c23a; border:1px solid #2b6339; }
            .btn-preset {
                background: var(--gj-bg-sec);
                border: 1px solid var(--gj-border); color: var(--gj-text-sec);
                padding: 6px 0; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight:600;
            }
            .btn-preset:hover { background: var(--gj-hover); border-color: #b3d8ff; color: #409EFF;
            }
            .btn-green { background: linear-gradient(135deg, #42e695 0%, #3bb2b8 100%);
            color: white; }
            .btn-blue { background: linear-gradient(135deg, #f56c6c 0%, #f78989 100%);
            color: white; }
            .gj-control-row { display: flex;
            justify-content: space-between; align-items: center; margin-top: 15px; padding: 0 2px;}
            .gj-input-mini {
                width: 45px;
                border: 1px solid var(--gj-border); border-radius: 6px;
                text-align: center; padding: 4px; font-size:13px; outline:none;
                background: var(--gj-bg-input); color: var(--gj-text-main); transition: all 0.2s;
            }
            .gj-input-mini:focus { border-color: #409EFF;
            }
            .gj-btn-icon { border:none; background:transparent; cursor:pointer; font-size:16px; padding:0 5px;
            }
            .gj-btn-text { border:none; background:transparent; cursor:pointer; font-size:11px; color:var(--gj-text-mute);
            }
            .gj-btn-text:hover { color:#409EFF;
            }
            .gj-group { display:flex; flex-direction:column; gap:8px; margin-bottom:12px;
            }
            .gj-divider { display:flex; align-items:center;
            margin: 10px 0 6px 0; }
            .gj-divider::before, .gj-divider::after { content:'';
            flex:1; height:1px; background:var(--gj-border); }
            .gj-label-sm { font-size: 11px;
            color: var(--gj-text-mute); margin: 0 8px; white-space:nowrap;}
            .gj-grid-btns { display: grid;
            grid-template-columns: repeat(5, 1fr); gap: 5px; }
            .gj-bottom-controls { display:flex;
            justify-content:space-between; align-items:center; margin-top:12px; padding-top:10px; border-top:1px dashed var(--gj-border); }
            .btn-icon-circle {
                width:22px;
                height:22px; border-radius:50%; background:rgba(255,255,255,0.2);
                display:flex; align-items:center; justify-content:center;
                cursor:pointer; color:#fff; font-size:12px; transition:0.2s;
            }
            .btn-icon-circle:hover { background:rgba(255,255,255,0.4); transform:scale(1.1);
            }
            .gj-tabs { display:flex; gap:10px; align-items:center;
            }
            .gj-tab { cursor:pointer; padding:2px 0; opacity:0.6;
            border-bottom:2px solid transparent; transition:0.2s; }
            .gj-tab:hover { opacity:0.9;
            }
            .gj-tab.active-tab { opacity:1; font-weight:bold; border-bottom-color:#fff;
            }
            .gj-toolbar {
                padding: 8px;
                background: var(--gj-bg-sec);
                border-bottom: 1px solid var(--gj-border);
                display: flex; align-items: center; gap: 5px;
            }
            #gj-search-input {
                flex: 1;
                border: 1px solid var(--gj-border);
                border-radius: 4px; padding: 5px 8px; font-size: 14px; outline: none;
                background: var(--gj-bg-input); color: var(--gj-text-main);
                font-family: monospace;
                letter-spacing: 1px;
            }
            #gj-search-input:focus { border-color: #409EFF;
            }
            .btn-clear { cursor: pointer; color: var(--gj-text-mute); font-size: 18px;
            line-height: 1; padding: 0 4px; transition: color 0.2s; }
            .btn-clear:hover { color: #F56C6C;
            }
            .gj-list-body {
                overflow-y: auto;
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(var(--gj-col-width, 80px), 1fr));
                gap: 1px; background: var(--gj-bg-sec); padding: 1px;
                transition: height 0.05s;
            }
            .gj-list-body::-webkit-scrollbar { width: 4px;
            }
            .gj-list-body::-webkit-scrollbar-thumb { background: var(--gj-border); border-radius: 2px;
            }
            .gj-list-item {
                background: var(--gj-bg-main);
                padding: 6px 4px;
                cursor: pointer; font-size: 13px; font-weight: 500;
                color: var(--gj-text-main); display: flex; align-items: center; justify-content: center;
                white-space: nowrap;
                overflow: hidden; text-overflow: ellipsis;
            }
            .gj-list-item:hover { background: var(--gj-hover);
            color: var(--gj-hover-text); }
            .gj-item-text { overflow: hidden; text-overflow: ellipsis;
            max-width: 100%; }
            .gj-empty { grid-column: 1 / -1;
            text-align: center; color: var(--gj-text-mute); padding: 30px 10px; font-size: 12px; background: var(--gj-bg-main);}
            .gj-resize-handle {
                position: absolute;
                bottom: 1px; right: 1px;
                width: 12px; height: 12px; cursor: nwse-resize;
                background: linear-gradient(135deg, transparent 50%, var(--gj-text-mute) 50%);
                opacity: 0.5; z-index: 10;
                clip-path: polygon(100% 0, 100% 100%, 0 100%);
            }
            .gj-resize-handle:hover {
                background: linear-gradient(135deg, transparent 50%, #409EFF 50%);
                opacity: 1;
            }
        `);
    };
    const init = () => {
        loadPinyinMatch(); // 在 init 最早时加载拼音库到 _PM（异步，不阻塞页面）
        migrateOldData();
        addStyles();
        checkPage();
        window.addEventListener('hashchange', checkPage);
        if (isDispatchPage()) setTimeout(applyDistanceByTime, 2000);
        applyGlobalTheme();

        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                reloadDB();
                if ((isOrderPage() || isDriverPage()) && !state.manualPause) performAction();
                if (isDispatchPage()) processClipboard();
            }
        });
        window.addEventListener('focus', () => {
            reloadDB();
            if (isDispatchPage()) processClipboard();
        });
        setTimeout(checkPage, 1000);
    };

    if (document.readyState === 'complete' || document.readyState === 'interactive') init();
    else window.addEventListener('load', init);
})();
