/* 
   云端脚本：TradingView 数据记录仪 V21.0
   目标：完整记录页面上所有金指指标的数值与颜色，用于后期开发参考
*/

(function() {
    console.log(">>> [V21.0 数据记录仪] 启动...");

    var capturedData = []; // 存储所有抓取到的数据

    // --- 1. 面板 UI ---
    var old = document.getElementById('tv-data-recorder-v21');
    if(old) old.remove();

    var panel = document.createElement('div');
    panel.id = 'tv-data-recorder-v21';
    panel.style.cssText = "position:fixed; top:80px; right:20px; width:480px; background:rgba(15, 15, 15, 0.98); color:#ecf0f1; font-family:'Consolas', monospace; font-size:12px; z-index:999999; border-radius:8px; border: 1px solid #00b894; box-shadow: 0 10px 30px rgba(0,0,0,0.8); display:flex; flex-direction:column; overflow:hidden;";
    
    var header = document.createElement('div');
    header.style.cssText = "padding:10px; background:#2d3436; cursor:move; font-weight:bold; color:#00b894; display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #444; user-select:none;";
    header.innerHTML = `
        <span>📋 数据记录仪 V21.0</span>
        <div style="display:flex; gap:10px;">
            <button id="btn-export-csv" style="background:#0984e3; color:white; border:none; border-radius:4px; cursor:pointer; padding:3px 10px; font-size:11px;">💾 导出CSV记录</button>
            <span id="btn-minimize" style="cursor:pointer; font-size:14px;">➖</span>
        </div>
    `;
    panel.appendChild(header);

    var content = document.createElement('div');
    content.style.cssText = "padding:0; max-height:70vh; overflow-y:auto;";
    panel.appendChild(content);
    document.body.appendChild(panel);

    if (window.__TV_HOT_CONTEXT) window.__TV_HOT_CONTEXT.panel = panel;

    // --- 2. 交互逻辑 (拖动/收起) ---
    var isDragging = false, startX, startY;
    header.onmousedown = function(e) {
        if(e.target.tagName === 'BUTTON') return;
        isDragging = true; startX = e.clientX - panel.offsetLeft; startY = e.clientY - panel.offsetTop;
        panel.style.right = 'auto';
    };
    document.onmousemove = function(e) { if(isDragging) { panel.style.left = (e.clientX - startX) + 'px'; panel.style.top = (e.clientY - startY) + 'px'; } };
    document.onmouseup = function() { isDragging = false; };
    header.querySelector('#btn-minimize').onclick = function() {
        content.style.display = content.style.display === 'none' ? 'block' : 'none';
        this.innerText = content.style.display === 'none' ? '➕' : '➖';
    };

    // --- 3. 核心抓取函数 ---
    function updatePanel() {
        var widgets = document.querySelectorAll('.chart-widget');
        var html = "";
        var currentScan = []; // 准备导出

        widgets.forEach(function(widget, wIndex) {
            html += `<div style="background:#333; color:#fab1a0; padding:5px 10px; font-weight:bold;">📺 分屏 ${wIndex + 1}</div>`;
            
            var titleElements = Array.from(widget.querySelectorAll('div[class*="title-"]'));
            var validTitles = titleElements.filter(function(t){
                return (t.innerText.includes("金指") || t.innerText.includes("数据智能")) && t.innerText.length < 50;
            }).sort((a,b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);

            validTitles.forEach(function(t, tIndex) {
                var indicatorName = t.innerText.substring(0, 15);
                html += `<div style="padding:4px 10px; background:#222; color:#00d2d3; font-size:11px;">🛠️ 指标: ${indicatorName} (ID: ${tIndex})</div>`;
                
                var p = t; 
                var rowData = [];
                // 向上找父级获取数值
                for(var i=0; i<4; i++) {
                    if(!p.parentElement) break;
                    p = p.parentElement;
                    var vs = p.querySelectorAll('div[class*="valueValue-"]');
                    if(vs.length > 0) {
                        vs.forEach(function(v, vIndex){ 
                            if(v.innerText && /\d/.test(v.innerText)) {
                                var color = window.getComputedStyle(v).color;
                                var valText = v.innerText;
                                rowData.push({ id: vIndex + 1, val: valText, color: color });
                                
                                html += `<div style="display:flex; justify-content:space-between; padding:2px 20px; border-bottom:1px solid #222; font-family:monospace;">
                                    <span style="color:#aaa;">[${vIndex + 1}]</span>
                                    <span style="color:${color}; font-weight:bold;">${valText}</span>
                                    <span style="color:#666; font-size:9px;">${color}</span>
                                </div>`;
                            }
                        });
                        if(rowData.length > 0) break;
                    }
                }
                currentScan.push({ screen: wIndex + 1, name: indicatorName, items: rowData });
            });
        });

        capturedData = currentScan;
        content.innerHTML = html || "<div style='padding:20px; color:gray;'>未检测到“金指”指标，请确保指标数值已展开显示。</div>";
    }

    // --- 4. 导出 CSV 逻辑 ---
    header.querySelector('#btn-export-csv').onclick = function() {
        if(capturedData.length === 0) return alert("无数据记录");
        
        var csv = "\uFEFF分屏,指标名,数值序号,数值内容,颜色代码(RGB)\n";
        capturedData.forEach(function(indicator) {
            indicator.items.forEach(function(item) {
                csv += `${indicator.screen},${indicator.name.replace(/,/g,' ')},${item.id},"${item.val.replace(/"/g,'')}",${item.color}\n`;
            });
        });

        var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        var link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `TV_Record_${new Date().getTime()}.csv`;
        link.click();
    };

    // --- 5. 启动 ---
    updatePanel();
    var timer = setInterval(updatePanel, 1000);
    if (window.__TV_HOT_CONTEXT) window.__TV_HOT_CONTEXT.timer = timer;

})();