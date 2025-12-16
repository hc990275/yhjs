/* 
   云端脚本：TradingView 金指数据监控 V6.1 (热更新适配版)
   此文件由本地加载器 eval() 执行
*/

(function() {
    console.log(">>> [云端脚本] V6.1 正在启动...");

    // 1. 创建显示面板
    const panel = document.createElement('div');
    panel.id = 'tv-monitor-panel-v6'; // 给个ID方便兜底查找
    panel.style.cssText = "position:fixed; top:60px; right:10px; width:320px; background:rgba(0,0,0,0.85); color:#00ff00; padding:12px; font-family:monospace; font-size:12px; z-index:999990; border-radius:8px; border: 1px solid #444; pointer-events:none; box-shadow: 0 4px 12px rgba(0,0,0,0.5);";
    panel.innerHTML = '正在初始化数据监控...';
    document.body.appendChild(panel);

    // ★★★ 关键：将面板引用注册到全局，给加载器下次清理用 ★★★
    if (window.__TV_HOT_CONTEXT) {
        window.__TV_HOT_CONTEXT.panel = panel;
    }

    // 2. 核心扫描逻辑 (V6 逻辑)
    function updatePanel() {
        let outputHTML = "<strong>🎯 金指系统 V6 监控 (云端版)</strong><hr>";
        
        // 简单的当前时间，让你确认脚本还在跑
        const timeStr = new Date().toLocaleTimeString();

        const widgets = document.querySelectorAll('.chart-widget');

        if (widgets.length === 0) {
            panel.innerHTML = "等待图表加载...";
            return;
        }

        widgets.forEach((widget, index) => {
            if(index > 1) return; // 只看前两个分屏
            
            outputHTML += `<div style='margin-top:8px; border-bottom:1px dashed #555; color: yellow;'>📺 分屏 #${index + 1}</div>`;

            // 查找标题
            const titles = widget.querySelectorAll('div[class*="title-"]');
            let foundCount = 0;

            titles.forEach(titleEl => {
                const text = titleEl.innerText;
                // 模糊匹配指标名称
                if ((text.includes("金指") || text.includes("数据智能")) && text.length < 50) {
                    foundCount++;
                    outputHTML += `<div style='color: #00d2d3; margin-top:4px;'>🔍 发现指标: ${text.substring(0, 10)}...</div>`;
                    
                    // --- 向上追溯 4 层找数值 ---
                    let values = [];
                    let currentParent = titleEl;
                    
                    for (let i = 0; i < 4; i++) {
                        if (!currentParent.parentElement) break;
                        currentParent = currentParent.parentElement;

                        // 向下查找数值
                        const candidates = currentParent.querySelectorAll('div[class*="valueValue-"]');
                        
                        if (candidates.length > 0) {
                            candidates.forEach(c => {
                                if(c.innerText && /\d/.test(c.innerText)) {
                                    values.push(c.innerText);
                                }
                            });
                            if(values.length > 0) break; // 找到了就退出
                        }
                    }

                    // --- 显示数值 ---
                    if (values.length > 0) {
                        outputHTML += `<div style='display:grid; grid-template-columns: 1fr 1fr; gap:5px; margin-left:10px;'>`;
                        values.forEach((val, idx) => {
                            outputHTML += `<div style='color:white;'>
                                <span style='color:#ff9ff3; font-weight:bold;'>[${idx + 1}]</span> ${val}
                            </div>`;
                        });
                        outputHTML += `</div>`;
                    } else {
                        outputHTML += `<div style='color:red; margin-left:10px;'>❌ 向上4层未找到数值</div>`;
                    }
                }
            });
            
            if(foundCount === 0) {
                outputHTML += "<div style='color:gray;'>未检测到金指标题</div>";
            }
        });

        outputHTML += `<hr><div style='color:#aaa; font-size:10px; text-align:right;'>刷新时间: ${timeStr}</div>`;
        panel.innerHTML = outputHTML;
    }

    // 3. 启动定时器
    // ★★★ 关键：将定时器ID注册到全局，给加载器下次清理用 ★★★
    const timerId = setInterval(updatePanel, 1000);
    
    if (window.__TV_HOT_CONTEXT) {
        window.__TV_HOT_CONTEXT.timer = timerId;
    }

})();