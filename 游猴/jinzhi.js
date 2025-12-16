/* 
   云端脚本：TradingView 金指数据监控 V9.0 (UI缩放增强+容错版)
*/

(function() {
    console.log(">>> [云端 V9] 启动缩放增强版...");

    // --- 1. 全局状态管理 ---
    if (!window.__TV_STATE) {
        window.__TV_STATE = {
            history: {}, 
            isCollapsed: false,
            uiScale: 1.1 // 默认放大一点点 (1.1倍)
        };
    }

    // --- 2. UI 构建 ---
    var old = document.getElementById('tv-monitor-panel-v8'); // 沿用ID防止冲突
    if(old) old.remove();

    var panel = document.createElement('div');
    panel.id = 'tv-monitor-panel-v8';
    
    // 基础样式
    panel.style.cssText = "position:fixed; top:80px; right:60px; background:rgba(25, 25, 25, 0.98); color:#ecf0f1; font-family:'Segoe UI', sans-serif; z-index:999999; border-radius:8px; border: 1px solid #555; box-shadow: 0 10px 40px rgba(0,0,0,0.6); display:flex; flex-direction:column; overflow:hidden;";
    
    // 应用缩放的函数
    function applyScale() {
        // 动态调整宽度和字体大小
        var baseWidth = 360;
        var baseFont = 12;
        panel.style.width = (baseWidth * window.__TV_STATE.uiScale) + "px";
        panel.style.fontSize = (baseFont * window.__TV_STATE.uiScale) + "px";
    }
    applyScale(); // 初始化应用

    // 2.1 标题栏
    var header = document.createElement('div');
    header.style.cssText = "padding:0.6em 1em; background:#2d3436; cursor:move; font-weight:bold; color:#00b894; display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #444; user-select:none;";
    
    // 标题栏按钮布局
    header.innerHTML = `
        <span>📊 监控系统</span>
        <div style="display:flex; gap:0.5em; align-items:center;">
            <button id="btn-zoom-out" style="background:#444; color:white; border:none; border-radius:4px; cursor:pointer; padding:2px 6px; font-size:0.9em;">A-</button>
            <button id="btn-zoom-in" style="background:#0984e3; color:white; border:none; border-radius:4px; cursor:pointer; padding:2px 6px; font-size:0.9em;">A+</button>
            <span style="width:10px;"></span>
            <span id="btn-log" style="cursor:pointer; font-size:1.1em;" title="记录颜色">📋</span>
            <span id="btn-collapse" style="cursor:pointer; font-size:1.1em;">${window.__TV_STATE.isCollapsed ? '➕' : '➖'}</span>
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

    // --- 3. 交互逻辑 (缩放/折叠/拖动) ---
    
    // 放大
    header.querySelector('#btn-zoom-in').onclick = function(e) {
        e.stopPropagation();
        window.__TV_STATE.uiScale += 0.1;
        applyScale();
    };
    // 缩小
    header.querySelector('#btn-zoom-out').onclick = function(e) {
        e.stopPropagation();
        if(window.__TV_STATE.uiScale > 0.6) {
            window.__TV_STATE.uiScale -= 0.1;
            applyScale();
        }
    };

    // 折叠
    header.querySelector('#btn-collapse').onclick = function(e) {
        e.stopPropagation();
        window.__TV_STATE.isCollapsed = !window.__TV_STATE.isCollapsed;
        this.innerText = window.__TV_STATE.isCollapsed ? '➕' : '➖';
        content.style.display = window.__TV_STATE.isCollapsed ? "none" : "block";
    };

    // 颜色日志
    header.querySelector('#btn-log').onclick = function(e) {
        e.stopPropagation();
        scanAndLogColors(); 
        alert("颜色代码已打印到控制台 (F12 -> Console)");
    };

    // 拖动
    var isDragging = false, startX, startY, initialLeft, initialTop;
    header.onmousedown = function(e) {
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        initialLeft = panel.offsetLeft;
        initialTop = panel.offsetTop;
        panel.style.opacity = "0.8";
    };
    document.onmousemove = function(e) {
        if (isDragging) {
            var dx = e.clientX - startX;
            var dy = e.clientY - startY;
            panel.style.left = (initialLeft + dx) + "px";
            panel.style.top = (initialTop + dy) + "px";
        }
    };
    document.onmouseup = function() {
        isDragging = false;
        panel.style.opacity = "1";
    };

    // --- 4. 辅助工具 ---
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

    // --- 5. 核心逻辑 (V9 容错优化) ---

    function scanAndLogColors() {
        console.log("=== 📋 颜色抓取日志 ===");
        var widgets = document.querySelectorAll('.chart-widget');
        widgets.forEach((widget, idx) => {
            if(idx > 1) return;
            var titles = Array.from(widget.querySelectorAll('div[class*="title-"]'));
            var mainTitle = titles.find(t => (t.innerText.includes("金指") || t.innerText.includes("数据智能")));
            if(mainTitle) {
                var values = getIndicatorValues(mainTitle);
                values.forEach((v, i) => {
                    console.log(`分屏${idx+1} [Index ${i}] 数值:${v.text} 颜色:%c${v.color}`, `color:${v.color};background:#333`);
                });
            }
        });
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

    function updatePanel() {
        if(window.__TV_STATE.isCollapsed) return;

        var html = "";
        var widgets = document.querySelectorAll('.chart-widget');

        if(widgets.length < 1) {
            content.innerHTML = "<div style='padding:1em'>等待图表加载...</div>";
            return;
        }

        widgets.forEach((widget, wIdx) => {
            if(wIdx > 1) return;
            
            var screenName = wIdx === 0 ? "分屏 1 (左)" : "分屏 2 (右)";
            html += `<div style="background:#333; color:#ffeaa7; padding:0.4em 0.8em; font-weight:bold; margin-top:${wIdx>0?'0.8em':'0'}; border-left:4px solid #00b894;">${screenName}</div>`;

            var allTitles = Array.from(widget.querySelectorAll('div[class*="title-"]')).filter(t => t.innerText.trim().length > 0);
            
            // --- 指标一：主图 ---
            var mainChartTitle = allTitles[0];
            if(mainChartTitle) {
                var vals = getIndicatorValues(mainChartTitle);
                // V9 修改：不再强制要求13个数据，有多少显示多少，防止报错
                
                html += `<table style="width:100%; border-collapse:collapse; margin-bottom:0.5em;">`;
                
                // 尝试提取中轨 (Index 0, 3)
                if(vals[0] && vals[3]) {
                    var midLen = (vals[3].val - vals[0].val).toFixed(2);
                    html += `
                        <tr style="border-bottom:1px solid #444;">
                            <td style="width:20%; color:#aaa;">中轨</td>
                            <td style="color:${rgbToHex(vals[0].el)}">L:${vals[0].text}</td>
                            <td style="color:${rgbToHex(vals[3].el)}">H:${vals[3].text}</td>
                            <td style="text-align:right;"><span style="background:#555; padding:0 0.3em; border-radius:3px;">长:${midLen}</span></td>
                        </tr>`;
                } else {
                    html += `<tr><td colspan="4" style="color:gray">中轨数据未找到</td></tr>`;
                }

                // 尝试提取牛熊 (Index 10, 11, 12) -> 对应原来的 11, 12, 13
                // 注意：你截图显示只找到了8个，说明牛熊线可能在 Index 4-7 之间，或者没显示出来
                // 这里我们做个容错：如果找不到 Index 10，就显示 "未显示"
                if(vals[10] && vals[11]) {
                    var midVal = vals[12] ? vals[12].text : "-";
                    html += `
                        <tr>
                            <td style="color:#aaa;">牛熊</td>
                            <td style="color:${rgbToHex(vals[10].el)}">上:${vals[10].text}</td>
                            <td style="color:${rgbToHex(vals[11].el)}">下:${vals[11].text}</td>
                            <td style="text-align:right;">中:${midVal}</td>
                        </tr>`;
                } else {
                    // 如果找不到牛熊，提示当前找到多少个，方便调试
                    html += `<tr><td colspan="4" style="color:orange; font-size:0.9em;">牛熊数据缺失 (当前只找到 ${vals.length} 个值)</td></tr>`;
                }
                html += `</table>`;
            }

            // --- 指标三：MACD ---
            // 尝试找第3个标题，或者包含 MACD 的
            var macdTitle = allTitles[2] || allTitles.find(t => t.innerText.includes("MACD"));
            
            if(macdTitle) {
                var mVals = getIndicatorValues(macdTitle);
                // 需求：Index 8(动能), 9(快), 10(慢)
                if(mVals.length >= 11) { // 稍微放宽一点
                    var histo = mVals[8];
                    var fast = mVals[9];
                    var slow = mVals[10];

                    var historyKey = `w${wIdx}_histo`;
                    var prevHisto = window.__TV_STATE.history[historyKey] || histo.val;
                    var histoTrend = histo.val > prevHisto ? "<span style='color:#ff7675'>↑</span>" : (histo.val < prevHisto ? "<span style='color:#00b894'>↓</span>" : "-");
                    window.__TV_STATE.history[historyKey] = histo.val;

                    var crossState = fast.val > slow.val ? "<span style='color:#ff7675;font-weight:bold;'>金叉</span>" : (fast.val < slow.val ? "<span style='color:#00b894;font-weight:bold;'>死叉</span>" : "粘合");

                    // 速度计算
                    var fastKey = `w${wIdx}_fast`;
                    var prevFast = window.__TV_STATE.history[fastKey];
                    var speedTip = "<span style='color:gray'>...</span>";
                    if (prevFast !== undefined) {
                        var delta = fast.val - prevFast;
                        var absDelta = Math.abs(delta);
                        if (absDelta < 0.01) speedTip = "<span style='color:#f1c40f'>→平缓</span>";
                        else if (delta > 0) speedTip = absDelta > 0.05 ? "<span style='color:#d63031;font-weight:bold;'>🚀急涨</span>" : "<span style='color:#ff7675'>↗缓涨</span>";
                        else speedTip = absDelta > 0.05 ? "<span style='color:#00b894;font-weight:bold;'>📉急跌</span>" : "<span style='color:#55efc4'>↘缓跌</span>";
                    }
                    window.__TV_STATE.history[fastKey] = fast.val;

                    html += `<div style="border-top:1px dashed #555; padding-top:0.3em; font-size:0.9em;">
                        <div style="display:flex; justify-content:space-between;">
                            <span>${crossState} | 动能:${histo.text}${histoTrend}</span>
                            <span>${speedTip}</span>
                        </div>
                    </div>`;
                } else {
                    html += `<div style="color:gray; font-size:0.9em;">MACD数据不足 (找到${mVals.length}个)</div>`;
                }
            } else {
                 html += `<div style="color:gray; font-size:0.9em;">未找到MACD指标</div>`;
            }
        });

        content.innerHTML = html;
    }

    var timer = setInterval(updatePanel, 1000);
    if (window.__TV_HOT_CONTEXT) window.__TV_HOT_CONTEXT.timer = timer;

})();