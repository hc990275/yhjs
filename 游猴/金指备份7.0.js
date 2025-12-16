/* 
   云端脚本：TradingView 金指数据监控 V17.0 (V7架构 + V16内核融合版)
   功能：左右分屏对比、强制位置锁定(0主2副)、红黄蓝识别、MACD趋势计算
*/

(function() {
    console.log(">>> [云端 V17] 启动融合监控...");

    // --- 1. 全局状态管理 ---
    if (!window.__TV_STATE) {
        window.__TV_STATE = {
            // 记录左右分屏的 MACD 快线历史
            fastLineHistory: { w0: [], w1: [] }, 
            uiScale: 1.0,
            isCollapsed: false
        };
    }

    // --- 2. 面板构建 ---
    var old = document.getElementById('tv-monitor-panel-v7');
    if(old) old.remove();

    var panel = document.createElement('div');
    panel.id = 'tv-monitor-panel-v7'; // 保持ID一致
    // 样式升级：支持缩放，背景加深
    panel.style.cssText = "position:fixed; top:100px; right:100px; width:450px; background:rgba(20, 20, 20, 0.98); color:#ecf0f1; font-family:'Microsoft YaHei', monospace; font-size:12px; z-index:999999; border-radius:8px; border: 1px solid #444; box-shadow: 0 10px 30px rgba(0,0,0,0.6); display:flex; flex-direction:column; overflow:hidden;";
    
    function applyScale() {
        var baseWidth = 450;
        var baseFont = 12;
        panel.style.width = (baseWidth * window.__TV_STATE.uiScale) + "px";
        panel.style.fontSize = (baseFont * window.__TV_STATE.uiScale) + "px";
    }
    applyScale();

    // 标题栏
    var header = document.createElement('div');
    header.style.cssText = "padding:8px 12px; background:#2d3436; cursor:move; font-weight:bold; color:#00b894; display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #444; user-select:none;";
    header.innerHTML = `
        <span>⚖️ 金指多空共振 V17</span>
        <div style="display:flex; gap:5px; align-items:center;">
            <button id="btn-z-out" style="background:#555;color:#fff;border:none;border-radius:3px;cursor:pointer;">A-</button>
            <button id="btn-z-in" style="background:#0984e3;color:#fff;border:none;border-radius:3px;cursor:pointer;">A+</button>
            <span id="btn-collapse" style="cursor:pointer;margin-left:5px;">${window.__TV_STATE.isCollapsed ? '➕' : '➖'}</span>
        </div>
    `;
    panel.appendChild(header);

    // 内容区
    var content = document.createElement('div');
    content.style.cssText = "padding:0; overflow-y:auto; transition:height 0.2s;";
    content.style.height = window.__TV_STATE.isCollapsed ? "0px" : "auto";
    content.style.display = window.__TV_STATE.isCollapsed ? "none" : "block";
    panel.appendChild(content);

    document.body.appendChild(panel);
    if (window.__TV_HOT_CONTEXT) window.__TV_HOT_CONTEXT.panel = panel;

    // --- 3. 修复后的拖动逻辑 ---
    var isDragging = false, dragStartX, dragStartY;
    header.onmousedown = function(e) {
        if(e.target.tagName === 'BUTTON' || e.target.id === 'btn-collapse') return;
        isDragging = true;
        dragStartX = e.clientX - panel.offsetLeft;
        dragStartY = e.clientY - panel.offsetTop;
        panel.style.right = 'auto'; // 关键修复
        panel.style.left = panel.offsetLeft + "px";
        panel.style.opacity = "0.8";
    };
    document.onmousemove = function(e) {
        if (isDragging) {
            panel.style.left = (e.clientX - dragStartX) + "px";
            panel.style.top = (e.clientY - dragStartY) + "px";
        }
    };
    document.onmouseup = function() { isDragging = false; panel.style.opacity = "1"; };

    // 按钮事件
    header.querySelector('#btn-z-in').onclick = function() { window.__TV_STATE.uiScale += 0.1; applyScale(); };
    header.querySelector('#btn-z-out').onclick = function() { if(window.__TV_STATE.uiScale > 0.6) window.__TV_STATE.uiScale -= 0.1; applyScale(); };
    header.querySelector('#btn-collapse').onclick = function() { 
        window.__TV_STATE.isCollapsed = !window.__TV_STATE.isCollapsed; 
        this.innerText = window.__TV_STATE.isCollapsed ? '➕' : '➖';
        content.style.display = window.__TV_STATE.isCollapsed ? "none" : "block";
    };

    // --- 4. 辅助函数 ---
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

    // 红黄蓝识别逻辑 (来自 V12)
    function analyzeColor(el) {
        var rgb = window.getComputedStyle(el).color; 
        if(!rgb) return { state: "⚪", color: "#aaa" };
        var c = rgb.replace(/\s/g, '');
        
        if(c.includes("254,67,101") || c.includes("255,0,0") || c.includes("254,114,75")) 
            return { state: "🔴多", color: "#ff4757" };
            
        if(c.includes("0,102,255") || c.includes("0,4,255") || c.includes("82,189,255") || c.includes("82,174,255")) 
            return { state: "🔵空", color: "#00a8ff" };
            
        if(c.includes("255,255,0") || c.includes("255,213,0") || c.includes("254,208,25") || c.includes("254,161,50")) 
            return { state: "🟡平", color: "#fbc531" };

        return { state: "⚪", color: rgbToHex(el) };
    }

    // --- 5. 核心逻辑 ---
    function updatePanel() {
        if(window.__TV_STATE.isCollapsed) return;

        var widgets = document.querySelectorAll('.chart-widget');
        if (widgets.length < 2) {
            content.innerHTML = "<div style='padding:10px;color:orange'>⚠️ 需要左右两个分屏</div>";
            return;
        }

        // 准备左右两屏的数据对象
        var screens = [null, null];

        widgets.forEach((widget, wIdx) => {
            if(wIdx > 1) return;
            
            var data = { 
                midStatus: {state:'-', color:'#555'}, midLen: '-',
                macdCross: '-', macdSpeed: '-', macdHisto: '-', macdHist: [] 
            };

            var allTitles = Array.from(widget.querySelectorAll('div[class*="title-"]')).filter(t => t.innerText.trim().length > 0);

            // [逻辑] 强制读取第1个指标 (Index 0) -> 主图
            if(allTitles.length > 0) {
                var vals = getIndicatorValues(allTitles[0]);
                if(vals[0] && vals[3]) {
                    data.midLen = (vals[3].val - vals[0].val).toFixed(2);
                    data.midStatus = analyzeColor(vals[0].el);
                }
            }

            // [逻辑] 强制读取第3个指标 (Index 2) -> MACD
            if(allTitles.length > 2) {
                var mVals = getIndicatorValues(allTitles[2]);
                if(mVals.length >= 10) {
                    var histo = mVals[8] || mVals[0];
                    var fast = mVals[9] || mVals[1];
                    var slow = mVals[10] || mVals[2];

                    // 趋势历史 (集成 V10)
                    var historyArr = window.__TV_STATE.fastLineHistory["w"+wIdx];
                    if(historyArr.length === 0 || historyArr[historyArr.length-1] !== fast.val) {
                        historyArr.push(fast.val);
                        if(historyArr.length > 5) historyArr.shift();
                    }
                    data.macdHist = historyArr;

                    // 计算速度
                    if(historyArr.length >= 2) {
                        var delta = fast.val - historyArr[historyArr.length - 2];
                        if (Math.abs(delta) < 1.0) data.macdSpeed = "<span style='color:#f1c40f'>→平缓</span>";
                        else if (delta > 0) data.macdSpeed = "<span style='color:#ff4757;font-weight:bold'>🚀急涨</span>";
                        else data.macdSpeed = "<span style='color:#2ed573;font-weight:bold'>📉急跌</span>";
                    } else {
                        data.macdSpeed = "计算中";
                    }

                    // 金叉死叉
                    if(fast.val > slow.val) data.macdCross = "<span style='color:#ff6b81'>金叉</span>";
                    else if(fast.val < slow.val) data.macdCross = "<span style='color:#1dd1a1'>死叉</span>";
                    else data.macdCross = "粘合";

                    data.macdHisto = `<span style="color:${rgbToHex(histo.el)}">${histo.text}</span>`;
                }
            }
            
            screens[wIdx] = data;
        });

        // --- 6. 渲染表格 (左右对比) ---
        var left = screens[0] || {};
        var right = screens[1] || {};

        var html = `
        <table style="width:100%; border-collapse:collapse; text-align:center;">
            <tr style="background:#333; color:#aaa; font-size:10px;">
                <td style="padding:4px;">指标项</td>
                <td style="border-left:1px solid #444;">左屏 (40分)</td>
                <td style="border-left:1px solid #444;">右屏 (10分)</td>
            </tr>
            
            <!-- 中轨状态 -->
            <tr style="border-bottom:1px solid #333;">
                <td style="color:#ffeaa7;">中轨</td>
                <td style="border-left:1px solid #333; color:${left.midStatus?.color || '#fff'}; font-weight:bold; font-size:1.1em;">
                    ${left.midStatus?.state || '-'}
                </td>
                <td style="border-left:1px solid #333; color:${right.midStatus?.color || '#fff'}; font-weight:bold; font-size:1.1em;">
                    ${right.midStatus?.state || '-'}
                </td>
            </tr>

            <!-- 中轨长度 -->
            <tr style="border-bottom:1px solid #333; font-size:0.9em;">
                <td style="color:#aaa;">长度</td>
                <td style="border-left:1px solid #333;">${left.midLen || '-'}</td>
                <td style="border-left:1px solid #333;">${right.midLen || '-'}</td>
            </tr>

            <!-- MACD 状态 -->
            <tr style="border-bottom:1px solid #333;">
                <td style="color:#74b9ff;">MACD</td>
                <td style="border-left:1px solid #333;">${left.macdCross || '-'}</td>
                <td style="border-left:1px solid #333;">${right.macdCross || '-'}</td>
            </tr>

            <!-- MACD 速度 -->
            <tr style="border-bottom:1px solid #333;">
                <td style="color:#aaa;">趋势</td>
                <td style="border-left:1px solid #333;">${left.macdSpeed || '-'}</td>
                <td style="border-left:1px solid #333;">${right.macdSpeed || '-'}</td>
            </tr>

            <!-- 动能 -->
            <tr style="border-bottom:1px solid #333;">
                <td style="color:#aaa;">动能</td>
                <td style="border-left:1px solid #333;">${left.macdHisto || '-'}</td>
                <td style="border-left:1px solid #333;">${right.macdHisto || '-'}</td>
            </tr>
        </table>
        
        <!-- 历史记录展示区 -->
        <div style="padding:5px; border-top:2px solid #333; font-size:10px; color:#666;">
            <div style="display:flex; justify-content:space-between;">
                <span>L: ${left.macdHist ? left.macdHist.slice(-3).join('→') : ''}</span>
                <span>R: ${right.macdHist ? right.macdHist.slice(-3).join('→') : ''}</span>
            </div>
        </div>
        `;

        content.innerHTML = html;
    }

    var timer = setInterval(updatePanel, 1000);
    if (window.__TV_HOT_CONTEXT) window.__TV_HOT_CONTEXT.timer = timer;

})();