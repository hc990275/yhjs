/* 
   云端脚本：TradingView 金指数据监控 V20.0 (MACD 数据透视诊断版)
   功能：显示原始数据索引，用于人工校对快慢线位置
*/

(function() {
    console.log(">>> [云端 V20] 启动数据透视...");

    // --- 全局状态 ---
    if (!window.__TV_STATE) {
        window.__TV_STATE = {
            isCollapsed: false,
            uiScale: 1.0
        };
    }

    // --- 面板构建 ---
    var old = document.getElementById('tv-monitor-panel-v7');
    if(old) old.remove();

    var panel = document.createElement('div');
    panel.id = 'tv-monitor-panel-v7';
    panel.style.cssText = "position:fixed; top:100px; right:100px; width:480px; background:rgba(10, 10, 10, 0.98); color:#ecf0f1; font-family:'Microsoft YaHei', monospace; font-size:12px; z-index:999999; border-radius:8px; border: 1px solid #ff7675; box-shadow: 0 10px 30px rgba(0,0,0,0.8); display:flex; flex-direction:column; overflow:hidden;";
    
    function applyScale() {
        panel.style.width = (480 * window.__TV_STATE.uiScale) + "px";
        panel.style.fontSize = (12 * window.__TV_STATE.uiScale) + "px";
    }
    applyScale();

    // 标题栏
    var header = document.createElement('div');
    header.style.cssText = "padding:8px 12px; background:#2d3436; cursor:move; font-weight:bold; color:#ff7675; display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #444; user-select:none;";
    header.innerHTML = `
        <span>🚑 V20 数据透视诊断</span>
        <div style="display:flex; gap:10px; align-items:center;">
            <button id="btn-z-out" style="background:#555;color:#fff;border:none;">A-</button>
            <button id="btn-z-in" style="background:#0984e3;color:#fff;border:none;">A+</button>
            <span id="btn-collapse" style="cursor:pointer;">➖</span>
        </div>
    `;
    panel.appendChild(header);

    var content = document.createElement('div');
    content.style.cssText = "padding:0; max-height:600px; overflow-y:auto;";
    panel.appendChild(content);
    document.body.appendChild(panel);
    if (window.__TV_HOT_CONTEXT) window.__TV_HOT_CONTEXT.panel = panel;

    // 拖动逻辑
    var isDragging = false, startX, startY;
    header.onmousedown = function(e) {
        if(e.target.tagName === 'BUTTON' || e.target.id === 'btn-collapse') return;
        isDragging = true; startX = e.clientX - panel.offsetLeft; startY = e.clientY - panel.offsetTop;
        panel.style.right = 'auto'; panel.style.opacity = "0.8";
    };
    document.onmousemove = function(e) { if(isDragging) { panel.style.left = (e.clientX - startX) + "px"; panel.style.top = (e.clientY - startY) + "px"; } };
    document.onmouseup = function() { isDragging = false; panel.style.opacity = "1"; };
    header.querySelector('#btn-z-in').onclick = function() { window.__TV_STATE.uiScale += 0.1; applyScale(); };
    header.querySelector('#btn-z-out').onclick = function() { if(window.__TV_STATE.uiScale > 0.6) window.__TV_STATE.uiScale -= 0.1; applyScale(); };
    header.querySelector('#btn-collapse').onclick = function() { 
        window.__TV_STATE.isCollapsed = !window.__TV_STATE.isCollapsed;
        this.innerText = window.__TV_STATE.isCollapsed ? '➕' : '➖';
        content.style.display = window.__TV_STATE.isCollapsed ? 'none' : 'block';
    };

    // 数据提取
    function parseNum(str) { return parseFloat((str || '').replace(/,/g, '').replace(/−/g, '-')) || 0; }
    function rgbToHex(el) {
        var rgb = window.getComputedStyle(el).color;
        var sep = rgb.indexOf(",") > -1 ? "," : " ";
        var p = rgb.substr(4).split(")")[0].split(sep);
        var r = (+p[0]).toString(16), g = (+p[1]).toString(16), b = (+p[2]).toString(16);
        return "#" + (r.length==1?"0"+r:r) + (g.length==1?"0"+g:g) + (b.length==1?"0"+b:b);
    }
    function analyzeColor(el) {
        var c = window.getComputedStyle(el).color.replace(/\s/g, '');
        if(c.includes("254,67,101") || c.includes("255,0,0")) return {t:"🔴多", c:"#ff4757"};
        if(c.includes("0,102,255") || c.includes("0,4,255")) return {t:"🔵空", c:"#00a8ff"};
        if(c.includes("255,255,0") || c.includes("255,213,0")) return {t:"🟡平", c:"#fbc531"};
        return {t:"⚪", c:"#aaa"};
    }

    function getIndicatorValues(titleEl) {
        var p = titleEl; var results = [];
        for(var i=0; i<6; i++) {
            if(!p.parentElement) break;
            p = p.parentElement;
            var vs = p.querySelectorAll('div[class*="valueValue-"]');
            if(vs.length > 5) {
                vs.forEach(v => {
                    if((v.innerText && /\d/.test(v.innerText)) || v.innerText.includes('−')) {
                        results.push({ txt: v.innerText, val: parseNum(v.innerText), el: v });
                    }
                });
                if(results.length > 0) break;
            }
        }
        return results;
    }

    // --- 核心逻辑 ---
    function updatePanel() {
        if(window.__TV_STATE.isCollapsed) return;
        var widgets = document.querySelectorAll('.chart-widget');
        if (widgets.length < 2) { content.innerHTML = "<div style='padding:10px'>等待加载...</div>"; return; }

        var screens = [{}, {}];

        widgets.forEach((widget, wIdx) => {
            if(wIdx > 1) return;
            var titles = Array.from(widget.querySelectorAll('div[class*="title-"]')).filter(t => t.innerText.trim().length > 0);
            
            var d = { mid:"", macdRaw:"" };

            // 主图 (ID 0)
            if(titles.length > 0) {
                var vs = getIndicatorValues(titles[0]);
                if(vs[0] && vs[3]) {
                    var s = analyzeColor(vs[0].el);
                    var len = (vs[3].val - vs[0].val).toFixed(2);
                    d.mid = `<span style="color:${s.c}">${s.t} ${len}</span>`;
                }
            }

            // MACD (ID 2) -> 重点诊断区域！
            if(titles.length > 2) {
                var vs = getIndicatorValues(titles[2]);
                // 显示最后几个数值供用户核对
                // 我们假设快慢线在 Index 8, 9, 10, 11 附近
                var html = "";
                if(vs.length > 8) {
                    for(var i=8; i < Math.min(vs.length, 12); i++) {
                        var color = rgbToHex(vs[i].el);
                        html += `<div style="display:flex; justify-content:space-between; border-bottom:1px dashed #333;">
                            <span style="color:#aaa;">Index [${i}]</span>
                            <span style="color:${color}; font-weight:bold;">${vs[i].txt}</span>
                        </div>`;
                    }
                } else {
                    html = "数据不足(Found " + vs.length + ")";
                }
                d.macdRaw = html;
            } else {
                d.macdRaw = "未找到MACD";
            }
            screens[wIdx] = d;
        });

        // 渲染透视表格
        var l = screens[0], r = screens[1];
        var html = `
        <table style="width:100%; border-collapse:collapse;">
            <tr style="background:#333; color:#aaa; font-size:10px; text-align:center;">
                <td>项目</td>
                <td style="border-left:1px solid #444;">左屏(40)</td>
                <td style="border-left:1px solid #444;">右屏(10)</td>
            </tr>
            <tr style="border-bottom:1px solid #444; text-align:center;">
                <td style="color:#ffeaa7;">中轨</td>
                <td style="border-left:1px solid #333;">${l.mid}</td>
                <td style="border-left:1px solid #333;">${r.mid}</td>
            </tr>
            <tr style="vertical-align:top;">
                <td style="color:#74b9ff; padding:5px; text-align:center;">MACD<br>原始数据</td>
                <td style="border-left:1px solid #444; padding:5px; background:#1e272e;">${l.macdRaw}</td>
                <td style="border-left:1px solid #444; padding:5px; background:#1e272e;">${r.macdRaw}</td>
            </tr>
        </table>
        <div style="padding:5px; color:#ff7675; font-size:11px; text-align:center;">
             请核对上方 [Index] 对应的数值和颜色！<br>
             例如：快线是 [9] 还是 [10]？
        </div>
        `;
        content.innerHTML = html;
    }
    setInterval(updatePanel, 1000);
})();