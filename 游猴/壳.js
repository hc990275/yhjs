// ==UserScript==
// @name         🚀 TradingView 云端脚本加载器 (V4 CSP穿透版)
// @namespace    http://tampermonkey.net/
// @version      4.0
// @description  使用 Blob 注入绕过 CSP 限制，支持热更新
// @author       TestUser
// @match        https://*.tradingview.com/*
// @match        https://tv.cngold.org/*
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      github.abcai.online
// ==/UserScript==

(function() {
    'use strict';

    // 🔴 你的云端脚本基础地址
    const CLOUD_SCRIPT_URL = "https://github.abcai.online/share/hc990275%2Fyhjs%2Fmain%2F%E6%B8%B8%E7%8C%B4%2Fjinzhi.js?sign=8n0an";

    // 获取页面的真实 window 对象 (用于与注入的脚本通信)
    const pageWindow = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;

    // --- 全局变量管理 ---
    if (!pageWindow.__TV_HOT_CONTEXT) {
        pageWindow.__TV_HOT_CONTEXT = {
            timer: null,
            panel: null,
            scriptElement: null // 记录注入的 script 标签
        };
    }

    // --- UI 按钮 ---
    const loaderBtn = document.createElement('div');
    loaderBtn.innerHTML = `
        <button id="btn-reload-remote" style="
            background: #6c5ce7;
            border: none;
            color: white;
            cursor: pointer;
            font-weight: bold;
            padding: 6px 12px;
            border-radius: 4px;
            font-size: 12px;
            box-shadow: 0 2px 5px rgba(0,0,0,0.3);
        ">💉 注入脚本</button>
    `;
    loaderBtn.style.cssText = "position:fixed; bottom:15px; left:15px; z-index:99999999;";
    document.body.appendChild(loaderBtn);

    const reloadBtn = document.getElementById('btn-reload-remote');

    // --- 清理旧实例 ---
    function cleanUpOldInstance() {
        console.log(">>> [加载器] 清理环境...");

        // 1. 停止定时器
        if (pageWindow.__TV_HOT_CONTEXT.timer) {
            clearInterval(pageWindow.__TV_HOT_CONTEXT.timer);
            pageWindow.__TV_HOT_CONTEXT.timer = null;
        }

        // 2. 移除面板
        if (pageWindow.__TV_HOT_CONTEXT.panel) {
            pageWindow.__TV_HOT_CONTEXT.panel.remove();
            pageWindow.__TV_HOT_CONTEXT.panel = null;
        }

        // 3. 移除旧的 script 标签
        if (pageWindow.__TV_HOT_CONTEXT.scriptElement) {
            pageWindow.__TV_HOT_CONTEXT.scriptElement.remove();
            pageWindow.__TV_HOT_CONTEXT.scriptElement = null;
        }

        // 兜底清理
        const oldPanel = document.getElementById('tv-monitor-panel-v6');
        if(oldPanel) oldPanel.remove();
    }

    // --- 核心：Blob 注入法 ---
    async function loadRemoteScript() {
        reloadBtn.innerText = "下载中...";
        reloadBtn.style.background = "#b2bec3";
        reloadBtn.disabled = true;

        cleanUpOldInstance();

        const finalUrl = `${CLOUD_SCRIPT_URL}&_t=${Date.now()}`;
        console.log(`>>> 请求: ${finalUrl}`);

        GM_xmlhttpRequest({
            method: "GET",
            url: finalUrl,
            onload: function(response) {
                if (response.status === 200) {
                    const code = response.responseText;

                    // 检查是否是 HTML (错误链接)
                    if (code.trim().startsWith("<")) {
                        alert("❌ 链接错误：获取到的是网页 HTML，请检查云端链接！");
                        resetBtn();
                        return;
                    }

                    try {
                        // ★★★ 核心修改：使用 Blob URL 注入，绕过 eval 限制 ★★★
                        const blob = new Blob([code], {type: 'application/javascript'});
                        const blobUrl = URL.createObjectURL(blob);

                        const script = document.createElement('script');
                        script.src = blobUrl;
                        script.onload = function() {
                            console.log(">>> [加载器] 脚本注入成功并已执行！");
                            URL.revokeObjectURL(blobUrl); // 释放内存
                        };

                        // 记录这个标签，以便下次删除
                        pageWindow.__TV_HOT_CONTEXT.scriptElement = script;

                        document.body.appendChild(script);

                        reloadBtn.innerText = "🔄 重载更新";
                        reloadBtn.style.background = "#00b894";

                    } catch (e) {
                        console.error("注入失败", e);
                        alert("❌ 注入失败，可能是 CSP 屏蔽了 Blob URL。\n建议直接使用本地脚本。");
                        resetBtn();
                    }
                } else {
                    alert("❌ 网络请求失败: " + response.status);
                    resetBtn();
                }
                reloadBtn.disabled = false;
            },
            onerror: function(err) {
                alert("❌ 网络错误");
                resetBtn();
            }
        });
    }

    function resetBtn() {
        reloadBtn.innerText = "❌ 失败重试";
        reloadBtn.style.background = "#d63031";
        reloadBtn.disabled = false;
    }

    reloadBtn.onclick = loadRemoteScript;
    loadRemoteScript();

})();