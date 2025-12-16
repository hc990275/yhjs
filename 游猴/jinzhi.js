/* 
   云端脚本：TradingView 金指数据监控 V14.0 (强制位置锁定版)
*/

(function() {
    console.log(">>> [云端 V14] 启动位置锁定...");

    // --- 1. 全局状态 ---
    if (!window.__TV_STATE) {
        window.__TV_STATE = {
            fastLineHistory: { w0: [], w1: [] },
            isCollapsed: false,
            uiScale: 1.0
        };
    }

    // --- 2. UI 构建 ---
    var old = document.getElementById('tv-monitor-panel-v8');
    if(old) old.remove();

    var panel = document.createElement('div');
    panel.id = 'tv-monitor-panel-v8';
    panel.style.cssText = "position:fixed; top:100px; right:100px; background:rgba(20, 20, 20, 0.98); color:#ecf0f1; font-family:'Microsoft YaHei', sans-serif; z-index:999999; border-radius:8px; border: 1px solid #555; box-shadow: 0 8px 30px rgba(0,0,0,0.6); display:flex; flex-direction:column; overflow:hidden;";
    
    function applyScale() {
        var baseWidth = 420;
        var baseFont = 13;
        panel.style.width = (baseWidth * window.__TV_STATE.uiScale) + "px";
        panel.style.fontSize = (baseFont * window.__TV_STATE.uiScale) + "px";
    }
    applyScale();

    // 标题栏
    var header = document.createElement('div');
    header.style.cssText = "padding:0.6em; background:#2d3436; cursor:move; font-weight:bold; color:#74b9ff; display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #444; user-select:none;";
    header.innerHTML = `
        <span>📊 V14 位置锁定</span>
        <div style="display:flex; gap:6px; align-items:center;">
            <button id="btn-zoom-out" style="background:#555; color:white; border:none; border-radius:4px; cursor:pointer; font-size:0.8em; padding:2px 6px;">A-</button>
            <button id="btn-zoom-in" style="background:#0984e3; color:white; border:none; border-radius:4px; cursor:pointer; font-size:0.8em; padding:2px 6px;">A+</button>
            <span id="btn-collapse" style="cursor:pointer; margin-left:5px;">${window.__TV_STATE.isCollapsed ? '➕' : '➖'}</span>
        </div>
    `;
    panel.appendChild(header);

    // 内容区
    var content = document.createElement('div');
    content.style.cssText = "padding:0; overflow-y:auto; transition: height 0.2s;";
    content.style.height = window.__TV_STATE.isCollapsed ? "0px" : "auto";
    content.style.display = window.__TV_STATE.isCollapsed ? "none" : "block";
    panel.appendChild(content);

    document.body.appendChild(panel);
    if (window.__TV_HOT_CONTEXT) window.__TV_HOT_CONTEXT.panel = panel;

    // --- 3. 拖动逻辑 ---
    var isDragging = false, dragStartX, dragStartY;
    header.onmousedown = function(e) {
        e.preventDefault();
        isDragging = true;
        dragStartX = e.clientX - panel.offsetLeft;
        dragStartY = e.clientY - panel.offsetTop;
        panel.style.right = 'auto';
        panel.style.left = panel.offsetLeft + "px";
        panel.style.opacity = "0.8";
        panel.style.cursor = "grabbing";
    };
    document.onmousemove = function(e) {
        if (isDragging) {
            var newLeft = e.clientX - dragStartX;
            var newTop = e.clientY - dragStartY;
            if(newTop < 0) newTop = 0;
            panel.style.left = newLeft + "px";
            panel.style.top = newTop + "px";
        }
    };
    document.onmouseup = function() {
        isDragging = false;
        panel.style.opacity = "1";
        panel.style.cursor = "default";
    };

    // --- 4. 按钮事件 ---
    header.querySelector('#btn-zoom-in').onclick = function(e) { e.stopPropagation(); window.__TV_STATE.uiScale += 0.1; applyScale(); };
    header.querySelector('#btn-zoom-out').onclick = function(e) { e.stopPropagation(); if(window.__TV_STATE.uiScale > 0.6) window.__TV_STATE.uiScale -= 0.1; applyScale(); };
    header.querySelector('#btn-collapse').onclick = function(e) { 
        e.stopPropagation(); 
        window.__TV_STATE.isCollapsed = !window.__TV_STATE.isCollapsed; 
        this.innerText = window.__TV_STATE.isCollapsed ? '➕' : '➖';
        content.style.display = window.__TV_STATE.isCollapsed ? "none" : "block"; 
    };

    // --- 5. 辅助函数 ---
    function parseNum(str) {
        if(!str) return 0;
        return parseFloat(str.replace(/,/g, '').replace(/−/g, '-')) || 0;
    }
    
    function rgbToHex(el) {
        if(!el) return "#fff";
        var rgb = window.getComputedStyle(el).color;
        if(rgb.indexOf('rgb') === -1) return rgb;
        var sep = rgb.indexOf(",") > -1 ? "," : " ";
        rgb = rgb.substr(4).split(")")[0].split(sep);
        var r = (+rgb[0]).toString(16), g = (+rgb[1]).toString(16), b = (+rgb[2]).toString(16);
        return "#" + (r.length==1?"0"+r:r) + (g.length==1?"0"+g:g) + (b.length==1?"0"+b:b);
    }

    // 红黄蓝识别
    function analyzeColor(el) {
        var rgb = window.getComputedStyle(el).color; 
        if(!rgb) return { state: "未知", color: "#aaa" };
        var c = rgb.replace(/\s/g, '');
        if(c.includes("254,67,101") || c.includes("255,0,0") || c.includes("254,114,75")) {
            return { state: "🔴 红色看涨", color: "#ff4757", bg: "rgba(255, 71, 87, 0.2)" };
        }
        if(c.includes("0,102,255") || c.includes("0,4,255") || c.includes("82,189,255") || c.includes("82,174,255")) {
             return { state: "🔵 蓝色看跌", color: "#00a8ff", bg: "rgba(0, 168, 255, 0.2)" };
        }
        if(c.includes("255,255,0") || c.includes("255,213,0") || c.includes("254,208,25") || c.includes("254,161,50")) {
             return { state: "🟡 黄色过渡", color: "#fbc531", bg: "rgba(251, 197, 49, 0.2)" };
        }
        return { state: "⚪ 观察中", color: rgbToHex(el), bg: "transparent" };
    }

    function getIndicatorValues(titleEl) {
        var p = titleEl; 
        var results = [];
        for(var i=0; i<4; i++) {
            if(!p.parentElement) break;
            p = p.parentElement;
            var vs = p.querySelectorAll('div[class*="valueValue-"]');
            if(vs.length > 0) {
                vs.forEach(v => {
                    if(v.innerText && /\d/.test(v.innerText)) {
                        results.push({
                            text: v.innerText,
                            val: parseNum(v.innerText),
                            color: window.getComputedStyle(v).color,
                            el: v
                        });
                    }
                });
                if(results.length > 0) break;
            }
        }
        return results;
    }

    // --- 6. 核心业务逻辑 (强制位置索引) ---
    function updatePanel() {
        if(window.__TV_STATE.isCollapsed) return;

        var html = "";
        var widgets = document.querySelectorAll('.chart-widget');

        if(widgets.length < 1) {
            content.innerHTML = "<div style='padding:10px'>⏳ 等待图表...</div>";
            return;
        }

        widgets.forEach((widget, wIdx) => {
            if(wIdx > 1) return;
            
            var screenName = wIdx === 0 ? "📺 分屏 1 (左)" : "📺 分屏 2 (右)";
            html += `<div style="background:#333; color:#fff; padding:4px 8px; font-weight:bold; margin-top:${wIdx>0?'8px':'0'}; font-size:0.9em;">${screenName}</div>`;

            // 获取所有标题
            // 注意：这里我们信任 DOM 顺序：主图 -> 副图1 -> 副图2 -> 副图3
            var allTitles = Array.from(widget.querySelectorAll('div[class*="title-"]')).filter(t => t.innerText.trim().length > 0);
            
            // --- 🎯 指标一：主图 (Index 0) ---
            var mainChartTitle = allTitles[0];
            if(mainChartTitle) {
                var vals = getIndicatorValues(mainChartTitle);
                if(vals[0] && vals[3]) {
                    var midLen = (vals[3].val - vals[0].val).toFixed(2);
                    var trendInfo = analyzeColor(vals[0].el); 
                    html += `
                        <div style="display:flex; justify-content:space-between; align-items:center; padding:6px 10px; border-bottom:1px dashed #555; background:${trendInfo.bg}; transition: background 0.5s;">
                            <div style="display:flex; flex-direction:column;">
                                <span style="color:${trendInfo.color}; font-weight:bold; font-size:1.1em;">${trendInfo.state}</span>
                            </div>
                            <div style="text-align:right;">
                                <div style="color:#aaa; font-size:0.8em;">长度</div>
                                <div style="color:#fff; font-weight:bold;">${midLen}</div>
                            </div>
                        </div>`;
                } else {
                    html += `<div style="padding:4px; color:gray; font-size:0.8em;">主图数据不足</div>`;
                }
            } else {
                html += `<div style="padding:4px; color:#e17055; font-size:0.8em;">❌ 找不到主图 (Title[0])</div>`;
            }

            // --- 🎯 指标三：MACD (强制读取 Index 2) ---
            // 逻辑：直接读第3个标题。因为用户说名字都一样。
            // Index: 0=主图, 1=副图1, 2=MACD
            var macdTitle = null;
            if (allTitles.length > 2) {
                macdTitle = allTitles[2];
            }
            
            if(macdTitle) {
                var mVals = getIndicatorValues(macdTitle);
                
                // 检查：是否获取到足够的数据
                if(mVals.length >= 10) { 
                    var histo = mVals[8] || mVals[0];
                    var fast = mVals[9] || mVals[1];
                    var slow = mVals[10] || mVals[2];
                    
                    var historyArr = window.__TV_STATE.fastLineHistory["w"+wIdx];
                    if(historyArr.length === 0 || historyArr[historyArr.length-1] !== fast.val) {
                        historyArr.push(fast.val);
                        if(historyArr.length > 5) historyArr.shift();
                    }

                    var speedTip = "<span style='color:gray'>-</span>";
                    if(historyArr.length >= 2) {
                        var current = fast.val;
                        var prev = historyArr[historyArr.length - 2]; 
                        var delta = current - prev;
                        if (Math.abs(delta) < 1.0) speedTip = "<span style='color:#f1c40f'>→ 平缓</span>";
                        else if (delta > 0) speedTip = "<span style='color:#ff4757; font-weight:bold;'>🚀 急涨</span>";
                        else speedTip = "<span style='color:#2ed573; font-weight:bold;'>📉 急跌</span>";
                    }

                    var crossState = fast.val > slow.val 
                        ? "<span style='color:#ff6b81; font-weight:bold;'>金叉 (多)</span>" 
                        : "<span style='color:#1dd1a1; font-weight:bold;'>死叉 (空)</span>";
                    
                    html += `<div style="padding:4px 8px; font-size:0.9em;">
                        <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                            <span>MACD <span style="font-size:0.8em;color:#666;">(Pos:3)</span></span>
                            <span>${crossState}</span>
                        </div>
                        <div style="display:flex; justify-content:space-between; align-items:center; background:#333; padding:2px 4px; border-radius:4px;">
                            <span>动能: <span style="color:${rgbToHex(histo.el)}">${histo.text}</span></span>
                            <span>${speedTip}</span>
                        </div>
                        <div style="margin-top:4px; font-size:0.8em; color:#aaa; font-family:monospace;">
                            ${historyArr.join(" > ")}
                        </div>
                    </div>`;
                } else {
                    html += `<div style="padding:4px; color:#fdcb6e; font-size:0.8em;">
                        已锁定第3个指标<br>但数值似乎被隐藏 (Found:${mVals.length})
                    </div>`;
                }
            } else {
                 html += `<div style="padding:4px; color:#e17055; font-size:0.8em;">
                    ❌ 未找到第3个指标<br>
                    <span style="color:#aaa; font-size:0.7em;">当前只有 ${allTitles.length} 个指标</span>
                 </div>`;
            }
        });

        content.innerHTML = html;
    }

    var timer = setInterval(updatePanel, 1000);
    if (window.__TV_HOT_CONTEXT) window.__TV_HOT_CONTEXT.timer = timer;

})();