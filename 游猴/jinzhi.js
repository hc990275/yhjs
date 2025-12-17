// ==UserScript==
// @name         TradingView 金指数据监控 V7.4 (周期分析版)
// @namespace    http://tampermonkey.net/
// @version      7.4
// @description  抓取数值颜色、支持面板拖动、左右分屏对比、周期分析、双向共振警报
// @author       You
// @match        *://*.tradingview.com/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';
    console.log(">>> [云端 V7.4] 启动周期分析监控...");

    // --- 0. 清理旧面板 ---
    var old = document.getElementById('tv-monitor-panel-v7');
    if(old) old.remove();
    var oldAnalysis = document.getElementById('tv-analysis-panel');
    if(oldAnalysis) oldAnalysis.remove();

    // --- 全局配置 ---
    var config = {
        soundEnabled: false,  // 默认关闭警报
        simpleMode: false,
        analysisMode: 'realtime', // 'realtime' 或 'period'
        periodTime: 5000,  // 周期时间(ms)
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
    var maxHistoryLength = 1000; // 最多保存1000条历史

    // --- 音频控制 ---
    var audioCtx = null;
    var lastAlertTime = 0;
    var alertCooldown = 3000;

    function playAlertSound(type) {
        // 严格检查开关状态
        if (config.soundEnabled !== true) {
            console.log("警报已关闭，不播放声音");
            return;
        }
        
        var now = Date.now();
        if (now - lastAlertTime < alertCooldown) {
            console.log("警报冷却中...");
            return;
        }
        lastAlertTime = now;

        try {
            if (!audioCtx) {
                audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            }
            
            // 恢复音频上下文（某些浏览器需要）
            if (audioCtx.state === 'suspended') {
                audioCtx.resume();
            }
            
            var oscillator = audioCtx.createOscillator();
            var gainNode = audioCtx.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(audioCtx.destination);
            
            if (type === 'up' || type === 'golden') {
                // 上涨/金叉 - 上升音调
                oscillator.frequency.setValueAtTime(600, audioCtx.currentTime);
                oscillator.frequency.setValueAtTime(800, audioCtx.currentTime + 0.1);
                oscillator.frequency.setValueAtTime(1000, audioCtx.currentTime + 0.2);
                oscillator.frequency.setValueAtTime(1200, audioCtx.currentTime + 0.3);
            } else {
                // 下跌/死叉 - 下降音调
                oscillator.frequency.setValueAtTime(600, audioCtx.currentTime);
                oscillator.frequency.setValueAtTime(500, audioCtx.currentTime + 0.1);
                oscillator.frequency.setValueAtTime(400, audioCtx.currentTime + 0.2);
                oscillator.frequency.setValueAtTime(300, audioCtx.currentTime + 0.3);
            }
            
            gainNode.gain.setValueAtTime(0.5, audioCtx.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);
            
            oscillator.start(audioCtx.currentTime);
            oscillator.stop(audioCtx.currentTime + 0.5);
            
            console.log("播放警报声音: " + type);
        } catch(e) {
            console.log("警报声音播放失败:", e);
        }
    }

    // --- 1. 主监控面板创建 (默认隐藏) ---
    var panel = document.createElement('div');
    panel.id = 'tv-monitor-panel-v7';
    panel.style.cssText = "position:fixed; top:100px; right:20px; width:380px; max-height:80vh; background:rgba(20,20,20,0.95); color:#ecf0f1; font-family:'Consolas',monospace; font-size:12px; z-index:999999; border-radius:8px; border:1px solid #444; box-shadow:0 8px 20px rgba(0,0,0,0.6); display:none; flex-direction:column; overflow:hidden;";
    
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
    content.style.cssText = "padding:8px; overflow-y:auto; flex:1;";
    panel.appendChild(content);

    document.body.appendChild(panel);

    // --- 2. 分析框面板创建 ---
    var analysisPanel = document.createElement('div');
    analysisPanel.id = 'tv-analysis-panel';
    analysisPanel.style.cssText = "position:fixed; top:60px; left:20px; width:340px; max-height:75vh; background:rgba(15,15,25,0.98); color:#ecf0f1; font-family:'Consolas',monospace; font-size:11px; z-index:999998; border-radius:8px; border:2px solid #e74c3c; box-shadow:0 8px 25px rgba(231,76,60,0.3); display:flex; flex-direction:column; overflow:hidden;";

    var analysisHeader = document.createElement('div');
    analysisHeader.id = 'analysis-header';
    analysisHeader.style.cssText = "padding:6px 10px; background:linear-gradient(135deg,#c0392b,#e74c3c); cursor:move; font-weight:bold; color:#fff; display:flex; justify-content:space-between; align-items:center; user-select:none;";
    analysisHeader.innerHTML = "<span>🎯 分析框</span><div><button id='btn-minimize' style='background:rgba(255,255,255,0.2);border:none;color:#fff;padding:2px 6px;border-radius:3px;cursor:pointer;font-size:10px;margin-right:4px;'>➖</button><button id='btn-maximize' style='background:rgba(255,255,255,0.2);border:none;color:#fff;padding:2px 6px;border-radius:3px;cursor:pointer;font-size:10px;'>➕</button></div>";
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
        '<option value="180000" selected>3分钟</option>' +
        '<option value="240000">4分钟</option>' +
        '<option value="300000">5分钟</option>' +
        '<option value="600000">10分钟</option>' +
        '</select>';
    analysisPanel.appendChild(modeBar);

    // 控制栏
    var analysisControlBar = document.createElement('div');
    analysisControlBar.id = 'analysis-control-bar';
    analysisControlBar.style.cssText = "display:flex; flex-wrap:wrap; align-items:center; gap:4px; padding:5px 8px; background:#222; border-bottom:1px solid #444;";
    analysisControlBar.innerHTML = '' +
        '<button id="btn-toggle-mode" style="padding:2px 8px;border-radius:3px;font-size:10px;cursor:pointer;border:none;background:#9b59b6;color:#fff;">📊 完整</button>' +
        '<button id="btn-toggle-raw" style="padding:2px 8px;border-radius:3px;font-size:10px;cursor:pointer;border:none;background:#8e44ad;color:#fff;">📋 原始</button>' +
        '<button id="btn-toggle-sound" style="padding:2px 8px;border-radius:3px;font-size:10px;cursor:pointer;border:none;background:#e74c3c;color:#fff;">🔕 关</button>' +
        '<span style="font-size:9px;color:#666;margin-left:auto;">刷新:</span>' +
        '<select id="select-interval" style="padding:2px;border-radius:3px;border:1px solid #555;background:#333;color:#fff;font-size:9px;">' +
        '<option value="200">200ms</option>' +
        '<option value="500" selected>500ms</option>' +
        '<option value="1000">1秒</option>' +
        '<option value="2000">2秒</option>' +
        '</select>';
    analysisPanel.appendChild(analysisControlBar);

    // 状态栏
    var analysisStatusBar = document.createElement('div');
    analysisStatusBar.style.cssText = "display:flex; justify-content:space-between; align-items:center; padding:3px 8px; background:#111; border-bottom:1px solid #444; font-size:10px;";
    analysisStatusBar.innerHTML = '<span id="alert-status" style="color:#888;">等待数据...</span><span id="update-time" style="color:#666;"></span>';
    analysisPanel.appendChild(analysisStatusBar);

    var analysisContent = document.createElement('div');
    analysisContent.id = 'analysis-content';
    analysisContent.style.cssText = "padding:8px; overflow-y:auto; flex:1;";
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

    makeDraggable(panel, document.getElementById('panel-header'));
    makeDraggable(analysisPanel, document.getElementById('analysis-header'));

    // --- 4. 记录功能变量 ---
    var recordedData = [];
    var isRecording = false;
    var recordStartTime = null;
    var durationTimer = null;
    var updateTimer = null;

    // --- 5. 辅助函数 ---
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

    // --- 6. 周期分析函数 ---
    function getPeriodChange(key, dataType) {
        var now = Date.now();
        var periodStart = now - config.periodTime;
        var data = historyData[key];
        
        if (!data || !data.timestamps || data.timestamps.length < 2) {
            return { change: 0, startVal: 0, endVal: 0, count: 0 };
        }
        
        // 找到周期开始时的数据
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

    // --- 7. 分析框更新逻辑 ---
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
                fastLineUp: null, 
                fastLineVal: 0, 
                momentumVal: 0,
                isGoldenCross: false,
                volumeStatus: ''
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
                
                result.fastLineVal = fastLine;
                result.momentumVal = momentum;
                result.isGoldenCross = isGoldenCross;

                // 保存历史数据
                historyData[screen.key].fastLine.push(fastLine);
                historyData[screen.key].momentum.push(momentum);
                historyData[screen.key].timestamps.push(now);
                
                // 限制历史长度
                if (historyData[screen.key].fastLine.length > maxHistoryLength) {
                    historyData[screen.key].fastLine.shift();
                    historyData[screen.key].momentum.shift();
                    historyData[screen.key].timestamps.shift();
                }

                // 计算变化
                if (config.analysisMode === 'period') {
                    // 周期模式
                    var fastPeriod = getPeriodChange(screen.key, 'fastLine');
                    var momentumPeriod = getPeriodChange(screen.key, 'momentum');
                    fastLineChange = fastPeriod.change;
                    momentumChange = momentumPeriod.change;
                    result.fastLineUp = fastLineChange > 0.0001 ? true : (fastLineChange < -0.0001 ? false : null);
                } else {
                    // 实时模式
                    var fh = historyData[screen.key].fastLine;
                    var mh = historyData[screen.key].momentum;
                    if (fh.length >= 2) {
                        fastLineChange = fastLine - fh[fh.length - 2];
                        result.fastLineUp = fastLineChange > 0.0001 ? true : (fastLineChange < -0.0001 ? false : null);
                    }
                    if (mh.length >= 2) {
                        momentumChange = momentum - mh[mh.length - 2];
                    }
                }

                // 动能柱放缩状态
                if (momentum >= 0) {
                    if (momentumChange > 0) {
                        result.volumeStatus = '多方放量📈';
                    } else if (momentumChange < 0) {
                        result.volumeStatus = '多方缩量📉';
                    } else {
                        result.volumeStatus = '多方持平➡️';
                    }
                } else {
                    if (momentumChange < 0) {
                        result.volumeStatus = '空方放量📉';
                    } else if (momentumChange > 0) {
                        result.volumeStatus = '空方缩量📈';
                    } else {
                        result.volumeStatus = '空方持平➡️';
                    }
                }
            }

            analysisResults[screen.key] = result;

            // === 简洁模式 ===
            if (config.simpleMode) {
                var trendIcon = result.fastLineUp === true ? '📈涨' : (result.fastLineUp === false ? '📉跌' : '➡️平');
                var trendColor = result.fastLineUp === true ? '#00ff7f' : (result.fastLineUp === false ? '#ff5252' : '#ffc107');
                var crossIcon = isGoldenCross ? '🌟金叉' : '💀死叉';
                var crossColor = isGoldenCross ? '#ffd700' : '#9b59b6';
                var sideColor = momentum >= 0 ? '#00ff7f' : '#ff5252';
                var sideText = momentum >= 0 ? '多' : '空';

                html += "<div style='background:#222;padding:8px;margin-bottom:4px;border-radius:4px;border-left:4px solid " + trendColor + ";'>";
                
                // 第一行：屏幕名称 + 趋势 + 金叉死叉
                html += "<div style='display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;'>";
                html += "<span style='color:#ffd700;font-weight:bold;font-size:12px;'>" + screen.name + "</span>";
                html += "<span style='color:" + trendColor + ";font-size:14px;font-weight:bold;'>" + trendIcon + "</span>";
                html += "<span style='color:" + crossColor + ";font-size:11px;'>" + crossIcon + "</span>";
                html += "</div>";
                
                // 第二行：数据
                html += "<div style='display:grid;grid-template-columns:1fr 1fr;gap:4px;font-size:10px;'>";
                html += "<div>中轨: <span style='color:" + railHex + ";font-weight:bold;'>" + railLength + "</span></div>";
                html += "<div style='color:" + sideColor + ";'>" + sideText + ": " + momentum.toFixed(3) + "</div>";
                html += "<div>快线: <span style='color:#2196f3;'>" + fastLine.toFixed(3) + "</span></div>";
                html += "<div style='font-size:9px;'>" + result.volumeStatus + "</div>";
                html += "</div>";
                
                html += "</div>";
            } 
            // === 完整模式 ===
            else {
                html += "<div style='background:#222;padding:8px;margin-bottom:6px;border-radius:5px;border:1px solid #444;'>";
                html += "<div style='color:#ffd700;font-weight:bold;margin-bottom:6px;padding-bottom:4px;border-bottom:1px solid #333;display:flex;justify-content:space-between;'>";
                html += "<span>" + screen.name + "</span>";
                if (config.analysisMode === 'period') {
                    html += "<span style='font-size:9px;color:#888;'>周期:" + (config.periodTime/1000) + "秒</span>";
                }
                html += "</div>";

                // 中轨
                html += "<div style='margin-bottom:6px;'>";
                html += "<span style='color:#aaa;font-size:10px;'>📈 中轨长度:</span> ";
                html += "<span style='color:" + railHex + ";font-size:14px;font-weight:bold;'>" + railLength + "</span>";
                html += "</div>";

                // MACD
                if (macdChart && macdChart.data && macdChart.data.length >= 11) {
                    var crossBg = isGoldenCross 
                        ? 'background:linear-gradient(90deg,rgba(255,215,0,0.15),transparent);border-left:3px solid #ffd700;'
                        : 'background:linear-gradient(90deg,rgba(138,43,226,0.15),transparent);border-left:3px solid #8a2be2;';
                    var crossText = isGoldenCross ? '🌟 金叉' : '💀 死叉';
                    var sideText = momentum >= 0 ? '多方' : '空方';
                    var sideColor = momentum >= 0 ? '#00ff7f' : '#ff5252';

                    html += "<div style='padding:6px;border-radius:4px;" + crossBg + "'>";
                    
                    // 金叉死叉 + 放缩状态
                    html += "<div style='display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;'>";
                    html += "<span style='font-size:13px;font-weight:bold;'>" + crossText + "</span>";
                    html += "<span style='color:" + sideColor + ";font-size:10px;'>" + result.volumeStatus + "</span>";
                    html += "</div>";
                    
                    // 数值
                    html += "<div style='display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px;font-size:10px;background:rgba(0,0,0,0.2);padding:4px;border-radius:3px;'>";
                    html += "<div style='text-align:center;'><div style='color:#888;'>动能柱</div><div style='color:" + sideColor + ";font-weight:bold;'>" + momentum.toFixed(3) + "</div></div>";
                    html += "<div style='text-align:center;'><div style='color:#888;'>快线</div><div style='color:#2196f3;font-weight:bold;'>" + fastLine.toFixed(3) + "</div></div>";
                    html += "<div style='text-align:center;'><div style='color:#888;'>慢线</div><div style='color:#ffeb3b;font-weight:bold;'>" + slowLine.toFixed(3) + "</div></div>";
                    html += "</div>";

                    // 快线趋势（最重要）
                    var changeText = config.analysisMode === 'period' ? '周期内' : '';
                    if (result.fastLineUp === true) {
                        html += "<div style='color:#00ff7f;font-size:12px;font-weight:bold;margin-top:5px;padding:4px;background:rgba(0,255,127,0.15);border-radius:3px;text-align:center;'>📈 快线上升 = " + changeText + "涨！(+" + fastLineChange.toFixed(4) + ")</div>";
                    } else if (result.fastLineUp === false) {
                        html += "<div style='color:#ff5252;font-size:12px;font-weight:bold;margin-top:5px;padding:4px;background:rgba(255,82,82,0.15);border-radius:3px;text-align:center;'>📉 快线下降 = " + changeText + "跌！(" + fastLineChange.toFixed(4) + ")</div>";
                    } else {
                        html += "<div style='color:#ffc107;font-size:11px;margin-top:5px;text-align:center;'>➡️ 快线持平</div>";
                    }

                    // 预警
                    if (isGoldenCross && result.fastLineUp === false) {
                        html += "<div style='color:#ff9800;font-size:10px;margin-top:3px;background:rgba(255,152,0,0.1);padding:2px 4px;border-radius:2px;'>⚠️ 金叉但快线减小，注意死叉风险</div>";
                    } else if (!isGoldenCross && result.fastLineUp === true) {
                        html += "<div style='color:#ff9800;font-size:10px;margin-top:3px;background:rgba(255,152,0,0.1);padding:2px 4px;border-radius:2px;'>⚠️ 死叉但快线变大，可能形成金叉</div>";
                    }
                    html += "</div>";
                }
                html += "</div>";
            }
        });

        // --- 双屏共振判断 ---
        var leftResult = analysisResults.left;
        var rightResult = analysisResults.right;
        var alertTriggered = false;
        var alertType = '';
        
        if (leftResult && rightResult) {
            // 双屏同时金叉
            if (leftResult.isGoldenCross && rightResult.isGoldenCross) {
                html += "<div style='background:linear-gradient(135deg,rgba(255,215,0,0.3),rgba(255,165,0,0.2));border:3px solid #ffd700;border-radius:8px;padding:12px;margin-top:8px;text-align:center;animation:pulse 1s infinite;'>";
                html += "<div style='color:#ffd700;font-size:18px;font-weight:bold;text-shadow:0 0 15px #ffd700;'>🌟🌟 双屏金叉共振！！🌟🌟</div>";
                html += "<div style='color:#ffeb3b;font-size:11px;margin-top:4px;'>左右两屏同时处于金叉状态</div>";
                html += "</div>";
                
                document.getElementById('alert-status').textContent = '🌟🌟 双屏金叉！！';
                document.getElementById('alert-status').style.color = '#ffd700';
                alertTriggered = true;
                alertType = 'golden';
            }
            // 双屏同时死叉
            else if (!leftResult.isGoldenCross && !rightResult.isGoldenCross && leftResult.momentumVal !== 0) {
                html += "<div style='background:linear-gradient(135deg,rgba(138,43,226,0.3),rgba(75,0,130,0.2));border:3px solid #8a2be2;border-radius:8px;padding:12px;margin-top:8px;text-align:center;animation:pulse 1s infinite;'>";
                html += "<div style='color:#9b59b6;font-size:18px;font-weight:bold;text-shadow:0 0 15px #8a2be2;'>💀💀 双屏死叉共振！！💀💀</div>";
                html += "<div style='color:#bb86fc;font-size:11px;margin-top:4px;'>左右两屏同时处于死叉状态</div>";
                html += "</div>";
                
                document.getElementById('alert-status').textContent = '💀💀 双屏死叉！！';
                document.getElementById('alert-status').style.color = '#9b59b6';
                alertTriggered = true;
                alertType = 'death';
            }
            // 双屏快线同时上涨
            else if (leftResult.fastLineUp === true && rightResult.fastLineUp === true) {
                html += "<div style='background:rgba(0,255,127,0.15);border:2px solid #00ff7f;border-radius:6px;padding:10px;margin-top:6px;text-align:center;'>";
                html += "<div style='color:#00ff7f;font-size:16px;font-weight:bold;text-shadow:0 0 10px #00ff7f;'>🚀🚀 双屏共振上涨！🚀🚀</div>";
                html += "</div>";
                
                document.getElementById('alert-status').textContent = '🚀 双屏上涨共振';
                document.getElementById('alert-status').style.color = '#00ff7f';
                alertTriggered = true;
                alertType = 'up';
            }
            // 双屏快线同时下跌
            else if (leftResult.fastLineUp === false && rightResult.fastLineUp === false) {
                html += "<div style='background:rgba(255,82,82,0.15);border:2px solid #ff5252;border-radius:6px;padding:10px;margin-top:6px;text-align:center;'>";
                html += "<div style='color:#ff5252;font-size:16px;font-weight:bold;text-shadow:0 0 10px #ff5252;'>💥💥 双屏共振下跌！💥💥</div>";
                html += "</div>";
                
                document.getElementById('alert-status').textContent = '💥 双屏下跌共振';
                document.getElementById('alert-status').style.color = '#ff5252';
                alertTriggered = true;
                alertType = 'down';
            }
            else {
                document.getElementById('alert-status').textContent = '无共振';
                document.getElementById('alert-status').style.color = '#888';
            }
            
            // 播放警报
            if (alertTriggered && config.soundEnabled === true) {
                playAlertSound(alertType);
            }
        }

        // 添加CSS动画
        if (!document.getElementById('pulse-style')) {
            var style = document.createElement('style');
            style.id = 'pulse-style';
            style.textContent = '@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.7; } }';
            document.head.appendChild(style);
        }

        document.getElementById('update-time').textContent = getTimeStr();
        analysisContent.innerHTML = html;
    }

    // --- 8. 核心扫描逻辑 ---
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

    // --- 9. 录制控制 ---
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

    // --- 10. 事件绑定 ---
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
        
        // 警报开关
        document.getElementById('btn-toggle-sound').onclick = function() {
            config.soundEnabled = !config.soundEnabled;
            if (config.soundEnabled) {
                this.textContent = '🔔 开';
                this.style.background = '#27ae60';
                // 初始化音频上下文
                if (!audioCtx) {
                    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                }
                console.log("警报已开启");
            } else {
                this.textContent = '🔕 关';
                this.style.background = '#e74c3c';
                console.log("警报已关闭");
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
            console.log("周期时间已更新为: " + config.periodTime + "ms");
        };
        
        // 刷新间隔选择
        document.getElementById('select-interval').onchange = function() {
            config.updateInterval = parseInt(this.value);
            clearInterval(updateTimer);
            updateTimer = setInterval(updatePanel, config.updateInterval);
            console.log("刷新间隔已更新为: " + config.updateInterval + "ms");
        };
        
        // 缩小按钮
        document.getElementById('btn-minimize').onclick = function() {
            var w = parseInt(analysisPanel.style.width) || 340;
            analysisPanel.style.width = Math.max(200, w - 40) + 'px';
        };
        
        // 放大按钮
        document.getElementById('btn-maximize').onclick = function() {
            var w = parseInt(analysisPanel.style.width) || 340;
            analysisPanel.style.width = Math.min(600, w + 40) + 'px';
        };
        
    }, 100);

    // --- 11. 启动 ---
    updatePanel();
    updateTimer = setInterval(updatePanel, config.updateInterval);
    if (window.__TV_HOT_CONTEXT) window.__TV_HOT_CONTEXT.timer = updateTimer;

    console.log(">>> [云端 V7.4] 初始化完成！");

})();