/* 
   云端脚本：TradingView 金指数据监控 V22.0 (双轨侦测+强制显示版)
   目的：同时显示下标 8-10 和 18-20，彻底找出数据在哪，绝不留白。
*/

(function() {
    console.log(">>> [云端 V22] 启动双轨侦测...");

    // --- 1. 全局状态 (历史记录) ---
    if (!window.__TV_STATE) {
        window.__TV_STATE = {
            history: { 
                w0: { histo: null, fast: null }, 
                w1: { histo: null, fast: null } 
            },
            isCollapsed: false
        };
    }

    // --- 2. 面板构建 ---
    var old = document.getElementById('tv-monitor-panel-v7');
    if(old) old.remove();

    var panel = document.createElement('div');
    panel.id = 'tv-monitor-panel-v7';
    panel.style.cssText = "position:fixed; top:100px; right:100px; width:500px; background:rgba(15, 15, 15, 0.98); color:#ecf0f1; font-family:'Microsoft YaHei', sans-serif; font-size:12px; z-index:999999; border-radius:8px; border: 1px solid #e17055; box-shadow: 0 8px 30px rgba(0,0,0,0.8); display:flex; flex-direction:column; overflow:hidden;";
    
    var header = document.createElement('div');
    header.style.cssText = "padding:8px 12px; background:#2d3436; cursor:move; font-weight:bold; color:#ff7675; display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #444; user-select:none;";
    header.innerHTML = `
        <span>🚑 V22 双轨侦测 (找回数据)</span>
        <span id="btn-collapse" style="cursor:pointer; font-size:14px;">➖</span>
    `;
    panel.appendChild(header);

    var content = document.createElement('div');
    content.style.cssText = "padding:0; max-height:600px; overflow-y:auto;";
    panel.appendChild(content);
    document.body.appendChild(panel);
    if (window.__TV_HOT_CONTEXT) window.__TV_HOT_CONTEXT.panel = panel;

    // --- 3. 拖动 ---
    var isDragging = false, startX, startY;
    header.onmousedown = function(e) {
        if(e.target.id === 'btn-collapse') return;
        isDragging = true; startX = e.clientX - panel.offsetLeft; startY = e.clientY - panel.offsetTop;
        panel.style.right = 'auto'; panel.style.opacity = "0.8";
    };
    document.onmousemove = function(e) { if(isDragging) { panel.style.left = (e.clientX - startX) + "px"; panel.style.top = (e.clientY - startY) + "px"; } };
    document.onmouseup = function() { isDragging = false; panel.style.opacity = "1"; };
    header.querySelector('#btn-collapse').onclick = function() {
        window.__TV_STATE.isCollapsed = !window.__TV_STATE.isCollapsed;
        this.innerText = window.__TV_STATE.isCollapsed ? '➕' : '➖';
        content.style.display = window.__TV_STATE.isCollapsed ? 'none' : 'block';
    };

    // --- 4. 辅助函数 ---
    function parseNum(str) {
        if(!str) return 0;
        return parseFloat(str.replace(/,/g, '').replace(/−/g, '-')) || 0;
    }
    function rgbToHex(el) {
        try {
            var rgb = window.getComputedStyle(el).color;
            if(rgb.indexOf('rgb') === -1) return "#fff";
            var p = rgb.substr(4).split(")")[0].split(",");
            var r = (+p[0]).toString(16), g = (+p[1]).toString(16), b = (+p[2]).toString(16);
            return "#" + (r.length==1?"0"+r:r) + (g.length==1?"0"+g:g) + (b.length==1?"0"+b:b);
        } catch(e) { return "#fff"; }
    }
    function analyzeColor(el) {
        // V7 颜色逻辑
        try {
            var c = window.getComputedStyle(el).color.replace(/\s/g, '');
            if(c.includes("254,67,101") || c.includes("255,0,0")) return {t:"🔴多", c:"#ff4757"};
            if(c.includes("0,102,255") || c.includes("0,4,255") || c.includes("0,255,0")) return {t:"🔵空", c:"#00a8ff"};
            if(c.includes("255,255,0") || c.includes("255,213,0")) return {t:"🟡平", c:"#fbc531"};
            return {t:"⚪", c:"#aaa"};
        } catch(e) { return {t:"?", c:"#555"}; }
    }
    function getIndicatorValues(titleEl) {
        // 暴力向上查找
        var p = titleEl; var results = [];
        for(var i=0; i<6; i++) {
            if(!p.parentElement) break;
            p = p.parentElement;
            var vs = p.querySelectorAll('div[class*="valueValue-"]');
            if(vs.length > 3) { 
                vs.forEach(v => {
                    if((v.innerText && /\d/.test(v.innerText)) || v.innerText.includes('−')) {
                        results.push({ val: parseNum(v.innerText), txt: v.innerText, el: v });
                    }
                });
                if(results.length > 0) break;
            }
        }
        return results;
    }

    // --- 5. 核心逻辑 ---
    function updatePanel() {
        if(window.__TV_STATE.isCollapsed) return;
        var widgets = document.querySelectorAll('.chart-widget');
        if (widgets.length < 2) { content.innerHTML = "<div style='padding:10px'>⚠️ 等待分屏...</div>"; return; }

        var screens = [{}, {}];

        widgets.forEach((widget, wIdx) => {
            if(wIdx > 1) return;
            var data = { midInfo: "无主图", setA: "无数据", setB: "无数据", total: 0 };
            var titles = Array.from(widget.querySelectorAll('div[class*="title-"]')).filter(t => t.innerText.trim().length > 0);

            // 1. 主图 (Index 0)
            if(titles.length > 0) {
                var vals = getIndicatorValues(titles[0]);
                if(vals[0] && vals[3]) {
                    var s = analyzeColor(vals[0].el);
                    var len = (vals[3].val - vals[0].val).toFixed(2);
                    data.midInfo = `<span style="color:${s.c}">${s.t} ${len}</span>`;
                }
            }

            // 2. MACD (Index 2)
            if(titles.length > 2) {
                var vals = getIndicatorValues(titles[2]);
                data.total = vals.length; // 显示总共有多少个数据

                // --- 方案 A: 你的 V16 截图显示的位置 (8, 9, 10) ---
                if(vals[8] && vals[9] && vals[10]) {
                    data.setA = formatMacd(wIdx, "A", vals[8], vals[9], vals[10]);
                } else {
                    data.setA = "<span style='color:#555'>下标 [8-10] 为空</span>";
                }

                // --- 方案 B: 你口述的位置 (18, 19, 20) ---
                // 注意：代码里数组从0开始，所以你说的19是index 18
                if(vals[18] && vals[19] && vals[20]) {
                    data.setB = formatMacd(wIdx, "B", vals[18], vals[19], vals[20]);
                } else {
                    data.setB = "<span style='color:#555'>下标 [18-20] 为空</span>";
                }
            } else {
                data.total = "未找到指标";
            }
            screens[wIdx] = data;
        });

        // 渲染
        var l = screens[0], r = screens[1];
        var html = `
        <table style="width:100%; border-collapse:collapse; text-align:center;">
            <tr style="background:#333; color:#aaa; font-size:10px;">
                <td>项目</td>
                <td style="border-left:1px solid #444; width:45%;">左屏 (总数:${l.total})</td>
                <td style="border-left:1px solid #444; width:45%;">右屏 (总数:${r.total})</td>
            </tr>
            <tr style="border-bottom:1px solid #555;">
                <td style="color:#ffeaa7;">中轨</td>
                <td style="border-left:1px solid #333;">${l.midInfo}</td>
                <td style="border-left:1px solid #333;">${r.midInfo}</td>
            </tr>
            <tr>
                <td style="color:#74b9ff; font-size:10px;">方案A<br>[8,9,10]</td>
                <td style="border-left:1px solid #333; padding:5px; vertical-align:top; background:#222;">${l.setA}</td>
                <td style="border-left:1px solid #333; padding:5px; vertical-align:top; background:#222;">${r.setA}</td>
            </tr>
            <tr>
                <td style="color:#ff7675; font-size:10px;">方案B<br>[18,19,20]</td>
                <td style="border-left:1px solid #333; padding:5px; vertical-align:top;">${l.setB}</td>
                <td style="border-left:1px solid #333; padding:5px; vertical-align:top;">${r.setB}</td>
            </tr>
        </table>
        `;
        content.innerHTML = html;
    }

    // 格式化 MACD 逻辑
    function formatMacd(wIdx, type, vHisto, vFast, vSlow) {
        var hist = window.__TV_STATE.history["w"+wIdx];
        
        // 1. 动能 (当前 > 上次)
        var histoStr = "平";
        // 区分 A/B 组的历史，避免混淆 (临时简化，共用一个逻辑会导致A/B跳变，但这里仅作展示用)
        // 实际使用时只会选一组。这里仅做逻辑演示。
        
        // 2. 快线平缓 (Abs(Diff) <= 1)
        var speedStr = "首测";
        if(hist.fast !== null) {
            var delta = Math.abs(vFast.val - hist.fast);
            if(delta <= 1.0) speedStr = "<span style='color:#f1c40f'>➖平缓</span>";
            else if(vFast.val > hist.fast) speedStr = "<span style='color:#ff4757'>🚀涨</span>";
            else speedStr = "<span style='color:#2ed573'>📉跌</span>";
        }
        // 实时更新历史 (副作用：两组方案会互相覆盖历史，但为了让你看到数值，先这样)
        hist.fast = vFast.val; 

        // 3. 金叉
        var crossStr = "";
        if(vFast.val > vSlow.val) crossStr = "<span style='color:#ff6b81'>金叉</span>";
        else if(vFast.val < vSlow.val) crossStr = "<span style='color:#1dd1a1'>死叉</span>";
        else crossStr = "粘合";

        var c1 = rgbToHex(vHisto.el);
        var c2 = rgbToHex(vFast.el);
        
        return `
            <div style="text-align:left; font-size:11px;">
                <div>动能: <span style="color:${c1}">${vHisto.val}</span></div>
                <div>快线: <span style="color:${c2}">${vFast.val}</span> ${speedStr}</div>
                <div>状态: ${crossStr}</div>
            </div>
        `;
    }

    setInterval(updatePanel, 1000);
})();