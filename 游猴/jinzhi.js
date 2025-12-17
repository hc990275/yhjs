// ==UserScript==
// @name         TradingView 金指数据监控 V7.0 (带记录版)
// @namespace    http://tampermonkey.net/
// @version      7.1
// @description  基于原版增加日志记录功能
// @author       You
// @match        https://*.tradingview.com/chart/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // --- 新增：记录相关的状态变量 ---
    let isRecording = false;
    let recordedData = [];

    // --- 新增：导出 CSV 函数 ---
    function downloadCSV() {
        if (recordedData.length === 0) {
            alert('暂无数据');
            return;
        }
        let csvContent = "\uFEFF时间,指标名称,左屏数值,左屏颜色,右屏数值,右屏颜色,是否共振\n";
        recordedData.forEach(row => {
            csvContent += `${row.time},${row.name},${row.lVal},${row.lColor},${row.rVal},${row.rColor},${row.resonance}\n`;
        });
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `TV_Log_${new Date().toISOString().slice(0,19).replace(/T|:/g,"-")}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    if (window.__TV_HOT_CONTEXT) {
        try {
            document.body.removeChild(window.__TV_HOT_CONTEXT.panel);
            clearInterval(window.__TV_HOT_CONTEXT.timer);
        } catch(e) {}
    }

    function rgbToHex(rgb) {
        if (!rgb || rgb.indexOf('rgb') === -1) return '#ffffff';
        var sep = rgb.indexOf(",") > -1 ? "," : " ";
        rgb = rgb.substr(4).split(")")[0].split(sep);
        var r = (+rgb[0]).toString(16),
            g = (+rgb[1]).toString(16),
            b = (+rgb[2]).toString(16);
        if (r.length == 1) r = "0" + r;
        if (g.length == 1) g = "0" + g;
        if (b.length == 1) b = "0" + b;
        return "#" + r + g + b;
    }

    var panel = document.createElement('div');
    panel.id = 'tv-monitor-panel-v7';
    panel.style.cssText = `
        position: fixed; top: 100px; right: 20px; width: 320px;
        background: #1e222d; color: #d1d4dc; z-index: 9999;
        border-radius: 4px; box-shadow: 0 2px 5px rgba(0,0,0,0.3);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Ubuntu, sans-serif;
        font-size: 12px; border: 1px solid #434651;
    `;

    function updatePanel() {
        var widgets = document.querySelectorAll('.chart-widget');
        if (widgets.length < 2) {
            panel.innerHTML = '<div style="padding:10px;">等待分屏加载...</div>';
            return;
        }

        var lW = widgets[0], rW = widgets[1];
        
        // 筛选函数保持原样
        var getItems = (w) => {
            var titles = Array.from(w.querySelectorAll('[class*="title-"]'));
            return titles.filter(t => t.innerText.includes('金指') || t.innerText.includes('数据智能')).map(t => {
                var p = t;
                while(p && !p.className.includes('legend-')) p = p.parentElement;
                if(!p) return null;
                var v = p.querySelector('[class*="valueValue-"]');
                return {
                    name: t.innerText,
                    val: v ? v.innerText : '-',
                    color: v ? window.getComputedStyle(v).color : '',
                    top: t.getBoundingClientRect().top
                };
            }).filter(i => i).sort((a,b) => a.top - b.top);
        };

        var lData = getItems(lW);
        var rData = getItems(rW);
        
        // --- 修改点1：在标题栏增加了两个小按钮 ---
        var html = `
            <div id="drag-handle" style="padding: 8px; background: #2a2e39; border-bottom: 1px solid #434651; cursor: move; display:flex; justify-content:space-between;">
                <b>TradingView 金指数据监控 V7.0</b>
                <div>
                    <span id="rec-status" style="margin-right:5px; color:${isRecording ? '#ff5252':'#666'}">${isRecording?'●':''}</span>
                    <button id="btn-toggle" style="cursor:pointer; background:none; border:1px solid #666; color:#ccc; font-size:10px;">${isRecording?'停止':'录制'}</button>
                    <button id="btn-down" style="cursor:pointer; background:none; border:1px solid #666; color:#ccc; font-size:10px;">下载</button>
                </div>
            </div>
            <table style="width:100%; border-collapse: collapse;">
                <tr style="color: #787b86;">
                    <td style="padding:5px;">指标</td>
                    <td style="padding:5px;">左屏(40分)</td>
                    <td style="padding:5px;">右屏(10分)</td>
                </tr>
        `;

        // 记录时间戳
        let nowTime = new Date().toLocaleTimeString();

        var max = Math.max(lData.length, rData.length);
        for(var i=0; i<max; i++) {
            var l = lData[i] || {name:'-', val:'-', color:''};
            var r = rData[i] || {name:'-', val:'-', color:''};
            
            var lHex = rgbToHex(l.color);
            var rHex = rgbToHex(r.color);
            var resonance = (lHex === rHex && lHex !== '#ffffff');
            
            var bg = resonance ? 'rgba(46, 204, 113, 0.1)' : '';

            // --- 新增：如果正在录制，将数据推入数组 ---
            if (isRecording) {
                recordedData.push({
                    time: nowTime,
                    name: l.name !== '-' ? l.name : r.name,
                    lVal: l.val,
                    lColor: lHex,
                    rVal: r.val,
                    rColor: rHex,
                    resonance: resonance ? "是" : "否"
                });
            }

            html += `
                <tr style="background:${bg}">
                    <td style="padding:4px 5px;">${l.name !== '-' ? l.name : r.name}</td>
                    <td style="padding:4px 5px;"><span style="color:${lHex}">●</span> ${l.val}</td>
                    <td style="padding:4px 5px;"><span style="color:${rHex}">●</span> ${r.val}</td>
                </tr>
            `;
        }
        html += '</table>';
        panel.innerHTML = html;

        // --- 新增：绑定按钮事件 (每次刷新DOM都需要重新绑定) ---
        document.getElementById('btn-toggle').onclick = function(e) {
            e.stopPropagation(); // 防止触发拖动
            isRecording = !isRecording;
        };
        document.getElementById('btn-down').onclick = function(e) {
            e.stopPropagation();
            downloadCSV();
        };

        // 拖动逻辑保持不变
        var handle = document.getElementById('drag-handle');
        handle.onmousedown = function(e) {
            var disX = e.clientX - panel.offsetLeft;
            var disY = e.clientY - panel.offsetTop;
            document.onmousemove = function(e) {
                panel.style.left = (e.clientX - disX) + 'px';
                panel.style.top = (e.clientY - disY) + 'px';
                panel.style.opacity = '0.5';
            }
            document.onmouseup = function() {
                document.onmousemove = null;
                document.onmouseup = null;
                panel.style.opacity = '1';
            }
        }
    }

    document.body.appendChild(panel);
    var timer = setInterval(updatePanel, 1000);
    window.__TV_HOT_CONTEXT = { panel: panel, timer: timer };
    updatePanel();
})();