/* 
   云端脚本：TradingView 金指数据监控 V8.0 (定制计算+折叠面板+日志)
*/

(function() {
    console.log(">>> [云端 V8] 启动定制监控...");

    // --- 1. 全局状态管理 (用于计算涨速和存储历史) ---
    // 挂载到 window 以便热更新时不丢失历史数据
    if (!window.__TV_STATE) {
        window.__TV_STATE = {
            history: {}, // 存储上一次的快线数值 { widgetId_indicatorIdx: value }
            isCollapsed: false // 面板折叠状态
        };
    }

    // --- 2. UI 构建 (支持拖动 & 折叠) ---
    var old = document.getElementById('tv-monitor-panel-v8');
    if(old) old.remove();

    var panel = document.createElement('div');
    panel.id = 'tv-monitor-panel-v8';
    panel.style.cssText = "position:fixed; top:80px; right:60px; width:360px; background:rgba(25, 25, 25, 0.95); color:#ecf0f1; font-family:'Segoe UI', sans-serif; font-size:12px; z-index:999999; border-radius:6px; border: 1px solid #444; box-shadow: 0 10px 30px rgba(0,0,0,0.5); display:flex; flex-direction:column; overflow:hidden;";
    
    // 2.1 标题栏
    var header = document.createElement('div');
    header.style.cssText = "padding:8px 12px; background:#2d3436; cursor:move; font-weight:bold; color:#00b894; display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #444; user-select:none;";
    header.innerHTML = `
        <span>📊 金指&MACD 监控系统</span>
        <div style="display:flex; gap:10px;">
            <span id="btn-log-color" style="cursor:pointer; font-size:14px;" title="打印中轨颜色到控制台">📋</span>
            <span id="btn-collapse" style="cursor:pointer; font-size:14px;">${window.__TV_STATE.isCollapsed ? '➕' : '➖'}</span>
        </div>
    `;
    panel.appendChild(header);

    // 2.2 内容区
    var content = document.createElement('div');
    content.style.cssText = "padding:0; overflow-y:auto; transition: height 0.3s;";
    content.style.height = window.__TV_STATE.isCollapsed ? "0px" : "auto";
    content.style.display = window.__TV_STATE.isCollapsed ? "none" : "block"; // 彻底隐藏防止占位
    panel.appendChild(content);

    document.body.appendChild(panel);
    if (window.__TV_HOT_CONTEXT) window.__TV_HOT_CONTEXT.panel = panel;

    // --- 3. 交互逻辑 ---
    // 折叠功能
    header.querySelector('#btn-collapse').onclick = function(e) {
        e.stopPropagation(); // 防止触发拖动
        window.__TV_STATE.isCollapsed = !window.__TV_STATE.isCollapsed;
        this.innerText = window.__TV_STATE.isCollapsed ? '➕' : '➖';
        content.style.height = window.__TV_STATE.isCollapsed ? "0px" : "auto";
        content.style.display = window.__TV_STATE.isCollapsed ? "none" : "block";
    };

    // 颜色日志功能 (手动触发)
    header.querySelector('#btn-log-color').onclick = function(e) {
        e.stopPropagation();
        console.log("=== 📋 中轨颜色抓取日志 ===");
        console.log("时间:", new Date().toLocaleTimeString());
        // 触发一次全局扫描并打印颜色
        scanAndLogColors(); 
        alert("已在控制台(Console)打印中轨颜色信息，按F12查看。");
    };

    // 拖动功能
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
            panel.style.right = "auto";
        }
    };
    document.onmouseup = function() {
        isDragging = false;
        panel.style.opacity = "1";
    };

    // --- 4. 数据处理辅助函数 ---
    
    // 提取纯数字 (处理 "4,300.00" 或 "−12.5")
    function parseNum(str) {
        if(!str) return 0;
        // 替换特殊的负号和其他非数字字符
        var clean = str.replace(/,/g, '').replace(/−/g, '-');
        return parseFloat(clean) || 0;
    }

    // 获取颜色 Hex
    function rgbToHex(el) {
        var rgb = window.getComputedStyle(el).color;
        if(!rgb) return '#fff';
        if(rgb.indexOf('rgb') === -1) return rgb;
        var sep = rgb.indexOf(",") > -1 ? "," : " ";
        rgb = rgb.substr(4).split(")")[0].split(sep);
        var r = (+rgb[0]).toString(16), g = (+rgb[1]).toString(16), b = (+rgb[2]).toString(16);
        return "#" + (r.length==1?"0"+r:r) + (g.length==1?"0"+g:g) + (b.length==1?"0"+b:b);
    }

    // --- 5. 核心业务逻辑 ---

    // 专门用于打印颜色的函数
    function scanAndLogColors() {
        var widgets = document.querySelectorAll('.chart-widget');
        widgets.forEach((widget, idx) => {
            if(idx > 1) return;
            var titles = Array.from(widget.querySelectorAll('div[class*="title-"]'));
            // 找到主图指标 (通常是第一个)
            var mainTitle = titles.find(t => (t.innerText.includes("金指") || t.innerText.includes("数据智能")));
            if(mainTitle) {
                var values = getIndicatorValues(mainTitle);
                if(values[0] && values[3]) {
                    console.log(`分屏${idx+1} [中轨最低值] 颜色: %c${values[0].color}`, `color:${values[0].color}; font-weight:bold; background:#333; padding:2px;`);
                    console.log(`分屏${idx+1} [中轨最高值] 颜色: %c${values[3].color}`, `color:${values[3].color}; font-weight:bold; background:#333; padding:2px;`);
                }
            }
        });
    }

    // 通用取值器 (返回带有颜色和文本的对象数组)
    function getIndicatorValues(titleEl) {
        var p = titleEl; 
        var results = [];
        // 向上找4层
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
                            el: v // 保存元素引用以便获取最新颜色
                        });
                    }
                });
                if(results.length > 0) break;
            }
        }
        return results; // 返回数组，索引 0 对应指标里的第1个数值
    }

    function updatePanel() {
        if(window.__TV_STATE.isCollapsed) return; // 折叠时不计算

        var html = "";
        var widgets = document.querySelectorAll('.chart-widget');

        if(widgets.length < 1) {
            content.innerHTML = "<div style='padding:10px'>等待图表加载...</div>";
            return;
        }

        // 遍历左右分屏
        widgets.forEach((widget, wIdx) => {
            if(wIdx > 1) return; // 只看前两个
            
            var screenName = wIdx === 0 ? "分屏 1 (左)" : "分屏 2 (右)";
            html += `<div style="background:#333; color:#ffeaa7; padding:4px 8px; font-weight:bold; margin-top:${wIdx>0?'10px':'0'}; border-left:4px solid #00b894;">${screenName}</div>`;

            // 获取该分屏下所有的标题
            // 按照在DOM中的顺序：通常 Index 0 是主图, 1 是副图1(忽略), 2 是副图2(MACD)
            // 我们通过简单的位置筛选
            var allTitles = Array.from(widget.querySelectorAll('div[class*="title-"]')).filter(t => t.innerText.trim().length > 0);
            
            // --- 🎯 指标一：主图 (金指) ---
            var mainChartTitle = allTitles[0]; // 假设第一个就是主图
            if(mainChartTitle) {
                var vals = getIndicatorValues(mainChartTitle);
                // 需求：提取 1(0), 4(3), 11(10), 12(11), 13(12)
                // 数组索引 = 需求序号 - 1
                if(vals.length >= 13) {
                    var midLow = vals[0];
                    var midHigh = vals[3];
                    var midLen = (midHigh.val - midLow.val).toFixed(2); // 中轨长度
                    
                    var bullUp = vals[10];
                    var bullDown = vals[11];
                    var bullMid = vals[12];

                    html += `<table style="width:100%; border-collapse:collapse; margin-bottom:5px;">`;
                    // 第一行：中轨数据
                    html += `
                        <tr style="border-bottom:1px solid #444;">
                            <td style="width:20%; color:#aaa;">中轨</td>
                            <td style="color:${rgbToHex(midLow.el)}">L: ${midLow.text}</td>
                            <td style="color:${rgbToHex(midHigh.el)}">H: ${midHigh.text}</td>
                            <td style="text-align:right;"><span style="background:#555; padding:0 4px; border-radius:3px;">长: ${midLen}</span></td>
                        </tr>
                    `;
                    // 第二行：牛熊线
                    html += `
                        <tr>
                            <td style="color:#aaa;">牛熊</td>
                            <td style="color:${rgbToHex(bullUp.el)}">上: ${bullUp.text}</td>
                            <td style="color:${rgbToHex(bullDown.el)}">下: ${bullDown.text}</td>
                            <td style="text-align:right; color:${rgbToHex(bullMid.el)}">中: ${bullMid.text}</td>
                        </tr>
                    </table>`;
                } else {
                    html += `<div style="color:gray; font-size:10px; padding:4px;">主图数据不足 (找到${vals.length}个)</div>`;
                }
            }

            // --- 🎯 指标三：MACD ---
            // 用户说指标2忽略，所以我们找列表里的第3个 (Index 2)
            // 为了稳健，也可以找包含 "MACD" 或特定名字的，这里暂按顺序取第3个
            var macdTitle = allTitles[2]; 
            if(macdTitle) {
                var mVals = getIndicatorValues(macdTitle);
                // 需求：9(动能), 10(快), 11(慢) -> Index 8, 9, 10
                if(mVals.length >= 11) {
                    var histo = mVals[8];
                    var fast = mVals[9];
                    var slow = mVals[10];

                    // --- 逻辑判定 ---
                    
                    // 1. 动能柱判定
                    // 需要历史数据来判断是涨还是跌 (当前 > 上次)
                    var historyKey = `w${wIdx}_histo`;
                    var prevHisto = window.__TV_STATE.history[historyKey] || histo.val;
                    var histoTrend = "";
                    if (histo.val > prevHisto) histoTrend = "<span style='color:#ff7675'>↑涨</span>";
                    else if (histo.val < prevHisto) histoTrend = "<span style='color:#00b894'>↓跌</span>";
                    else histoTrend = "<span>-</span>";
                    
                    // 更新历史
                    window.__TV_STATE.history[historyKey] = histo.val;

                    // 2. 金叉/死叉判定
                    var crossState = "";
                    if (fast.val > slow.val) crossState = "<span style='color:#ff7675; font-weight:bold;'>金叉 (多)</span>";
                    else if (fast.val < slow.val) crossState = "<span style='color:#00b894; font-weight:bold;'>死叉 (空)</span>";
                    else crossState = "<span>粘合</span>";

                    // 3. 快线速度判定 (买涨/买跌/平仓)
                    var fastKey = `w${wIdx}_fast`;
                    var prevFast = window.__TV_STATE.history[fastKey];
                    var speedTip = "<span style='color:gray'>计算中...</span>";
                    
                    if (prevFast !== undefined) {
                        var delta = fast.val - prevFast;
                        var absDelta = Math.abs(delta);
                        var threshold = 0.05; // 阈值，根据品种不同可能需要调整，这里是示例
                        var flatThreshold = 0.01;

                        if (absDelta < flatThreshold) {
                            speedTip = "<span style='color:#f1c40f'>→ 平缓(平仓)</span>";
                        } else if (delta > 0) {
                            // 在涨
                            if (absDelta > threshold) speedTip = "<span style='color:#d63031; font-weight:bold;'>🚀 急涨(买)</span>";
                            else speedTip = "<span style='color:#ff7675'>↗ 缓涨</span>";
                        } else {
                            // 在跌
                            if (absDelta > threshold) speedTip = "<span style='color:#00b894; font-weight:bold;'>📉 急跌(卖)</span>";
                            else speedTip = "<span style='color:#55efc4'>↘ 缓跌</span>";
                        }
                    }
                    window.__TV_STATE.history[fastKey] = fast.val;

                    html += `<div style="border-top:1px dashed #555; padding-top:4px; font-size:11px;">`;
                    html += `
                        <div style="display:flex; justify-content:space-between; margin-bottom:2px;">
                            <span>MACD状态: ${crossState}</span>
                            <span>动能: ${histo.text} ${histoTrend}</span>
                        </div>
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <span>快线趋势: ${speedTip}</span>
                            <span style="color:#aaa; font-size:10px;">(D: ${(fast.val - slow.val).toFixed(3)})</span>
                        </div>
                    </div>`;

                } else {
                    html += `<div style="color:gray; font-size:10px;">MACD数据不足</div>`;
                }
            } else {
                 html += `<div style="color:gray; font-size:10px;">未找到第3个指标(MACD)</div>`;
            }
        });

        content.innerHTML = html;
    }

    // 6. 启动循环
    var timer = setInterval(updatePanel, 1000);
    if (window.__TV_HOT_CONTEXT) window.__TV_HOT_CONTEXT.timer = timer;

})();