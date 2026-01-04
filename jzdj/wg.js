// ==UserScript==
// @name          代驾调度系统助手 (v15.9 修复电话填充版)
// @namespace     http://tampermonkey.net/
// @version       15.9
// @description   【v15.9】修复“填最新电话”无效的问题；修复读取剪切板电话逻辑；保留所有定制功能。
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

(function() {
    'use strict';

    // --------------- 1. 配置中心 (定制配置) ---------------
    const CONFIG = {
        // 【抓取与排除配置】
        SCRAPE: {
            // 1. 抓取目标列
            PHONE_COL_INDEX: 13,  // 您的要求：13 (第14列)
            ADDR_COL_INDEX: 7,    // 您的要求：7  (第8列)

            // 2. 排除过滤配置
            EXCLUDE_COL_INDEX: 6, // 您的要求：6  (第7列)
            
            // 3. 排除关键词
            EXCLUDE_NAMES: [
                '腾讯出行', 
                '盛大大地模式'
            ]
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
        try { return JSON.parse(GM_getValue(key, def));
        } catch (e) { return JSON.parse(def); }
    };
    let state = {
        currentHash: window.location.hash,
        isCollapsed: GM_getValue('uiCollapsed', false),
        manualPause: GM_getValue('manualPause', false),
        isScrapingEnabled: GM_getValue('scrapeEnabled', false), 

        refreshInterval: 20, 
        countdown: 0,
        timerId: null,
        scrapeObserver: null,
        
        posMain: safeParse('posMain', '{"top":"80px","left":"20px"}'),
        posAddr: safeParse('posAddr', '{"top":"80px","left":"300px"}'),
        uiScale: parseFloat(GM_getValue('uiScale', '1.0')),
        layout: safeParse('uiLayout', '{"width": 280, "height": 350}'),
        colWidth: parseInt(GM_getValue('addrColWidth', 80)),
        
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

    // --------------- 3. 核心逻辑 ---------------

    const checkPage = () => {
        state.currentHash = window.location.hash;
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
            log('进入派单界面 (纯手动模式)', 'info');
            setTimeout(applyDistanceByTime, 1500);
            updateListsUI(); // 进入页面时立即刷新一次列表
        }

        updateUI(); // 尝试调用UI更新
        
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
    
    // ==============================================
    //        核心修正：列定位 + 过滤 + 本地存储
    // ==============================================
    
    const setupTableObserver = () => {
        if (state.scrapeObserver) return;
        const targetNode = document.body;
        const config = { childList: true, subtree: true };
        let timeout = null;
        state.scrapeObserver = new MutationObserver((mutationsList) => {
            if (!state.isScrapingEnabled) return;
            let hasTableChange = false;
            for(let mutation of mutationsList) {
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

        const rows = document.querySelectorAll('.el-table__body-wrapper .el-table__row');
        let newCount = 0;

        rows.forEach(row => {
            const cells = row.querySelectorAll('td');
            if (cells.length <= Math.max(idxExclude, idxPhone, idxAddr)) return;

            // === A. 排除逻辑 ===
            if (idxExclude !== null && cells[idxExclude]) {
                const checkText = cells[idxExclude].innerText.trim();
                const hit = excludeKeywords.find(kw => checkText.includes(kw));
                if (hit) return; 
            }

            // === B. 抓取电话 ===
            if (idxPhone !== null && cells[idxPhone]) {
                const rawText = cells[idxPhone].innerText.trim();
                const cleanNum = rawText.replace(/\D/g, '');
                if (/^1\d{10}$/.test(cleanNum)) {
                    if (addToDB('phone', cleanNum, idxPhone)) {
                        newCount++;
                    }
                }
            }

            // === C. 抓取地址 ===
            if (idxAddr !== null && cells[idxAddr]) {
                const addrText = cells[idxAddr].innerText.trim();
                if (addrText && addrText.length > 1) {
                    const blockers = state.blacklist.split(/[,，]/).map(s => s.trim()).filter(s => s);
                    if (!blockers.some(b => addrText.includes(b))) {
                        if (!/^\d{4}-\d{2}-\d{2}/.test(addrText)) { 
                             if (addToDB('address', addrText, idxAddr)) {
                                 newCount++;
                             }
                        }
                    }
                }
            }
        });

        if (newCount > 0) {
            updateListsUI();
        }
    };

    // ==============================================
    //        核心存储函数：强制实时保存
    // ==============================================
    const addToDB = (type, value, sourceIdx = null) => {
        if (!value) return false;
        
        const storageKey = type === 'address' ? 'dbAddrs' : 'dbPhones';
        
        // 1. 强制读取最新
        let currentList = [];
        try {
            const raw = GM_getValue(storageKey, '[]');
            currentList = JSON.parse(raw);
        } catch(e) { currentList = []; }

        // 2. 查重
        if (currentList.includes(value)) return false;

        // 3. 插入
        currentList.unshift(value);

        // 4. 限制
        if (currentList.length > CONFIG.STORAGE.MAX_ITEMS) {
            currentList.length = CONFIG.STORAGE.MAX_ITEMS;
        }

        // 5. 保存
        GM_setValue(storageKey, JSON.stringify(currentList));

        // 6. 同步内存
        if (type === 'address') state.db.addrs = currentList;
        else state.db.phones = currentList;

        if (sourceIdx !== null) {
            log(`💾 [已保存] ${type==='address'?'地址':'电话'}: ${value} (来源: 第${sourceIdx}列)`, 'success');
        }
        
        return true;
    };

    // ==============================================
    //               云端同步 / 数据库
    // ==============================================
    
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

    const cleanDBWithBlacklist = () => {
        let currentAddrs = safeParse('dbAddrs', '[]');
        if (!currentAddrs || currentAddrs.length === 0) return;
        
        const blockers = state.blacklist.split(/[,，]/).map(s => s.trim()).filter(s => s);
        const originalCount = currentAddrs.length;
        
        currentAddrs = currentAddrs.filter(addr => {
            if (blockers.length > 0 && blockers.some(keyword => addr.includes(keyword))) return false;
            const hanziMatches = addr.match(/[\u4e00-\u9fa5]/g);
            if ((hanziMatches ? hanziMatches.length : 0) > 6) return false;
            return true;
        });

        if (originalCount !== currentAddrs.length) {
            GM_setValue('dbAddrs', JSON.stringify(currentAddrs));
            state.db.addrs = currentAddrs;
            updateListsUI();
        }
    };

    const fetchOnlineBlacklist = (silent = false) => {
        const t = new Date().getTime();
        if (CONFIG.CLOUD.SYNC_URL && CONFIG.CLOUD.SYNC_TOKEN) {
            const cloudUrl = `${CONFIG.CLOUD.SYNC_URL.replace(/\/$/, '')}/txt?token=${CONFIG.CLOUD.SYNC_TOKEN}`;
            GM_xmlhttpRequest({
                method: "GET",
                url: cloudUrl + '&t=' + t,
                onload: function(response) {
                    if (response.status === 200) {
                        const text = response.responseText;
                        if (text && text.includes('[BLACKLIST]')) {
                            const sections = text.split(/\[(BLACKLIST|ADDRS|PHONES)\]/);
                            for(let i=1; i<sections.length; i+=2) {
                                if(sections[i] === 'BLACKLIST') {
                                    const bl = sections[i+1].split(/[\r\n]+/).map(s=>s.trim()).filter(s=>s).join(',');
                                    if(bl) {
                                        state.blacklist = bl;
                                        GM_setValue('blacklist', bl);
                                        cleanDBWithBlacklist();
                                        if(!silent) log('✅ 已从 Worker 覆盖黑名单', 'success');
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
            onload: function(response) {
                if (response.status === 200) {
                    const text = response.responseText;
                    if (text && text.length > 0) {
                        const cleanList = text.replace(/[\r\n\s]+/g, ',').replace(/，/g, ',');
                        state.blacklist = cleanList;
                        GM_setValue('blacklist', cleanList);
                        cleanDBWithBlacklist();
                        if(!silent) log('✅ 已从 GitHub 同步黑名单', 'success');
                    }
                }
            }
        });
    };

    // 【核心】下载覆盖逻辑
    const pullFromCloud = (isAuto = false) => {
        const url = CONFIG.CLOUD.SYNC_URL;
        const token = CONFIG.CLOUD.SYNC_TOKEN;
        
        if (!url || !token) { 
            if (!isAuto) { alert('请先点击 ⚙️ 设置 Worker 域名和 Token');
            setupCloudConfig(); }
            return;
        }

        const targetUrl = `${url.replace(/\/$/, '')}/txt?token=${token}`;
        if (!isAuto) log('正在全量拉取(覆盖模式)...', 'info');
        GM_xmlhttpRequest({
            method: "GET",
            url: targetUrl + '&t=' + new Date().getTime(),
            onload: function(response) {
                if (response.status === 200) {
                    const text = response.responseText;
                    if (!text) return;
                    
                    let importedAddrs = 0;
                    let importedPhones = 0;
                    
                    if (text.includes('[BLACKLIST]') || text.includes('[ADDRS]') || text.includes('[PHONES]')) {
                        const sections = text.split(/\[(BLACKLIST|ADDRS|PHONES)\]/);
                        for(let i=1; i<sections.length; i+=2) {
                            const type = sections[i];
                            const content = sections[i+1];
                            const lines = content.split(/[\r\n]+/).map(s=>s.trim()).filter(s=>s);
                            if (type === 'BLACKLIST') {
                                state.blacklist = lines.join(',');
                                GM_setValue('blacklist', state.blacklist);
                            } else if (type === 'ADDRS') {
                                state.db.addrs = lines;
                                GM_setValue('dbAddrs', JSON.stringify(state.db.addrs)); // 强制覆盖
                                importedAddrs = lines.length;
                            } else if (type === 'PHONES') {
                                state.db.phones = lines;
                                GM_setValue('dbPhones', JSON.stringify(state.db.phones)); // 强制覆盖
                                importedPhones = lines.length;
                            }
                        }
                    } else {
                        const lines = text.split(/[\r\n]+/).map(s=>s.trim()).filter(s=>s);
                        state.db.addrs = lines;
                        GM_setValue('dbAddrs', JSON.stringify(state.db.addrs));
                        importedAddrs = lines.length;
                    }

                    cleanDBWithBlacklist();
                    updateListsUI(); 
                    if (!isAuto) {
                        alert(`☁️ 覆盖成功！本地数据库已更新。\n\n- 地址库: ${importedAddrs} 条\n- 电话库: ${importedPhones} 条`);
                    } else {
                        log(`[自动同步] 完成: 覆盖地址${importedAddrs}条 / 电话${importedPhones}条`, 'success');
                    }
                } else {
                    if (!isAuto) alert('❌ 拉取失败: ' + response.statusText);
                }
            },
            onerror: function(e) { if (!isAuto) alert('❌ 网络错误');
            }
        });
    };
    const pushToCloud = () => {
        const url = CONFIG.CLOUD.SYNC_URL;
        const token = CONFIG.CLOUD.SYNC_TOKEN;
        if (!url || !token) { alert('请先设置云端'); setupCloudConfig(); return;
        }

        if (!confirm('⚠️ 流量警告：\n\n这会将所有本地数据（新旧汇总）一次性上传覆盖到云端。\n请确保在一天工作结束后点击，以节省Cloudflare写入额度。\n\n确定上传吗？')) return;

        const targetUrl = `${url.replace(/\/$/, '')}/api/sync?token=${token}`;
        const blData = state.blacklist.split(/[,，]/).map(s=>s.trim()).filter(s=>s).join('\n');
        
        const latestAddrs = safeParse('dbAddrs', '[]');
        const latestPhones = safeParse('dbPhones', '[]');
        const addrData = (latestAddrs || []).join('\n');
        const phoneData = (latestPhones || []).join('\n');
        const fileContent = `[BLACKLIST]\n${blData}\n\n[ADDRS]\n${addrData}\n\n[PHONES]\n${phoneData}`;
        
        GM_xmlhttpRequest({
            method: "POST",
            url: targetUrl,
            data: fileContent,
            headers: { "Content-Type": "text/plain" },
            onload: function(response) {
                if (response.status === 200) alert(`✅ 上传成功！`);
                else alert('❌ 上传失败: ' + response.responseText);
            },
            onerror: function(e) { alert('❌ 网络错误'); }
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
    // ==============================================
    //               其他辅助功能
    // ==============================================

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
    
    const parseTextToDB = (fullText) => {
        if (!fullText || !fullText.trim()) return false;
        let hasUpdate = false;
        const phoneRegex = /(?:^|[^\d])(1\d{10})(?:$|[^\d])/g;
        let phoneMatch;
        let tempTextForPhone = fullText;
        while ((phoneMatch = phoneRegex.exec(tempTextForPhone)) !== null) {
            const num = phoneMatch[1];
            if (/^1\d{10}$/.test(num)) {
                if(addToDB('phone', num)) hasUpdate = true;
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
            if(addToDB('address', cleanSeg)) hasUpdate = true;
        });
        if (hasUpdate) cleanDBWithBlacklist();
        return hasUpdate;
    };

    // 【修改点】修复 填电话 逻辑
    const processClipboard = async (autoFill = false, fillType = 'address') => {
        try {
            const text = await navigator.clipboard.readText();
            parseTextToDB(text); // 解析入库
            updateListsUI(); // 刷新UI
            
            // 重新读取最新数据进行填充
            const currentAddrs = safeParse('dbAddrs', '[]');
            const currentPhones = safeParse('dbPhones', '[]');
            
            if (autoFill) {
                if (fillType === 'phone' && currentPhones.length > 0) {
                    fillInput('phone', currentPhones[0]);
                } else if (fillType === 'address' && currentAddrs.length > 0) {
                    fillInput('address', currentAddrs[0]);
                }
            }
        } catch (e) {}
    };

    const handleFileImport = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if(!confirm(`确认导入文件 "${file.name}" 到本地库吗？\n将会自动清洗（汉字>7或含违禁词）。`)) {
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
        let input = null;
        if (type === 'address') {
             input = document.getElementById('tipinput');
             if (!input) {
                 const inputs = document.querySelectorAll('input');
                 for (let i = 0; i < inputs.length; i++) {
                     const el = inputs[i];
                     if (el.closest('.gj-window')) continue;
                     if (!el.closest('.el-form-item') && el.type === 'text') { input = el; break;
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
                     if (keywords.some(k => ph.includes(k))) { input = el; break;
                     }
                 }
             }
        } else if (type === 'phone') {
             const inputs = document.querySelectorAll('input');
             for (let i = 0; i < inputs.length; i++) {
                 const el = inputs[i];
                 if (el.closest('.gj-window')) continue; 
                 const ph = (el.placeholder || '').toLowerCase();
                 if (ph.includes('用户电话') || ph.includes('电话') || el.type === 'tel') { input = el;
                 break; }
             }
        }
        if (input) {
            input.value = value;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
            input.click();
            input.focus();
            input.style.transition = 'all 0.3s';
            input.style.boxShadow = '0 0 0 2px rgba(103, 194, 58, 0.3)';
            setTimeout(() => input.style.boxShadow = '', 800);
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
                try { const re = new RegExp(pattern); return re.test(dbItem); } catch(e) {}
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
    
    // 【修改点】UI函数声明提升
    function toggleTheme() {
        state.theme = state.theme === 'light' ? 'dark' : 'light';
        GM_setValue('theme', state.theme);
        updateUI();
        applyGlobalTheme(); 
    }
    function applyGlobalTheme() {
        const doc = document.documentElement;
        if (state.theme === 'dark') {
            doc.classList.add('gj-global-dark');
        } else {
            doc.classList.remove('gj-global-dark');
        }
    }
    function createMainWidget() {
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

        widget.innerHTML = `
            <div class="gj-header">
                <div style="display:flex;align-items:center;gap:6px;">
                    <span style="font-size:16px;">🤖</span>
                    <span id="gj-title-text">...</span>
                </div>
                <div style="display:flex; gap:8px;">
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
        return widget;
    }

    function createAddrWidget() {
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
            
            <div style="padding:5px 8px; font-size:11px; display:flex; align-items:center; gap:5px; border-top:1px dashed var(--gj-border);">
                <span style="color:var(--gj-text-mute);white-space:nowrap;">列宽:</span>
                <input type="range" id="gj-col-slider" min="50" max="250" value="${state.colWidth}" style="flex:1;" title="拖动改变显示字数">
            </div>

            <div id="gj-size-handle" class="gj-resize-handle" title="拖拽调整宽高"></div>
        `;

        document.body.appendChild(widget);
        setupDrag(widget, 'posAddr');
        setupResizeDrag(widget);

        widget.querySelector('#btn-refresh-addr').addEventListener('click', () => processClipboard(true));
        
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
    }

    function updateUI() {
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
                    if(el.dataset.tab === state.viewTab) el.classList.add('active-tab');
                    else el.classList.remove('active-tab');
                });
            }
        } else if (!isDispatchPage() && addrWidget) {
            addrWidget.remove();
        }

        const cls = state.theme === 'dark' ? 'gj-dark gj-window' : 'gj-light gj-window';
        if(mainWidget) mainWidget.className = cls;
        if(addrWidget) addrWidget.className = cls;

        const themeIcon = document.getElementById('gj-theme-toggle');
        if(themeIcon) themeIcon.textContent = state.theme === 'light' ? '🌙' : '🌞';

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
    }

    function renderMainContent(container) {
        let html = '';
        if (isOrderPage() || isDriverPage()) {
            const btnClass = state.manualPause ? 'btn-resume' : 'btn-pause';
            const btnText = state.manualPause ? '▶ 恢复运行' : '⏸ 暂停刷新';
            const statusColor = state.manualPause ? 'var(--gj-text-sec)' : '#409EFF';
            
            const scrapeClass = state.isScrapingEnabled ? 'btn-resume' : 'btn-preset';
            const scrapeText = state.isScrapingEnabled ? '👁️ 自动抓取: 开启' : '🙈 自动抓取: 关闭';
            const scrapeStyle = state.isScrapingEnabled ? 'border:1px solid #e1f3d8;background:#f0f9eb;color:#67c23a;' : 'border:1px solid var(--gj-border);background:var(--gj-bg-sec);color:var(--gj-text-mute);';

            html = `
                <div style="display:flex; justify-content:center; align-items:baseline; margin-bottom:10px;">
                    <span class="gj-timer-text" style="color:${statusColor}">${state.manualPause ? '暂停' : state.countdown + '<span style="font-size:12px;margin-left:2px">s</span>'}</span>
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
                    <span style="font-size:10px;color:var(--gj-text-mute);">缩放: ${(state.uiScale*100).toFixed(0)}%</span>
                </div>
            `;
        } else {
            html = `<div style="padding:20px;color:var(--gj-text-mute);text-align:center;font-size:13px;">💤 非工作区域</div>`;
        }
        container.innerHTML = html;
        bindEvents();
    }

    function updateListsUI() {
        const addrBody = document.getElementById('list-addr-body');
        if (!addrBody) return;
        
        // 强制刷新内存数据
        state.db.addrs = safeParse('dbAddrs', '[]');
        state.db.phones = safeParse('dbPhones', '[]');

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
            addrBody.innerHTML = `<div class="gj-empty">${state.searchText ? '无匹配结果' : '库为空<br>请导入文件或复制文本'}</div>`;
        } else {
            addrBody.innerHTML = filteredList.map(i => renderItem(i)).join('');
            addrBody.querySelectorAll('.gj-list-item').forEach(el => 
                el.addEventListener('click', () => fillInput(el.dataset.type, el.dataset.val))
            );
        }
    }

    if (document.readyState === 'complete' || document.readyState === 'interactive') init();
    else window.addEventListener('load', init);
})();