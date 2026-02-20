// ==UserScript==
// @name          代驾调度系统助手 (v15.7.0 独立刷新版)
// @namespace     http://tampermonkey.net/
// @version       15.7.0
// @description   【v15.7.0】新增：1.独立刷新控制(司机/订单页面互不影响)；2.头部启停按钮；3.自动消单功能。
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
// @grant         unsafeWindow
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
        isCollapsed: GM_getValue('uiCollapsed', false),
        manualPause: GM_getValue('manualPause', false),
        driverManualPause: GM_getValue('driverManualPause', false), // [新增] 司机调度独立暂停状态
        isScrapingEnabled: GM_getValue('scrapeEnabled', false),
        debugMode: false, // [新增] 调试模式
        debugTimer: null,

        refreshInterval: 20,
        countdown: 0,
        timerId: null,
        scrapeObserver: null,

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

    // [新增] 统一判断当前页面是否暂停
    const isPaused = () => {
        if (isOrderPage()) return state.manualPause;
        if (isDriverPage()) return state.driverManualPause;
        return false;
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

        // 如果是自动调用(无参数)，则跳过确认，否则询问
        // 这里简化处理，直接上传
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
                    log('✅ 上传成功！云端已更新为最新清洗版', 'success');
                    alert('✅ 上传成功！云端数据已清洗。');
                } else {
                    alert('❌ 上传失败: ' + response.responseText);
                }
            },
            onerror: function (e) { alert('❌ 网络错误'); }
        });
    };

    // ... (后续代码：setupCloudConfig, applyDistanceByTime, UI渲染, processClipboard 等保持 v15.6.8 逻辑不变，已包含在上方完整代码中) ...
    // 为节省篇幅，核心修正已在上方完整体现，请直接复制上方完整代码块。

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

    const processClipboard = async (fillTarget = null) => {
        log(`[流程开始] 准备从剪贴板填充: ${fillTarget === 'address' ? '地址' : '电话'}`, 'info');
        reloadDB();

        try {
            const text = await navigator.clipboard.readText();
            log(`📋 剪贴板读取成功: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`, 'success');

            const hasUpdate = parseTextToDB(text);
            updateListsUI();
            log(`📊 [本地库统计] 📍地址: ${state.db.addrs.length} | 📞电话: ${state.db.phones.length}`, 'info');

        } catch (e) {
            log(`❌ 剪贴板读取失败 (可能是权限问题): ${e.message}`, 'error');
            log('🔄 将尝试使用本地库中已有的最新数据进行填充...', 'info');
        }

        if (fillTarget === 'address' && state.db.addrs && state.db.addrs.length > 0) {
            fillInput('address', state.db.addrs[0]);
        } else if (fillTarget === 'phone' && state.db.phones && state.db.phones.length > 0) {
            fillInput('phone', state.db.phones[0]);
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
    const isMatch = (dbItem, inputKey, type) => {
        if (!inputKey) return true;
        const cleanKey = inputKey.trim();
        if (!cleanKey) return true;
        if (type === 'phone') {
            if (dbItem.includes(cleanKey)) return true;
            if (cleanKey.includes(dbItem)) return true;
            if (/^\d+$/.test(cleanKey) && cleanKey.length >= 4) {
                const pattern = cleanKey.split('').join('.*');
                try { const re = new RegExp(pattern); return re.test(dbItem); } catch (e) { }
            }
            return false;
        }
        const keywords = cleanKey.split(/\s+/);
        return keywords.every(k => dbItem.includes(k));
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
    const createMainWidget = () => {
        let widget = document.getElementById('gj-widget-main');
        if (widget) widget.remove();
        widget = document.createElement('div');
        widget.id = 'gj-widget-main';
        widget.className = state.theme === 'dark' ? 'gj-dark gj-window' : 'gj-light gj-window';
        applyPos(widget, state.posMain);
        widget.style.transform = `scale(${state.uiScale})`;
        widget.style.transformOrigin = 'top left';

        const themeIcon = state.theme === 'light' ? '🌙' : '🌞';
        const toggleIcon = state.isCollapsed ? '➕' : '➖';

        // [新增] 头部启停按钮 (仅在订单/司机管理页面显示)
        let pauseHtml = '';
        if (isOrderPage() || isDriverPage()) {
            const isPausedPage = isPaused();
            // isPausedPage=true (暂停中) => 按钮应显示"启"(恢复运行) => 绿色
            // isPausedPage=false (运行中) => 按钮应显示"停"(暂停运行) => 红色
            const pauseText = isPausedPage ? '启' : '停';
            const pauseIcon = isPausedPage ? '▶' : '⏸';
            const pauseTitle = isPausedPage ? '当前已暂停，点击恢复刷新' : '正在刷新中，点击暂停刷新';
            const pauseColor = isPausedPage ? '#67C23A' : '#F56C6C';
            pauseHtml = `<span id="gj-header-pause" title="${pauseTitle}" style="cursor:pointer;color:${pauseColor};font-weight:bold;font-size:14px;">${pauseIcon} ${pauseText}</span>`;
        }

        widget.innerHTML = `
            <div class="gj-header">
                <div style="display:flex;align-items:center;gap:6px;">
                    <span style="font-size:16px;">🤖</span>
                    <span id="gj-title-text">...</span>
                </div>
                <div style="display:flex; gap:10px;">
                     ${pauseHtml}
                     <span id="gj-theme-toggle" title="全站变黑/变亮">${themeIcon}</span>
                     <span class="gj-toggle" title="折叠/展开">${toggleIcon}</span>
                </div>
            </div>
            <div id="gj-main-content" style="display: ${state.isCollapsed ? 'none' : 'block'}"></div>
            <div id="gj-scale-handle" class="gj-resize-handle" title="拖拽缩放"></div>
        `;
        document.body.appendChild(widget);
        setupDrag(widget, 'posMain');
        setupScaleDrag(widget);

        widget.querySelector('.gj-toggle').addEventListener('click', (e) => {
            e.stopPropagation();
            state.isCollapsed = !state.isCollapsed;
            GM_setValue('uiCollapsed', state.isCollapsed);
            updateUI();
        });
        widget.querySelector('#gj-theme-toggle').addEventListener('click', (e) => {
            e.stopPropagation();
            toggleTheme();
        });
        // [新增] 头部启停事件
        const headerPauseBtn = widget.querySelector('#gj-header-pause');
        if (headerPauseBtn) {
            headerPauseBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (isOrderPage()) {
                    state.manualPause = !state.manualPause;
                    GM_setValue('manualPause', state.manualPause);
                } else if (isDriverPage()) {
                    state.driverManualPause = !state.driverManualPause;
                    GM_setValue('driverManualPause', state.driverManualPause);
                }
                updateUI();
            });
        }
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

    const updateUI = () => {
        let mainWidget = document.getElementById('gj-widget-main');
        if (!mainWidget) mainWidget = createMainWidget();

        let addrWidget = document.getElementById('gj-widget-addr');
        if (isDispatchPage()) {
            if (!addrWidget) {
                addrWidget = createAddrWidget();
                updateListsUI();
                applyLayout();
            } else {
                addrWidget.querySelectorAll('.gj-tab').forEach(el => {
                    if (el.dataset.tab === state.viewTab) el.classList.add('active-tab');
                    else el.classList.remove('active-tab');
                });
            }
        } else if (!isDispatchPage() && addrWidget) {
            addrWidget.remove();
        }

        const cls = state.theme === 'dark' ? 'gj-dark gj-window' : 'gj-light gj-window';
        if (mainWidget) mainWidget.className = cls;
        if (addrWidget) addrWidget.className = cls;

        const themeIcon = document.getElementById('gj-theme-toggle');
        if (themeIcon) themeIcon.textContent = state.theme === 'light' ? '🌙' : '🌞';

        const titleSpan = document.getElementById('gj-title-text');
        if (titleSpan) {
            if (isOrderPage()) titleSpan.textContent = CONFIG.ORDER.TITLE;
            else if (isDriverPage()) titleSpan.textContent = CONFIG.DRIVER.TITLE;
            else if (isDispatchPage()) titleSpan.textContent = CONFIG.DISPATCH.TITLE;
            else titleSpan.textContent = "助手待机";
        }

        const mainContent = document.getElementById('gj-main-content');
        const scaleHandle = document.getElementById('gj-scale-handle');
        if (mainContent) mainContent.style.display = state.isCollapsed ? 'none' : 'block';
        if (scaleHandle) scaleHandle.style.display = state.isCollapsed ? 'none' : 'block';
        if (mainContent) renderMainContent(mainContent);
        updateStatusText();
    };

    const renderMainContent = (container) => {
        let html = '';
        const debugPanelHtml = state.debugMode ?
            `<div id="gj-debug-console" style="margin-top:10px;padding:8px;background:#333;color:#fff;font-size:11px;font-family:monospace;white-space:pre-wrap;max-height:150px;overflow-y:auto;border-radius:4px;">正在等待抓取数据...</div>` : '';

        const cancelColValue = state.cancelColIndex === -1 ? '' : state.cancelColIndex;

        if (isOrderPage() || isDriverPage()) {
            const paused = isPaused(); // [修改] 获取当前页面的暂停状态
            const btnClass = paused ? 'btn-resume' : 'btn-pause';
            const btnText = paused ? '▶ 恢复运行' : '⏸ 暂停刷新';
            const statusColor = paused ? 'var(--gj-text-sec)' : '#409EFF';

            const scrapeClass = state.isScrapingEnabled ? 'btn-resume' : 'btn-preset';
            const scrapeText = state.isScrapingEnabled ? '👁️ 自动抓取: 开启' : '🙈 自动抓取: 关闭';
            const scrapeStyle = state.isScrapingEnabled ? 'border:1px solid #e1f3d8;background:#f0f9eb;color:#67c23a;' : 'border:1px solid var(--gj-border);background:var(--gj-bg-sec);color:var(--gj-text-mute);';

            html = `
                <div style="display:flex; justify-content:center; align-items:baseline; margin-bottom:10px;">
                    <span class="gj-timer-text" style="color:${statusColor}">${paused ? '暂停' : state.countdown + '<span style="font-size:12px;margin-left:2px">s</span>'}</span>
                </div>
                
                <button id="gj-btn-toggle" class="gj-btn ${btnClass}">${btnText}</button>
                
                <button id="gj-btn-scrape" class="gj-btn" style="margin-top:8px; ${scrapeStyle}">${scrapeText}</button>

                <div class="gj-control-row">
                    <span style="color:var(--gj-text-sec);font-size:12px;">刷新间隔</span>
                    <div style="display:flex;align-items:center;">
                        <input type="number" id="gj-input-interval" value="${state.refreshInterval}" class="gj-input-mini">
                        <button id="gj-btn-set" class="gj-btn-icon">🆗</button>
                    </div>
                </div>

                <!-- [新增] 调试与消单配置 -->
                <div class="gj-control-row" style="margin-top:8px;border-top:1px dashed var(--gj-border);padding-top:8px;">
                     <label style="font-size:12px;display:flex;align-items:center;cursor:pointer;">
                        <input type="checkbox" id="gj-chk-debug" ${state.debugMode ? 'checked' : ''} style="margin-right:4px;">
                        🐛 调试模式
                     </label>
                     <div style="display:flex;align-items:center;gap:4px;" title="当状态列包含'乘客取消'时自动删除电话">
                        <span style="font-size:12px;">🚫 消单列</span>
                        <input type="number" id="gj-input-cancel-col" value="${cancelColValue}" placeholder="无" class="gj-input-mini" style="width:30px;">
                     </div>
                </div>
                ${debugPanelHtml}

                <div class="gj-control-row" style="margin-top:10px; border-top:1px dashed var(--gj-border); padding-top:10px; justify-content: space-around;">
                    <span class="btn-icon-circle" id="btn-cloud-setting" title="配置云端Worker" style="background:rgba(64,158,255,0.6)">⚙️</span>
                    <span class="btn-icon-circle" id="btn-cloud-pull" title="⬇️ 覆盖下载(以云端为准)" style="background:rgba(230,162,60,0.6)">⬇</span>
                    <span class="btn-icon-circle" id="btn-cloud-push" title="⬆️ 上传本地数据" style="background:rgba(245,108,108,0.6)">⬆</span>
                    <label class="btn-icon-circle" title="导入本地文件(txt/csv)" style="background:rgba(103,194,58,0.6)">
                        📂<input type="file" id="gj-file-import" style="display:none" accept=".txt,.csv">
                    </label>
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
                    <button id="btn-sync-cloud" class="gj-btn-text">☁️ 手动同步</button>
                    <span style="font-size:10px;color:var(--gj-text-mute);">缩放: ${(state.uiScale * 100).toFixed(0)}%</span>
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
        const isPhone = state.viewTab === 'phone';
        const sourceList = isPhone ? state.db.phones : state.db.addrs;
        const filteredList = (sourceList || []).filter(item => isMatch(item, state.searchText, isPhone ? 'phone' : 'address'));
        const renderItem = (item) => {
            return `<div class="gj-list-item" title="${item}" data-val="${item}" data-type="${isPhone ? 'phone' : 'address'}">
                ${isPhone ? '📞' : ''}
                <span class="gj-item-text">${item}</span>
            </div>`;
        };

        if (filteredList.length === 0) {
            addrBody.innerHTML = `<div class="gj-empty">${state.searchText ?
                '无匹配结果' : '库为空<br>请导入文件或复制文本'}</div>`;
        } else {
            addrBody.innerHTML = filteredList.map(i => renderItem(i)).join('');
            addrBody.querySelectorAll('.gj-list-item').forEach(el =>
                el.addEventListener('click', () => fillInput(el.dataset.type, el.dataset.val))
            );
        }
    };

    const bindEvents = () => {
        document.getElementById('btn-cloud-setting')?.addEventListener('click', setupCloudConfig);
        document.getElementById('btn-cloud-pull')?.addEventListener('click', () => pullFromCloud(false));
        document.getElementById('btn-cloud-push')?.addEventListener('click', pushToCloud);
        document.getElementById('gj-file-import')?.addEventListener('change', handleFileImport);
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

            document.getElementById('btn-sync-cloud')?.addEventListener('click', () => {
                fetchOnlineBlacklist(false);
            });
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
                    updateUI(); // 触发重绘以显示/隐藏面板
                    if (state.debugMode) scanOrderPage();
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
        if (text) {
            if (isPaused()) { // [修改] 使用统一暂停判断
                text.textContent = "暂停";
                text.style.color = "var(--gj-text-sec)";
            }
            else {
                text.innerHTML = `${state.countdown}<span style="font-size:16px;margin-left:2px;opacity:0.6">s</span>`;
                text.style.color = state.countdown <= 3 ? "#F56C6C" : "#409EFF";
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

    const setupScaleDrag = (el) => {
        const handle = el.querySelector('#gj-scale-handle');
        if (!handle) return;
        let isResizing = false, startY, startScale;
        handle.addEventListener('mousedown', e => {
            e.stopPropagation(); e.preventDefault();
            isResizing = true; startY = e.clientY; startScale = state.uiScale;
            document.body.style.cursor = 'nwse-resize';
        });
        document.addEventListener('mousemove', e => {
            if (!isResizing) return;
            const dy = e.clientY - startY;
            let newScale = startScale + (dy * 0.005);
            if (newScale < 0.5) newScale = 0.5;
            if (newScale > 3.0) newScale = 3.0;
            state.uiScale = newScale;
            const mainW = document.getElementById('gj-widget-main');
            const addrW = document.getElementById('gj-widget-addr');
            if (mainW) mainW.style.transform = `scale(${newScale})`;
            if (addrW) addrW.style.transform = `scale(${newScale})`;
            const label = document.querySelector('.gj-bottom-controls span');
            if (label) label.textContent = `缩放: ${(newScale * 100).toFixed(0)}%`;
        });
        document.addEventListener('mouseup', () => {
            if (isResizing) {
                isResizing = false; document.body.style.cursor = 'default';
                GM_setValue('uiScale', state.uiScale);
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