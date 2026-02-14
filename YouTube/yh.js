// ==UserScript==
// @name         YouTube 整合助手 (V23.3 定制版 - 画质选择+代理开关)
// @name:en      YouTube All-in-One (V23.3 Custom with Quality Selector & Proxy Toggle)
// @namespace    http://tampermonkey.net/
// @version      23.3.0
// @description  1.新增画质选择(最高/8K/4K/2K/1080p/720p)；2.两级菜单(画质→线程)；3.记忆画质偏好；4.断点续传+限速保护+大文件优化；5.代理开关。
// @description:en  Ad blocker, Shorts filter, quality selector (Best/8K/4K/2K/1080p/720p), smart download menu (1/4/16 threads), resume support, throttle protection, proxy toggle.
// @author       郭
// @match        *://www.youtube.com/*
// @grant        GM_setClipboard
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// @run-at       document-start
// @icon         https://www.google.com/s2/favicons?sz=64&domain=YouTube.com
// @license      MIT
// ==/UserScript==

(function () {
    'use strict';

    console.log('YT助手 V23.3.0: 启动 (作者: 郭 | 画质选择+代理开关版)...');

    // ==========================================
    // 1. 配置管理
    // ==========================================
    const CONFIG = {
        get blockAds() { return GM_getValue('cfg_blockAds', true); },
        set blockAds(val) { GM_setValue('cfg_blockAds', val); },
        get blockShorts() { return GM_getValue('cfg_blockShorts', true); },
        set blockShorts(val) { GM_setValue('cfg_blockShorts', val); },
        get hideSidebar() { return GM_getValue('cfg_hideSidebar', true); },
        set hideSidebar(val) { GM_setValue('cfg_hideSidebar', val); },
        get autoTheater() { return GM_getValue('cfg_autoTheater', false); },
        set autoTheater(val) { GM_setValue('cfg_autoTheater', val); },
        get expandSubs() { return GM_getValue('cfg_expandSubs', true); },
        set expandSubs(val) { GM_setValue('cfg_expandSubs', val); },
        get showSpeed() { return GM_getValue('cfg_showSpeed', true); },
        set showSpeed(val) { GM_setValue('cfg_showSpeed', val); },
        get useProxy() { return GM_getValue('cfg_useProxy', true); },
        set useProxy(val) { GM_setValue('cfg_useProxy', val); },
        get proxyAddr() { return GM_getValue('cfg_proxyAddr', 'http://127.0.0.1:30000'); },
        set proxyAddr(val) { GM_setValue('cfg_proxyAddr', val); },
        // 新增：画质偏好记忆
        get preferQuality() { return GM_getValue('cfg_preferQuality', 'best'); },
        set preferQuality(val) { GM_setValue('cfg_preferQuality', val); }
    };

    // ==========================================
    // 2. 画质档位定义
    // ==========================================
    const QUALITY_OPTIONS = [
        { key: 'best', label: '🏆 最高画质', desc: '自动选择视频可用的最佳分辨率', color: '#ff6b6b', format: 'bestvideo+bestaudio/best' },
        { key: '8k', label: '📺 8K (4320p)', desc: '超高清 8K · 需视频源支持', color: '#a855f7', format: 'bestvideo[height<=4320]+bestaudio/best' },
        { key: '4k', label: '📺 4K (2160p)', desc: '超高清 4K · 主流高清视频', color: '#3b82f6', format: 'bestvideo[height<=2160]+bestaudio/best' },
        { key: '2k', label: '📺 2K (1440p)', desc: '准高清 2K · 平衡画质与体积', color: '#06b6d4', format: 'bestvideo[height<=1440]+bestaudio/best' },
        { key: '1080p', label: '📺 1080p', desc: '全高清 · 最通用的画质', color: '#22c55e', format: 'bestvideo[height<=1080]+bestaudio/best' },
        { key: '720p', label: '📺 720p', desc: '高清 · 体积最小省流量', color: '#eab308', format: 'bestvideo[height<=720]+bestaudio/best' }
    ];

    // ==========================================
    // 3. 样式注入
    // ==========================================
    function injectStyles() {
        const styleId = 'yt-helper-v23-css';
        if (document.getElementById(styleId)) return;

        let css = '';
        if (CONFIG.hideSidebar) {
            css += `ytd-watch-flexy #secondary { display: none !important; } ytd-watch-flexy[flexy] #primary.ytd-watch-flexy { max-width: 100% !important; min-width: 100% !important; margin-right: 0 !important; }`;
        }
        if (CONFIG.blockShorts) {
            css += `ytd-rich-shelf-renderer[is-shorts], ytd-reel-shelf-renderer, ytd-rich-section-renderer:has(ytd-rich-shelf-renderer[is-shorts]), ytd-guide-entry-renderer:has(a[href="/shorts"]), ytd-mini-guide-entry-renderer[aria-label="Shorts"] { display: none !important; }`;
        }
        if (CONFIG.blockAds) {
            css += `ytd-ad-slot-renderer, #masthead-ad, #player-ads, .ytd-action-companion-ad-renderer, ytd-mealbar-promo-renderer, ytd-promoted-sparkles-web-renderer, ytd-banner-promo-renderer, #premium-container { display: none !important; }`;
        }

        css += `
            .yt-helper-highlight {
                border-right: 6px solid #ff0000 !important;
                background-color: rgba(255,0,0,0.15) !important;
                border-radius: 4px;
                transition: all 0.3s ease;
            }
        `;

        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = css;
        (document.head || document.documentElement).appendChild(style);
    }

    // ==========================================
    // 4. UI 构建 (下载菜单 - 两级：画质→线程)
    // ==========================================
    function createSVGIcon() {
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("viewBox", "0 0 24 24");
        svg.style.cssText = "width:28px; height:28px; fill:white;";
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", "M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z");
        svg.appendChild(path);
        return svg;
    }

    function createMenuItem(title, desc, color, onClick) {
        const item = document.createElement('div');
        item.style.cssText = `color: white; cursor: pointer; padding: 10px; border-radius: 6px; border-left: 4px solid ${color}; background: #252525; margin-bottom: 8px; font-family: sans-serif; transition: all 0.2s ease;`;
        item.onmouseenter = () => { item.style.background = '#333'; item.style.transform = 'translateX(-2px)'; };
        item.onmouseleave = () => { item.style.background = '#252525'; item.style.transform = 'translateX(0)'; };

        const tDiv = document.createElement('div');
        tDiv.style.fontWeight = 'bold';
        tDiv.style.fontSize = '14px';
        tDiv.textContent = title;

        const dDiv = document.createElement('div');
        dDiv.style.fontSize = '11px';
        dDiv.style.color = '#aaa';
        dDiv.style.marginTop = '3px';
        dDiv.textContent = desc;

        item.appendChild(tDiv);
        item.appendChild(dDiv);
        item.onclick = (e) => { e.stopPropagation(); onClick(); };
        return item;
    }

    // 构建 yt-dlp 命令（支持画质参数）
    function buildYtdlpCmd(threads, qualityKey) {
        const url = window.location.href.split('&')[0];
        // 稳定性参数
        const stableArgs = `--retries infinite --fragment-retries infinite --skip-unavailable-fragments --socket-timeout 60`;
        // 断点续传
        const resumeArgs = `-c`;
        // 限速保护：被限速时自动切换到未限速格式
        const throttleArgs = `--throttled-rate 100K`;
        // 大文件缓冲优化
        const bufferArgs = `--buffer-size 16K --http-chunk-size 10M`;
        // 保存元信息方便排查
        const metaArgs = `--write-info-json`;
        // 线程参数
        const threadArgs = threads > 1 ? `-N ${threads}` : '';

        // 画质参数
        const qOption = QUALITY_OPTIONS.find(q => q.key === qualityKey) || QUALITY_OPTIONS[0];
        const formatArgs = `-f "${qOption.format}"`;

        // 处理代理前缀
        let proxyPrefix = '';
        if (CONFIG.useProxy) {
            proxyPrefix = `$env:HTTP_PROXY="${CONFIG.proxyAddr}"; $env:HTTPS_PROXY="${CONFIG.proxyAddr}"; `;
        }

        return `${proxyPrefix}cd "$([Environment]::GetFolderPath('Desktop'))"; yt-dlp ${stableArgs} ${resumeArgs} ${throttleArgs} ${bufferArgs} ${metaArgs} --extractor-args "youtube:player-client=android,web" --no-check-certificates ${formatArgs} --merge-output-format mp4 ${threadArgs} -o "%(title)s.%(ext)s" "${url}"`;
    }

    function renderUI() {
        if (document.getElementById('yt-helper-v23-root')) return;
        const root = document.createElement('div');
        root.id = 'yt-helper-v23-root';
        root.style.cssText = 'position: fixed; top: 20%; right: 0; z-index: 2147483647; display: flex; flex-direction: column; align-items: flex-end;';

        const btn = document.createElement('div');
        btn.style.cssText = 'width: 48px; height: 48px; background: #cc0000; border-radius: 24px 0 0 24px; cursor: pointer; display: flex; align-items: center; justify-content: center; box-shadow: -2px 2px 10px rgba(0,0,0,0.5); pointer-events: auto; transition: all 0.2s ease;';
        btn.onmouseenter = () => { btn.style.width = '56px'; btn.style.background = '#e60000'; };
        btn.onmouseleave = () => { btn.style.width = '48px'; btn.style.background = '#cc0000'; };
        btn.appendChild(createSVGIcon());

        const menu = document.createElement('div');
        menu.style.cssText = 'display: none; background: #1a1a1a; border: 1px solid #333; border-radius: 8px 0 0 8px; padding: 12px; min-width: 300px; margin-top: 10px; box-shadow: -5px 5px 20px rgba(0,0,0,0.8); pointer-events: auto;';

        const proxyTag = CONFIG.useProxy ? '代理:ON' : '直连:OFF';

        // ---- 第一级：画质选择面板 ----
        const qualityPanel = document.createElement('div');
        qualityPanel.id = 'yt-dl-quality-panel';

        const qTitle = document.createElement('div');
        qTitle.style.cssText = 'color: #fff; font-size: 13px; font-weight: bold; margin-bottom: 10px; padding-bottom: 8px; border-bottom: 1px solid #333; font-family: sans-serif; display: flex; align-items: center; justify-content: space-between;';
        qTitle.innerHTML = `<span>📥 选择画质 (${proxyTag})</span><span style="font-size:11px; color:#888; font-weight:normal;">偏好: ${getQualityLabel(CONFIG.preferQuality)}</span>`;
        qualityPanel.appendChild(qTitle);

        QUALITY_OPTIONS.forEach(q => {
            const isPreferred = q.key === CONFIG.preferQuality;
            const item = createMenuItem(
                q.label + (isPreferred ? ' ⭐' : ''),
                q.desc,
                q.color,
                () => {
                    // 记忆用户的画质偏好
                    CONFIG.preferQuality = q.key;
                    // 切换到线程选择面板
                    qualityPanel.style.display = 'none';
                    showThreadPanel(q);
                }
            );
            if (isPreferred) {
                item.style.background = '#2a2a3a';
                item.style.border = `1px solid ${q.color}40`;
                item.style.borderLeft = `4px solid ${q.color}`;
            }
            qualityPanel.appendChild(item);
        });

        menu.appendChild(qualityPanel);

        // ---- 第二级：线程选择面板 ----
        const threadPanel = document.createElement('div');
        threadPanel.id = 'yt-dl-thread-panel';
        threadPanel.style.display = 'none';
        menu.appendChild(threadPanel);

        function showThreadPanel(quality) {
            threadPanel.innerHTML = '';
            threadPanel.style.display = 'block';

            // 返回按钮 + 标题
            const tTitle = document.createElement('div');
            tTitle.style.cssText = 'color: #fff; font-size: 13px; font-weight: bold; margin-bottom: 10px; padding-bottom: 8px; border-bottom: 1px solid #333; font-family: sans-serif; display: flex; align-items: center; gap: 8px;';

            const backBtn = document.createElement('span');
            backBtn.textContent = '← ';
            backBtn.style.cssText = 'cursor: pointer; font-size: 16px; padding: 2px 6px; border-radius: 4px; transition: background 0.2s;';
            backBtn.onmouseenter = () => { backBtn.style.background = '#333'; };
            backBtn.onmouseleave = () => { backBtn.style.background = 'transparent'; };
            backBtn.onclick = (e) => {
                e.stopPropagation();
                threadPanel.style.display = 'none';
                qualityPanel.style.display = 'block';
            };

            tTitle.appendChild(backBtn);
            tTitle.appendChild(document.createTextNode(`选择线程 · ${quality.label}`));
            threadPanel.appendChild(tTitle);

            // 当前画质提示
            const qualityHint = document.createElement('div');
            qualityHint.style.cssText = `font-size: 11px; color: ${quality.color}; margin-bottom: 10px; padding: 6px 10px; background: ${quality.color}15; border-radius: 4px; font-family: sans-serif;`;
            qualityHint.textContent = `画质: ${quality.desc}`;
            threadPanel.appendChild(qualityHint);

            // 三个线程选项
            const threadOptions = [
                { threads: 1, icon: '🎬', title: '单线程下载（推荐长视频）', desc: '断点续传 + 限速保护 + 大文件优化 | 适合几百MB~数GB视频', color: '#34a853' },
                { threads: 4, icon: '⚡', title: '4线程下载（均衡模式）', desc: '4并发 + 断点续传 + 限速保护 | 中等长度视频', color: '#4285f4' },
                { threads: 16, icon: '🚀', title: '16线程下载（短视频快速）', desc: '16并发极速 + 续传 | ⚠️ 长视频可能被限流导致下载失败', color: '#fbbc05' }
            ];

            threadOptions.forEach(opt => {
                threadPanel.appendChild(createMenuItem(
                    `${opt.icon} ${opt.title}`,
                    opt.desc,
                    opt.color,
                    () => {
                        const cmd = buildYtdlpCmd(opt.threads, quality.key);
                        GM_setClipboard(cmd);
                        const qualityName = quality.label.replace(/[🏆📺]\s*/, '');
                        const warn = opt.threads > 1 ? '\n⚠️ 注意：多线程可能导致长视频下载失败，如遇问题请切换单线程' : '';
                        alert(`已复制下载命令！\n\n📹 画质: ${qualityName}\n🔧 线程: ${opt.threads} 线程\n🌐 代理: ${proxyTag}\n\n✅ 断点续传 | ✅ 限速保护 | ✅ 大文件优化${warn}\n\n请打开 PowerShell → 右键粘贴 → 回车执行`);
                        menu.style.display = 'none';
                        // 重置面板状态
                        threadPanel.style.display = 'none';
                        qualityPanel.style.display = 'block';
                    }
                ));
            });
        }

        // 切换菜单显示
        btn.onclick = (e) => {
            e.stopPropagation();
            if (menu.style.display === 'none') {
                menu.style.display = 'block';
                // 重置到画质面板
                threadPanel.style.display = 'none';
                qualityPanel.style.display = 'block';
            } else {
                menu.style.display = 'none';
            }
        };

        document.addEventListener('click', () => {
            menu.style.display = 'none';
            // 重置面板状态
            threadPanel.style.display = 'none';
            qualityPanel.style.display = 'block';
        });

        root.appendChild(btn);
        root.appendChild(menu);
        (document.body || document.documentElement).appendChild(root);
    }

    // 获取画质标签文本
    function getQualityLabel(key) {
        const q = QUALITY_OPTIONS.find(o => o.key === key);
        return q ? q.label.replace(/[🏆📺]\s*/, '') : '最高画质';
    }

    // ==========================================
    // 5. 侧边栏核心逻辑 (只展开订阅并定位)
    // ==========================================
    function syncSidebarOnlySubs() {
        if (!CONFIG.expandSubs) return;
        const guide = document.querySelector('ytd-guide-renderer, ytd-mini-guide-renderer');
        if (!guide) return;

        const sections = guide.querySelectorAll('ytd-guide-section-renderer');
        sections.forEach(section => {
            const subLink = section.querySelector('a[href="/feed/subscriptions"]');
            if (subLink) {
                const collapsible = section.querySelector('ytd-guide-collapsible-entry-renderer');
                const expander = section.querySelector('#expander-item');
                if (collapsible && !collapsible.hasAttribute('expanded') && expander) {
                    expander.click();
                }
            }
        });
        setTimeout(locateChannelInSidebar, 300);
    }

    function locateChannelInSidebar() {
        const path = window.location.pathname;
        let channelHandle = null;
        if (path.startsWith('/@')) {
            channelHandle = path.split('/')[1];
        } else if (path.includes('/watch')) {
            const ownerLink = document.querySelector('ytd-video-owner-renderer a');
            if (ownerLink) {
                const href = ownerLink.getAttribute('href');
                if (href) channelHandle = href.replace('/', '');
            }
        }
        if (!channelHandle) return;

        const sidebarItems = document.querySelectorAll('ytd-guide-entry-renderer a#endpoint');
        for (let a of sidebarItems) {
            const href = a.getAttribute('href');
            if (href && (href.includes(channelHandle) || href === `/${channelHandle}`)) {
                const row = a.closest('ytd-guide-entry-renderer');
                if (row) {
                    if (row.classList.contains('yt-helper-highlight')) return;
                    document.querySelectorAll('.yt-helper-highlight').forEach(el => el.classList.remove('yt-helper-highlight'));
                    row.classList.add('yt-helper-highlight');
                    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    break;
                }
            }
        }
    }

    // ==========================================
    // 6. 自动化及监控
    // ==========================================
    function formatSpeed(kbps) {
        const mbs = kbps / 8000;
        if (mbs >= 1024) return (mbs / 1024).toFixed(2) + ' GB/s';
        if (mbs >= 1) return mbs.toFixed(2) + ' MB/s';
        return (mbs * 1024).toFixed(0) + ' KB/s';
    }

    function handleAutomation() {
        if (CONFIG.blockAds) {
            const ad = document.querySelector('.ad-showing, .ad-interrupting');
            if (ad) {
                const v = document.querySelector('video');
                if (v) { v.muted = true; v.playbackRate = 16; }
                const skip = document.querySelector('.ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-skip-ad-button');
                if (skip) skip.click();
            }
        }
        if (CONFIG.autoTheater && window.location.pathname === '/watch') {
            const flexy = document.querySelector('ytd-watch-flexy');
            const size = document.querySelector('.ytp-size-button');
            if (flexy && size && !flexy.hasAttribute('theater')) size.click();
        }
        if (CONFIG.showSpeed) {
            const panel = document.querySelector('.html5-video-info-panel');
            if (panel && panel.style.display !== 'none') {
                const spans = panel.getElementsByTagName('span');
                let targetSpan = null;
                for (let s of spans) {
                    if (s.textContent.includes('Kbps') || s.textContent.includes('Mbps')) {
                        targetSpan = s; break;
                    }
                }
                if (targetSpan) {
                    let display = document.getElementById('yt-speed-v23');
                    if (!display) {
                        display = document.createElement('span');
                        display.id = 'yt-speed-v23';
                        display.style.cssText = 'margin-left:10px; color:#ff0000; font-weight:bold; font-family: monospace; font-size: 1.1em;';
                        targetSpan.parentNode.appendChild(display);
                    }
                    const txt = targetSpan.textContent;
                    const num = parseFloat(txt.match(/[\d\.]+/));
                    let kbpsVal = txt.includes('Mbps') ? num * 1000 : num;
                    display.textContent = `⚡ ${formatSpeed(kbpsVal)}`;
                }
            }
        }
    }

    // ==========================================
    // 7. 主程序启动
    // ==========================================
    function init() {
        const reload = () => location.reload();

        GM_registerMenuCommand(`${CONFIG.useProxy ? '✅' : '❌'} 使用代理下载`, () => { CONFIG.useProxy = !CONFIG.useProxy; reload(); });
        GM_registerMenuCommand(`🌐 设置代理地址 (当前: ${CONFIG.proxyAddr})`, () => {
            const v = prompt("输入代理地址 (例如 http://127.0.0.1:30000):", CONFIG.proxyAddr);
            if (v) { CONFIG.proxyAddr = v; reload(); }
        });
        GM_registerMenuCommand(`${CONFIG.blockAds ? '✅' : '❌'} 屏蔽广告 & Premium`, () => { CONFIG.blockAds = !CONFIG.blockAds; reload(); });
        GM_registerMenuCommand(`${CONFIG.blockShorts ? '✅' : '❌'} 屏蔽 Shorts`, () => { CONFIG.blockShorts = !CONFIG.blockShorts; reload(); });
        GM_registerMenuCommand(`${CONFIG.hideSidebar ? '✅' : '❌'} 隐藏右侧栏`, () => { CONFIG.hideSidebar = !CONFIG.hideSidebar; reload(); });
        GM_registerMenuCommand(`${CONFIG.autoTheater ? '✅' : '❌'} 自动影院模式`, () => { CONFIG.autoTheater = !CONFIG.autoTheater; reload(); });
        GM_registerMenuCommand(`${CONFIG.expandSubs ? '✅' : '❌'} 自动展开订阅 & 定位博主`, () => { CONFIG.expandSubs = !CONFIG.expandSubs; reload(); });
        GM_registerMenuCommand(`${CONFIG.showSpeed ? '✅' : '❌'} 显示网速 (MB/s)`, () => { CONFIG.showSpeed = !CONFIG.showSpeed; reload(); });

        setInterval(() => {
            const isWatch = window.location.pathname.includes('/watch') || window.location.search.includes('v=');
            injectStyles();
            if (isWatch) {
                renderUI();
                handleAutomation();
            } else {
                const r = document.getElementById('yt-helper-v23-root');
                if (r) r.remove();
            }
            if (CONFIG.expandSubs && Math.random() < 0.3) {
                syncSidebarOnlySubs();
            }
        }, 1200);

        window.addEventListener('yt-navigate-finish', () => {
            document.querySelectorAll('.yt-helper-highlight').forEach(el => el.classList.remove('yt-helper-highlight'));
            if (/^(\/@[\w\.-]+)\/?$/.test(window.location.pathname)) {
                window.location.replace(window.location.pathname + '/videos');
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
