// ==UserScript==
// @name          代驾调度系统助手 (云端直连版 + 一键清空)
// @namespace     http://tampermonkey.net/
// @version       9.1
// @description   本地不保存代码，直接从云端加载最新逻辑；实现秒级更新，多端同步；新增一键清空位置电话功能。
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

    // ==========================================
    // 第一部分：原有的云端加载逻辑 (保持不变)
    // ==========================================

    // ?? 云端代码地址 (已配置为你提供的地址)
    const CLOUD_URL_BASE = "https://github.abcai.online/share/hc990275%2Fyhjs%2Fmain%2Fjzdj%2Fwg.js?sign=voi9t7&t=1765094363251";
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
                }
            } else {
                console.error('[调度助手] 连接失败，状态码:', response.status);
            }
        },
        onerror: function(err) {
            console.error('[调度助手] 网络请求错误:', err);
        }
    });

    // ==========================================
    // 第二部分：新增“一键清空位置和电话”功能
    // ==========================================

    // 辅助函数：模拟 React/Vue 的输入事件，确保数据被底层框架捕获
    function triggerInputEvent(el) {
        el.value = '';
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        // 针对某些特定框架的 hack
        let nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
        if (nativeInputValueSetter) {
            nativeInputValueSetter.call(el, '');
            el.dispatchEvent(new Event('input', { bubbles: true }));
        }
    }

    // 主逻辑：查找并清空
    function clearLocationAndPhone() {
        // 获取所有可见的输入框
        const inputs = document.querySelectorAll('input[type="text"], textarea, input:not([type])');
        let count = 0;

        inputs.forEach(input => {
            // 排除隐藏元素
            if (input.offsetParent === null) return;

            // 获取输入框的上下文（placeholder 或 父级标签文本）
            const placeholder = (input.placeholder || '').trim();
            // 尝试获取 ElementUI 或 常见表单的 label
            let labelText = "";
            const formItem = input.closest('.el-form-item, .form-group, .form-item');
            if (formItem) {
                labelText = formItem.textContent || "";
            }

            // 关键词匹配逻辑
            const isPhone = /电话|手机|联系方式/i.test(placeholder) || /电话|手机/i.test(labelText);
            const isLocation = /位置|地址|起点|终点|出发地|目的地/i.test(placeholder) || /位置|地址/i.test(labelText);

            if (isPhone || isLocation) {
                console.log(`[调度助手] 清空字段: ${labelText || placeholder}`);
                triggerInputEvent(input);
                count++;
            }
        });

        if (count > 0) {
            showToast(`已清空 ${count} 个填写项`);
        } else {
            showToast('未找到可见的电话或地址输入框', 'orange');
        }
    }

    // UI：创建悬浮按钮
    function createClearButton() {
        const btnId = 'dj-clear-btn-123';
        if (document.getElementById(btnId)) return; // 防止重复创建

        const btn = document.createElement('div');
        btn.id = btnId;
        btn.innerText = '清空位置/电话';
        btn.style.cssText = `
            position: fixed;
            top: 150px;
            right: 10px;
            z-index: 99999;
            background-color: #f56c6c; /* 红色警示色 */
            color: white;
            padding: 8px 12px;
            border-radius: 4px;
            font-size: 13px;
            cursor: pointer;
            box-shadow: 0 2px 12px 0 rgba(0,0,0,0.2);
            user-select: none;
            transition: all 0.3s;
            opacity: 0.9;
        `;

        btn.onmouseover = () => btn.style.opacity = '1';
        btn.onmouseout = () => btn.style.opacity = '0.9';
        
        btn.onclick = function(e) {
            e.stopPropagation(); // 防止触发底层点击
            clearLocationAndPhone();
        };

        document.body.appendChild(btn);
    }

    // 简单的提示框
    function showToast(msg, color = '#67c23a') {
        const toast = document.createElement('div');
        toast.innerText = msg;
        toast.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background-color: ${color};
            color: white;
            padding: 10px 20px;
            border-radius: 5px;
            z-index: 100000;
            box-shadow: 0 2px 10px rgba(0,0,0,0.3);
            font-size: 14px;
        `;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 1500);
    }

    // 页面加载完成后，或检测到 URL 变化时尝试注入按钮
    // 延迟执行以确保页面元素加载完毕
    setTimeout(createClearButton, 2000);
    
    // 如果是单页应用(SPA)，可能需要监听路由变化反复注入
    const observer = new MutationObserver(() => {
        if (!document.getElementById('dj-clear-btn-123')) {
            createClearButton();
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });

})();