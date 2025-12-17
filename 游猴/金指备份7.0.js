/* 
   云端脚本：TradingView 金指数据监控 V7.0
   功能：抓取数值颜色、支持面板拖动、左右分屏并排对比
*/

(function() {
    console.log(">>> [云端 V7]");

    // --- 1. 面板创建与样式 (支持拖动) ---
    // 如果旧面板存在，先移除
    var old = document.getElementById('tv-monitor-panel-v7');
    if(old) old.remove();

    var panel = document.createElement('div');
    panel.id = 'tv-monitor-panel-v7';
    panel.style.cssText = "position:fixed; top:100px; right:100px; width:400px; background:rgba(20, 20, 20, 0.95); color:#ecf0f1; font-family:'Consolas', monospace; font-size:12px; z-index:999999; border-radius:8px; border: 1px solid #444; box-shadow: 0 8px 20px rgba(0,0,0,0.6); display:flex; flex-direction:column; overflow:hidden;";
    
    // 标题栏 (用于拖动)
    var header = document.createElement('div');
    header.style.cssText = "padding:8px; background:#2d3436; cursor:move; font-weight:bold; color:#00b894; display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #444;";
    header.innerHTML = "<span>⚖️ 金指系统多空共振 V7</span><span style='font-size:10px;color:#aaa'>按住拖动</span>";
    panel.appendChild(header);

    // 内容区
    var content = document.createElement('div');
    content.style.cssText = "padding:10px; max-height:500px; overflow-y:auto;";
    panel.appendChild(content);

    document.body.appendChild(panel);

    // 注册给加载器清理
    if (window.__TV_HOT_CONTEXT) window.__TV_HOT_CONTEXT.panel = panel;

    // --- 2. 拖动逻辑 ---
    var isDragging = false;
    var offsetX, offsetY;
    header.onmousedown = function(e) {
        isDragging = true;
        offsetX = e.clientX - panel.offsetLeft;
        offsetY = e.clientY - panel.offsetTop;
        panel.style.opacity = "0.7";
    };
    document.onmousemove = function(e) {
        if (isDragging) {
            panel.style.left = (e.clientX - offsetX) + "px";
            panel.style.top = (e.clientY - offsetY) + "px";
            panel.style.right = "auto"; // 取消right定位，防止冲突
        }
    };
    document.onmouseup = function() {
        isDragging = false;
        panel.style.opacity = "1";
    };

    // --- 3. 辅助函数：提取颜色 ---
    function getColorName(rgbStr) {
        if(!rgbStr) return "N/A";
        // 简单判断几个常见色
        if(rgbStr.includes("255, 82, 82")) return "🔴红"; // TV默认红
        if(rgbStr.includes("0, 255")) return "🟢绿"; 
        if(rgbStr.includes("33, 150, 243")) return "🔵蓝";
        if(rgbStr.includes("255, 255, 255")) return "⚪白";
        if(rgbStr.includes("255, 235, 59")) return "🟡黄";
        // 如果是其他颜色，返回RGB简写
        return "🎨色"; 
    }

    // 转换RGB为Hex用于显示小圆点
    function rgbToHex(rgb) {
        if(!rgb) return '#fff';
        var sep = rgb.indexOf(",") > -1 ? "," : " ";
        rgb = rgb.substr(4).split(")")[0].split(sep);
        var r = (+rgb[0]).toString(16), g = (+rgb[1]).toString(16), b = (+rgb[2]).toString(16);
        if (r.length == 1) r = "0" + r;
        if (g.length == 1) g = "0" + g;
        if (b.length == 1) b = "0" + b;
        return "#" + r + g + b;
    }

    // --- 4. 核心扫描与对比逻辑 ---
    function updatePanel() {
        var widgets = document.querySelectorAll('.chart-widget');
        if (widgets.length < 2) {
            content.innerHTML = "<div style='color:orange'>⚠️ 需要至少 2 个分屏才能对比</div>";
            return;
        }

        // 收集数据容器
        // 结构: chartData[0] = [ {title, values:[ {text, color} ]}, ... ]
        var chartData = []; 

        widgets.forEach(function(widget, wIndex) {
            if(wIndex > 1) return; // 只取前两个分屏
            
            var widgetInfo = [];
            // 按垂直位置排序，确保 主图、副图1、副图2 顺序一致
            var titleElements = Array.from(widget.querySelectorAll('div[class*="title-"]'));
            
            // 过滤并排序
            var validTitles = titleElements.filter(function(t){
                var txt = t.innerText;
                return (txt.includes("金指") || txt.includes("数据智能")) && txt.length < 50;
            }).sort(function(a, b){
                return a.getBoundingClientRect().top - b.getBoundingClientRect().top;
            });

            validTitles.forEach(function(t) {
                // 向上找父级，再向下找数值
                var p = t; 
                var foundValues = [];
                for(var i=0; i<4; i++) {
                    if(!p.parentElement) break;
                    p = p.parentElement;
                    var vs = p.querySelectorAll('div[class*="valueValue-"]');
                    if(vs.length > 0) {
                        vs.forEach(function(v){ 
                            if(v.innerText && /\d/.test(v.innerText)) {
                                // ★ 获取计算后的颜色 ★
                                var computedStyle = window.getComputedStyle(v);
                                foundValues.push({
                                    val: v.innerText,
                                    color: computedStyle.color
                                });
                            }
                        });
                        if(foundValues.length > 0) break;
                    }
                }
                if(foundValues.length > 0) {
                    widgetInfo.push({ name: t.innerText.substring(0,6), data: foundValues });
                }
            });
            chartData.push(widgetInfo);
        });

        // --- 5. 生成对比表格 ---
        var html = "";
        
        // 左右两边的指标顺序是一样的（主图vs主图，副图vs副图）
        // 这里的 maxLen 是为了防止某一屏指标没加载出来
        var maxRows = Math.max(chartData[0]?.length || 0, chartData[1]?.length || 0);

        for(var i=0; i<maxRows; i++) {
            var leftItem = chartData[0] ? chartData[0][i] : null;
            var rightItem = chartData[1] ? chartData[1][i] : null;
            
            var rowName = leftItem ? leftItem.name : (rightItem ? rightItem.name : "未知区域");
            
            // 区域标题
            html += "<div style='background:#333; padding:4px; margin-top:8px; font-weight:bold; color:#ffeaa7; border-radius:4px;'>📊 " + rowName + " (指标 " + (i+1) + ")</div>";
            
            // 表头
            html += "<div style='display:grid; grid-template-columns: 30px 1fr 1fr; gap:2px; font-size:10px; color:#aaa; margin-bottom:2px;'>";
            html += "<div>ID</div><div>左屏</div><div>右屏</div></div>";

            // 数据行对比
            var maxVals = Math.max(leftItem?.data.length || 0, rightItem?.data.length || 0);
            
            for(var j=0; j<maxVals; j++) {
                var lData = leftItem && leftItem.data[j] ? leftItem.data[j] : {val:'-', color:''};
                var rData = rightItem && rightItem.data[j] ? rightItem.data[j] : {val:'-', color:''};

                // 颜色指示器
                var lDot = `<span style='display:inline-block;width:8px;height:8px;border-radius:50%;background:${rgbToHex(lData.color)};margin-right:4px;'></span>`;
                var rDot = `<span style='display:inline-block;width:8px;height:8px;border-radius:50%;background:${rgbToHex(rData.color)};margin-right:4px;'></span>`;

                // 简单的状态判断（比如颜色是否一致）
                var isColorSame = (lData.color === rData.color) && lData.color !== '';
                var bgStyle = isColorSame ? "background:rgba(46, 204, 113, 0.1);" : ""; // 颜色一样给个微绿背景

                html += `<div style='display:grid; grid-template-columns: 30px 1fr 1fr; gap:2px; align-items:center; border-bottom:1px solid #444; padding:2px 0; ${bgStyle}'>`;
                html += `<div style='color:#74b9ff; font-weight:bold;'>${j+1}</div>`; // ID
                html += `<div style='color:${rgbToHex(lData.color)}'>${lDot}${lData.val}</div>`; // 左数据
                html += `<div style='color:${rgbToHex(rData.color)}'>${rDot}${rData.val}</div>`; // 右数据
                html += `</div>`;
            }
        }

        var now = new Date();
        var timeStr = now.getHours() + ":" + now.getMinutes() + ":" + now.getSeconds();
        html += `<div style='text-align:right; font-size:10px; color:#666; margin-top:5px;'>最后刷新: ${timeStr}</div>`;
        
        content.innerHTML = html;
    }

    // --- 6. 启动 ---
    updatePanel();
    var timer = setInterval(updatePanel, 1000);
    if (window.__TV_HOT_CONTEXT) window.__TV_HOT_CONTEXT.timer = timer;

})();