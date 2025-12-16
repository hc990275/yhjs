// ==UserScript==
// @name         TradingView 金指数据实时监控面板 (V6 终极定位版)
// @namespace    http://tampermonkey.net/
// @version      6.0
// @description  向上遍历3层父级元素，强行抓取同区域内的指标数值
// @author       TestUser
// @match        https://*.tradingview.com/*
// @match        https://tv.cngold.org/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // --- 样式设置 ---
    const panel = document.createElement('div');
    panel.style.cssText = "position:fixed; top:50px; right:10px; width:320px; background:rgba(0,0,0,0.85); color:#00ff00; padding:12px; font-family:monospace; font-size:12px; z-index:999999; border-radius:8px; border: 1px solid #444; pointer-events:none;";
    panel.innerHTML = '正在初始化 V6 扫描...';
    document.body.appendChild(panel);

    function updatePanel() {
        let outputHTML = "<strong>🎯 金指系统 V6 深度监控</strong><hr>";

        const widgets = document.querySelectorAll('.chart-widget');

        if (widgets.length === 0) {
            panel.innerHTML = "等待图表加载...";
            return;
        }

        widgets.forEach((widget, index) => {
            // 只显示前两个分屏，避免太多
            if(index > 1) return; 
            
            outputHTML += `<div style='margin-top:8px; border-bottom:1px dashed #555; color: yellow;'>📺 分屏 #${index + 1}</div>`;

            // 1. 找到所有包含“金指”的标题
            const titles = widget.querySelectorAll('div[class*="title-"]');
            let foundCount = 0;

            titles.forEach(titleEl => {
                const text = titleEl.innerText;
                // 过滤条件：必须包含“金指”且不能太长
                if ((text.includes("金指") || text.includes("数据智能")) && text.length < 50) {
                    foundCount++;
                    outputHTML += `<div style='color: #00d2d3; margin-top:4px;'>🔍 发现指标: ${text.substring(0, 10)}...</div>`;
                    
                    // --- 2. V6 核心：向上追溯找数值 ---
                    let values = [];
                    let currentParent = titleEl;
                    
                    // 尝试向上找 4 层父级 (Parent -> GrandParent -> GreatGrandParent...)
                    for (let i = 0; i < 4; i++) {
                        if (!currentParent.parentElement) break;
                        currentParent = currentParent.parentElement;

                        // 在当前这一层父级里，向下搜索所有数值
                        // 注意：我们排除掉隐藏的元素
                        const candidates = currentParent.querySelectorAll('div[class*="valueValue-"]');
                        
                        if (candidates.length > 0) {
                            // 只要找到数值，就认为找对地方了，停止向上找
                            // 过滤掉空的或者非数字的
                            candidates.forEach(c => {
                                if(c.innerText && /\d/.test(c.innerText)) {
                                    values.push(c.innerText);
                                }
                            });
                            
                            if(values.length > 0) break; // 找到了就退出循环
                        }
                    }

                    // --- 3. 显示结果 ---
                    if (values.length > 0) {
                        outputHTML += `<div style='display:grid; grid-template-columns: 1fr 1fr; gap:5px; margin-left:10px;'>`;
                        values.forEach((val, idx) => {
                            // 给每个数值标号，方便用户核对
                            outputHTML += `<div style='color:white;'>
                                <span style='color:#ff9ff3; font-weight:bold;'>[${idx + 1}]</span> ${val}
                            </div>`;
                        });
                        outputHTML += `</div>`;
                    } else {
                        outputHTML += `<div style='color:red; margin-left:10px;'>❌ 向上4层都未找到数值</div>`;
                    }
                }
            });
            
            if(foundCount === 0) {
                outputHTML += "<div style='color:gray;'>此分屏未检测到金指标题</div>";
            }
        });

        outputHTML += "<hr><div style='color:#aaa; font-size:10px; text-align:right;'>V6 暴力追溯版</div>";
        panel.innerHTML = outputHTML;
    }

    setInterval(updatePanel, 1000);
    console.log(">>> V6 监控面板已启动");

})();