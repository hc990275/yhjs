// ==UserScript==
// @name         TradingView 金指数据监控 V7.10 (优化版)
// @namespace    http://tampermonkey.net/
// @version      7.10
// @description  抓取数值颜色、支持面板拖动、四角缩放、分析、资金滤网、交易建议、归零反弹/反抽、本地配置保存、优化提醒系统
// @author       You
// @match        *://*.tradingview.com/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';
    console.log(">>> [云端 V7.10] 启动优化版监控...");

    // --- 默认配置（新增提醒相关配置）---
    var defaultConfig = {
        simpleMode: false,
        analysisMode: 'realtime',
        periodTime: 60000,
        updateInterval: 500,
        analysisPanel: { left: 20, top: 60, width: 400, height: 500 },
        rawPanel: { left: null, top: 100, right: 20, width: 380, height: 400 },
        alertEnabled: true,
        // 新增配置项
        alertRepeatCount: 3,        // 提醒次数
        alertDuration: 5000,         // 普通提醒显示时间(毫秒)
        bounceAlertDuration: 8000,   // 归零反弹/反抽显示时间(毫秒)
        cooldownTime: 5000           // 冷却时间(毫秒)
    };

    // ... 其他代码保持不变 ...

    // --- 修改全屏提示函数 ---
    function showFullscreenAlert(type, detail) {
        if (!config.alertEnabled) return;
        
        var title = document.getElementById('fullscreen-title');
        var detailEl = document.getElementById('fullscreen-detail');
        var alertEl = document.getElementById('tv-fullscreen-alert');
        var duration = config.alertDuration; // 默认显示时间
        
        if (type === 'long') {
            title.textContent = '🚀🚀🚀 双屏共振做多！！！';
            title.style.color = '#00ff7f';
            alertEl.style.borderColor = '#00ff7f';
            alertEl.style.color = '#00ff7f';
        } else if (type === 'short') {
            title.textContent = '💥💥💥 双屏共振做空！！！';
            title.style.color = '#ff5252';
            alertEl.style.borderColor = '#ff5252';
            alertEl.style.color = '#ff5252';
        } else if (type === 'bounce') {
            title.textContent = '🌟🔄 双屏归零反弹！建议做多！';
            title.style.color = '#ffd700';
            alertEl.style.borderColor = '#ffd700';
            alertEl.style.color = '#ffd700';
            duration = config.bounceAlertDuration; // 使用更长的显示时间
        } else if (type === 'pullback') {
            title.textContent = '💀🔄 双屏归零反抽！建议做空！';
            title.style.color = '#8a2be2';
            alertEl.style.borderColor = '#8a2be2';
            alertEl.style.color = '#8a2be2';
            duration = config.bounceAlertDuration; // 使用更长的显示时间
        }
        // 注意：移除了 golden 和 death 类型的全屏提示
        
        detailEl.textContent = detail || '';
        alertEl.style.display = 'flex';
        alertEl.style.animation = 'flashBorder 0.5s infinite';
        
        // 重复播放声音
        for (var i = 0; i < config.alertRepeatCount; i++) {
            setTimeout(playAlertSound, i * 600);
        }
        
        if (fullscreenTimeout) clearTimeout(fullscreenTimeout);
        fullscreenTimeout = setTimeout(function() {
            alertEl.style.display = 'none';
        }, duration);
    }

    // --- 修改共振判断逻辑 ---
    // 在 updateAnalysisPanel 函数中，修改共振判断部分：
    
    // 1. 双屏归零反弹 - 触发全屏
    if (leftResult.isBounce && rightResult.isBounce) {
        resonanceItems.push('<span class="resonance-status resonance-bounce">🔄 双屏归零反弹！</span>');
        shouldTriggerFullscreen = true;
        fullscreenType = 'bounce';
        fullscreenDetail = '二次金叉，建议做多';
    }
    
    // 2. 双屏归零反抽 - 触发全屏
    if (leftResult.isPullback && rightResult.isPullback) {
        resonanceItems.push('<span class="resonance-status resonance-pullback">🔄 双屏归零反抽！</span>');
        shouldTriggerFullscreen = true;
        fullscreenType = 'pullback';
        fullscreenDetail = '二次死叉，建议做空';
    }
    
    // 3. 双屏同时做多信号 - 触发全屏
    var leftHasLong = leftResult.signals.some(function(s) { return s.type === 'long'; });
    var rightHasLong = rightResult.signals.some(function(s) { return s.type === 'long'; });
    if (leftHasLong && rightHasLong) {
        resonanceItems.push('<span class="resonance-status resonance-long">🚀 双屏做多共振！</span>');
        if (!shouldTriggerFullscreen) {
            shouldTriggerFullscreen = true;
            fullscreenType = 'long';
            fullscreenDetail = '金叉 + 滤网红 + 多方放量';
        }
    }
    
    // 4. 双屏同时做空信号 - 触发全屏
    var leftHasShort = leftResult.signals.some(function(s) { return s.type === 'short'; });
    var rightHasShort = rightResult.signals.some(function(s) { return s.type === 'short'; });
    if (leftHasShort && rightHasShort) {
        resonanceItems.push('<span class="resonance-status resonance-short">💥 双屏做空共振！</span>');
        if (!shouldTriggerFullscreen) {
            shouldTriggerFullscreen = true;
            fullscreenType = 'short';
            fullscreenDetail = '死叉 + 滤网蓝 + 空方放量';
        }
    }
    
    // 5. 双屏同时金叉 - 只在状态栏显示，不触发全屏
    if (leftResult.isGoldenCross && rightResult.isGoldenCross) {
        resonanceItems.push('<span class="resonance-status resonance-golden">🌟 双屏金叉</span>');
        // 移除全屏触发
    }
    
    // 6. 双屏同时死叉 - 只在状态栏显示，不触发全屏
    if (!leftResult.isGoldenCross && !rightResult.isGoldenCross && historyData.left.fastLine.length > 2) {
        resonanceItems.push('<span class="resonance-status resonance-death">💀 双屏死叉</span>');
        // 移除全屏触发
    }
    
    // 7. 双屏快线同时上涨 - 只在状态栏显示，不触发全屏
    if (leftResult.fastLineStatus.class === 'status-up' && rightResult.fastLineStatus.class === 'status-up') {
        resonanceItems.push('<span class="resonance-status resonance-long">🚀 双屏上涨</span>');
        // 移除全屏触发
    }
    
    // 8. 双屏快线同时下跌 - 只在状态栏显示，不触发全屏
    if (leftResult.fastLineStatus.class === 'status-down' && rightResult.fastLineStatus.class === 'status-down') {
        resonanceItems.push('<span class="resonance-status resonance-short">💥 双屏下跌</span>');
        // 移除全屏触发
    }

    // --- 在控制栏中添加新的设置输入 ---
    // 在 analysisControlBar 中添加：
    '<span style="font-size:9px;color:#666;margin-left:4px;">提醒:</span>' +
    '<input type="number" id="input-alert-count" class="time-input" value="' + config.alertRepeatCount + '" min="1" max="10" title="提醒次数">' +
    '<span style="font-size:9px;color:#666;">次</span>' +
    '<span style="font-size:9px;color:#666;margin-left:4px;">时长:</span>' +
    '<input type="number" id="input-alert-duration" class="time-input" value="' + (config.alertDuration/1000) + '" min="1" max="30" title="显示时间(秒)">' +
    '<span style="font-size:9px;color:#666;">秒</span>' +
    '<span style="font-size:9px;color:#666;margin-left:4px;">归零:</span>' +
    '<input type="number" id="input-bounce-duration" class="time-input" value="' + (config.bounceAlertDuration/1000) + '" min="3" max="30" title="归零信号显示时间(秒)">' +
    '<span style="font-size:9px;color:#666;">秒</span>'

    // --- 在事件绑定中添加新的配置处理 ---
    document.getElementById('input-alert-count').onchange = function() {
        var val = parseInt(this.value);
        if (val >= 1 && val <= 10) {
            config.alertRepeatCount = val;
            saveConfig();
        }
    };
    
    document.getElementById('input-alert-duration').onchange = function() {
        var val = parseInt(this.value);
        if (val >= 1 && val <= 30) {
            config.alertDuration = val * 1000;
            saveConfig();
        }
    };
    
    document.getElementById('input-bounce-duration').onchange = function() {
        var val = parseInt(this.value);
        if (val >= 3 && val <= 30) {
            config.bounceAlertDuration = val * 1000;
            saveConfig();
        }
    };

})();