// ==UserScript==
// @name         TradingView 金指数据监控 V7.2 (完整分析版+警报)
// @namespace    http://tampermonkey.net/
// @version      7.2
// @description  抓取数值颜色、支持面板拖动、左右分屏对比、分析框显示中轨和MACD、双向共振警报
// @author       You
// @match        *://*.tradingview.com/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';
    console.log(">>> [云端 V7.2] 启动颜色对比监控 + 分析框 + 警报...");

    // --- 0. 清理旧面板 ---
    var old = document.getElementById('tv-monitor-panel-v7');
    if(old) old.remove();
    var oldAnalysis = document.getElementById('tv-analysis-panel');
    if(oldAnalysis) oldAnalysis.remove();

    // --- 音频上下文用于警报 ---
    var audioCtx = null;
    var lastAlertTime = 0;
    var alertCooldown = 5000; // 5秒冷却时间

    function playAlertSound(type) {
        var now = Date.now();
        if (now - lastAlertTime < alertCooldown) return; // 冷却中
        lastAlertTime = now;

        try {
            if (!audioCtx) {
                audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            }
            
            var oscillator = audioCtx.createOscillator();
            var gainNode = audioCtx.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(audioCtx.destination);
            
            if (type === 'up') {
                // 上涨警报：高音连续
                oscillator.frequency.setValueAtTime(880, audioCtx.currentTime);
                oscillator.frequency.setValueAtTime(1100, audioCtx.currentTime + 0.1);
                oscillator.frequency.setValueAtTime(1320, audioCtx.currentTime + 0.2);
            } else {
                // 下跌警报：低音连续
                oscillator.frequency.setValueAtTime(440, audioCtx.currentTime);
                oscillator.frequency.setValueAtTime(330, audioCtx.currentTime + 0.1);
                oscillator.frequency.setValueAtTime(220, audioCtx.currentTime + 0.2);
            }
            
            gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);
            
            oscillator.start(audioCtx.currentTime);
            oscillator.stop(audioCtx.currentTime + 0.5);
        } catch(e) {
            console.log("警报声音播放失败:", e);
        }
    }

    // --- 1. 主监控面板创建 (默认隐藏) ---
    var panel = document.createElement('div');
    panel.id = 'tv-monitor-panel-v7';
    panel.style.cssText = "position:fixed; top:100px; right:100px; width:420px; background:rgba(20, 20, 20, 0.95); color:#ecf0f1; font-family:'Consolas', monospace; font-size:12px; z-index:999999; border-radius:8px; border: 1px solid #444; box-shadow: 0 8px 20px rgba(0,0,0,0.6); display:none; flex-direction:column; overflow:hidden; resize:both; min-width:300px; min-height:150px;";
    
    // 标题栏 (用于拖动)
    var header = document.createElement('div');
    header.style.cssText = "padding:8px; background:#2d3436; cursor:move; font-weight:bold; color:#00b894; display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #444; user-select:none;";
    header.innerHTML = "<span>⚖️ 金指系统多空共振 V7 - 原始数据</span><span style='font-size:10px;color:#aaa'>按住拖动 | 右下角缩放</span>";
    panel.appendChild(header);

    // 录制控制栏
    var controlBar = document.createElement('div');
    controlBar.style.cssText = "display:flex; align-items:center; gap:8px; padding:6px 10px; background:#1a1a1a; border-bottom:1px solid #444;";
    controlBar.innerHTML = '<button id="btn-start" style="padding:4px 10px; border-radius:4px; font-size:11px; cursor:pointer; border:none; background:#27ae60; color:#fff;">▶️ 开始记录</button><button id="btn-stop" style="padding:4px 10px; border-radius:4px; font-size:11px; cursor:pointer; border:none; background:#c0392b; color:#fff;" disabled>⏹️ 停止记录</button><button id="btn-export" style="padding:4px 10px; border-radius:4px; font-size:11px; cursor:pointer; border:none; background:#2980b9; color:#fff;">📥 导出数据</button><span id="record-status" style="font-size:10px; color:#888; margin-left:auto;">未开始</span>';
    panel.appendChild(controlBar);

    // 记录统计栏
    var statsBar = document.createElement('div');
    statsBar.style.cssText = "display:flex; align-items:center; gap:15px; padding:4px 10px; background:#111; border-bottom:1px solid #444; font-size:11px;";
    statsBar.innerHTML = '<span>📊 已记录: <span id="record-count" style="color:#00bcd4; font-weight:bold;">0</span> 条</span><span>⏱️ 时长: <span id="record-duration" style="color:#ffc107;">00:00:00</span></span><span id="recording-indicator" style="display:none; color:#f44336;">● 录制中</span>';
    panel.appendChild(statsBar);

    // 内容区
    var content = document.createElement('div');
    content.style.cssText = "padding:10px; max-height:500px; overflow-y:auto; flex:1;";
    panel.appendChild(content);

    document.body.appendChild(panel);

    // --- 2. 分析框面板创建 ---
    var analysisPanel = document.createElement('div');
    analysisPanel.id = 'tv-analysis-panel';
    analysisPanel.style.cssText = "position:fixed; top:100px; left:100px; width:480px; background:rgba(15, 15, 25, 0.98); color:#ecf0f1; font-family:'Consolas', monospace; font-size:12px; z-index:999998; border-radius:10px; border: 2px solid #e74c3c; box-shadow: 0 10px 30px rgba(231, 76, 60, 0.3); display:flex; flex-direction:column; overflow:hidden; resize:both; min-width:350px; min-height:200px;";

    var analysisHeader = document.createElement('div');
    analysisHeader.style.cssText = "padding:10px 14px; background:linear-gradient(135deg, #c0392b 0%, #e74c3c 100%); cursor:move; font-weight:bold; color:#fff; display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #922b21; user-select:none;";
    analysisHeader.innerHTML = "<span>🎯 分析框</span><span style='font-size:10px; opacity:0.8;'>按住拖动 | 右下角缩放</span>";
    analysisPanel.appendChild(analysisHeader);

    // 分析框控制栏
    var analysisControlBar = document.createElement('div');
    analysisControlBar.style.cssText = "display:flex; align-items:center; gap:8px; padding:6px 10px; background:#1a1a1a; border-bottom:1px solid #444;";
    analysisControlBar.innerHTML = '<button id="btn-toggle-raw" style="padding:4px 12px; border-radius:4px; font-size:11px; cursor:pointer; border:none; background:#8e44ad; color:#fff;">📋 查看原始数据</button><button id="btn-toggle-sound" style="padding:4px 12px; border-radius:4px; font-size:11px; cursor:pointer; border:none; background:#27ae60; color:#fff;">🔔 警报开启</button><span id="alert-status" style="font-size:10px; color:#888; margin-left:auto;">等待数据...</span>';
    analysisPanel.appendChild(analysisControlBar);

    var analysisContent = document.createElement('div');
    analysisContent.id = 'analysis-content';
    analysisContent.style.cssText = "padding:12px; overflow-y:auto; flex:1; max-height:600px;";
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
    var soundEnabled = true;
    
    // 历史数据用于趋势判断
    var historyData = {
        left: { fastLine: [], momentum: [] },
        right: { fastLine: [], momentum: [] }
    };

    // --- 5. 辅助函数 ---
    function parseNumber(str) {
        if (!str) return 0;
        // 处理特殊负号字符 "−" (Unicode U+2212) 转为普通减号
        var cleaned = str.replace(/−/g, '-').replace(/,/g, '').trim();
        var num = parseFloat(cleaned);
        return isNaN(num) ? 0 : num;
    }

    function getColorName(rgbStr) {
        if(!rgbStr) return "N/A";
        if(rgbStr.includes("254, 67, 101") || rgbStr.includes("255, 0, 0") || rgbStr.includes("255, 80, 112")) return "🔴红";
        if(rgbStr.includes("0, 255") || rgbStr.includes("82, 189") || rgbStr.includes("82, 154")) return "🟢绿"; 
        if(rgbStr.includes("33, 150, 243") || rgbStr.includes("41, 98, 255") || rgbStr.includes("34, 107, 255")) return "🔵蓝";
        if(rgbStr.includes("255, 255, 255")) return "⚪白";
        if(rgbStr.includes("255, 235, 59") || rgbStr.includes("255, 213, 0") || rgbStr.includes("230, 255, 41")) return "🟡黄";
        if(rgbStr.includes("82, 174, 255")) return "🔵浅蓝";
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
        var analysisResults = { left: null, right: null };
        
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

            var result = { trend: null, fastLineUp: null };

            html += "<div style='background:rgba(0,0,0,0.4); border-radius:6px; padding:10px; margin-bottom:10px; border:1px solid #555;'>";
            html += "<div style='color:#ffd700; font-weight:bold; margin-bottom:8px; padding-bottom:5px; border-bottom:1px solid #444;'>📊 " + screen.name + "分析</div>";

            // 1. 主图分析 - 中轨长度 (第一个指标的前4个数据)
            var mainChart = screen.data[0];
            if (mainChart && mainChart.data && mainChart.data.length >= 4) {
                var id1 = parseNumber(mainChart.data[0].val); // 中轨最小值
                var id4 = parseNumber(mainChart.data[3].val); // 中轨最大值
                var railLength = (id4 - id1).toFixed(3);
                var railColor = mainChart.data[0].color || '#fff';
                var railHex = rgbToHex(railColor);

                html += "<div style='margin-bottom:10px; padding:8px; background:rgba(255,255,255,0.05); border-radius:4px;'>";
                html += "<div style='color:#aaa; margin-bottom:5px;'>📈 主图中轨分析</div>";
                html += "<div style='display:flex; align-items:center; gap:10px;'>";
                html += "<span style='color:#888;'>中轨长度:</span>";
                html += "<span style='color:" + railHex + "; font-size:20px; font-weight:bold; text-shadow: 0 0 10px " + railHex + ";'>" + railLength + "</span>";
                html += "</div>";
                html += "<div style='color:#666; font-size:10px; margin-top:5px;'>ID1(最小):" + id1.toFixed(3) + " | ID4(最大):" + id4.toFixed(3) + "</div>";
                html += "</div>";
            }

            // 2. MACD分析 (第三个指标，索引2)
            var macdChart = screen.data[2];
            if (macdChart && macdChart.data && macdChart.data.length >= 11) {
                var momentum = parseNumber(macdChart.data[8].val);  // ID9 动能柱
                var fastLine = parseNumber(macdChart.data[9].val);  // ID10 快线
                var slowLine = parseNumber(macdChart.data[10].val); // ID11 慢线
                
                // 判断金叉死叉
                var isGoldenCross = fastLine > slowLine;
                var crossType = isGoldenCross ? '金叉' : '死叉';
                var crossEmoji = isGoldenCross ? '🌟' : '💀';
                var crossBg = isGoldenCross 
                    ? 'background:linear-gradient(90deg, rgba(255,215,0,0.2), transparent); border-left:3px solid #ffd700;'
                    : 'background:linear-gradient(90deg, rgba(138,43,226,0.2), transparent); border-left:3px solid #8a2be2;';

                // 保存历史快线数据判断趋势
                historyData[screen.key].fastLine.push(fastLine);
                historyData[screen.key].momentum.push(momentum);
                if (historyData[screen.key].fastLine.length > 10) {
                    historyData[screen.key].fastLine.shift();
                    historyData[screen.key].momentum.shift();
                }

                // 判断快线趋势 - 这是最重要的指标！
                var fastLineTrend = '';
                var fastLineUp = null;
                var fastHistory = historyData[screen.key].fastLine;
                if (fastHistory.length >= 2) {
                    var prevFast = fastHistory[fastHistory.length - 2];
                    var fastChange = fastLine - prevFast;
                    
                    if (fastChange > 0.001) {
                        fastLineUp = true;
                        fastLineTrend = '<div style="color:#00ff7f; font-size:14px; font-weight:bold; padding:5px; background:rgba(0,255,127,0.1); border-radius:4px; margin-top:5px;">📈 快线上升中 (+' + fastChange.toFixed(3) + ') = 涨势!</div>';
                    } else if (fastChange < -0.001) {
                        fastLineUp = false;
                        fastLineTrend = '<div style="color:#ff5252; font-size:14px; font-weight:bold; padding:5px; background:rgba(255,82,82,0.1); border-radius:4px; margin-top:5px;">📉 快线下降中 (' + fastChange.toFixed(3) + ') = 跌势!</div>';
                    } else {
                        fastLineTrend = '<div style="color:#ffc107; font-size:12px; padding:5px; margin-top:5px;">➡️ 快线持平 (变化:' + fastChange.toFixed(3) + ')</div>';
                    }
                }

                result.fastLineUp = fastLineUp;

                // 动能柱判断
                var momentumColor = momentum >= 0 ? '#00ff7f' : '#ff5252';
                var momentumText = momentum >= 0 ? '正数(涨)' : '负数(跌)';
                result.trend = momentum >= 0 ? 'up' : 'down';

                // 预警判断
                var warning = '';
                if (isGoldenCross && fastLineUp === false) {
                    warning = '<div style="color:#ff9800; font-size:12px; padding:5px; background:rgba(255,152,0,0.1); border-radius:4px; margin-top:5px;">⚠️ 金叉但快线在减小，可能形成死叉！</div>';
                } else if (!isGoldenCross && fastLineUp === true) {
                    warning = '<div style="color:#ff9800; font-size:12px; padding:5px; background:rgba(255,152,0,0.1); border-radius:4px; margin-top:5px;">⚠️ 死叉但快线在变大，可能形成金叉！</div>';
                }

                html += "<div style='padding:8px; margin-bottom:8px; border-radius:4px; " + crossBg + "'>";
                html += "<div style='display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;'>";
                html += "<span style='font-size:16px; font-weight:bold;'>" + crossEmoji + " " + crossType + "</span>";
                html += "<span style='color:" + momentumColor + "; font-weight:bold;'>动能柱: " + momentumText + "</span>";
                html += "</div>";
                
                html += "<div style='display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px; font-size:12px; padding:5px; background:rgba(0,0,0,0.2); border-radius:4px;'>";
                html += "<div style='text-align:center;'><div style='color:#888;'>动能柱(9)</div><div style='color:" + momentumColor + "; font-size:14px; font-weight:bold;'>" + momentum.toFixed(3) + "</div></div>";
                html += "<div style='text-align:center;'><div style='color:#888;'>快线(10)</div><div style='color:#2196f3; font-size:14px; font-weight:bold;'>" + fastLine.toFixed(3) + "</div></div>";
                html += "<div style='text-align:center;'><div style='color:#888;'>慢线(11)</div><div style='color:#ffeb3b; font-size:14px; font-weight:bold;'>" + slowLine.toFixed(3) + "</div></div>";
                html += "</div>";
                
                html += "<div style='color:#888; font-size:10px; margin-top:5px;'>计算验证: 快线-慢线 = " + (fastLine - slowLine).toFixed(3) + "</div>";
                
                html += fastLineTrend;
                html += warning;
                html += "</div>";
            } else {
                html += "<div style='color:#888; padding:5px;'>MACD数据不足 (需要第3个指标,至少11个数值)</div>";
            }

            html += "</div>";
            analysisResults[screen.key] = result;
        });

        // --- 双向共振判断 ---
        var leftResult = analysisResults.left;
        var rightResult = analysisResults.right;
        
        if (leftResult && rightResult && leftResult.fastLineUp !== null && rightResult.fastLineUp !== null) {
            var bothUp = leftResult.fastLineUp === true && rightResult.fastLineUp === true;
            var bothDown = leftResult.fastLineUp === false && rightResult.fastLineUp === false;
            
            if (bothUp || bothDown) {
                var alertType = bothUp ? 'up' : 'down';
                var alertColor = bothUp ? '#00ff7f' : '#ff5252';
                var alertBg = bothUp ? 'rgba(0,255,127,0.2)' : 'rgba(255,82,82,0.2)';
                var alertText = bothUp ? '🚀🚀🚀 双屏共振上涨！！！' : '💥💥💥 双屏共振下跌！！！';
                var alertBorder = bothUp ? '#00ff7f' : '#ff5252';
                
                html += "<div style='background:" + alertBg + "; border:3px solid " + alertBorder + "; border-radius:8px; padding:15px; margin-top:10px; animation: alertBlink 0.5s infinite;'>";
                html += "<div style='color:" + alertColor + "; font-size:20px; font-weight:bold; text-align:center; text-shadow: 0 0 20px " + alertColor + ";'>" + alertText + "</div>";
                html += "<div style='color:#fff; font-size:12px; text-align:center; margin-top:5px;'>左右两屏快线同时" + (bothUp ? "上升" : "下降") + "，趋势确认！</div>";
                html += "</div>";
                
                // 更新警报状态
                document.getElementById('alert-status').textContent = alertText;
                document.getElementById('alert-status').style.color = alertColor;
                
                // 播放警报声
                if (soundEnabled) {
                    playAlertSound(alertType);
                }
            } else {
                document.getElementById('alert-status').textContent = '无共振信号';
                document.getElementById('alert-status').style.color = '#888';
            }
        }

        // 添加CSS动画
        if (!document.getElementById('alert-blink-style')) {
            var style = document.createElement('style');
            style.id = 'alert-blink-style';
            style.textContent = '@keyframes alertBlink { 0%, 100% { opacity: 1; } 50% { opacity: 0.7; } }';
            document.head.appendChild(style);
        }

        var now = new Date();
        var timeStr = now.getHours() + ":" + String(now.getMinutes()).padStart(2,'0') + ":" + String(now.getSeconds()).padStart(2,'0');
        html += "<div style='text-align:right; font-size:10px; color:#666; margin-top:10px;'>最后分析: " + timeStr + "</div>";

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

        // 收集数据容器
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

        // --- 生成对比表格 (原始数据面板) ---
        var html = "";
        var maxRows = Math.max(chartData[0]?.length || 0, chartData[1]?.length || 0);

        for(var i=0; i<maxRows; i++) {
            var leftItem = chartData[0] ? chartData[0][i] : null;
            var rightItem = chartData[1] ? chartData[1][i] : null;
            
            var rowName = leftItem ? leftItem.name : (rightItem ? rightItem.name : "未知区域");
            
            html += "<div style='background:#333; padding:4px; margin-top:8px; font-weight:bold; color:#ffeaa7; border-radius:4px;'>📊 " + rowName + " (指标 " + (i+1) + ")</div>";
            
            // 表头 - 只显示左屏右屏
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
        
        // 切换原始数据面板显示
        document.getElementById('btn-toggle-raw').addEventListener('click', function() {
            if (panel.style.display === 'none') {
                panel.style.display = 'flex';
                this.textContent = '📋 隐藏原始数据';
                this.style.background = '#c0392b';
            } else {
                panel.style.display = 'none';
                this.textContent = '📋 查看原始数据';
                this.style.background = '#8e44ad';
            }
        });
        
        // 切换警报声音
        document.getElementById('btn-toggle-sound').addEventListener('click', function() {
            soundEnabled = !soundEnabled;
            if (soundEnabled) {
                this.textContent = '🔔 警报开启';
                this.style.background = '#27ae60';
            } else {
                this.textContent = '🔕 警报关闭';
                this.style.background = '#7f8c8d';
            }
        });
    }, 100);

    // --- 10. 启动定时刷新 ---
    updatePanel();
    var timer = setInterval(updatePanel, 100);
    if (window.__TV_HOT_CONTEXT) window.__TV_HOT_CONTEXT.timer = timer;

})();