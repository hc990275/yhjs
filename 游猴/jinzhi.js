/* 
   云端脚本：TradingView 金指数据监控 V10.0 (修复拖动+历史记录+阈值调整)
*/

(function() {
    console.log(">>> [云端 V10] 启动...");

    // --- 1. 全局状态管理 (增加历史队列) ---
    if (!window.__TV_STATE) {
        window.__TV_STATE = {
            // 存储 MACD 快线的历史数据队列 (只存最近5次)
            fastLineHistory: {
                w0: [], // 左分屏
                w1: []  // 右分屏
            },
            isCollapsed: false,
            uiScale: 1.0
        };
    }

    // --- 2. UI 构建 ---
    var old = document.getElementById('tv-monitor-panel-v8');
    if(old) old.remove();

    var panel = document.createElement('div');
    panel.id = 'tv-monitor-panel-v8';
    
    // 样式优化：默认定位
    panel.style.cssText = "position:fixed; top:100px; right:100px; background:rgba(30, 30, 30, 0.98); color:#ecf0f1; font-family:'Microsoft YaHei', sans-serif; z-index:999999; border-radius:8px; border: 1px solid #666; box-shadow: 0 8px 30px rgba(0,0,0,0.5); display:flex; flex-direction:column; overflow:hidden;";
    
    function applyScale() {
        var baseWidth = 400; // 稍微加宽一点以显示历史数据
        var baseFont = 13;
        panel.style.width = (baseWidth * window.__TV_STATE.uiScale) + "px";
        panel.style.fontSize = (baseFont * window.__TV_STATE.uiScale) + "px";
    }
    applyScale();

    // 2.1 标题栏
    var header = document.createElement('div');
    header.style.cssText = "padding:0.6em; background:#2d3436; cursor:move; font-weight:bold; color:#fab1a0; display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #555; user-select:none;";
    
    header.innerHTML = `
        <span>📊 V10 监控</span>
        <div style="display:flex; gap:6px; align-items:center;">
            <button id="btn-zoom-out" style="background:#555; color:white; border:none; border-radius:4px; cursor:pointer; font-size:0.8em; padding:2px 6px;">A-</button>
            <button id="btn-zoom-in" style="background:#0984e3; color:white; border:none; border-radius:4px; cursor:pointer; font-size:0.8em; padding:2px 6px;">A+</button>
            <span id="btn-collapse" style="cursor:pointer; margin-left:5px;">${window.__TV_STATE.isCollapsed ? '➕' : '➖'}</span>
        </div>
    `;
    panel.appendChild(header);

    // 2.2 内容区
    var content = document.createElement('div');
    content.style.cssText = "padding:0; overflow-y:auto; transition: height 0.2s;";
    content.style.height = window.__TV_STATE.isCollapsed ? "0px" : "auto";
    content.style.display = window.__TV_STATE.isCollapsed ? "none" : "block";
    panel.appendChild(content);

    document.body.appendChild(panel);
    if (window.__TV_HOT_CONTEXT) window.__TV_HOT_CONTEXT.panel = panel;

    // --- 3. 修复后的拖动逻辑 ---
    // 关键点：鼠标按下时，将 right: auto，并将 left 固定为当前计算值
    var isDragging = false, dragStartX, dragStartY;
    
    header.onmousedown = function(e) {
        e.preventDefault(); // 防止选中文本
        isDragging = true;
        dragStartX = e.clientX - panel.offsetLeft;
        dragStartY = e.clientY - panel.offsetTop;
        
        // ★★★ 关键修复：解除 right 定位，锁定 left ★★★
        panel.style.right = 'auto';
        panel.style.left = panel.offsetLeft + "px";
        panel.style.opacity = "0.8";
        panel.style.cursor = "grabbing";
    };

    document.onmousemove = function(e) {
        if (isDragging) {
            var newLeft = e.clientX - dragStartX;
            var newTop = e.clientY - dragStartY;
            
            // 简单防跑飞限制
            if(newTop < 0) newTop = 0;
            
            panel.style.left = newLeft + "px";
            panel.style.top = newTop + "px";
        }
    };

    document.onmouseup = function() {
        if(isDragging) {
            isDragging = false;
            panel.style.opacity = "1";
            panel.style.cursor = "default";
        }
    };

    // --- 4. 交互逻辑 ---
    header.querySelector('#btn-zoom-in').onclick = function(e) { e.stopPropagation(); window.__TV_STATE.uiScale += 0.1; applyScale(); };
    header.querySelector('#btn-zoom-out').onclick = function(e) { e.stopPropagation(); if(window.__TV_STATE.uiScale > 0.6) window.__TV_STATE.uiScale -= 0.1; applyScale(); };
    header.querySelector('#btn-collapse').onclick = function(e) { 
        e.stopPropagation(); 
        window.__TV_STATE.isCollapsed = !window.__TV_STATE.isCollapsed; 
        this.innerText = window.__TV_STATE.isCollapsed ? '➕' : '➖';
        content.style.display = window.__TV_STATE.isCollapsed ? "none" : "block"; 
    };

    // --- 5. 数据辅助 ---
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
    
    // 递归获取数值
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

    // --- 6. 核心业务逻辑 (V10) ---
    function updatePanel() {
        if(window.__TV_STATE.isCollapsed) return;

        var html = "";
        var widgets = document.querySelectorAll('.chart-widget');

        if(widgets.length < 1) {
            content.innerHTML = "<div style='padding:10px'>⏳ 正在等待图表...</div>";
            return;
        }

        widgets.forEach((widget, wIdx) => {
            if(wIdx > 1) return;
            
            var screenName = wIdx === 0 ? "📺 分屏 1 (左)" : "📺 分屏 2 (右)";
            html += `<div style="background:#444; color:#fff; padding:4px 8px; font-weight:bold; margin-top:${wIdx>0?'8px':'0'}; font-size:0.9em;">${screenName}</div>`;

            var allTitles = Array.from(widget.querySelectorAll('div[class*="title-"]')).filter(t => t.innerText.trim().length > 0);
            
            // --- 🎯 指标一：主图 (只保留中轨) ---
            var mainChartTitle = allTitles[0];
            if(mainChartTitle) {
                var vals = getIndicatorValues(mainChartTitle);
                // 需求：1(Index 0) 和 4(Index 3)
                if(vals[0] && vals[3]) {
                    var midLen = (vals[3].val - vals[0].val).toFixed(2);
                    html += `
                        <div style="display:flex; justify-content:space-between; padding:4px 8px; border-bottom:1px dashed #555; background:#222;">
                            <span style="color:#aaa;">中轨长度</span>
                            <span style="color:#00b894; font-weight:bold;">${midLen}</span>
                            <span style="font-size:0.8em; color:#666;">(L:${vals[0].text} H:${vals[3].text})</span>
                        </div>`;
                } else {
                    html += `<div style="padding:4px; color:gray; font-size:0.8em;">中轨数据不足</div>`;
                }
            }

            // --- 🎯 指标三：MACD ---
            var macdTitle = allTitles[2] || allTitles.find(t => t.innerText.includes("MACD"));
            
            if(macdTitle) {
                var mVals = getIndicatorValues(macdTitle);
                // 需求：Index 8(动能), 9(快), 10(慢)
                if(mVals.length >= 11) {
                    var histo = mVals[8];
                    var fast = mVals[9];
                    var slow = mVals[10];

                    // 1. 动能柱逻辑 (跟上一次比)
                    // 这里的 "上一次" 指的是脚本的上一次刷新，而不是上一根K线
                    // 如果要跟上一根K线比，需要更复杂的逻辑，目前按用户描述“数值比前一根大就是涨”
                    // 假设用户看的是实时变动的当前根
                    var diffHisto = 0; // 暂存变化趋势
                    
                    // 2. 历史数据记录 (5次)
                    var historyArr = window.__TV_STATE.fastLineHistory["w"+wIdx];
                    
                    // 防止重复插入相同数据 (每秒刷新太快)
                    // 只有当数值变化时，或者队列为空时才推入
                    if(historyArr.length === 0 || historyArr[historyArr.length-1] !== fast.val) {
                        historyArr.push(fast.val);
                        if(historyArr.length > 5) historyArr.shift(); // 保持5个
                    }

                    // 3. 快线平缓/急涨逻辑 (阈值 = 1.0)
                    var speedTip = "<span style='color:gray'>-</span>";
                    if(historyArr.length >= 2) {
                        // 取最新值 和 上一个记录值 对比
                        var current = fast.val;
                        var prev = historyArr[historyArr.length - 2]; 
                        var delta = current - prev;
                        var absDelta = Math.abs(delta);

                        // ★★★ V10 核心修改：阈值设为 1.0 ★★★
                        var THRESHOLD = 1.0; 

                        if (absDelta < THRESHOLD) {
                            speedTip = "<span style='color:#f1c40f'>→ 平缓</span>";
                        } else if (delta > 0) {
                            speedTip = "<span style='color:#d63031; font-weight:bold;'>🚀 急涨 (+" + delta.toFixed(2) + ")</span>";
                        } else {
                            speedTip = "<span style='color:#00b894; font-weight:bold;'>📉 急跌 (" + delta.toFixed(2) + ")</span>";
                        }
                    }

                    // 4. 金叉死叉
                    var crossState = fast.val > slow.val 
                        ? "<span style='color:#ff7675; font-weight:bold;'>金叉 (多)</span>" 
                        : "<span style='color:#00b894; font-weight:bold;'>死叉 (空)</span>";
                    
                    if(Math.abs(fast.val - slow.val) < 0.5) crossState = "<span>♾️ 粘合</span>";

                    // 5. 渲染
                    html += `<div style="padding:4px 8px; font-size:0.9em;">
                        <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                            <span>MACD: ${crossState}</span>
                            <span>动能: <span style="color:${rgbToHex(histo.el)}">${histo.text}</span></span>
                        </div>
                        <div style="display:flex; justify-content:space-between; align-items:center; background:#333; padding:2px 4px; border-radius:4px;">
                            <span>快线趋势:</span>
                            ${speedTip}
                        </div>
                        <div style="margin-top:4px; font-size:0.8em; color:#aaa;">
                            <div>📜 近5次记录:</div>
                            <div style="word-break:break-all; color:#74b9ff; font-family:monospace;">
                                ${historyArr.join(" -> ")}
                            </div>
                        </div>
                    </div>`;

                } else {
                    html += `<div style="padding:4px; color:gray;">MACD数据不足</div>`;
                }
            } else {
                 html += `<div style="padding:4px; color:gray;">未找到MACD</div>`;
            }
        });

        content.innerHTML = html;
    }

    var timer = setInterval(updatePanel, 1000);
    if (window.__TV_HOT_CONTEXT) window.__TV_HOT_CONTEXT.timer = timer;

})();