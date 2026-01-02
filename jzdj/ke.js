// ==UserScript==
// @name          代驾调度系统助手 (云端直连版)
// @namespace     http://tampermonkey.net/
// @version       8
// @description   本地不保存代码，直接从云端加载最新逻辑；实现秒级更新，多端同步。
// @author        郭 + You + Gemini Consultant
// @match         https://admin.v3.jiuzhoudaijiaapi.cn/*
// @grant         GM_xmlhttpRequest
// @grant         unsafeWindow
// @grant         GM_setValue
// @grant         GM_getValue
// @grant         GM_addStyle
// @grant         GM_info
// @grant         GM_openInTab
// @connect       github.abcai.online
// ==/UserScript==

(function() {
    'use strict';

    // 🔴 云端代码地址 (已配置为你提供的地址)
    // 我加了 &t=时间戳，强制浏览器每次都读最新文件，不准缓存
    const CLOUD_URL_BASE = "https://github.abcai.online/share/hc990275%2Fyhjs%2Fmain%2Fjzdj%2Fwg.js?sign=3r6e7p&t=1767323607234";
    const CLOUD_URL = CLOUD_URL_BASE + "&t=" + new Date().getTime();

    console.log('[调度助手] 正在连接云端核心库...');

    GM_xmlhttpRequest({
        method: "GET",
        url: CLOUD_URL,
        headers: {
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0"
        },
        onload: function(response) {
            if (response.status === 200) {
                try {
                    const cloudCode = response.responseText;

                    if (!cloudCode || cloudCode.length < 50) {
                        console.error('[调度助手] 云端代码似乎为空或无效');
                        return;
                    }

                    console.log('[调度助手] 云端代码加载成功，正在注入...');

                    // 核心黑科技：在本地作用域执行云端代码，并赋予GM权限
                    // 这样云端代码里也能用 GM_setValue, unsafeWindow 等
                    const exec = new Function(
                        'GM_setValue', 'GM_getValue', 'GM_addStyle',
                        'GM_xmlhttpRequest', 'GM_info', 'GM_openInTab',
                        'unsafeWindow',
                        cloudCode
                    );

                    exec(GM_setValue, GM_getValue, GM_addStyle,
                         GM_xmlhttpRequest, GM_info, GM_openInTab,
                         unsafeWindow);

                } catch (e) {
                    console.error('[调度助手] 代码执行错误:', e);
                    // 可以在这里加个alert提示，或者静默失败
                }
            } else {
                console.error('[调度助手] 连接失败，状态码:', response.status);
            }
        },
        onerror: function(err) {
            console.error('[调度助手] 网络请求错误:', err);
        }
    });

})();