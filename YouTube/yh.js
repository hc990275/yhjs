// ==UserScript==
// @name         YouTube 整合助手 (V23.4 定制版 - 画质检测+代理开关)
// @name:en      YouTube All-in-One (V23.4 Custom with Quality Detection & Proxy Toggle)
// @namespace    http://tampermonkey.net/
// @version      23.4.0
// @description  1.自动检测视频最高画质；2.画质选择(最高/8K/4K/2K/1080p/720p)；3.两级菜单(画质→线程)；4.精简下载输出；5.断点续传+限速保护；6.代理开关。
// @description:en  Ad blocker, Shorts filter, auto quality detection, quality selector, smart download menu, clean output, resume support, proxy toggle.
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

    console.log('YT助手 V23.4.0: 启动 (作者: 郭 | 画质检测+代理开关版)...');

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
        get preferQuality() { return GM_getValue('cfg_preferQuality', 'best'); },
        set preferQuality(val) { GM_setValue('cfg_preferQuality', val); }
    };

    // ==========================================
    // 2. 画质档位定义（含 height 用于对比检测结果）
    // ==========================================
    const QUALITY_OPTIONS = [
        { key: 'best', height: Infinity, label: '🏆 最高画质', desc: '自动选择视频可用的最佳分辨率', color: '#ff6b6b', format: 'bestvideo+bestaudio/best' },
        { key: '8k', height: 4320, label: '📺 8K (4320p)', desc: '超高清 8K · 需视频源支持', color: '#a855f7', format: 'bestvideo[height<=4320]+bestaudio/best' },
        { key: '4k', height: 2160, label: '📺 4K (2160p)', desc: '超高清 4K · 主流高清视频', color: '#3b82f6', format: 'bestvideo[height<=2160]+bestaudio/best' },
        { key: '2k', height: 1440, label: '📺 2K (1440p)', desc: '准高清 2K · 平衡画质与体积', color: '#06b6d4', format: 'bestvideo[height<=1440]+bestaudio/best' },
        { key: '1080p', height: 1080, label: '📺 1080p', desc: '全高清 · 最通用的画质', color: '#22c55e', format: 'bestvideo[height<=1080]+bestaudio/best' },
        { key: '720p', height: 720, label: '📺 720p', desc: '高清 · 体积最小省流量', color: '#eab308', format: 'bestvideo[height<=720]+bestaudio/best' }
    ];

    // ==========================================
    // 3. 画质检测（通过 YouTube 播放器 API）
    // ==========================================
    const YT_QUALITY_MAP = {
        'highres': { label: '8K (4320p)', height: 4320 },
        'hd2160': { label: '4K (2160p)', height: 2160 },
        'hd1440': { label: '2K (1440p)', height: 1440 },
        'hd1080': { label: '1080p', height: 1080 },
        'hd720': { label: '720p', height: 720 },
        'large': { label: '480p', height: 480 },
        'medium': { label: '360p', height: 360 },
        'small': { label: '240p', height: 240 },
        'tiny': { label: '144p', height: 144 }
    };

    function detectMaxQuality() {
        try {
            const player = document.getElementById('movie_player');
            if (player && typeof player.getAvailableQualityLevels === 'function') {
                const levels = player.getAvailableQualityLevels();
                if (levels && levels.length > 0) {
                    const filtered = levels.filter(l => l !== 'auto');
                    if (filtered.length > 0) {
                        return YT_QUALITY_MAP[filtered[0]] || null;
                    }
                }
            }
        } catch (e) {
            console.log('YT助手: 检测画质失败', e);
        }
        return null;
    }

    // ==========================================
    // 4. 样式注入
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
    // 5. UI 构建 (下载菜单 - 两级：画质→线程)
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

    function createMenuItem(title, desc, color, onClick, options) {
        const opts = options || {};
        const item = document.createElement('div');
        const dimmed = opts.dimmed || false;
        const opacity = dimmed ? '0.5' : '1';
        item.style.cssText = `color: white; cursor: pointer; padding: 10px; border-radius: 6px; border-left: 4px solid ${color}; background: #252525; margin-bottom: 8px; font-family: sans-serif; transition: all 0.2s ease; opacity: ${opacity};`;
        item.onmouseenter = () => { item.style.background = '#333'; item.style.transform = 'translateX(-2px)'; };
        item.onmouseleave = () => { item.style.background = '#252525'; item.style.transform = 'translateX(0)'; };

        const tDiv = document.createElement('div');
        tDiv.style.cssText = 'font-weight: bold; font-size: 14px; display: flex; align-items: center; gap: 6px;';
        tDiv.textContent = title;

        // 如果有标签（如"视频最高"），添加彩色标签
        if (opts.badge) {
            const badge = document.createElement('span');
            badge.style.cssText = `font-size: 10px; padding: 1px 6px; border-radius: 3px; background: ${opts.badgeColor || '#666'}; color: #fff; font-weight: normal;`;
            badge.textContent = opts.badge;
            tDiv.appendChild(badge);
        }

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

    // 构建 yt-dlp 命令（支持画质参数 + 精简输出）
    function buildYtdlpCmd(threads, qualityKey) {
        const url = window.location.href.split('&')[0];
        const stableArgs = `--retries infinite --fragment-retries infinite --skip-unavailable-fragments --socket-timeout 60`;
        const resumeArgs = `-c`;
        const throttleArgs = `--throttled-rate 100K`;
        const bufferArgs = `--buffer-size 16K --http-chunk-size 10M`;
        const metaArgs = `--write-info-json`;
        // 精简输出：静默模式 + 仅显示进度条（隐藏重复的重试信息）
        const quietArgs = `-q --progress`;
        const threadArgs = threads > 1 ? `-N ${threads}` : '';

        const qOption = QUALITY_OPTIONS.find(q => q.key === qualityKey) || QUALITY_OPTIONS[0];
        const formatArgs = `-f "${qOption.format}"`;

        let proxyPrefix = '';
        if (CONFIG.useProxy) {
            proxyPrefix = `$env:HTTP_PROXY="${CONFIG.proxyAddr}"; $env:HTTPS_PROXY="${CONFIG.proxyAddr}"; `;
        }

        return `${proxyPrefix}cd "$([Environment]::GetFolderPath('Desktop'))"; yt-dlp ${stableArgs} ${resumeArgs} ${throttleArgs} ${bufferArgs} ${metaArgs} ${quietArgs} --extractor-args "youtube:player-client=android,web" --no-check-certificates ${formatArgs} --merge-output-format mp4 ${threadArgs} -o "%(title)s.%(ext)s" "${url}"`;
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

        // ---- 画质选择面板 ----
        const qualityPanel = document.createElement('div');
        qualityPanel.id = 'yt-dl-quality-panel';

        // ---- 线程选择面板 ----
        const threadPanel = document.createElement('div');
        threadPanel.id = 'yt-dl-thread-panel';
        threadPanel.style.display = 'none';

        menu.appendChild(qualityPanel);
        menu.appendChild(threadPanel);

        // 动态构建画质面板（每次打开菜单时刷新，确保获取最新画质检测结果）
        function buildQualityPanel() {
            while (qualityPanel.firstChild) qualityPanel.removeChild(qualityPanel.firstChild);

            const maxQ = detectMaxQuality();
            const maxLabel = maxQ ? maxQ.label : '检测中...';
            const maxHeight = maxQ ? maxQ.height : 0;

            // 标题行
            const qTitle = document.createElement('div');
            qTitle.style.cssText = 'color: #fff; font-size: 13px; font-weight: bold; margin-bottom: 10px; padding-bottom: 8px; border-bottom: 1px solid #333; font-family: sans-serif; display: flex; align-items: center; justify-content: space-between;';
            const qTitleLeft = document.createElement('span');
            qTitleLeft.textContent = `📥 选择画质 (${proxyTag})`;
            const qTitleRight = document.createElement('span');
            qTitleRight.style.cssText = 'font-size: 11px; color: #4ade80; font-weight: normal;';
            qTitleRight.textContent = `🎯 最高: ${maxLabel}`;
            qTitle.appendChild(qTitleLeft);
            qTitle.appendChild(qTitleRight);
            qualityPanel.appendChild(qTitle);

            // 画质选项
            QUALITY_OPTIONS.forEach(q => {
                const isPreferred = q.key === CONFIG.preferQuality;
                const exceedsMax = maxQ && q.height > maxHeight && q.key !== 'best';

                // 构建描述信息
                let desc = q.desc;
                let itemLabel = q.label;
                let badge = null;
                let badgeColor = null;

                if (q.key === 'best') {
                    // "最高画质"选项显示实际检测到的最高分辨率
                    itemLabel = maxQ ? `🏆 最高画质 → ${maxQ.label}` : '🏆 最高画质';
                    desc = maxQ ? `将以 ${maxQ.label} 下载（该视频的最高可用画质）` : '自动选择视频可用的最佳分辨率';
                    badge = '推荐';
                    badgeColor = '#22c55e';
                } else if (exceedsMax) {
                    desc += ` · ⚠️ 超出视频最高画质，实际按 ${maxLabel} 下载`;
                    badge = '超出';
                    badgeColor = '#ef4444';
                } else if (maxQ && q.height === maxHeight) {
                    badge = '视频最高';
                    badgeColor = '#3b82f6';
                }

                const item = createMenuItem(
                    itemLabel + (isPreferred ? ' ⭐' : ''),
                    desc,
                    q.color,
                    () => {
                        CONFIG.preferQuality = q.key;
                        qualityPanel.style.display = 'none';
                        showThreadPanel(q);
                    },
                    { dimmed: exceedsMax, badge: badge, badgeColor: badgeColor }
                );
                if (isPreferred && !exceedsMax) {
                    item.style.background = '#2a2a3a';
                    item.style.border = `1px solid ${q.color}40`;
                    item.style.borderLeft = `4px solid ${q.color}`;
                }
                qualityPanel.appendChild(item);
            });
        }

        function showThreadPanel(quality) {
            while (threadPanel.firstChild) threadPanel.removeChild(threadPanel.firstChild);
            threadPanel.style.display = 'block';

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

            const qualityHint = document.createElement('div');
            qualityHint.style.cssText = `font-size: 11px; color: ${quality.color}; margin-bottom: 10px; padding: 6px 10px; background: ${quality.color}15; border-radius: 4px; font-family: sans-serif;`;
            qualityHint.textContent = `画质: ${quality.desc}`;
            threadPanel.appendChild(qualityHint);

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
                        const qualityName = quality.key === 'best' ? '最高画质' : quality.label.replace(/📺\s*/, '');
                        const warn = opt.threads > 1 ? '\n⚠️ 注意：多线程可能导致长视频下载失败，如遇问题请切换单线程' : '';
                        alert(`已复制下载命令！\n\n📹 画质: ${qualityName}\n🔧 线程: ${opt.threads} 线程\n🌐 代理: ${proxyTag}\n\n✅ 断点续传 | ✅ 限速保护 | ✅ 精简输出${warn}\n\n请打开 PowerShell → 右键粘贴 → 回车执行`);
                        menu.style.display = 'none';
                        threadPanel.style.display = 'none';
                        qualityPanel.style.display = 'block';
                    }
                ));
            });
        }

        // 点击按钮：打开菜单时重新构建画质面板（刷新检测结果）
        btn.onclick = (e) => {
            e.stopPropagation();
            if (menu.style.display === 'none') {
                buildQualityPanel();
                menu.style.display = 'block';
                threadPanel.style.display = 'none';
                qualityPanel.style.display = 'block';
            } else {
                menu.style.display = 'none';
            }
        };

        document.addEventListener('click', () => {
            menu.style.display = 'none';
            threadPanel.style.display = 'none';
            qualityPanel.style.display = 'block';
        });

        root.appendChild(btn);
        root.appendChild(menu);
        (document.body || document.documentElement).appendChild(root);
    }

    // ==========================================
    // 6. 侧边栏核心逻辑 (只展开订阅并定位)
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
    // 7. 自动化及监控
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
    // 8. 主程序启动
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