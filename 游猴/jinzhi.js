// ==UserScript==
// @name         TradingView 金指数据监控 V7.1 (颜色识别+拖动+对比+分析框版)
// @namespace    http://tampermonkey.net/
// @version      7.1
// @description  抓取数值颜色、支持面板拖动、左右分屏并排对比、分析框显示中轨和MACD
// @author       You
// @match        *://*.tradingview.com/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';
    console.log(">>> [云端 V7.1] 启动颜色对比监控 + 分析框...");

    // --- 0. 清理旧面板 ---
    var old = document.getElementById('tv-monitor-panel-v7');
    if(old) old.remove();
    var oldAnalysis = document.getElementById('tv-analysis-panel');
    if(oldAnalysis) oldAnalysis.remove();

    // --- 1. 主监控面板创建 ---
    var panel = document.createElement('div');
    panel.id = 'tv-monitor-panel-v7';
    panel.style.cssText = "position:fixed; top:100px; right:100px; width:400px; background:rgba(20, 20, 20, 0.95); color:#ecf0f1; font-family:'Consolas', monospace; font-size:12px; z-index:999999; border-radius:8px; border: 1px solid #444; box-shadow: 0 8px 20px rgba(0,0,0,0.6); display:flex; flex-direction:column; overflow:hidden; resize:both; min-width:300px; min-height:150px;";
    
    // 标题栏 (用于拖动)
    var header = document.createElement('div');
    header.style.cssText = "padding:8px; background:#2d3436; cursor:move; font-weight:bold; color:#00b894; display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #444; user-select:none;";
    header.innerHTML = "<span>⚖️ 金指系统多空共振 V7</span><span style='font-size:10px;color:#aaa'>按住拖动 | 右下角缩放</span>";
    panel.appendChild(header);

    // 录制控制栏
    var controlBar = document.createElement('div');
    controlBar.style.cssText = "display:flex; align-items:center; gap:8px; padding:6px 10px; background:#1a1a1a; border-bottom:1px solid #444;";
    controlBar.innerHTML = `
        <button id="btn-start" style="padding:4px 10px; border-radius:4px; font-size:11px; cursor:pointer; border:none; background:#27ae60; color:#fff;">▶️ 开始记录</button>
        <button id="btn-stop" style="padding:4px 10px; border-radius:4px; font-size:11px; cursor:pointer; border:none; background:#c0392b; color:#fff;" disabled>⏹️ 停止记录</button>
        <button id="btn-export" style="padding:4px 10px; border-radius:4px; font-size:11px; cursor:pointer; border:none; background:#2980b9; color:#fff;">📥 导出数据</button>
        <span id="record-status" style="font-size:10px; color:#888; margin-left:auto;">未开始</span>
    `;
    panel.appendChild(controlBar);

    // 记录统计栏
    var statsBar = document.createElement('div');
    statsBar.style.cssText = "display:flex; align-items:center; gap:15px; padding:4px 10px; background:#111; border-bottom:1px solid #444; font-size:11px;";
    statsBar.innerHTML = `
        <span>📊 已记录: <span id="record-count" style="color:#00bcd4; font-weight:bold;">0</span> 条</span>
        <span>⏱️ 时长: <span id="record-duration" style="color:#ffc107;">00:00:00</span></span>
        <span id="recording-indicator" style="display:none; color:#f44336;">● 录制中</span>
    `;
    panel.appendChild(statsBar);

    // 内容区
    var content = document.createElement('div');
    content.style.cssText = "padding:10px; max-height:500px; overflow-y:auto; flex:1;";
    panel.appendChild(content);

    document.body.appendChild(panel);

    // --- 2. 分析框面板创建 ---
    var analysisPanel = document.createElement('div');
    analysisPanel.id = 'tv-analysis-panel';
    analysisPanel.style.cssText = "position:fixed; top:100px; left:100px; width:420px; background:rgba(15, 15, 25, 0.98); color:#ecf0f1; font-family:'Consolas', monospace; font-size:12px; z-index:999998; border-radius:10px; border: 2px solid #e74c3c; box-shadow: 0 10px 30px rgba(231, 76, 60, 0.3); display:flex; flex-direction:column; overflow:hidden; resize:both; min-width:320px; min-height:200px;";

    var analysisHeader = document.createElement('div');
    analysisHeader.style.cssText = "padding:10px 14px; background:linear-gradient(135deg, #c0392b 0%, #e74c3c 100%); cursor:move; font-weight:bold; color:#fff; display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #922b21; user-select:none;";
    analysisHeader.innerHTML = "<span>🎯 分析框</span><span style='font-size:10px; opacity:0.8;'>按住拖动 | 右下角缩放</span>";
    analysisPanel.appendChild(analysisHeader);

    var analysisContent = document.createElement('div');
    analysisContent.id = 'analysis-content';
    analysisContent.style.cssText = "padding:12px; overflow-y:auto; flex:1;";
    analysisPanel.appendChild(analysisContent);

    document.body.appendChild(analysisPanel);

    // 注册给加载器清理
    if (window.__TV_HOT_CONTEXT) {
        window.__TV_HOT_CONTEXT.panel = panel;
        window.__TV_HOT_CONTEXT.analysisPanel = analysisPanel;
    }

    // --- 3. 拖动逻辑 (通用函数) ---
    function makeDraggable(panelEl, headerEl) {
        var isDragging = false;
        var offsetX, offsetY;
        headerEl.onmousedown = function(e) {
            isDragging = true;
            offsetX = e.clientX - panelEl.offsetLeft;
            offsetY = e.clientY - panelEl.offsetTop;
            panelEl.style.opacity = "0.7";
        };
        document.addEventListener('mousemove', function(e) {
            if (isDragging) {
                panelEl.style.left = (e.clientX - offsetX) + "px";
                panelEl.style.top = (e.clientY - offsetY) + "px";
                panelEl.style.right = "auto";
            }
        });
        document.addEventListener('mouseup', function() {
            if (isDragging) {
                isDragging = false;
                panelEl.style.opacity = "1";
            }
        });
    }

    // 为两个面板应用拖动
    makeDraggable(panel, header);
    makeDraggable(analysisPanel, analysisHeader);

    // --- 4. 记录功能变量 ---
    var recordedData = [];
    var isRecording = false;
    var recordStartTime = null;
    var durationTimer = null;
    var historyData = {
        left: { fastLine: [] },
        right: { fastLine: [] }
    };

    // --- 5. 辅助函数 ---
    function getColorName(rgbStr) {
        if(!rgbStr) return "N/A";
        if(rgbStr.includes("255, 82, 82")) return "🔴红";
        if(rgbStr.includes("0, 255")) return "🟢绿"; 
        if(rgbStr.includes("33, 150, 243")) return "🔵蓝";
        if(rgbStr.includes("255, 255, 255")) return "⚪白";
        if(rgbStr.includes("255, 235, 59")) return "🟡黄";
        return "🎨色"; 
    }

    function rgbToHex(rgb) {
        if(!rgb || !rgb.startsWith('rgb')) return '#fff';
        var sep = rgb.indexOf(",") > -1 ? "," : " ";
        rgb = rgb.substr(4).split(")")[0].split(sep);
        var r = (+rgb[0]).toString(16), g = (+rgb[1]).toString(16), b = (+rgb[2]).toString(16);
        if (r.length == 1) r = "0" + r;
        if (g.length == 1) g = "0" + g;
        if (b.length == 1) b = "0" + b;
        return "#" + r + g + b;
    }

    function formatDuration(ms) {
        var s = Math.floor(ms / 1000);
        var h = Math.floor(s / 3600);
        var m = Math.floor((s % 3600) / 60);
        var sec = s % 60;
        return [h, m, sec].map(function(n) { return n.toString().padStart(2, '0'); }).join(':');
    }

    // --- 6. 分析框更新逻辑 ---
    function updateAnalysisPanel(chartData) {
        var html = '';
        
        var screens = [
            { name: '左屏', data: chartData[0], key: 'left' },
            { name: '右屏', data: chartData[1], key: 'right' }
        ];

        screens.forEach(function(screen) {
            if (!screen.data || screen.data.length === 0) {
                html += "<div style='background:rgba(0,0,0,0.4); border-radius:6px; padding:10px; margin-bottom:10px; border:1px solid #555;'>";
                html += "<div style='color:#ffd700; font-weight:bold; margin-bottom:8px;'>📊 " + screen.name + "</div>";
                html += "<div style='color:#888;'>⏳ 等待数据...</div></div>";
                return;
            }

            html += "<div style='background:rgba(0,0,0,0.4); border-radius:6px; padding:10px; margin-bottom:10px; border:1px solid #555;'>";
            html += "<div style='color:#ffd700; font-weight:bold; margin-bottom:8px; padding-bottom:5px; border-bottom:1px solid #444;'>📊 " + screen.name + "分析</div>";

            // 1. 主图分析 - 中轨长度 (假设第一个指标是主图)
            var mainChart = screen.data[0];
            if (mainChart && mainChart.data && mainChart.data.length >= 4) {
                var id1 = parseFloat(mainChart.data[0].val) || 0;
                var id4 = parseFloat(mainChart.data[3].val) || 0;
                var railLength = (id4 - id1).toFixed(2);
                var railColor = mainChart.data[0].color || '#fff';
                var railHex = rgbToHex(railColor);

                html += "<div style='margin-bottom:8px;'>";
                html += "<span style='color:#aaa;'>📈 主图中轨:</span> ";
                html += "<span style='color:" + railHex + "; font-size:16px; font-weight:bold;'>" + railLength + "</span>";
                html += "<span style='color:#666; font-size:10px; margin-left:8px;'>(ID4:" + id4.toFixed(2) + " - ID1:" + id1.toFixed(2) + ")</span>";
                html += "</div>";
            }

            // 2. MACD分析 (假设第三个指标是MACD，即附图2)
            var macdChart = screen.data[2];
            if (macdChart && macdChart.data && macdChart.data.length >= 11) {
                var momentum = parseFloat(macdChart.data[8].val) || 0;  // ID9 动能柱
                var fastLine = parseFloat(macdChart.data[9].val) || 0;  // ID10 快线
                var slowLine = parseFloat(macdChart.data[10].val) || 0; // ID11 慢线
                
                var isGoldenCross = fastLine > slowLine;
                var crossType = isGoldenCross ? '金叉' : '死叉';
                var crossEmoji = isGoldenCross ? '🌟' : '💀';
                var crossBg = isGoldenCross 
                    ? 'background:linear-gradient(90deg, rgba(255,215,0,0.2), transparent); border-left:3px solid #ffd700;'
                    : 'background:linear-gradient(90deg, rgba(138,43,226,0.2), transparent); border-left:3px solid #8a2be2;';

                var trendColor = momentum >= 0 ? '#00ff7f' : '#ff5252';
                var trendText = momentum >= 0 ? '📈 涨' : '📉 跌';

                // 保存历史快线数据判断趋势
                historyData[screen.key].fastLine.push(fastLine);
                if (historyData[screen.key].fastLine.length > 5) {
                    historyData[screen.key].fastLine.shift();
                }

                // 判断快线趋势
                var fastLineTrend = '';
                var fastHistory = historyData[screen.key].fastLine;
                if (fastHistory.length >= 2) {
                    var lastFast = fastHistory[fastHistory.length - 2];
                    if (isGoldenCross) {
                        if (fastLine >= lastFast) {
                            fastLineTrend = '<span style="color:#00ff7f;">↑持续上涨</span>';
                        } else {
                            fastLineTrend = '<span style="color:#ff9800;">⚠️ 快线减小，可能形成死叉</span>';
                        }
                    } else {
                        if (fastLine <= lastFast) {
                            fastLineTrend = '<span style="color:#ff5252;">↓持续下跌</span>';
                        } else {
                            fastLineTrend = '<span style="color:#ff9800;">⚠️ 快线变大，可能形成金叉</span>';
                        }
                    }
                }

                html += "<div style='padding:8px; margin-bottom:8px; border-radius:4px; " + crossBg + "'>";
                html += "<div style='margin-bottom:5px;'>";
                html += "<span style='font-size:14px; font-weight:bold;'>" + crossEmoji + " " + crossType + "</span>";
                html += "<span style='color:" + trendColor + "; margin-left:10px; font-weight:bold; text-shadow:0 0 8px " + trendColor + ";'>" + trendText + "</span>";
                html += "</div>";
                
                html += "<div style='display:grid; grid-template-columns:1fr 1fr 1fr; gap:5px; font-size:11px;'>";
                html += "<div>动能柱(9): <span style='color:" + trendColor + "; font-weight:bold;'>" + momentum.toFixed(2) + "</span></div>";
                html += "<div style='color:#2196f3;'>快线(10): " + fastLine.toFixed(2) + "</div>";
                html += "<div style='color:#ffeb3b;'>慢线(11): " + slowLine.toFixed(2) + "</div>";
                html += "</div>";
                
                if (fastLineTrend) {
                    html += "<div style='margin-top:5px; font-size:11px;'>" + fastLineTrend + "</div>";
                }
                html += "</div>";
            }

            html += "</div>";
        });

        var now = new Date();
        var timeStr = now.getHours() + ":" + String(now.getMinutes()).padStart(2,'0') + ":" + String(now.getSeconds()).padStart(2,'0');
        html += "<div style='text-align:right; font-size:10px; color:#666;'>最后分析: " + timeStr + "</div>";

        analysisContent.innerHTML = html;
    }

    // --- 7. 核心扫描与对比逻辑 ---
    function updatePanel() {
        var widgets = document.querySelectorAll('.chart-widget');
        if (widgets.length < 2) {
            content.innerHTML = "<div style='color:orange'>⚠️ 需要至少 2 个分屏才能对比</div>";
            analysisContent.innerHTML = "<div style='color:orange'>⚠️ 等待分屏数据...</div>";
            return;
        }

        var chartData = []; 

        widgets.forEach(function(widget, wIndex) {
            if(wIndex > 1) return;
            
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

        // 更新分析框
        updateAnalysisPanel(chartData);

        // 如果正在记录，保存数据
        if (isRecording) {
            var snapshot = {
                timestamp: new Date().toISOString(),
                left: JSON.parse(JSON.stringify(chartData[0] || [])),
                right: JSON.parse(JSON.stringify(chartData[1] || []))
            };
            recordedData.push(snapshot);
            document.getElementById('record-count').textContent = recordedData.length;
        }

        // --- 生成对比表格 ---
        var html = "";
        var maxRows = Math.max(chartData[0]?.length || 0, chartData[1]?.length || 0);

        for(var i=0; i<maxRows; i++) {
            var leftItem = chartData[0] ? chartData[0][i] : null;
            var rightItem = chartData[1] ? chartData[1][i] : null;
            
            var rowName = leftItem ? leftItem.name : (rightItem ? rightItem.name : "未知区域");
            
            html += "<div style='background:#333; padding:4px; margin-top:8px; font-weight:bold; color:#ffeaa7; border-radius:4px;'>📊 " + rowName + " (指标 " + (i+1) + ")</div>";
            
            // 表头 - 修改为只显示左屏右屏
            html += "<div style='display:grid; grid-template-columns: 30px 1fr 1fr; gap:2px; font-size:10px; color:#aaa; margin-bottom:2px;'>";
            html += "<div>ID</div><div>左屏</div><div>右屏</div></div>";

            var maxVals = Math.max(leftItem?.data.length || 0, rightItem?.data.length || 0);
            
            for(var j=0; j<maxVals; j++) {
                var lData = leftItem && leftItem.data[j] ? leftItem.data[j] : {val:'-', color:''};
                var rData = rightItem && rightItem.data[j] ? rightItem.data[j] : {val:'-', color:''};

                var lDot = "<span style='display:inline-block;width:8px;height:8px;border-radius:50%;background:" + rgbToHex(lData.color) + ";margin-right:4px;'></span>";
                var rDot = "<span style='display:inline-block;width:8px;height:8px;border-radius:50%;background:" + rgbToHex(rData.color) + ";margin-right:4px;'></span>";

                var isColorSame = (lData.color === rData.color) && lData.color !== '';
                var bgStyle = isColorSame ? "background:rgba(46, 204, 113, 0.1);" : "";

                html += "<div style='display:grid; grid-template-columns: 30px 1fr 1fr; gap:2px; align-items:center; border-bottom:1px solid #444; padding:2px 0; " + bgStyle + "'>";
                html += "<div style='color:#74b9ff; font-weight:bold;'>" + (j+1) + "</div>";
                html += "<div style='color:" + rgbToHex(lData.color) + "'>" + lDot + lData.val + "</div>";
                html += "<div style='color:" + rgbToHex(rData.color) + "'>" + rDot + rData.val + "</div>";
                html += "</div>";
            }
        }

        var now = new Date();
        var timeStr = now.getHours() + ":" + String(now.getMinutes()).padStart(2,'0') + ":" + String(now.getSeconds()).padStart(2,'0');
        html += "<div style='text-align:right; font-size:10px; color:#666; margin-top:5px;'>最后刷新: " + timeStr + "</div>";
        
        content.innerHTML = html;
    }

    // --- 8. 录制控制函数 ---
    function startRecording() {
        isRecording = true;
        recordStartTime = Date.now();
        recordedData = [];
        
        document.getElementById('btn-start').disabled = true;
        document.getElementById('btn-stop').disabled = false;
        document.getElementById('btn-start').style.opacity = '0.5';
        document.getElementById('btn-stop').style.opacity = '1';
        
        document.getElementById('record-status').textContent = '记录中...';
        document.getElementById('record-status').style.color = '#4caf50';
        document.getElementById('recording-indicator').style.display = 'inline';
        
        durationTimer = setInterval(function() {
            var elapsed = Date.now() - recordStartTime;
            document.getElementById('record-duration').textContent = formatDuration(elapsed);
        }, 1000);
    }

    function stopRecording() {
        isRecording = false;
        clearInterval(durationTimer);
        
        document.getElementById('btn-start').disabled = false;
        document.getElementById('btn-stop').disabled = true;
        document.getElementById('btn-start').style.opacity = '1';
        document.getElementById('btn-stop').style.opacity = '0.5';
        
        document.getElementById('record-status').textContent = '已停止 (' + recordedData.length + '条)';
        document.getElementById('record-status').style.color = '#888';
        document.getElementById('recording-indicator').style.display = 'none';
    }

    function exportData() {
        if (recordedData.length === 0) {
            alert('没有可导出的数据！请先开始记录。');
            return;
        }

        // 生成CSV
        var csv = '\uFEFF'; // UTF-8 BOM
        csv += '时间戳,屏幕,指标名称,序号,数值,颜色RGB,颜色名称\n';

        recordedData.forEach(function(snapshot) {
            var ts = snapshot.timestamp;
            
            ['left', 'right'].forEach(function(side, sideIdx) {
                var screenName = sideIdx === 0 ? '左屏' : '右屏';
                var data = snapshot[side];
                
                if (data && data.length > 0) {
                    data.forEach(function(indicator) {
                        if (indicator.data) {
                            indicator.data.forEach(function(item, idx) {
                                var colorName = getColorName(item.color);
                                csv += '"' + ts + '","' + screenName + '","' + indicator.name + '",' + (idx + 1) + ',"' + item.val + '","' + item.color + '","' + colorName + '"\n';
                            });
                        }
                    });
                }
            });
        });

        // 下载CSV
        var blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        var now = new Date();
        var filename = '金指数据_' + now.getFullYear() + String(now.getMonth()+1).padStart(2,'0') + String(now.getDate()).padStart(2,'0') + '_' + String(now.getHours()).padStart(2,'0') + String(now.getMinutes()).padStart(2,'0') + '.csv';
        
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        // 下载JSON
        var jsonBlob = new Blob([JSON.stringify(recordedData, null, 2)], { type: 'application/json' });
        var jsonUrl = URL.createObjectURL(jsonBlob);
        var jsonA = document.createElement('a');
        jsonA.href = jsonUrl;
        jsonA.download = filename.replace('.csv', '.json');
        document.body.appendChild(jsonA);
        jsonA.click();
        document.body.removeChild(jsonA);
        URL.revokeObjectURL(jsonUrl);

        alert('数据已导出！\n- CSV文件: ' + filename + '\n- JSON文件: ' + filename.replace('.csv', '.json') + '\n共 ' + recordedData.length + ' 条记录');
    }

    // --- 9. 绑定按钮事件 ---
    setTimeout(function() {
        document.getElementById('btn-start').addEventListener('click', startRecording);
        document.getElementById('btn-stop').addEventListener('click', stopRecording);
        document.getElementById('btn-export').addEventListener('click', exportData);
    }, 100);

    // --- 10. 启动定时刷新 ---
    updatePanel();
    var timer = setInterval(updatePanel, 1000);
    if (window.__TV_HOT_CONTEXT) window.__TV_HOT_CONTEXT.timer = timer;

})();