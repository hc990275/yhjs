/* 
   云端脚本：TradingView 金指数据监控 V19.0 (V7界面复刻 + 精准数据内核)
   特点：保留V7的表格对比风格，使用调试确认过的精准坐标
*/

(function() {
    console.log(">>> [云端 V19] 启动 V7 复刻版...");

    // --- 1. 全局状态 (用于记录MACD历史) ---
    if (!window.__TV_STATE) {
        window.__TV_STATE = {
            fastLineHistory: { w0: [], w1: [] },
            isCollapsed: false
        };
    }

    // --- 2. 面板构建 (V7 风格) ---
    var old = document.getElementById('tv-monitor-panel-v7');
    if(old) old.remove();

    var panel = document.createElement('div');
    panel.id = 'tv-monitor-panel-v7';
    // V7 经典样式
    panel.style.cssText = "position:fixed; top:100px; right:100px; width:420px; background:rgba(20, 20, 20, 0.95); color:#ecf0f1; font-family:'Microsoft YaHei', sans-serif; font-size:12px; z-index:999999; border-radius:8px; border: 1px solid #444; box-shadow: 0 8px 20px rgba(0,0,0,0.6); display:flex; flex-direction:column; overflow:hidden;";
    
    // 标题栏
    var header = document.createElement('div');
    header.style.cssText = "padding:8px 12px; background:#2d3436; cursor:move; font-weight:bold; color:#00b894; display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #444; user-select:none;";
    header.innerHTML = `
        <span>⚖️ 金指系统多空共振 V19</span>
        <div style="display:flex; gap:10px; align-items:center;">
            <span style='font-size:10px;color:#aaa'>按住拖动</span>
            <span id="btn-collapse" style="cursor:pointer; font-size:14px;">➖</span>
        </div>
    `;
    panel.appendChild(header);

    // 内容区
    var content = document.createElement('div');
    content.style.cssText = "padding:0; max-height:600px; overflow-y:auto; transition:height 0.2s;";
    panel.appendChild(content);

    document.body.appendChild(panel);
    if (window.__TV_HOT_CONTEXT) window.__TV_HOT_CONTEXT.panel = panel;

    // --- 3. 修复后的拖动逻辑 ---
    var isDragging = false, startX, startY;
    header.onmousedown = function(e) {
        if(e.target.id === 'btn-collapse') return;
        isDragging = true;
        startX = e.clientX - panel.offsetLeft;
        startY = e.clientY - panel.offsetTop;
        panel.style.right = 'auto'; // 关键修复：解除右对齐
        panel.style.opacity = "0.8";
    };
    document.onmousemove = function(e) {
        if (isDragging) {
            panel.style.left = (e.clientX - startX) + "px";
            panel.style.top = (e.clientY - startY) + "px";
        }
    };
    document.onmouseup = function() { isDragging = false; panel.style.opacity = "1"; };

    header.querySelector('#btn-collapse').onclick = function() {
        window.__TV_STATE.isCollapsed = !window.__TV_STATE.isCollapsed;
        this.innerText = window.__TV_STATE.isCollapsed ? '➕' : '➖';
        content.style.display = window.__TV_STATE.isCollapsed ? 'none' : 'block';
    };

    // --- 4. 数据提取工具 ---
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
        if(!rgb) return { state: "-", color: "#aaa" };
        var c = rgb.replace(/\s/g, '');
        
        // 红系 (多)
        if(c.includes("254,67,101") || c.includes("255,0,0") || c.includes("254,114,75")) 
            return { state: "🔴多", color: "#ff4757" };
        // 蓝/绿系 (空)
        if(c.includes("0,102,255") || c.includes("0,4,255") || c.includes("82,189,255") || c.includes("0,255,0")) 
            return { state: "🔵空", color: "#00a8ff" };
        // 黄系 (平)
        if(c.includes("255,255,0") || c.includes("255,213,0") || c.includes("254,208,25")) 
            return { state: "🟡平", color: "#fbc531" };

        return { state: "⚪", color: rgbToHex(el) };
    }

    // 提取器
    function getIndicatorValues(titleEl) {
        var p = titleEl; 
        var results = [];
        // 向上找父级，直到找到包含数值的容器
        for(var i=0; i<6; i++) {
            if(!p.parentElement) break;
            p = p.parentElement;
            var vs = p.querySelectorAll('div[class*="valueValue-"]');
            if(vs.length > 5) { // 只要这一行数字够多
                vs.forEach(v => {
                    if((v.innerText && /\d/.test(v.innerText)) || v.innerText.includes('−')) {
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

    // --- 5. 核心逻辑 (V7 表格生成) ---
    function updatePanel() {
        if(window.__TV_STATE.isCollapsed) return;

        var widgets = document.querySelectorAll('.chart-widget');
        if (widgets.length < 2) {
            content.innerHTML = "<div style='padding:10px;color:orange'>⚠️ 等待分屏加载...</div>";
            return;
        }

        // 准备数据对象
        var screens = [{}, {}];

        widgets.forEach((widget, wIdx) => {
            if(wIdx > 1) return;
            
            var data = { 
                midStatus: {state:'-', color:'#555'}, midLen: '-',
                macdCross: '-', macdSpeed: '-', macdHisto: '-', macdHist: [] 
            };

            var allTitles = Array.from(widget.querySelectorAll('div[class*="title-"]')).filter(t => t.innerText.trim().length > 0);

            // 1. 主图 (Index 0) -> 读取 [0] 和 [3]
            if(allTitles.length > 0) {
                var vals = getIndicatorValues(allTitles[0]);
                if(vals.length >= 4) {
                    var vLow = vals[0];
                    var vHigh = vals[3];
                    if(vLow && vHigh) {
                        data.midLen = (vHigh.val - vLow.val).toFixed(2);
                        data.midStatus = analyzeColor(vLow.el);
                    }
                }
            }

            // 2. MACD (Index 2) -> 读取 [8], [9], [10]
            if(allTitles.length > 2) {
                var mVals = getIndicatorValues(allTitles[2]);
                if(mVals.length >= 11) {
                    var histo = mVals[8];
                    var fast = mVals[9];
                    var slow = mVals[10];

                    // 历史
                    var historyArr = window.__TV_STATE.fastLineHistory["w"+wIdx];
                    if(historyArr.length === 0 || historyArr[historyArr.length-1] !== fast.val) {
                        historyArr.push(fast.val);
                        if(historyArr.length > 5) historyArr.shift();
                    }
                    data.macdHist = historyArr;

                    // 速度
                    if(historyArr.length >= 2) {
                        var delta = fast.val - historyArr[historyArr.length - 2];
                        if (Math.abs(delta) < 1.0) data.macdSpeed = "<span style='color:#f1c40f'>→平缓</span>";
                        else if (delta > 0) data.macdSpeed = "<span style='color:#ff4757;font-weight:bold'>🚀急涨</span>";
                        else data.macdSpeed = "<span style='color:#2ed573;font-weight:bold'>📉急跌</span>";
                    } else {
                        data.macdSpeed = "计算中";
                    }

                    // 交叉
                    if(fast.val > slow.val) data.macdCross = "<span style='color:#ff6b81'>金叉</span>";
                    else if(fast.val < slow.val) data.macdCross = "<span style='color:#1dd1a1'>死叉</span>";
                    else data.macdCross = "粘合";

                    data.macdHisto = `<span style="color:${rgbToHex(histo.el)}">${histo.text}</span>`;
                }
            }
            screens[wIdx] = data;
        });

        // --- 6. 渲染 V7 风格表格 ---
        var left = screens[0];
        var right = screens[1];

        var html = `
        <table style="width:100%; border-collapse:collapse; text-align:center;">
            <!-- 表头 -->
            <tr style="background:#333; color:#aaa; font-size:10px;">
                <td style="padding:6px;">指标项</td>
                <td style="border-left:1px solid #444; width:35%;">左屏 (40分)</td>
                <td style="border-left:1px solid #444; width:35%;">右屏 (10分)</td>
            </tr>
            
            <!-- 1. 中轨状态 (核心) -->
            <tr style="border-bottom:1px solid #333;">
                <td style="color:#ffeaa7;">中轨状态</td>
                <td style="border-left:1px solid #333; color:${left.midStatus.color}; font-weight:bold; font-size:1.1em;">
                    ${left.midStatus.state}
                </td>
                <td style="border-left:1px solid #333; color:${right.midStatus.color}; font-weight:bold; font-size:1.1em;">
                    ${right.midStatus.state}
                </td>
            </tr>

            <!-- 2. 中轨长度 -->
            <tr style="border-bottom:1px solid #333;">
                <td style="color:#aaa;">中轨长度</td>
                <td style="border-left:1px solid #333;">${left.midLen}</td>
                <td style="border-left:1px solid #333;">${right.midLen}</td>
            </tr>

            <!-- 3. MACD 状态 -->
            <tr style="border-bottom:1px solid #333;">
                <td style="color:#74b9ff;">MACD</td>
                <td style="border-left:1px solid #333;">${left.macdCross}</td>
                <td style="border-left:1px solid #333;">${right.macdCross}</td>
            </tr>

            <!-- 4. MACD 速度 -->
            <tr style="border-bottom:1px solid #333;">
                <td style="color:#aaa;">趋势速度</td>
                <td style="border-left:1px solid #333;">${left.macdSpeed}</td>
                <td style="border-left:1px solid #333;">${right.macdSpeed}</td>
            </tr>

            <!-- 5. 动能 -->
            <tr style="border-bottom:1px solid #333;">
                <td style="color:#aaa;">动能柱</td>
                <td style="border-left:1px solid #333;">${left.macdHisto}</td>
                <td style="border-left:1px solid #333;">${right.macdHisto}</td>
            </tr>
        </table>
        
        <!-- 底部历史 -->
        <div style="padding:5px; background:#1e272e; font-size:10px; color:#636e72; border-top:1px solid #333; display:flex; justify-content:space-between;">
            <div>L: ${left.macdHist ? left.macdHist.slice(-3).join('→') : '-'}</div>
            <div>R: ${right.macdHist ? right.macdHist.slice(-3).join('→') : '-'}</div>
        </div>
        `;

        content.innerHTML = html;
    }

    setInterval(updatePanel, 1000);

})();