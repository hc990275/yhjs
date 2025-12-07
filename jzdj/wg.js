// ==UserScript==
// @name          代驾调度系统助手 (云端加载器)
// @namespace     http://tampermonkey.net/
// @version       9.0
// @description   这是一个“壳”，核心代码直接从云端加载，由服务器控制最新逻辑。
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

    // 🔴 核心代码的云端地址 (请替换为你上传后的真实地址)
    // 注意：这个地址的内容必须是纯JS代码，不能包含 HTML 标签
    const CLOUD_CODE_URL = "https://github.abcai.online/share/hc990275%2Fyhjs%2Fmain%2Fjzdj%2Fwg.js?sign=voi9t7&t=1765094363251?sign=voi9t7&t=" + new Date().getTime(); 

    console.log('[加载器] 正在从云端拉取最新代码...');

    GM_xmlhttpRequest({
        method: "GET",
        url: CLOUD_CODE_URL,
        // 强制不缓存，保证每次刷新都是最新的
        headers: {
            "Cache-Control": "no-cache"
        },
        onload: function(response) {
            if (response.status === 200) {
                try {
                    const cloudCode = response.responseText;
                    console.log('[加载器] 代码拉取成功，正在执行...');
                    
                    // 使用 eval 执行云端代码
                    // 这里的 unsafeWindow 是为了让云端代码能访问页面对象
                    const exec = new Function('GM_setValue', 'GM_getValue', 'GM_addStyle', 'GM_xmlhttpRequest', 'GM_info', 'GM_openInTab', 'unsafeWindow', cloudCode);
                    
                    exec(GM_setValue, GM_getValue, GM_addStyle, GM_xmlhttpRequest, GM_info, GM_openInTab, unsafeWindow);
                    
                } catch (e) {
                    console.error('[加载器] 云端代码执行出错:', e);
                    alert('脚本加载失败，请检查网络或控制台日志');
                }
            } else {
                console.error('[加载器] 获取失败，状态码:', response.status);
            }
        },
        onerror: function(err) {
            console.error('[加载器] 网络错误:', err);
            alert('无法连接到脚本服务器，请检查网络。');
        }
    });

})();