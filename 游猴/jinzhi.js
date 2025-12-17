// ==UserScript==
// @name         TradingView 金指数据监控 V7.6 (自适应窗口版)
// @namespace    http://tampermonkey.net/
// @version      7.7
// @description  抓取数值颜色、支持面板拖动、四角缩放、左右分屏对比、快线状态分析、窗口自适应、确认按钮
// @author       You
// @match        *://*.tradingview.com/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';
    console.log(">>> [云端 V7.7] 启动快线状态分析监控（确认按钮版）...");

    // --- 0. 清理旧面板 ---
    var old = document.getElementById('tv-monitor-panel-v7');
    if(old) old.remove();
    var oldAnalysis = document.getElementById('tv-analysis-panel');
    if(oldAnalysis) oldAnalysis.remove();
    var oldStyle = document.getElementById('tv-monitor-style');
    if(oldStyle) oldStyle.remove();

    // --- 全局配置 ---
    var config = {
        simpleMode: false,
        analysisMode: 'realtime',
        periodTime: 5000,
        updateInterval: 500
    };

    // --- 历史数据存储 ---
    var historyData = {
        left: { 
            fastLine: [], 
            momentum: [],
            timestamps: []
        },
        right: { 
            fastLine: [], 
            momentum: [],
            timestamps: []
        }
    };
    var maxHistoryLength = 1000;

    // --- 添加全局样式 ---
    var globalStyle = document.createElement('style');
    globalStyle.id = 'tv-monitor-style';
    globalStyle.textContent = `
        .tv-resize-handle {
            position: absolute;
            z-index: 10;
        }
        .tv-resize-nw { top: 0; left: 0; width: 12px; height: 12px; cursor: nw-resize; }
        .tv-resize-ne { top: 0; right: 0; width: 12px; height: 12px; cursor: ne-resize; }
        .tv-resize-sw { bottom: 0; left: 0; width: 12px; height: 12px; cursor: sw-resize; }
        .tv-resize-se { bottom: 0; right: 0; width: 12px; height: 12px; cursor: se-resize; }
        .tv-resize-n { top: 0; left: 12px; right: 12px; height: 5px; cursor: n-resize; }
        .tv-resize-s { bottom: 0; left: 12px; right: 12px; height: 5px; cursor: s-resize; }
        .tv-resize-w { left: 0; top: 12px; bottom: 12px; width: 5px; cursor: w-resize; }
        .tv-resize-e { right: 0; top: 12px; bottom: 12px; width: 5px; cursor: e-resize; }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.7; } }
        @keyframes strongPulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.8; transform: scale(1.02); } }
        .status-up { color: #00ff7f; text-shadow: 0 0 5px rgba(0,255,127,0.5); }
        .status-down { color: #ff5252; text-shadow: 0 0 5px rgba(255,82,82,0.5); }
        .status-flat { color: #ffc107; }
        .energy-warning { background: rgba(255,152,0,0.2); border: 1px solid #ff9800; border-radius: 4px; padding: 4px 6px; margin-top: 4px; }
        
        /* 自适应内容样式 */
        .tv-panel-content {
            display: flex;
            flex-direction: column;
            flex: 1;
            overflow-y: auto;
            overflow-x: hidden;
            min-height: 0;
        }
        .tv-panel-content::-webkit-scrollbar {
            width: 6px;
        }
        .tv-panel-content::-webkit-scrollbar-thumb {
            background: #555;
            border-radius: 3px;
        }
        .tv-panel-content::-webkit-scrollbar-track {
            background: #222;
        }
        .tv-analysis-box {
            flex-shrink: 0;
            margin-bottom: 6px;
        }
        .tv-data-grid {
            display: grid;
            gap: 4px;
        }
        .tv-screen-box {
            background: #222;
            padding: 8px;
            border-radius: 5px;
            border: 1px solid #444;
        }
        .tv-resonance-box {
            flex-shrink: 0;
            margin-top: 6px;
        }
    `;
    document.head.appendChild(globalStyle);

    // --- 1. 主监控面板创建 (默认隐藏) ---
    var panel = document.createElement('div');
    panel.id = 'tv-monitor-panel-v7';
    panel.style.cssText = "position:fixed; top:100px; right:20px; width:380px; height:400px; background:rgba(20,20,20,0.95); color:#ecf0f1; font-family:'Consolas',monospace; font-size:12px; z-index:999999; border-radius:8px; border:1px solid #444; box-shadow:0 8px 20px rgba(0,0,0,0.6); display:none; flex-direction:column; overflow:hidden; min-width:200px; min-height:150px;";
    
    // 添加缩放手柄
    var resizeHandles = ['nw', 'ne', 'sw', 'se', 'n', 's', 'w', 'e'];
    resizeHandles.forEach(function(dir) {
        var handle = document.createElement('div');
        handle.className = 'tv-resize-handle tv-resize-' + dir;
        handle.dataset.direction = dir;
        panel.appendChild(handle);
    });

    var header = document.createElement('div');
    header.id = 'panel-header';
    header.style.cssText = "padding:6px 10px; background:#2d3436; cursor:move; font-weight:bold; color:#00b894; display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #444; user-select:none;";
    header.innerHTML = "<span>⚖️ 原始数据 V7</span><button id='btn-close-raw' style='background:#c0392b;border:none;color:#fff;padding:2px 8px;border-radius:3px;cursor:pointer;font-size:10px;'>✕ 关闭</button>";
    panel.appendChild(header);

    var controlBar = document.createElement('div');
    controlBar.style.cssText = "display:flex; align-items:center; gap:6px; padding:5px 8px; background:#1a1a1a; border-bottom:1px solid #444; flex-wrap:wrap;";
    controlBar.innerHTML = '<button id="btn-start" style="padding:3px 8px;border-radius:3px;font-size:10px;cursor:pointer;border:none;background:#27ae60;color:#fff;">▶️ 记录</button><button id="btn-stop" style="padding:3px 8px;border-radius:3px;font-size:10px;cursor:pointer;border:none;background:#c0392b;color:#fff;" disabled>⏹️ 停止</button><button id="btn-export" style="padding:3px 8px;border-radius:3px;font-size:10px;cursor:pointer;border:none;background:#2980b9;color:#fff;">📥 导出</button><span id="record-status" style="font-size:10px;color:#888;margin-left:auto;">未记录</span>';
    panel.appendChild(controlBar);

    var statsBar = document.createElement('div');
    statsBar.style.cssText = "display:flex; align-items:center; gap:10px; padding:3px 8px; background:#111; border-bottom:1px solid #444; font-size:10px;";
    statsBar.innerHTML = '<span>📊 <span id="record-count" style="color:#00bcd4;">0</span>条</span><span>⏱️ <span id="record-duration" style="color:#ffc107;">00:00:00</span></span><span id="recording-indicator" style="display:none;color:#f44336;">● 录制中</span>';
    panel.appendChild(statsBar);

    var content = document.createElement('div');
    content.id = 'panel-content';
    content.className = 'tv-panel-content';
    content.style.cssText = "padding:8px;";
    panel.appendChild(content);

    document.body.appendChild(panel);

    // --- 2. 分析框面板创建 ---
    var analysisPanel = document.createElement('div');
    analysisPanel.id = 'tv-analysis-panel';
    analysisPanel.style.cssText = "position:fixed; top:60px; left:20px; width:360px; height:450px; background:rgba(15,15,25,0.98); color:#ecf0f1; font-family:'Consolas',monospace; font-size:11px; z-index:999998; border-radius:8px; border:2px solid #e74c3c; box-shadow:0 8px 25px rgba(231,76,60,0.3); display:flex; flex-direction:column; overflow:hidden; min-width:250px; min-height:200px;";

    // 添加缩放手柄到分析框
    resizeHandles.forEach(function(dir) {
        var handle = document.createElement('div');
        handle.className = 'tv-resize-handle tv-resize-' + dir;
        handle.dataset.direction = dir;
        analysisPanel.appendChild(handle);
    });

    var analysisHeader = document.createElement('div');
    analysisHeader.id = 'analysis-header';
    analysisHeader.style.cssText = "padding:6px 10px; background:linear-gradient(135deg,#c0392b,#e74c3c); cursor:move; font-weight:bold; color:#fff; display:flex; justify-content:space-between; align-items:center; user-select:none;";
    analysisHeader.innerHTML = "<span>🎯 分析框</span><span style='font-size:9px;opacity:0.7;'>拖动标题移动 | 边角缩放</span>";
    analysisPanel.appendChild(analysisHeader);

    // 模式选择栏
    var modeBar = document.createElement('div');
    modeBar.style.cssText = "display:flex; align-items:center; gap:4px; padding:5px 8px; background:#1a1a1a; border-bottom:1px solid #444;";
    modeBar.innerHTML = '' +
        '<button id="btn-realtime" style="padding:3px 8px;border-radius:3px;font-size:10px;cursor:pointer;border:2px solid #27ae60;background:#27ae60;color:#fff;">⚡实时</button>' +
        '<button id="btn-period" style="padding:3px 8px;border-radius:3px;font-size:10px;cursor:pointer;border:2px solid #555;background:#333;color:#aaa;">📊周期</button>' +
        '<select id="select-period" style="padding:2px 4px;border-radius:3px;border:1px solid #555;background:#333;color:#fff;font-size:10px;">' +
        '<option value="60000">1分钟</option>' +
        '<option value="120000">2分钟</option>' +
        '<option value="180000">3分钟</option>' +
        '<option value="240000">4分钟</option>' +
        '<option value="300000" selected>5分钟</option>' +
        '<option value="600000">10分钟</option>' +
        '</select>' +
        '<span style="margin-left:auto;font-size:9px;color:#666;">刷新:</span>' +
        '<select id="select-interval" style="padding:2px;border-radius:3px;border:1px solid #555;background:#333;color:#fff;font-size:9px;">' +
        '<option value="200">200毫秒</option>' +
        '<option value="500">500毫秒</option>' +
        '<option value="1000">1秒</option>' +
        '<option value="5000" selected>5秒</option>' +
        '<option value="10000">10秒</option>' +
        '<option value="30000">30秒</option>' +
        '<option value="60000">1分钟</option>' +
        '</select>';
    analysisPanel.appendChild(modeBar);

    // 控制栏
    var analysisControlBar = document.createElement('div');
    analysisControlBar.id = 'analysis-control-bar';
    analysisControlBar.style.cssText = "display:flex; flex-wrap:wrap; align-items:center; gap:4px; padding:5px 8px; background:#222; border-bottom:1px solid #444;";
    analysisControlBar.innerHTML = '' +
        '<button id="btn-toggle-mode" style="padding:2px 8px;border-radius:3px;font-size:10px;cursor:pointer;border:none;background:#9b59b6;color:#fff;">📊 完整</button>' +
        '<button id="btn-toggle-raw" style="padding:2px 8px;border-radius:3px;font-size:10px;cursor:pointer;border:none;background:#8e44ad;color:#fff;">📋 原始</button>';
    analysisPanel.appendChild(analysisControlBar);

    // 状态栏
    var analysisStatusBar = document.createElement('div');
    analysisStatusBar.style.cssText = "display:flex; justify-content:space-between; align-items:center; padding:3px 8px; background:#111; border-bottom:1px solid #444; font-size:10px;";
    analysisStatusBar.innerHTML = '<span id="alert-status" style="color:#888;">等待数据...</span><span id="update-time" style="color:#666;"></span>';
    analysisPanel.appendChild(analysisStatusBar);

    var analysisContent = document.createElement('div');
    analysisContent.id = 'analysis-content';
    analysisContent.className = 'tv-panel-content';
    analysisContent.style.cssText = "padding:8px;";
    analysisPanel.appendChild(analysisContent);

    document.body.appendChild(analysisPanel);

    // 注册给加载器清理
    if (window.__TV_HOT_CONTEXT) {
        window.__TV_HOT_CONTEXT.panel = panel;
        window.__TV_HOT_CONTEXT.analysisPanel = analysisPanel;
    }

    // --- 3. 拖动逻辑 ---
    function makeDraggable(panelEl, headerEl) {
        var isDragging = false;
        var offsetX, offsetY;
        headerEl.addEventListener('mousedown', function(e) {
            if (e.target.tagName === 'BUTTON') return;
            isDragging = true;
            offsetX = e.clientX - panelEl.offsetLeft;
            offsetY = e.clientY - panelEl.offsetTop;
            panelEl.style.opacity = "0.8";
        });
        document.addEventListener('mousemove', function(e) {
            if (isDragging) {
                var newLeft = e.clientX - offsetX;
                var newTop = e.clientY - offsetY;
                newLeft = Math.max(0, Math.min(newLeft, window.innerWidth - 100));
                newTop = Math.max(0, Math.min(newTop, window.innerHeight - 50));
                panelEl.style.left = newLeft + "px";
                panelEl.style.top = newTop + "px";
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

    // --- 4. 四角缩放逻辑 ---
    function makeResizable(panelEl) {
        var isResizing = false;
        var currentDirection = '';
        var startX, startY, startWidth, startHeight, startLeft, startTop;
        var minWidth = 280;
        var minHeight = 200;

        panelEl.querySelectorAll('.tv-resize-handle').forEach(function(handle) {
            handle.addEventListener('mousedown', function(e) {
                e.preventDefault();
                e.stopPropagation();
                isResizing = true;
                currentDirection = handle.dataset.direction;
                startX = e.clientX;
                startY = e.clientY;
                startWidth = panelEl.offsetWidth;
                startHeight = panelEl.offsetHeight;
                startLeft = panelEl.offsetLeft;
                startTop = panelEl.offsetTop;
                panelEl.style.opacity = "0.9";
            });
        });

        document.addEventListener('mousemove', function(e) {
            if (!isResizing) return;
            
            var dx = e.clientX - startX;
            var dy = e.clientY - startY;
            var newWidth = startWidth;
            var newHeight = startHeight;
            var newLeft = startLeft;
            var newTop = startTop;

            // 处理各个方向
            if (currentDirection.includes('e')) {
                newWidth = Math.max(minWidth, startWidth + dx);
            }
            if (currentDirection.includes('w')) {
                newWidth = Math.max(minWidth, startWidth - dx);
                if (newWidth > minWidth) {
                    newLeft = startLeft + dx;
                }
            }
            if (currentDirection.includes('s')) {
                newHeight = Math.max(minHeight, startHeight + dy);
            }
            if (currentDirection.includes('n')) {
                newHeight = Math.max(minHeight, startHeight - dy);
                if (newHeight > minHeight) {
                    newTop = startTop + dy;
                }
            }

            panelEl.style.width = newWidth + 'px';
            panelEl.style.height = newHeight + 'px';
            panelEl.style.left = newLeft + 'px';
            panelEl.style.top = newTop + 'px';
            panelEl.style.right = 'auto';
            panelEl.style.maxHeight = 'none';
        });

        document.addEventListener('mouseup', function() {
            if (isResizing) {
                isResizing = false;
                panelEl.style.opacity = "1";
            }
        });
    }

    makeDraggable(panel, document.getElementById('panel-header'));
    makeDraggable(analysisPanel, document.getElementById('analysis-header'));
    makeResizable(panel);
    makeResizable(analysisPanel);

    // --- 5. 记录功能变量 ---
    var recordedData = [];
    var isRecording = false;
    var recordStartTime = null;
    var durationTimer = null;
    var updateTimer = null;

    // --- 6. 辅助函数 ---
    function parseNumber(str) {
        if (!str) return 0;
        var cleaned = str.replace(/−/g, '-').replace(/,/g, '').trim();
        var num = parseFloat(cleaned);
        return isNaN(num) ? 0 : num;
    }

    function getColorName(rgbStr) {
        if(!rgbStr) return "N/A";
        if(rgbStr.includes("254, 67, 101") || rgbStr.includes("255, 0, 0") || rgbStr.includes("255, 80, 112")) return "🔴";
        if(rgbStr.includes("0, 255") || rgbStr.includes("82, 189") || rgbStr.includes("82, 154")) return "🟢"; 
        if(rgbStr.includes("33, 150, 243") || rgbStr.includes("41, 98, 255") || rgbStr.includes("34, 107, 255")) return "🔵";
        if(rgbStr.includes("255, 255, 255")) return "⚪";
        if(rgbStr.includes("255, 235, 59") || rgbStr.includes("255, 213, 0") || rgbStr.includes("230, 255, 41")) return "🟡";
        if(rgbStr.includes("82, 174, 255")) return "🔵";
        return "🎨"; 
    }

    function rgbToHex(rgb) {
        if(!rgb || !rgb.startsWith('rgb')) return '#fff';
        try {
            var sep = rgb.indexOf(",") > -1 ? "," : " ";
            rgb = rgb.substr(4).split(")")[0].split(sep);
            var r = (+rgb[0]).toString(16), g = (+rgb[1]).toString(16), b = (+rgb[2]).toString(16);
            if (r.length == 1) r = "0" + r;
            if (g.length == 1) g = "0" + g;
            if (b.length == 1) b = "0" + b;
            return "#" + r + g + b;
        } catch(e) {
            return '#fff';
        }
    }

    function formatDuration(ms) {
        var s = Math.floor(ms / 1000);
        var h = Math.floor(s / 3600);
        var m = Math.floor((s % 3600) / 60);
        var sec = s % 60;
        return [h, m, sec].map(function(n) { return n.toString().padStart(2, '0'); }).join(':');
    }

    function getTimeStr() {
        var now = new Date();
        return now.getHours() + ":" + String(now.getMinutes()).padStart(2,'0') + ":" + String(now.getSeconds()).padStart(2,'0');
    }

    // 获取快线状态文字
    function getFastLineStatus(change) {
        if (change > 0.0001) {
            return { text: '↑上涨', class: 'status-up', simple: '↑涨' };
        } else if (change < -0.0001) {
            return { text: '↓下跌', class: 'status-down', simple: '↓跌' };
        } else {
            return { text: '→平缓', class: 'status-flat', simple: '→平' };
        }
    }

    // 获取动能柱状态
    function getMomentumStatus(momentum, change) {
        var side = momentum >= 0 ? '多方' : '空方';
        var sideColor = momentum >= 0 ? '#00ff7f' : '#ff5252';
        var status = '';
        
        if (momentum >= 0) {
            if (change > 0.0001) {
                status = '放量📈';
            } else if (change < -0.0001) {
                status = '缩量📉';
            } else {
                status = '持平→';
            }
        } else {
            if (change < -0.0001) {
                status = '放量📉';
            } else if (change > 0.0001) {
                status = '缩量📈';
            } else {
                status = '持平→';
            }
        }
        
        return { side: side, status: status, color: sideColor };
    }

    // --- 7. 周期分析函数 ---
    function getPeriodChange(key, dataType) {
        var now = Date.now();
        var periodStart = now - config.periodTime;
        var data = historyData[key];
        
        if (!data || !data.timestamps || data.timestamps.length < 2) {
            return { change: 0, startVal: 0, endVal: 0, count: 0 };
        }
        
        var startIdx = -1;
        for (var i = 0; i < data.timestamps.length; i++) {
            if (data.timestamps[i] >= periodStart) {
                startIdx = Math.max(0, i - 1);
                break;
            }
        }
        
        if (startIdx === -1) startIdx = 0;
        
        var values = data[dataType];
        if (!values || values.length < 2) {
            return { change: 0, startVal: 0, endVal: 0, count: 0 };
        }
        
        var startVal = values[startIdx];
        var endVal = values[values.length - 1];
        var change = endVal - startVal;
        var count = values.length - startIdx;
        
        return { change: change, startVal: startVal, endVal: endVal, count: count };
    }

    // --- 8. 分析框更新逻辑 ---
    function updateAnalysisPanel(chartData) {
        var html = '';
        var analysisResults = { left: null, right: null };
        var now = Date.now();
        
        var screens = [
            { name: '左屏', data: chartData[0], key: 'left' },
            { name: '右屏', data: chartData[1], key: 'right' }
        ];

        screens.forEach(function(screen) {
            var result = { 
                fastLineStatus: null,
                fastLineChange: 0,
                momentumStatus: null,
                momentumChange: 0,
                isGoldenCross: false,
                energyWarning: null
            };

            if (!screen.data || screen.data.length === 0) {
                html += "<div style='background:#222;padding:6px;margin-bottom:4px;border-radius:4px;border-left:3px solid #666;'>";
                html += "<b style='color:#ffd700;'>" + screen.name + "</b> <span style='color:#888;'>等待数据...</span></div>";
                analysisResults[screen.key] = result;
                return;
            }

            // 解析数据
            var mainChart = screen.data[0];
            var macdChart = screen.data[2];
            
            var railLength = 0, railHex = '#fff';
            var momentum = 0, fastLine = 0, slowLine = 0;
            var isGoldenCross = false;
            var fastLineChange = 0;
            var momentumChange = 0;

            // 主图中轨
            if (mainChart && mainChart.data && mainChart.data.length >= 4) {
                var id1 = parseNumber(mainChart.data[0].val);
                var id4 = parseNumber(mainChart.data[3].val);
                railLength = (id4 - id1).toFixed(3);
                railHex = rgbToHex(mainChart.data[0].color);
            }

            // MACD
            if (macdChart && macdChart.data && macdChart.data.length >= 11) {
                momentum = parseNumber(macdChart.data[8].val);
                fastLine = parseNumber(macdChart.data[9].val);
                slowLine = parseNumber(macdChart.data[10].val);
                isGoldenCross = fastLine > slowLine;
                
                result.isGoldenCross = isGoldenCross;

                // 保存历史数据
                historyData[screen.key].fastLine.push(fastLine);
                historyData[screen.key].momentum.push(momentum);
                historyData[screen.key].timestamps.push(now);
                
                if (historyData[screen.key].fastLine.length > maxHistoryLength) {
                    historyData[screen.key].fastLine.shift();
                    historyData[screen.key].momentum.shift();
                    historyData[screen.key].timestamps.shift();
                }

                // 计算变化
                if (config.analysisMode === 'period') {
                    var fastPeriod = getPeriodChange(screen.key, 'fastLine');
                    var momentumPeriod = getPeriodChange(screen.key, 'momentum');
                    fastLineChange = fastPeriod.change;
                    momentumChange = momentumPeriod.change;
                } else {
                    var fh = historyData[screen.key].fastLine;
                    var mh = historyData[screen.key].momentum;
                    if (fh.length >= 2) {
                        fastLineChange = fastLine - fh[fh.length - 2];
                    }
                    if (mh.length >= 2) {
                        momentumChange = momentum - mh[mh.length - 2];
                    }
                }

                result.fastLineChange = fastLineChange;
                result.momentumChange = momentumChange;
                result.fastLineStatus = getFastLineStatus(fastLineChange);
                result.momentumStatus = getMomentumStatus(momentum, momentumChange);

                // 能量警告判断
                if (isGoldenCross && fastLineChange <= 0) {
                    result.energyWarning = '⚠️ 金叉能量不足！快线' + (fastLineChange < -0.0001 ? '下跌' : '平缓') + '，注意变盘！';
                } else if (!isGoldenCross && fastLineChange >= 0 && historyData[screen.key].fastLine.length > 2) {
                    result.energyWarning = '⚠️ 死叉能量不足！快线' + (fastLineChange > 0.0001 ? '上涨' : '平缓') + '，注意变盘！';
                }
            }

            analysisResults[screen.key] = result;

            // === 简洁模式 ===
            if (config.simpleMode) {
                var fastStatus = result.fastLineStatus || { text: '—', class: '', simple: '—' };
                var momStatus = result.momentumStatus || { side: '—', status: '—', color: '#888' };
                var crossIcon = isGoldenCross ? '🌟金叉' : '💀死叉';
                var crossColor = isGoldenCross ? '#ffd700' : '#9b59b6';
                var borderColor = fastStatus.class === 'status-up' ? '#00ff7f' : (fastStatus.class === 'status-down' ? '#ff5252' : '#ffc107');

                html += "<div class='tv-analysis-box' style='background:#222;padding:8px;border-radius:4px;border-left:4px solid " + borderColor + ";'>";
                
                // 第一行：屏幕名 + 快线状态 + 金叉死叉
                html += "<div style='display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;flex-wrap:wrap;gap:4px;'>";
                html += "<span style='color:#ffd700;font-weight:bold;font-size:13px;'>" + screen.name + "</span>";
                html += "<span class='" + fastStatus.class + "' style='font-size:15px;font-weight:bold;'>" + fastStatus.simple + "</span>";
                html += "<span style='color:" + crossColor + ";font-size:11px;'>" + crossIcon + "</span>";
                html += "</div>";
                
                // 第二行：数据 - 自适应网格
                html += "<div class='tv-data-grid' style='grid-template-columns:repeat(auto-fit,minmax(100px,1fr));font-size:10px;'>";
                html += "<div>中轨: <span style='color:" + railHex + ";font-weight:bold;'>" + railLength + "</span></div>";
                html += "<div style='color:" + momStatus.color + ";'>" + momStatus.side + ": " + momentum.toFixed(3) + "</div>";
                html += "<div>快线: <span style='color:#2196f3;'>" + fastLine.toFixed(3) + "</span> <span class='" + fastStatus.class + "' style='font-size:9px;'>(" + (fastLineChange >= 0 ? '+' : '') + fastLineChange.toFixed(4) + ")</span></div>";
                html += "<div style='font-size:9px;color:" + momStatus.color + ";'>" + momStatus.side + momStatus.status + "</div>";
                html += "</div>";
                
                // 能量警告
                if (result.energyWarning) {
                    html += "<div class='energy-warning' style='font-size:10px;margin-top:6px;'>" + result.energyWarning + "</div>";
                }
                
                html += "</div>";
            } 
            // === 完整模式 ===
            else {
                var fastStatus = result.fastLineStatus || { text: '—', class: '' };
                var momStatus = result.momentumStatus || { side: '—', status: '—', color: '#888' };
                var borderColor = fastStatus.class === 'status-up' ? '#00ff7f' : (fastStatus.class === 'status-down' ? '#ff5252' : '#ffc107');

                html += "<div class='tv-analysis-box tv-screen-box' style='border-left:4px solid " + borderColor + ";'>";
                html += "<div style='color:#ffd700;font-weight:bold;margin-bottom:8px;padding-bottom:5px;border-bottom:1px solid #333;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:4px;'>";
                html += "<span style='font-size:13px;'>" + screen.name + "</span>";
                if (config.analysisMode === 'period') {
                    html += "<span style='font-size:9px;color:#888;'>周期:" + (config.periodTime/1000) + "秒</span>";
                }
                // 快线状态大字显示
                html += "<span class='" + fastStatus.class + "' style='font-size:16px;font-weight:bold;'>" + fastStatus.text + "</span>";
                html += "</div>";

                // 中轨 - 自适应
                html += "<div style='margin-bottom:8px;padding:6px;background:rgba(0,0,0,0.2);border-radius:4px;'>";
                html += "<span style='color:#aaa;font-size:10px;'>📈 中轨长度:</span> ";
                html += "<span style='color:" + railHex + ";font-size:16px;font-weight:bold;'>" + railLength + "</span>";
                html += "</div>";

                // MACD
                if (macdChart && macdChart.data && macdChart.data.length >= 11) {
                    var crossBg = isGoldenCross 
                        ? 'background:linear-gradient(90deg,rgba(255,215,0,0.15),transparent);border-left:3px solid #ffd700;'
                        : 'background:linear-gradient(90deg,rgba(138,43,226,0.15),transparent);border-left:3px solid #8a2be2;';
                    var crossText = isGoldenCross ? '🌟 金叉' : '💀 死叉';

                    html += "<div style='padding:8px;border-radius:4px;" + crossBg + "'>";
                    
                    // 金叉死叉 + 快线状态 + 动能状态 - 自适应flex
                    html += "<div style='display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;flex-wrap:wrap;gap:4px;'>";
                    html += "<span style='font-size:14px;font-weight:bold;'>" + crossText + "</span>";
                    html += "<span class='" + fastStatus.class + "' style='font-size:12px;font-weight:bold;'>快线" + fastStatus.text + "</span>";
                    html += "<span style='color:" + momStatus.color + ";font-size:11px;'>" + momStatus.side + momStatus.status + "</span>";
                    html += "</div>";
                    
                    // 数值详情 - 自适应网格
                    html += "<div class='tv-data-grid' style='grid-template-columns:repeat(auto-fit,minmax(80px,1fr));font-size:10px;background:rgba(0,0,0,0.2);padding:6px;border-radius:3px;'>";
                    html += "<div style='text-align:center;'><div style='color:#888;font-size:9px;'>动能(9)</div><div style='color:" + momStatus.color + ";font-weight:bold;font-size:12px;'>" + momentum.toFixed(3) + "</div><div style='font-size:8px;color:#666;'>(" + (momentumChange >= 0 ? '+' : '') + momentumChange.toFixed(4) + ")</div></div>";
                    html += "<div style='text-align:center;'><div style='color:#888;font-size:9px;'>快线(10)</div><div style='color:#2196f3;font-weight:bold;font-size:12px;'>" + fastLine.toFixed(3) + "</div><div class='" + fastStatus.class + "' style='font-size:8px;'>(" + (fastLineChange >= 0 ? '+' : '') + fastLineChange.toFixed(4) + ")</div></div>";
                    html += "<div style='text-align:center;'><div style='color:#888;font-size:9px;'>慢线(11)</div><div style='color:#ffeb3b;font-weight:bold;font-size:12px;'>" + slowLine.toFixed(3) + "</div></div>";
                    html += "</div>";

                    // 能量警告
                    if (result.energyWarning) {
                        html += "<div class='energy-warning' style='margin-top:8px;'>" + result.energyWarning + "</div>";
                    }

                    html += "</div>";
                }
                html += "</div>";
            }
        });

        // --- 双屏共振判断 ---
        var leftResult = analysisResults.left;
        var rightResult = analysisResults.right;
        
        if (leftResult && rightResult && leftResult.fastLineStatus && rightResult.fastLineStatus) {
            // 双屏同时金叉
            if (leftResult.isGoldenCross && rightResult.isGoldenCross) {
                html += "<div class='tv-resonance-box' style='background:linear-gradient(135deg,rgba(255,215,0,0.3),rgba(255,165,0,0.2));border:3px solid #ffd700;border-radius:8px;padding:10px;text-align:center;animation:strongPulse 1s infinite;'>";
                html += "<div style='color:#ffd700;font-size:16px;font-weight:bold;text-shadow:0 0 15px #ffd700;'>🌟🌟 双屏金叉共振！！🌟🌟</div>";
                html += "<div style='color:#ffeb3b;font-size:10px;margin-top:3px;'>左右两屏同时处于金叉状态</div>";
                html += "</div>";
                
                document.getElementById('alert-status').textContent = '🌟🌟 双屏金叉！';
                document.getElementById('alert-status').style.color = '#ffd700';
            }
            // 双屏同时死叉
            else if (!leftResult.isGoldenCross && !rightResult.isGoldenCross && historyData.left.fastLine.length > 2) {
                html += "<div class='tv-resonance-box' style='background:linear-gradient(135deg,rgba(138,43,226,0.3),rgba(75,0,130,0.2));border:3px solid #8a2be2;border-radius:8px;padding:10px;text-align:center;animation:strongPulse 1s infinite;'>";
                html += "<div style='color:#9b59b6;font-size:16px;font-weight:bold;text-shadow:0 0 15px #8a2be2;'>💀💀 双屏死叉共振！！💀💀</div>";
                html += "<div style='color:#bb86fc;font-size:10px;margin-top:3px;'>左右两屏同时处于死叉状态</div>";
                html += "</div>";
                
                document.getElementById('alert-status').textContent = '💀💀 双屏死叉！';
                document.getElementById('alert-status').style.color = '#9b59b6';
            }
            // 双屏快线同时上涨
            else if (leftResult.fastLineStatus.class === 'status-up' && rightResult.fastLineStatus.class === 'status-up') {
                html += "<div class='tv-resonance-box' style='background:rgba(0,255,127,0.2);border:2px solid #00ff7f;border-radius:6px;padding:8px;text-align:center;animation:pulse 1s infinite;'>";
                html += "<div style='color:#00ff7f;font-size:14px;font-weight:bold;text-shadow:0 0 10px #00ff7f;'>🚀🚀 双屏快线同步上涨！🚀🚀</div>";
                html += "<div style='font-size:9px;color:#7bed9f;margin-top:2px;'>左: +" + leftResult.fastLineChange.toFixed(4) + " | 右: +" + rightResult.fastLineChange.toFixed(4) + "</div>";
                html += "</div>";
                
                document.getElementById('alert-status').textContent = '🚀 双屏上涨';
                document.getElementById('alert-status').style.color = '#00ff7f';
            }
            // 双屏快线同时下跌
            else if (leftResult.fastLineStatus.class === 'status-down' && rightResult.fastLineStatus.class === 'status-down') {
                html += "<div class='tv-resonance-box' style='background:rgba(255,82,82,0.2);border:2px solid #ff5252;border-radius:6px;padding:8px;text-align:center;animation:pulse 1s infinite;'>";
                html += "<div style='color:#ff5252;font-size:14px;font-weight:bold;text-shadow:0 0 10px #ff5252;'>💥💥 双屏快线同步下跌！💥💥</div>";
                html += "<div style='font-size:9px;color:#ff6b6b;margin-top:2px;'>左: " + leftResult.fastLineChange.toFixed(4) + " | 右: " + rightResult.fastLineChange.toFixed(4) + "</div>";
                html += "</div>";
                
                document.getElementById('alert-status').textContent = '💥 双屏下跌';
                document.getElementById('alert-status').style.color = '#ff5252';
            }
            else {
                document.getElementById('alert-status').textContent = '监控中...';
                document.getElementById('alert-status').style.color = '#888';
            }
        }

        document.getElementById('update-time').textContent = getTimeStr();
        analysisContent.innerHTML = html;
    }

    // --- 9. 核心扫描逻辑 ---
    function updatePanel() {
        var widgets = document.querySelectorAll('.chart-widget');
        if (widgets.length < 2) {
            content.innerHTML = "<div style='color:orange'>⚠️ 需要至少2个分屏</div>";
            analysisContent.innerHTML = "<div style='color:orange'>⚠️ 等待分屏...</div>";
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

        // 记录数据
        if (isRecording) {
            var snapshot = {
                timestamp: new Date().toISOString(),
                left: JSON.parse(JSON.stringify(chartData[0] || [])),
                right: JSON.parse(JSON.stringify(chartData[1] || []))
            };
            recordedData.push(snapshot);
            document.getElementById('record-count').textContent = recordedData.length;
        }

        // 原始数据面板
        var html = "";
        var maxRows = Math.max(chartData[0]?.length || 0, chartData[1]?.length || 0);

        for(var i=0; i<maxRows; i++) {
            var leftItem = chartData[0] ? chartData[0][i] : null;
            var rightItem = chartData[1] ? chartData[1][i] : null;
            var rowName = leftItem ? leftItem.name : (rightItem ? rightItem.name : "未知");
            
            html += "<div style='background:#333;padding:3px 6px;margin-top:6px;font-weight:bold;color:#ffeaa7;border-radius:3px;font-size:11px;'>📊 " + rowName + " (" + (i+1) + ")</div>";
            html += "<div style='display:grid;grid-template-columns:25px 1fr 1fr;gap:2px;font-size:9px;color:#aaa;'><div>ID</div><div>左屏</div><div>右屏</div></div>";

            var maxVals = Math.max(leftItem?.data.length || 0, rightItem?.data.length || 0);
            
            for(var j=0; j<maxVals; j++) {
                var lData = leftItem && leftItem.data[j] ? leftItem.data[j] : {val:'-', color:''};
                var rData = rightItem && rightItem.data[j] ? rightItem.data[j] : {val:'-', color:''};
                var lHex = rgbToHex(lData.color);
                var rHex = rgbToHex(rData.color);
                var isColorSame = (lData.color === rData.color) && lData.color !== '';
                var bgStyle = isColorSame ? "background:rgba(46,204,113,0.1);" : "";

                html += "<div style='display:grid;grid-template-columns:25px 1fr 1fr;gap:2px;align-items:center;border-bottom:1px solid #333;padding:1px 0;font-size:10px;" + bgStyle + "'>";
                html += "<div style='color:#74b9ff;'>" + (j+1) + "</div>";
                html += "<div style='color:" + lHex + ";'>" + lData.val + "</div>";
                html += "<div style='color:" + rHex + ";'>" + rData.val + "</div>";
                html += "</div>";
            }
        }
        content.innerHTML = html;
    }

    // --- 10. 录制控制 ---
    function startRecording() {
        isRecording = true;
        recordStartTime = Date.now();
        recordedData = [];
        document.getElementById('btn-start').disabled = true;
        document.getElementById('btn-stop').disabled = false;
        document.getElementById('record-status').textContent = '记录中...';
        document.getElementById('record-status').style.color = '#4caf50';
        document.getElementById('recording-indicator').style.display = 'inline';
        
        durationTimer = setInterval(function() {
            document.getElementById('record-duration').textContent = formatDuration(Date.now() - recordStartTime);
        }, 1000);
    }

    function stopRecording() {
        isRecording = false;
        clearInterval(durationTimer);
        document.getElementById('btn-start').disabled = false;
        document.getElementById('btn-stop').disabled = true;
        document.getElementById('record-status').textContent = '已停止(' + recordedData.length + ')';
        document.getElementById('record-status').style.color = '#888';
        document.getElementById('recording-indicator').style.display = 'none';
    }

    function exportData() {
        if (recordedData.length === 0) {
            alert('没有数据！');
            return;
        }
        var csv = '\uFEFF时间戳,屏幕,指标,序号,数值,颜色\n';
        recordedData.forEach(function(s) {
            ['left', 'right'].forEach(function(side, idx) {
                var name = idx === 0 ? '左屏' : '右屏';
                (s[side] || []).forEach(function(ind) {
                    (ind.data || []).forEach(function(item, i) {
                        csv += '"' + s.timestamp + '","' + name + '","' + ind.name + '",' + (i+1) + ',"' + item.val + '","' + getColorName(item.color) + '"\n';
                    });
                });
            });
        });
        
        var blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
        var a = document.createElement('a');
        var now = new Date();
        var fn = '金指_' + now.getFullYear() + String(now.getMonth()+1).padStart(2,'0') + String(now.getDate()).padStart(2,'0') + '_' + String(now.getHours()).padStart(2,'0') + String(now.getMinutes()).padStart(2,'0') + '.csv';
        a.href = URL.createObjectURL(blob);
        a.download = fn;
        a.click();
        
        var jb = new Blob([JSON.stringify(recordedData, null, 2)], { type: 'application/json' });
        var ja = document.createElement('a');
        ja.href = URL.createObjectURL(jb);
        ja.download = fn.replace('.csv', '.json');
        ja.click();
        
        alert('已导出 ' + recordedData.length + ' 条记录');
    }

    // --- 11. 事件绑定 ---
    setTimeout(function bindEvents() {
        // 记录按钮
        document.getElementById('btn-start').onclick = startRecording;
        document.getElementById('btn-stop').onclick = stopRecording;
        document.getElementById('btn-export').onclick = exportData;
        
        // 关闭原始数据面板
        document.getElementById('btn-close-raw').onclick = function() {
            panel.style.display = 'none';
            document.getElementById('btn-toggle-raw').textContent = '📋 原始';
            document.getElementById('btn-toggle-raw').style.background = '#8e44ad';
        };
        
        // 切换原始数据面板
        document.getElementById('btn-toggle-raw').onclick = function() {
            if (panel.style.display === 'none') {
                panel.style.display = 'flex';
                this.textContent = '📋 隐藏';
                this.style.background = '#c0392b';
            } else {
                panel.style.display = 'none';
                this.textContent = '📋 原始';
                this.style.background = '#8e44ad';
            }
        };
        
        // 简洁/完整模式
        document.getElementById('btn-toggle-mode').onclick = function() {
            config.simpleMode = !config.simpleMode;
            if (config.simpleMode) {
                this.textContent = '📊 简洁';
                this.style.background = '#3498db';
            } else {
                this.textContent = '📊 完整';
                this.style.background = '#9b59b6';
            }
        };
        
        // 实时模式按钮
        document.getElementById('btn-realtime').onclick = function() {
            config.analysisMode = 'realtime';
            this.style.background = '#27ae60';
            this.style.borderColor = '#27ae60';
            this.style.color = '#fff';
            document.getElementById('btn-period').style.background = '#333';
            document.getElementById('btn-period').style.borderColor = '#555';
            document.getElementById('btn-period').style.color = '#aaa';
        };
        
        // 周期模式按钮
        document.getElementById('btn-period').onclick = function() {
            config.analysisMode = 'period';
            this.style.background = '#e67e22';
            this.style.borderColor = '#e67e22';
            this.style.color = '#fff';
            document.getElementById('btn-realtime').style.background = '#333';
            document.getElementById('btn-realtime').style.borderColor = '#555';
            document.getElementById('btn-realtime').style.color = '#aaa';
        };
        
        // 周期时间选择
        document.getElementById('select-period').onchange = function() {
            config.periodTime = parseInt(this.value);
        };
        
        // 刷新间隔选择
        document.getElementById('select-interval').onchange = function() {
            config.updateInterval = parseInt(this.value);
            clearInterval(updateTimer);
            updateTimer = setInterval(updatePanel, config.updateInterval);
        };
        
    }, 100);

    // --- 12. 启动 ---
    updatePanel();
    updateTimer = setInterval(updatePanel, config.updateInterval);
    if (window.__TV_HOT_CONTEXT) window.__TV_HOT_CONTEXT.timer = updateTimer;

    console.log(">>> [云端 V7.5] 初始化完成！");

})();