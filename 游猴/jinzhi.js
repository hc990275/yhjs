// ==UserScript==
// @name         TradingView 金指数据监控 V7.8 (完整功能版)
// @namespace    http://tampermonkey.net/
// @version      7.8
// @description  抓取数值颜色、支持面板拖动、四角缩放、分析、资金滤网、交易建议、本地配置保存
// @author       You
// @match        *://*.tradingview.com/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';
    console.log(">>> [云端 V7.8] 启动完整功能版监控...");

    // --- 0. 清理旧面板 ---
    var old = document.getElementById('tv-monitor-panel-v7');
    if(old) old.remove();
    var oldAnalysis = document.getElementById('tv-analysis-panel');
    if(oldAnalysis) oldAnalysis.remove();
    var oldStyle = document.getElementById('tv-monitor-style');
    if(oldStyle) oldStyle.remove();
    var oldFullscreen = document.getElementById('tv-fullscreen-alert');
    if(oldFullscreen) oldFullscreen.remove();

    // --- 本地存储键名 ---
    var STORAGE_KEY = 'tv_monitor_config_v78';

    // --- 默认配置 ---
    var defaultConfig = {
        simpleMode: false,
        analysisMode: 'realtime',
        periodTime: 5000,
        updateInterval: 500,
        // 分析框位置和大小
        analysisPanel: { left: 20, top: 60, width: 400, height: 500 },
        // 原始数据面板位置和大小
        rawPanel: { left: null, top: 100, right: 20, width: 380, height: 400 },
        // 警报开关
        alertEnabled: true
    };

    // --- 从本地存储加载配置 ---
    function loadConfig() {
        try {
            var saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
                var parsed = JSON.parse(saved);
                return Object.assign({}, defaultConfig, parsed);
            }
        } catch(e) {
            console.log('[V7.8] 加载配置失败:', e);
        }
        return Object.assign({}, defaultConfig);
    }

    // --- 保存配置到本地存储 ---
    function saveConfig() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
            console.log('[V7.8] 配置已保存');
        } catch(e) {
            console.log('[V7.8] 保存配置失败:', e);
        }
    }

    // --- 全局配置 ---
    var config = loadConfig();

    // --- 临时配置（未确认前的设置）---
    var tempConfig = {
        analysisMode: config.analysisMode,
        periodTime: config.periodTime,
        updateInterval: config.updateInterval
    };

    // --- 历史数据存储 ---
    var historyData = {
        left: { fastLine: [], momentum: [], timestamps: [] },
        right: { fastLine: [], momentum: [], timestamps: [] }
    };
    var maxHistoryLength = 1000;

    // --- 警报音频 ---
    var audioCtx = null;
    function initAudio() {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
    }
    function playAlertSound() {
        if (!config.alertEnabled) return;
        try {
            initAudio();
            var oscillator = audioCtx.createOscillator();
            var gainNode = audioCtx.createGain();
            oscillator.connect(gainNode);
            gainNode.connect(audioCtx.destination);
            oscillator.frequency.value = 800;
            oscillator.type = 'sine';
            gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);
            oscillator.start(audioCtx.currentTime);
            oscillator.stop(audioCtx.currentTime + 0.5);
            // 第二声
            setTimeout(function() {
                var osc2 = audioCtx.createOscillator();
                var gain2 = audioCtx.createGain();
                osc2.connect(gain2);
                gain2.connect(audioCtx.destination);
                osc2.frequency.value = 1000;
                osc2.type = 'sine';
                gain2.gain.setValueAtTime(0.3, audioCtx.currentTime);
                gain2.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);
                osc2.start(audioCtx.currentTime);
                osc2.stop(audioCtx.currentTime + 0.5);
            }, 200);
        } catch(e) {
            console.log('[V7.8] 播放警报失败:', e);
        }
    }

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
        @keyframes flashBorder { 0%, 100% { border-color: #ffd700; } 50% { border-color: #ff6b6b; } }
        .status-up { color: #00ff7f; text-shadow: 0 0 5px rgba(0,255,127,0.5); }
        .status-down { color: #ff5252; text-shadow: 0 0 5px rgba(255,82,82,0.5); }
        .status-flat { color: #ffc107; }
        .energy-warning { background: rgba(255,152,0,0.2); border: 1px solid #ff9800; border-radius: 4px; padding: 4px 6px; margin-top: 4px; }
        .trade-signal { padding: 6px 8px; border-radius: 4px; margin-top: 6px; font-weight: bold; }
        .trade-long { background: linear-gradient(135deg, rgba(0,255,127,0.3), rgba(0,200,100,0.1)); border: 2px solid #00ff7f; color: #00ff7f; }
        .trade-short { background: linear-gradient(135deg, rgba(255,82,82,0.3), rgba(200,50,50,0.1)); border: 2px solid #ff5252; color: #ff5252; }
        .tv-panel-content {
            display: flex;
            flex-direction: column;
            flex: 1;
            overflow-y: auto;
            overflow-x: hidden;
            min-height: 0;
        }
        .tv-panel-content::-webkit-scrollbar { width: 6px; }
        .tv-panel-content::-webkit-scrollbar-thumb { background: #555; border-radius: 3px; }
        .tv-panel-content::-webkit-scrollbar-track { background: #222; }
        .tv-analysis-box { flex-shrink: 0; margin-bottom: 6px; }
        .tv-data-grid { display: grid; gap: 4px; }
        .tv-screen-box { background: #222; padding: 8px; border-radius: 5px; border: 1px solid #444; }
        .tv-resonance-box { flex-shrink: 0; margin-top: 6px; }
        .resonance-status { padding: 2px 6px; border-radius: 3px; font-size: 10px; font-weight: bold; margin-right: 8px; }
        .resonance-long { background: #00ff7f; color: #000; animation: pulse 1s infinite; }
        .resonance-short { background: #ff5252; color: #fff; animation: pulse 1s infinite; }
        .resonance-golden { background: #ffd700; color: #000; animation: pulse 1s infinite; }
        .resonance-death { background: #8a2be2; color: #fff; animation: pulse 1s infinite; }
        #tv-fullscreen-alert {
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            background: rgba(0,0,0,0.85);
            z-index: 9999999;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            animation: flashBorder 0.5s infinite;
            border: 10px solid #ffd700;
            box-sizing: border-box;
        }
        .fullscreen-text {
            font-size: 48px;
            font-weight: bold;
            text-shadow: 0 0 30px currentColor;
            margin: 10px 0;
        }
        .fullscreen-sub {
            font-size: 24px;
            opacity: 0.9;
        }
        .fullscreen-close {
            margin-top: 30px;
            padding: 15px 40px;
            font-size: 20px;
            cursor: pointer;
            border: none;
            border-radius: 8px;
            background: #fff;
            color: #000;
        }
        .time-input {
            width: 60px;
            padding: 2px 4px;
            border-radius: 3px;
            border: 1px solid #555;
            background: #333;
            color: #fff;
            font-size: 10px;
            text-align: center;
        }
    `;
    document.head.appendChild(globalStyle);

    // --- 1. 全屏提示元素 ---
    var fullscreenAlert = document.createElement('div');
    fullscreenAlert.id = 'tv-fullscreen-alert';
    fullscreenAlert.style.display = 'none';
    fullscreenAlert.innerHTML = `
        <div class="fullscreen-text" id="fullscreen-title">🚀🚀🚀 双屏共振做多！！！</div>
        <div class="fullscreen-sub" id="fullscreen-detail">左右两屏同时满足做多条件</div>
        <button class="fullscreen-close" id="fullscreen-close">✕ 关闭 (3秒后自动关闭)</button>
    `;
    document.body.appendChild(fullscreenAlert);

    var fullscreenTimeout = null;
    function showFullscreenAlert(type, detail) {
        var title = document.getElementById('fullscreen-title');
        var detailEl = document.getElementById('fullscreen-detail');
        
        if (type === 'long') {
            title.textContent = '🚀🚀🚀 双屏共振做多！！！';
            title.style.color = '#00ff7f';
            fullscreenAlert.style.borderColor = '#00ff7f';
        } else if (type === 'short') {
            title.textContent = '💥💥💥 双屏共振做空！！！';
            title.style.color = '#ff5252';
            fullscreenAlert.style.borderColor = '#ff5252';
        } else if (type === 'golden') {
            title.textContent = '🌟🌟🌟 双屏金叉共振！！！';
            title.style.color = '#ffd700';
            fullscreenAlert.style.borderColor = '#ffd700';
        } else if (type === 'death') {
            title.textContent = '💀💀💀 双屏死叉共振！！！';
            title.style.color = '#8a2be2';
            fullscreenAlert.style.borderColor = '#8a2be2';
        }
        
        detailEl.textContent = detail || '';
        fullscreenAlert.style.display = 'flex';
        playAlertSound();
        
        if (fullscreenTimeout) clearTimeout(fullscreenTimeout);
        fullscreenTimeout = setTimeout(function() {
            fullscreenAlert.style.display = 'none';
        }, 3000);
    }

    document.getElementById('fullscreen-close').onclick = function() {
        fullscreenAlert.style.display = 'none';
        if (fullscreenTimeout) clearTimeout(fullscreenTimeout);
    };

    // --- 2. 主监控面板创建 (默认隐藏) ---
    var panel = document.createElement('div');
    panel.id = 'tv-monitor-panel-v7';
    var rawPanelStyle = "position:fixed; background:rgba(20,20,20,0.95); color:#ecf0f1; font-family:'Consolas',monospace; font-size:12px; z-index:999999; border-radius:8px; border:1px solid #444; box-shadow:0 8px 20px rgba(0,0,0,0.6); display:none; flex-direction:column; overflow:hidden; min-width:200px; min-height:150px;";
    rawPanelStyle += "width:" + config.rawPanel.width + "px;";
    rawPanelStyle += "height:" + config.rawPanel.height + "px;";
    rawPanelStyle += "top:" + config.rawPanel.top + "px;";
    if (config.rawPanel.left !== null) {
        rawPanelStyle += "left:" + config.rawPanel.left + "px;";
    } else {
        rawPanelStyle += "right:" + config.rawPanel.right + "px;";
    }
    panel.style.cssText = rawPanelStyle;
    
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
    header.innerHTML = "<span>⚖️ 原始数据 V7.8</span><button id='btn-close-raw' style='background:#c0392b;border:none;color:#fff;padding:2px 8px;border-radius:3px;cursor:pointer;font-size:10px;'>✕ 关闭</button>";
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

    // --- 3. 分析框面板创建 ---
    var analysisPanel = document.createElement('div');
    analysisPanel.id = 'tv-analysis-panel';
    var analysisPanelStyle = "position:fixed; background:rgba(15,15,25,0.98); color:#ecf0f1; font-family:'Consolas',monospace; font-size:11px; z-index:999998; border-radius:8px; border:2px solid #e74c3c; box-shadow:0 8px 25px rgba(231,76,60,0.3); display:flex; flex-direction:column; overflow:hidden; min-width:250px; min-height:200px;";
    analysisPanelStyle += "left:" + config.analysisPanel.left + "px;";
    analysisPanelStyle += "top:" + config.analysisPanel.top + "px;";
    analysisPanelStyle += "width:" + config.analysisPanel.width + "px;";
    analysisPanelStyle += "height:" + config.analysisPanel.height + "px;";
    analysisPanel.style.cssText = analysisPanelStyle;

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
    analysisHeader.innerHTML = "<span>🎯 分析框 V7.8</span><span style='font-size:9px;opacity:0.7;'>拖动移动 | 边角缩放</span>";
    analysisPanel.appendChild(analysisHeader);

    // 模式选择栏
    var modeBar = document.createElement('div');
    modeBar.style.cssText = "display:flex; align-items:center; gap:4px; padding:5px 8px; background:#1a1a1a; border-bottom:1px solid #444; flex-wrap:wrap;";
    
    var realtimeBtnStyle = config.analysisMode === 'realtime' 
        ? 'border:2px solid #27ae60;background:#27ae60;color:#fff;' 
        : 'border:2px solid #555;background:#333;color:#aaa;';
    var periodBtnStyle = config.analysisMode === 'period' 
        ? 'border:2px solid #e67e22;background:#e67e22;color:#fff;' 
        : 'border:2px solid #555;background:#333;color:#aaa;';
    
    modeBar.innerHTML = '' +
        '<button id="btn-realtime" style="padding:3px 8px;border-radius:3px;font-size:10px;cursor:pointer;' + realtimeBtnStyle + '">⚡实时</button>' +
        '<button id="btn-period" style="padding:3px 8px;border-radius:3px;font-size:10px;cursor:pointer;' + periodBtnStyle + '">📊周期</button>' +
        '<input type="number" id="input-period" class="time-input" value="' + (config.periodTime/1000) + '" min="1" max="300" title="周期时间(秒)">' +
        '<span style="font-size:9px;color:#666;">秒</span>' +
        '<span style="font-size:9px;color:#666;margin-left:4px;">刷新:</span>' +
        '<input type="number" id="input-interval" class="time-input" value="' + config.updateInterval + '" min="100" max="5000" step="100" title="刷新间隔(ms)">' +
        '<span style="font-size:9px;color:#666;">ms</span>' +
        '<button id="btn-apply-config" style="margin-left:4px;padding:3px 10px;border-radius:3px;font-size:10px;cursor:pointer;border:none;background:#e67e22;color:#fff;font-weight:bold;">✓ 确认</button>' +
        '<span id="config-status" style="font-size:9px;color:#888;display:none;margin-left:4px;">已应用</span>';
    analysisPanel.appendChild(modeBar);

    // 控制栏
    var analysisControlBar = document.createElement('div');
    analysisControlBar.id = 'analysis-control-bar';
    analysisControlBar.style.cssText = "display:flex; flex-wrap:wrap; align-items:center; gap:4px; padding:5px 8px; background:#222; border-bottom:1px solid #444;";
    
    var alertBtnStyle = config.alertEnabled ? 'background:#27ae60;' : 'background:#c0392b;';
    var alertBtnText = config.alertEnabled ? '🔔开' : '🔕关';
    
    analysisControlBar.innerHTML = '' +
        '<button id="btn-toggle-mode" style="padding:2px 8px;border-radius:3px;font-size:10px;cursor:pointer;border:none;background:#9b59b6;color:#fff;">📊 完整</button>' +
        '<button id="btn-toggle-raw" style="padding:2px 8px;border-radius:3px;font-size:10px;cursor:pointer;border:none;background:#8e44ad;color:#fff;">📋 原始</button>' +
        '<button id="btn-toggle-alert" style="padding:2px 8px;border-radius:3px;font-size:10px;cursor:pointer;border:none;' + alertBtnStyle + 'color:#fff;">' + alertBtnText + '</button>' +
        '<button id="btn-save-config" style="padding:2px 8px;border-radius:3px;font-size:10px;cursor:pointer;border:none;background:#3498db;color:#fff;">💾 保存</button>';
    analysisPanel.appendChild(analysisControlBar);

    // 状态栏 - 共振提示在这里
    var analysisStatusBar = document.createElement('div');
    analysisStatusBar.style.cssText = "display:flex; justify-content:space-between; align-items:center; padding:3px 8px; background:#111; border-bottom:1px solid #444; font-size:10px; min-height:24px;";
    analysisStatusBar.innerHTML = '<div id="resonance-status" style="display:flex;align-items:center;"></div><span id="update-time" style="color:#666;"></span>';
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

    // --- 4. 拖动逻辑 ---
    function makeDraggable(panelEl, headerEl, configKey) {
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
                
                // 保存位置
                if (configKey) {
                    config[configKey].left = newLeft;
                    config[configKey].top = newTop;
                    config[configKey].right = null;
                }
            }
        });
        document.addEventListener('mouseup', function() {
            if (isDragging) {
                isDragging = false;
                panelEl.style.opacity = "1";
            }
        });
    }

    // --- 5. 四角缩放逻辑 ---
    function makeResizable(panelEl, configKey) {
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
            
            // 保存尺寸
            if (configKey) {
                config[configKey].width = newWidth;
                config[configKey].height = newHeight;
                config[configKey].left = newLeft;
                config[configKey].top = newTop;
            }
        });

        document.addEventListener('mouseup', function() {
            if (isResizing) {
                isResizing = false;
                panelEl.style.opacity = "1";
            }
        });
    }

    makeDraggable(panel, document.getElementById('panel-header'), 'rawPanel');
    makeDraggable(analysisPanel, document.getElementById('analysis-header'), 'analysisPanel');
    makeResizable(panel, 'rawPanel');
    makeResizable(analysisPanel, 'analysisPanel');

    // --- 6. 记录功能变量 ---
    var recordedData = [];
    var isRecording = false;
    var recordStartTime = null;
    var durationTimer = null;
    var updateTimer = null;
    
    // --- 共振冷却 ---
    var lastResonanceTime = 0;
    var resonanceCooldown = 5000;

    // --- 7. 辅助函数 ---
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

    function getFastLineStatus(change) {
        if (change > 0.0001) {
            return { text: '↑上涨', class: 'status-up', simple: '↑涨' };
        } else if (change < -0.0001) {
            return { text: '↓下跌', class: 'status-down', simple: '↓跌' };
        } else {
            return { text: '→平缓', class: 'status-flat', simple: '→平' };
        }
    }

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

    // 获取资金滤网状态
    function getFilterStatus(value) {
        if (value > 0) {
            return { text: '🔴红', color: '#ff5252', signal: 'red' };
        } else if (value < 0) {
            return { text: '🔵蓝', color: '#2196f3', signal: 'blue' };
        } else {
            return { text: '⚪中', color: '#888', signal: 'neutral' };
        }
    }

    // 判断交易信号
    function getTradeSignal(isGoldenCross, filterSignal, momentumSide, momentumChange, momentum) {
        // 做多条件: 金叉 + 滤网红 + 多方放量
        if (isGoldenCross && filterSignal === 'red' && momentumSide === '多方' && momentumChange > 0.0001) {
            return { signal: 'long', text: '📈 建议做多', class: 'trade-long' };
        }
        // 做空条件: 死叉 + 滤网蓝 + 空方放量
        if (!isGoldenCross && filterSignal === 'blue' && momentumSide === '空方' && momentumChange < -0.0001) {
            return { signal: 'short', text: '📉 建议做空', class: 'trade-short' };
        }
        return null;
    }

    // --- 8. 周期分析函数 ---
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

    // --- 9. 分析框更新逻辑 ---
    function updateAnalysisPanel(chartData) {
        var html = '';
        var analysisResults = { left: null, right: null };
        var now = Date.now();
        var resonanceStatusEl = document.getElementById('resonance-status');
        
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
                energyWarning: null,
                filterStatus: null,
                tradeSignal: null
            };

            if (!screen.data || screen.data.length === 0) {
                html += "<div style='background:#222;padding:6px;margin-bottom:4px;border-radius:4px;border-left:3px solid #666;'>";
                html += "<b style='color:#ffd700;'>" + screen.name + "</b> <span style='color:#888;'>等待数据...</span></div>";
                analysisResults[screen.key] = result;
                return;
            }

            var mainChart = screen.data[0];
            var filterChart = screen.data[1]; // 指标2 - 资金滤网
            var macdChart = screen.data[2];
            
            var railLength = 0, railHex = '#fff';
            var momentum = 0, fastLine = 0, slowLine = 0;
            var isGoldenCross = false;
            var fastLineChange = 0;
            var momentumChange = 0;
            var filterValue = 0;

            // 主图中轨
            if (mainChart && mainChart.data && mainChart.data.length >= 4) {
                var id1 = parseNumber(mainChart.data[0].val);
                var id4 = parseNumber(mainChart.data[3].val);
                railLength = (id4 - id1).toFixed(3);
                railHex = rgbToHex(mainChart.data[0].color);
            }

            // 资金滤网 - 指标2的第10个数据 (索引9)
            if (filterChart && filterChart.data && filterChart.data.length >= 10) {
                filterValue = parseNumber(filterChart.data[9].val);
                result.filterStatus = getFilterStatus(filterValue);
            }

            // MACD
            if (macdChart && macdChart.data && macdChart.data.length >= 11) {
                momentum = parseNumber(macdChart.data[8].val);
                fastLine = parseNumber(macdChart.data[9].val);
                slowLine = parseNumber(macdChart.data[10].val);
                isGoldenCross = fastLine > slowLine;
                
                result.isGoldenCross = isGoldenCross;

                historyData[screen.key].fastLine.push(fastLine);
                historyData[screen.key].momentum.push(momentum);
                historyData[screen.key].timestamps.push(now);
                
                if (historyData[screen.key].fastLine.length > maxHistoryLength) {
                    historyData[screen.key].fastLine.shift();
                    historyData[screen.key].momentum.shift();
                    historyData[screen.key].timestamps.shift();
                }

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

                // 能量警告
                if (isGoldenCross && fastLineChange <= 0) {
                    result.energyWarning = '⚠️ 金叉能量不足！快线' + (fastLineChange < -0.0001 ? '下跌' : '平缓') + '，注意变盘！';
                } else if (!isGoldenCross && fastLineChange >= 0 && historyData[screen.key].fastLine.length > 2) {
                    result.energyWarning = '⚠️ 死叉能量不足！快线' + (fastLineChange > 0.0001 ? '上涨' : '平缓') + '，注意变盘！';
                }

                // 交易信号
                if (result.filterStatus) {
                    result.tradeSignal = getTradeSignal(
                        isGoldenCross, 
                        result.filterStatus.signal, 
                        result.momentumStatus.side, 
                        momentumChange,
                        momentum
                    );
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
                var filterText = result.filterStatus ? result.filterStatus.text : '—';

                html += "<div class='tv-analysis-box' style='background:#222;padding:8px;border-radius:4px;border-left:4px solid " + borderColor + ";'>";
                
                // 第一行
                html += "<div style='display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;flex-wrap:wrap;gap:4px;'>";
                html += "<span style='color:#ffd700;font-weight:bold;font-size:13px;'>" + screen.name + "</span>";
                html += "<span class='" + fastStatus.class + "' style='font-size:15px;font-weight:bold;'>" + fastStatus.simple + "</span>";
                html += "<span style='color:" + crossColor + ";font-size:11px;'>" + crossIcon + "</span>";
                html += "<span style='font-size:10px;'>滤网:" + filterText + "</span>";
                html += "</div>";
                
                // 第二行
                html += "<div class='tv-data-grid' style='grid-template-columns:repeat(auto-fit,minmax(90px,1fr));font-size:10px;'>";
                html += "<div>中轨: <span style='color:" + railHex + ";font-weight:bold;'>" + railLength + "</span></div>";
                html += "<div style='color:" + momStatus.color + ";'>" + momStatus.side + ": " + momentum.toFixed(3) + "</div>";
                html += "<div>快线: <span style='color:#2196f3;'>" + fastLine.toFixed(3) + "</span></div>";
                html += "<div style='font-size:9px;color:" + momStatus.color + ";'>" + momStatus.side + momStatus.status + "</div>";
                html += "</div>";
                
                // 能量警告
                if (result.energyWarning) {
                    html += "<div class='energy-warning' style='font-size:10px;margin-top:6px;'>" + result.energyWarning + "</div>";
                }
                
                // 交易信号
                if (result.tradeSignal) {
                    html += "<div class='trade-signal " + result.tradeSignal.class + "' style='font-size:11px;margin-top:4px;text-align:center;'>" + result.tradeSignal.text + "</div>";
                }
                
                html += "</div>";
            } 
            // === 完整模式 ===
            else {
                var fastStatus = result.fastLineStatus || { text: '—', class: '' };
                var momStatus = result.momentumStatus || { side: '—', status: '—', color: '#888' };
                var borderColor = fastStatus.class === 'status-up' ? '#00ff7f' : (fastStatus.class === 'status-down' ? '#ff5252' : '#ffc107');
                var filterText = result.filterStatus ? result.filterStatus.text : '—';
                var filterColor = result.filterStatus ? result.filterStatus.color : '#888';

                html += "<div class='tv-analysis-box tv-screen-box' style='border-left:4px solid " + borderColor + ";'>";
                html += "<div style='color:#ffd700;font-weight:bold;margin-bottom:8px;padding-bottom:5px;border-bottom:1px solid #333;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:4px;'>";
                html += "<span style='font-size:13px;'>" + screen.name + "</span>";
                if (config.analysisMode === 'period') {
                    html += "<span style='font-size:9px;color:#888;'>周期:" + (config.periodTime/1000) + "秒</span>";
                }
                html += "<span class='" + fastStatus.class + "' style='font-size:16px;font-weight:bold;'>" + fastStatus.text + "</span>";
                html += "</div>";

                // 中轨 + 滤网
                html += "<div style='display:flex;gap:10px;margin-bottom:8px;flex-wrap:wrap;'>";
                html += "<div style='padding:6px;background:rgba(0,0,0,0.2);border-radius:4px;flex:1;min-width:100px;'>";
                html += "<span style='color:#aaa;font-size:10px;'>📈 中轨:</span> ";
                html += "<span style='color:" + railHex + ";font-size:14px;font-weight:bold;'>" + railLength + "</span>";
                html += "</div>";
                html += "<div style='padding:6px;background:rgba(0,0,0,0.2);border-radius:4px;flex:1;min-width:100px;'>";
                html += "<span style='color:#aaa;font-size:10px;'>💰 滤网:</span> ";
                html += "<span style='color:" + filterColor + ";font-size:14px;font-weight:bold;'>" + filterText + "</span>";
                html += "<span style='color:#666;font-size:9px;margin-left:4px;'>(" + filterValue.toFixed(3) + ")</span>";
                html += "</div>";
                html += "</div>";

                // MACD
                if (macdChart && macdChart.data && macdChart.data.length >= 11) {
                    var crossBg = isGoldenCross 
                        ? 'background:linear-gradient(90deg,rgba(255,215,0,0.15),transparent);border-left:3px solid #ffd700;'
                        : 'background:linear-gradient(90deg,rgba(138,43,226,0.15),transparent);border-left:3px solid #8a2be2;';
                    var crossText = isGoldenCross ? '🌟 金叉' : '💀 死叉';

                    html += "<div style='padding:8px;border-radius:4px;" + crossBg + "'>";
                    
                    html += "<div style='display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;flex-wrap:wrap;gap:4px;'>";
                    html += "<span style='font-size:14px;font-weight:bold;'>" + crossText + "</span>";
                    html += "<span class='" + fastStatus.class + "' style='font-size:12px;font-weight:bold;'>快线" + fastStatus.text + "</span>";
                    html += "<span style='color:" + momStatus.color + ";font-size:11px;'>" + momStatus.side + momStatus.status + "</span>";
                    html += "</div>";
                    
                    html += "<div class='tv-data-grid' style='grid-template-columns:repeat(auto-fit,minmax(80px,1fr));font-size:10px;background:rgba(0,0,0,0.2);padding:6px;border-radius:3px;'>";
                    html += "<div style='text-align:center;'><div style='color:#888;font-size:9px;'>动能(9)</div><div style='color:" + momStatus.color + ";font-weight:bold;font-size:12px;'>" + momentum.toFixed(3) + "</div><div style='font-size:8px;color:#666;'>(" + (momentumChange >= 0 ? '+' : '') + momentumChange.toFixed(4) + ")</div></div>";
                    html += "<div style='text-align:center;'><div style='color:#888;font-size:9px;'>快线(10)</div><div style='color:#2196f3;font-weight:bold;font-size:12px;'>" + fastLine.toFixed(3) + "</div><div class='" + fastStatus.class + "' style='font-size:8px;'>(" + (fastLineChange >= 0 ? '+' : '') + fastLineChange.toFixed(4) + ")</div></div>";
                    html += "<div style='text-align:center;'><div style='color:#888;font-size:9px;'>慢线(11)</div><div style='color:#ffeb3b;font-weight:bold;font-size:12px;'>" + slowLine.toFixed(3) + "</div></div>";
                    html += "</div>";

                    if (result.energyWarning) {
                        html += "<div class='energy-warning' style='margin-top:8px;'>" + result.energyWarning + "</div>";
                    }

                    // 交易信号
                    if (result.tradeSignal) {
                        html += "<div class='trade-signal " + result.tradeSignal.class + "' style='margin-top:8px;text-align:center;font-size:13px;'>" + result.tradeSignal.text + "</div>";
                    }

                    html += "</div>";
                }
                html += "</div>";
            }
        });

        // --- 双屏共振判断 ---
        var leftResult = analysisResults.left;
        var rightResult = analysisResults.right;
        var resonanceHtml = '';
        var shouldTriggerFullscreen = false;
        var fullscreenType = '';
        var fullscreenDetail = '';
        
        if (leftResult && rightResult && leftResult.fastLineStatus && rightResult.fastLineStatus) {
            // 双屏同时做多信号
            if (leftResult.tradeSignal && leftResult.tradeSignal.signal === 'long' &&
                rightResult.tradeSignal && rightResult.tradeSignal.signal === 'long') {
                resonanceHtml = '<span class="resonance-status resonance-long">🚀 双屏做多共振！</span>';
                shouldTriggerFullscreen = true;
                fullscreenType = 'long';
                fullscreenDetail = '金叉 + 滤网红 + 多方放量';
            }
            // 双屏同时做空信号
            else if (leftResult.tradeSignal && leftResult.tradeSignal.signal === 'short' &&
                     rightResult.tradeSignal && rightResult.tradeSignal.signal === 'short') {
                resonanceHtml = '<span class="resonance-status resonance-short">💥 双屏做空共振！</span>';
                shouldTriggerFullscreen = true;
                fullscreenType = 'short';
                fullscreenDetail = '死叉 + 滤网蓝 + 空方放量';
            }
            // 双屏同时金叉
            else if (leftResult.isGoldenCross && rightResult.isGoldenCross) {
                resonanceHtml = '<span class="resonance-status resonance-golden">🌟 双屏金叉</span>';
                if (leftResult.fastLineStatus.class === 'status-up' && rightResult.fastLineStatus.class === 'status-up') {
                    resonanceHtml += '<span class="resonance-status resonance-long">🚀 双屏上涨</span>';
                    shouldTriggerFullscreen = true;
                    fullscreenType = 'golden';
                    fullscreenDetail = '双屏金叉 + 快线同步上涨';
                }
            }
            // 双屏同时死叉
            else if (!leftResult.isGoldenCross && !rightResult.isGoldenCross && historyData.left.fastLine.length > 2) {
                resonanceHtml = '<span class="resonance-status resonance-death">💀 双屏死叉</span>';
                if (leftResult.fastLineStatus.class === 'status-down' && rightResult.fastLineStatus.class === 'status-down') {
                    resonanceHtml += '<span class="resonance-status resonance-short">💥 双屏下跌</span>';
                    shouldTriggerFullscreen = true;
                    fullscreenType = 'death';
                    fullscreenDetail = '双屏死叉 + 快线同步下跌';
                }
            }
            // 双屏快线同时上涨
            else if (leftResult.fastLineStatus.class === 'status-up' && rightResult.fastLineStatus.class === 'status-up') {
                resonanceHtml = '<span class="resonance-status resonance-long">🚀 双屏上涨</span>';
            }
            // 双屏快线同时下跌
            else if (leftResult.fastLineStatus.class === 'status-down' && rightResult.fastLineStatus.class === 'status-down') {
                resonanceHtml = '<span class="resonance-status resonance-short">💥 双屏下跌</span>';
            }
            
            // 触发全屏警报
            if (shouldTriggerFullscreen && config.alertEnabled) {
                var currentTime = Date.now();
                if (currentTime - lastResonanceTime > resonanceCooldown) {
                    lastResonanceTime = currentTime;
                    showFullscreenAlert(fullscreenType, fullscreenDetail);
                }
            }
        }

        resonanceStatusEl.innerHTML = resonanceHtml || '<span style="color:#888;">监控中...</span>';
        document.getElementById('update-time').textContent = getTimeStr();
        analysisContent.innerHTML = html;
    }

    // --- 10. 核心扫描逻辑 ---
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

        updateAnalysisPanel(chartData);

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

    // --- 11. 录制控制 ---
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

    // --- 12. 事件绑定 ---
    setTimeout(function bindEvents() {
        document.getElementById('btn-start').onclick = startRecording;
        document.getElementById('btn-stop').onclick = stopRecording;
        document.getElementById('btn-export').onclick = exportData;
        
        document.getElementById('btn-close-raw').onclick = function() {
            panel.style.display = 'none';
            document.getElementById('btn-toggle-raw').textContent = '📋 原始';
            document.getElementById('btn-toggle-raw').style.background = '#8e44ad';
        };
        
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
        
        document.getElementById('btn-toggle-alert').onclick = function() {
            config.alertEnabled = !config.alertEnabled;
            if (config.alertEnabled) {
                this.textContent = '🔔开';
                this.style.background = '#27ae60';
                initAudio();
            } else {
                this.textContent = '🔕关';
                this.style.background = '#c0392b';
            }
            saveConfig();
        };
        
        document.getElementById('btn-save-config').onclick = function() {
            saveConfig();
            this.textContent = '✓ 已保存';
            this.style.background = '#27ae60';
            setTimeout(function() {
                document.getElementById('btn-save-config').textContent = '💾 保存';
                document.getElementById('btn-save-config').style.background = '#3498db';
            }, 2000);
        };
        
        document.getElementById('btn-realtime').onclick = function() {
            tempConfig.analysisMode = 'realtime';
            this.style.background = '#27ae60';
            this.style.borderColor = '#27ae60';
            this.style.color = '#fff';
            document.getElementById('btn-period').style.background = '#333';
            document.getElementById('btn-period').style.borderColor = '#555';
            document.getElementById('btn-period').style.color = '#aaa';
            showConfigPending();
        };
        
        document.getElementById('btn-period').onclick = function() {
            tempConfig.analysisMode = 'period';
            this.style.background = '#e67e22';
            this.style.borderColor = '#e67e22';
            this.style.color = '#fff';
            document.getElementById('btn-realtime').style.background = '#333';
            document.getElementById('btn-realtime').style.borderColor = '#555';
            document.getElementById('btn-realtime').style.color = '#aaa';
            showConfigPending();
        };
        
        document.getElementById('input-period').onchange = function() {
            var val = parseInt(this.value);
            if (val >= 1 && val <= 300) {
                tempConfig.periodTime = val * 1000;
                showConfigPending();
            }
        };
        
        document.getElementById('input-interval').onchange = function() {
            var val = parseInt(this.value);
            if (val >= 100 && val <= 5000) {
                tempConfig.updateInterval = val;
                showConfigPending();
            }
        };
        
        document.getElementById('btn-apply-config').onclick = function() {
            config.analysisMode = tempConfig.analysisMode;
            config.periodTime = tempConfig.periodTime;
            config.updateInterval = tempConfig.updateInterval;
            
            clearInterval(updateTimer);
            updateTimer = setInterval(updatePanel, config.updateInterval);
            
            historyData.left.fastLine = [];
            historyData.left.momentum = [];
            historyData.left.timestamps = [];
            historyData.right.fastLine = [];
            historyData.right.momentum = [];
            historyData.right.timestamps = [];
            
            saveConfig();
            
            var statusEl = document.getElementById('config-status');
            statusEl.textContent = '✓ 已应用';
            statusEl.style.color = '#27ae60';
            statusEl.style.display = 'inline';
            
            var btnEl = document.getElementById('btn-apply-config');
            btnEl.style.background = '#27ae60';
            btnEl.textContent = '✓ 已确认';
            btnEl.style.animation = 'none';
            
            setTimeout(function() {
                btnEl.style.background = '#e67e22';
                btnEl.textContent = '✓ 确认';
                statusEl.style.display = 'none';
            }, 2000);
            
            console.log('[V7.8] 配置已应用并保存:', config);
        };
        
        function showConfigPending() {
            var statusEl = document.getElementById('config-status');
            statusEl.textContent = '⏳ 待确认';
            statusEl.style.color = '#ff9800';
            statusEl.style.display = 'inline';
            
            var btnEl = document.getElementById('btn-apply-config');
            btnEl.style.background = '#ff5722';
            btnEl.style.animation = 'pulse 1s infinite';
        }
        
    }, 100);

    // --- 13. 启动 ---
    updatePanel();
    updateTimer = setInterval(updatePanel, config.updateInterval);
    if (window.__TV_HOT_CONTEXT) window.__TV_HOT_CONTEXT.timer = updateTimer;

    console.log(">>> [云端 V7.8] 初始化完成！配置自动加载，位置和设置已恢复");

})();