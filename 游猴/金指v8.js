/* 
   云端脚本：TradingView 金指数据监控 V7 (数据保存增强版)
   基础：用户提供的 V7 源码
   新增：数据持久化、CSV导出、控制台日志记录
*/

(function() {
    console.log(">>> [V7 数据保存版] 启动...");

    // --- 全局变量：用于存储最新一次扫描的数据 ---
    var lastScanData = [];

    // --- 1. 面板创建与样式 (支持拖动) ---
    var old = document.getElementById('tv-monitor-panel-v7');
    if(old) old.remove();

    var panel = document.createElement('div');
    panel.id = 'tv-monitor-panel-v7';
    panel.style.cssText = "position:fixed; top:100px; right:100px; width:450px; background:rgba(20, 20, 20, 0.95); color:#ecf0f1; font-family:'Consolas', monospace; font-size:12px; z-index:999999; border-radius:8px; border: 1px solid #444; box-shadow: 0 8px 20px rgba(0,0,0,0.6); display:flex; flex-direction:column; overflow:hidden;";
    
    // 标题栏 (新增保存按钮)
    var header = document.createElement('div');
    header.style.cssText = "padding:8px; background:#2d3436; cursor:move; font-weight:bold; color:#00b894; display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #444; user-select:none;";
    header.innerHTML = `
        <span>⚖️ 金指 V7 (含保存)</span>
        <div style="display:flex; gap:10px; align-items:center;">
            <button id="btn-save-data" style="background:#0984e3; color:white; border:none; border-radius:3px; cursor:pointer; padding:2px 8px; font-size:11px;">💾 保存数据</button>
            <span style='font-size:10px;color:#aaa'>按住拖动</span>
        </div>
    `;
    panel.appendChild(header);

    // 内容区
    var content = document.createElement('div');
    content.style.cssText = "padding:10px; max-height:500px; overflow-y:auto;";
    panel.appendChild(content);

    document.body.appendChild(panel);

    if (window.__TV_HOT_CONTEXT) window.__TV_HOT_CONTEXT.panel = panel;

    // --- 2. 拖动逻辑 (微调优化) ---
    var isDragging = false;
    var offsetX, offsetY;
    header.onmousedown = function(e) {
        if(e.target.id === 'btn-save-data') return; // 点击按钮时不拖动
        isDragging = true;
        offsetX = e.clientX - panel.offsetLeft;
        offsetY = e.clientY - panel.offsetTop;
        panel.style.opacity = "0.7";
        panel.style.right = "auto"; // 关键：解除右对齐锁定
    };
    document.onmousemove = function(e) {
        if (isDragging) {
            panel.style.left = (e.clientX - offsetX) + "px";
            panel.style.top = (e.clientY - offsetY) + "px";
        }
    };
    document.onmouseup = function() {
        isDragging = false;
        panel.style.opacity = "1";
    };

    // --- 3. 新增：导出数据功能 ---
    header.querySelector('#btn-save-data').onclick = function() {
        if(!lastScanData || lastScanData.length === 0) {
            alert("暂无数据可保存，请等待图表加载");
            return;
        }

        console.log(">>> 正在导出数据:", lastScanData);

        // 生成 CSV 内容
        // 格式: 区域名, 行ID, 左屏数值, 左屏颜色, 右屏数值, 右屏颜色
        var csvContent = "\uFEFF"; // BOM防止乱码
        csvContent += "区域名称,行ID,左屏数值,左屏颜色(RGB),右屏数值,右屏颜色(RGB)\n";

        // 获取最大行数
        var leftGroup = lastScanData[0] || []; // 左屏数据组
        var rightGroup = lastScanData[1] || []; // 右屏数据组
        
        // 既然是对比，我们假设左右结构类似，以较长的为准
        var maxGroups = Math.max(leftGroup.length, rightGroup.length);

        for(var i=0; i<maxGroups; i++) {
            var lItem = leftGroup[i] || {name: "无", data: []};
            var rItem = rightGroup[i] || {name: "无", data: []};
            var sectionName = lItem.name !== "无" ? lItem.name : rItem.name;

            var maxRows = Math.max(lItem.data.length, rItem.data.length);
            
            for(var j=0; j<maxRows; j++) {
                var lVal = lItem.data[j] ? lItem.data[j].val : "-";
                var lCol = lItem.data[j] ? lItem.data[j].color : "-";
                var rVal = rItem.data[j] ? rItem.data[j].val : "-";
                var rCol = rItem.data[j] ? rItem.data[j].color : "-";

                // 处理数值中的逗号，防止破坏CSV格式
                lVal = `"${lVal}"`;
                rVal = `"${rVal}"`;

                csvContent += `${sectionName},${j+1},${lVal},"${lCol}",${rVal},"${rCol}"\n`;
            }
        }

        // 创建下载链接
        var blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        var url = URL.createObjectURL(blob);
        var link = document.createElement("a");
        link.setAttribute("href", url);
        var timeStr = new Date().toISOString().slice(0,19).replace(/:/g,"-");
        link.setAttribute("download", `TV_Data_${timeStr}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // --- 4. 辅助函数 ---
    function rgbToHex(rgb) {
        if(!rgb) return '#fff';
        var sep = rgb.indexOf(",") > -1 ? "," : " ";
        try {
            var parts = rgb.substr(4).split(")")[0].split(sep);
            var r = (+parts[0]).toString(16), g = (+parts[1]).toString(16), b = (+parts[2]).toString(16);
            if (r.length == 1) r = "0" + r;
            if (g.length == 1) g = "0" + g;
            if (b.length == 1) b = "0" + b;
            return "#" + r + g + b;
        } catch(e) { return '#fff'; }
    }

    // --- 5. 核心扫描逻辑 (保留V7原逻辑，增加数据存储) ---
    function updatePanel() {
        var widgets = document.querySelectorAll('.chart-widget');
        if (widgets.length < 2) {
            content.innerHTML = "<div style='color:orange'>⚠️ 需要至少 2 个分屏才能对比</div>";
            return;
        }

        // chartData 结构: [ [ {name, data:[{val, color}]} ], [ ... ] ]
        var chartData = []; 

        widgets.forEach(function(widget, wIndex) {
            if(wIndex > 1) return; // 只取前两个分屏
            
            var widgetInfo = [];
            var titleElements = Array.from(widget.querySelectorAll('div[class*="title-"]'));
            
            var validTitles = titleElements.filter(function(t){
                var txt = t.innerText;
                return (txt.includes("金指") || txt.includes("数据智能")) && txt.length < 50;
            }).sort(function(a, b){
                return a.getBoundingClientRect().top - b.getBoundingClientRect().top;
            });

            validTitles.forEach(function(t) {
                var p = t; 
                var foundValues = [];
                for(var i=0; i<4; i++) {
                    if(!p.parentElement) break;
                    p = p.parentElement;
                    var vs = p.querySelectorAll('div[class*="valueValue-"]');
                    if(vs.length > 0) {
                        vs.forEach(function(v){ 
                            if(v.innerText && /\d/.test(v.innerText)) {
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

        // ★★★ 保存数据到全局变量，供导出使用 ★★★
        lastScanData = chartData;

        // --- 生成界面 (V7 原代码) ---
        var html = "";
        var maxRows = Math.max(chartData[0]?.length || 0, chartData[1]?.length || 0);

        for(var i=0; i<maxRows; i++) {
            var leftItem = chartData[0] ? chartData[0][i] : null;
            var rightItem = chartData[1] ? chartData[1][i] : null;
            
            var rowName = leftItem ? leftItem.name : (rightItem ? rightItem.name : "未知区域");
            
            html += "<div style='background:#333; padding:4px; margin-top:8px; font-weight:bold; color:#ffeaa7; border-radius:4px;'>📊 " + rowName + " (指标 " + (i+1) + ")</div>";
            html += "<div style='display:grid; grid-template-columns: 30px 1fr 1fr; gap:2px; font-size:10px; color:#aaa; margin-bottom:2px;'>";
            html += "<div>ID</div><div>左屏(40分)</div><div>右屏(10分)</div></div>";

            var maxVals = Math.max(leftItem?.data.length || 0, rightItem?.data.length || 0);
            
            for(var j=0; j<maxVals; j++) {
                var lData = leftItem && leftItem.data[j] ? leftItem.data[j] : {val:'-', color:''};
                var rData = rightItem && rightItem.data[j] ? rightItem.data[j] : {val:'-', color:''};

                var lDot = `<span style='display:inline-block;width:8px;height:8px;border-radius:50%;background:${rgbToHex(lData.color)};margin-right:4px;'></span>`;
                var rDot = `<span style='display:inline-block;width:8px;height:8px;border-radius:50%;background:${rgbToHex(rData.color)};margin-right:4px;'></span>`;

                var isColorSame = (lData.color === rData.color) && lData.color !== '';
                var bgStyle = isColorSame ? "background:rgba(46, 204, 113, 0.1);" : ""; 

                html += `<div style='display:grid; grid-template-columns: 30px 1fr 1fr; gap:2px; align-items:center; border-bottom:1px solid #444; padding:2px 0; ${bgStyle}'>`;
                html += `<div style='color:#74b9ff; font-weight:bold;'>${j+1}</div>`; 
                html += `<div style='color:${rgbToHex(lData.color)}'>${lDot}${lData.val}</div>`; 
                html += `<div style='color:${rgbToHex(rData.color)}'>${rDot}${rData.val}</div>`; 
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
