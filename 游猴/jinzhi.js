/* 
   云端脚本：TradingView 金指数据监控 V21.0 (精准逻辑定版)
   逻辑说明：
   1. 主图(Index 0): 取 Val[0]和Val[3]计算长度，颜色跟随Val[0]。
   2. MACD(Index 2): 取 Val[18](动能), Val[19](快), Val[20](慢)。
      - 动能: 比前值大=涨, 小=跌。
      - 快线: 波动<=1 即为平缓(平仓/观望)。
      - 交叉: 快>慢=金叉, 快<慢=死叉。
*/

(function() {
    console.log(">>> [云端 V21] 启动精准逻辑监控...");

    // --- 1. 全局状态 (用于记录历史比对) ---
    if (!window.__TV_STATE) {
        window.__TV_STATE = {
            // 记录历史数据: { w0: {histo:null, fast:null}, w1: ... }
            history: { 
                w0: { histo: null, fast: null }, 
                w1: { histo: null, fast: null } 
            },
            isCollapsed: false
        };
    }

    // --- 2. 面板构建 (V7 风格) ---
    var old = document.getElementById('tv-monitor-panel-v7');
    if(old) old.remove();

    var panel = document.createElement('div');
    panel.id = 'tv-monitor-panel-v7';
    panel.style.cssText = "position:fixed; top:100px; right:100px; width:450px; background:rgba(15, 15, 15, 0.98); color:#ecf0f1; font-family:'Microsoft YaHei', sans-serif; font-size:12px; z-index:999999; border-radius:8px; border: 1px solid #444; box-shadow: 0 8px 20px rgba(0,0,0,0.8); display:flex; flex-direction:column; overflow:hidden;";
    
    // 标题栏
    var header = document.createElement('div');
    header.style.cssText = "padding:8px 12px; background:#2d3436; cursor:move; font-weight:bold; color:#00b894; display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #444; user-select:none;";
    header.innerHTML = `
        <span>⚖️ 金指 V21 精准逻辑</span>
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

    // --- 3. 拖动逻辑 ---
    var isDragging = false, startX, startY;
    header.onmousedown = function(e) {
        if(e.target.id === 'btn-collapse') return;
        isDragging = true;
        startX = e.clientX - panel.offsetLeft;
        startY = e.clientY - panel.offsetTop;
        panel.style.right = 'auto'; 
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
        try {
            var p = rgb.substr(4).split(")")[0].split(sep);
            var r = (+p[0]).toString(16), g = (+p[1]).toString(16), b = (+p[2]).toString(16);
            return "#" + (r.length==1?"0"+r:r) + (g.length==1?"0"+g:g) + (b.length==1?"0"+b:b);
        } catch(e) { return "#fff"; }
    }

    // 提取器
    function getIndicatorValues(titleEl) {
        var p = titleEl; 
        var results = [];
        // 向上找父级，直到找到包含大量数值的容器
        for(var i=0; i<6; i++) {
            if(!p.parentElement) break;
            p = p.parentElement;
            var vs = p.querySelectorAll('div[class*="valueValue-"]');
            if(vs.length > 5) { 
                vs.forEach(v => {
                    if((v.innerText && /\d/.test(v.innerText)) || v.innerText.includes('−')) {
                        results.push({
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

    // --- 5. 核心逻辑 ---
    function updatePanel() {
        if(window.__TV_STATE.isCollapsed) return;

        var widgets = document.querySelectorAll('.chart-widget');
        if (widgets.length < 2) {
            content.innerHTML = "<div style='padding:10px;color:orange'>⚠️ 等待分屏加载...</div>";
            return;
        }

        var screens = [{}, {}];

        widgets.forEach((widget, wIdx) => {
            if(wIdx > 1) return;
            
            var data = { 
                midLen: '-', midColor: '#aaa',
                macdHistoStatus: '-', macdSpeed: '-', macdCross: '-', 
                debugInfo: ''
            };

            var allTitles = Array.from(widget.querySelectorAll('div[class*="title-"]')).filter(t => t.innerText.trim().length > 0);

            // ============================================
            // 1. 主图 (Index 0) -> 目标: [0] 和 [3]
            // ============================================
            if(allTitles.length > 0) {
                var vals = getIndicatorValues(allTitles[0]);
                if(vals.length >= 4) {
                    var vLow = vals[0];  // 第1个数值 (最低值)
                    var vHigh = vals[3]; // 第4个数值 (最高值)
                    
                    data.midLen = (vHigh.val - vLow.val).toFixed(2);
                    data.midColor = rgbToHex(vLow.el); // 颜色跟随最低值
                }
            }

            // ============================================
            // 2. MACD (Index 2) -> 目标: [18], [19], [20]
            // 用户口径: 19(动能), 20(快), 21(慢) -> 数组索引: 18, 19, 20
            // ============================================
            if(allTitles.length > 2) {
                var mVals = getIndicatorValues(allTitles[2]);
                
                // 检查数据长度是否足够
                if(mVals.length >= 21) {
                    var idxHisto = 18; // 动能
                    var idxFast = 19;  // 快线
                    var idxSlow = 20;  // 慢线

                    var vHisto = mVals[idxHisto];
                    var vFast = mVals[idxFast];
                    var vSlow = mVals[idxSlow];

                    var histState = window.__TV_STATE.history["w"+wIdx];

                    // --- 逻辑1: 动能柱 (比前一根大=涨) ---
                    if(histState.histo !== null) {
                        if(vHisto.val > histState.histo) data.macdHistoStatus = "<span style='color:#ff4757'>📈涨</span>";
                        else if(vHisto.val < histState.histo) data.macdHistoStatus = "<span style='color:#2ed573'>📉跌</span>";
                        else data.macdHistoStatus = "→平";
                    } else {
                        data.macdHistoStatus = "初始化";
                    }
                    // 更新历史
                    histState.histo = vHisto.val;

                    // --- 逻辑2: 快线平缓 (波动 <= 1) ---
                    if(histState.fast !== null) {
                        var delta = Math.abs(vFast.val - histState.fast);
                        if(delta <= 1.0) {
                            data.macdSpeed = "<span style='color:#f1c40f; border:1px solid #f1c40f; padding:0 2px; border-radius:2px;'>➖平缓(观望)</span>";
                        } else {
                            // 波动大于1，显示方向
                            if(vFast.val > histState.fast) data.macdSpeed = "<span style='color:#ff6b81'>🚀波动向上</span>";
                            else data.macdSpeed = "<span style='color:#1dd1a1'>📉波动向下</span>";
                        }
                    } else {
                        data.macdSpeed = "计算中";
                    }
                    // 更新历史
                    histState.fast = vFast.val;

                    // --- 逻辑3: 金叉/死叉 (快线与慢线对比) ---
                    // 金叉: 快 > 慢; 死叉: 快 < 慢; (严格相等是交汇)
                    if(vFast.val > vSlow.val) data.macdCross = "<span style='color:#ff4757; font-weight:bold;'>🔴金叉状态</span>";
                    else if(vFast.val < vSlow.val) data.macdCross = "<span style='color:#2ed573; font-weight:bold;'>🟢死叉状态</span>";
                    else data.macdCross = "<span style='color:#fff'>⚪交汇</span>";

                } else {
                    data.debugInfo = `MACD数据不足(${mVals.length})`;
                }
            } else {
                data.debugInfo = "未找到MACD";
            }
            
            screens[wIdx] = data;
        });

        // --- 6. 渲染表格 ---
        var left = screens[0];
        var right = screens[1];

        var html = `
        <table style="width:100%; border-collapse:collapse; text-align:center;">
            <tr style="background:#333; color:#aaa; font-size:10px;">
                <td style="padding:6px;">指标项</td>
                <td style="border-left:1px solid #444; width:35%;">左屏 (40分)</td>
                <td style="border-left:1px solid #444; width:35%;">右屏 (10分)</td>
            </tr>
            
            <!-- 中轨长度 -->
            <tr style="border-bottom:1px solid #333;">
                <td style="color:#ffeaa7;">中轨长度</td>
                <td style="border-left:1px solid #333;">
                    <span style="display:inline-block;width:10px;height:10px;background:${left.midColor};border-radius:50%;margin-right:5px;"></span>
                    <span style="font-weight:bold; font-size:1.1em; color:#fff;">${left.midLen}</span>
                </td>
                <td style="border-left:1px solid #333;">
                    <span style="display:inline-block;width:10px;height:10px;background:${right.midColor};border-radius:50%;margin-right:5px;"></span>
                    <span style="font-weight:bold; font-size:1.1em; color:#fff;">${right.midLen}</span>
                </td>
            </tr>

            <!-- 动能柱 -->
            <tr style="border-bottom:1px solid #333;">
                <td style="color:#aaa;">动能趋势</td>
                <td style="border-left:1px solid #333;">${left.macdHistoStatus}</td>
                <td style="border-left:1px solid #333;">${right.macdHistoStatus}</td>
            </tr>

            <!-- 快线平缓度 -->
            <tr style="border-bottom:1px solid #333;">
                <td style="color:#aaa;">快线力度</td>
                <td style="border-left:1px solid #333;">${left.macdSpeed}</td>
                <td style="border-left:1px solid #333;">${right.macdSpeed}</td>
            </tr>

            <!-- 金叉死叉 -->
            <tr style="border-bottom:1px solid #333;">
                <td style="color:#74b9ff;">多空状态</td>
                <td style="border-left:1px solid #333;">${left.macdCross}</td>
                <td style="border-left:1px solid #333;">${right.macdCross}</td>
            </tr>
        </table>
        
        <div style="padding:2px; font-size:10px; color:#555; text-align:center;">
            ${left.debugInfo || right.debugInfo ? '⚠️ ' + (left.debugInfo || right.debugInfo) : ''}
        </div>
        `;

        content.innerHTML = html;
    }

    setInterval(updatePanel, 1000);

})();