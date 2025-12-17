// ==UserScript==
// @name         TradingView 金指数据监控 V7.0 (带记录功能)
// @namespace    http://tampermonkey.net/
// @version      7.1
// @description  监控左右分屏指标数据，支持共振高亮与数据本地导出CSV
// @author       You
// @match        https://*.tradingview.com/chart/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // --- 全局配置与状态 ---
    const CONFIG = {
        keywords: ['金指', '数据智能'], // 监控关键词
        scanInterval: 1000,            // 扫描频率(ms)
    };

    let isRecording = false; // 是否正在记录
    let recordedData = [];   // 存储记录的数据
    let recordCount = 0;     // 记录条数计数

    // --- 热更新清理 (防止开发调试时重复创建) ---
    if (window.__TV_MONITOR_PANEL) {
        try {
            document.body.removeChild(window.__TV_MONITOR_PANEL);
            clearInterval(window.__TV_MONITOR_TIMER);
        } catch(e) {}
    }

    // --- 辅助函数：颜色转换 RGB转Hex ---
    function rgbToHex(rgb) {
        if (!rgb || rgb.indexOf('rgb') === -1) return '#ffffff';
        const sep = rgb.indexOf(",") > -1 ? "," : " ";
        rgb = rgb.substr(4).split(")")[0].split(sep);
        let r = (+rgb[0]).toString(16),
            g = (+rgb[1]).toString(16),
            b = (+rgb[2]).toString(16);
        if (r.length == 1) r = "0" + r;
        if (g.length == 1) g = "0" + g;
        if (b.length == 1) b = "0" + b;
        return "#" + r + g + b;
    }

    // --- 辅助函数：导出CSV ---
    function downloadCSV() {
        if (recordedData.length === 0) {
            alert('没有数据可导出，请先开始记录！');
            return;
        }

        // CSV 表头
        let csvContent = "\uFEFF"; // 添加 BOM 防止 Excel 中文乱码
        csvContent += "时间,指标名称,左屏数值,左屏方向(颜色),右屏数值,右屏方向(颜色),共振状态\n";

        // 构建数据行
        recordedData.forEach(row => {
            csvContent += `${row.time},${row.name},${row.lVal},${row.lColor},${row.rVal},${row.rColor},${row.resonance}\n`;
        });

        // 创建下载链接
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        const timestamp = new Date().toISOString().slice(0,19).replace(/T|:/g,"-");
        
        link.setAttribute("href", url);
        link.setAttribute("download", `TV_Data_Log_${timestamp}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    // --- 核心逻辑：UI 构建 ---
    const panel = document.createElement('div');
    panel.id = 'tv-monitor-panel-v7';
    window.__TV_MONITOR_PANEL = panel;

    // 样式定义
    panel.style.cssText = `
        position: fixed;
        top: 60px;
        right: 20px;
        width: 380px;
        background: rgba(30, 34, 45, 0.95);
        color: #e0e3eb;
        z-index: 9999;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.5);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Ubuntu, sans-serif;
        font-size: 12px;
        border: 1px solid #434651;
        user-select: none;
    `;

    // --- 核心逻辑：数据提取与更新 ---
    function updatePanel() {
        // 1. 获取图表窗口
        const widgets = document.querySelectorAll('.chart-widget');
        if (widgets.length < 2) {
            panel.innerHTML = `<div style="padding:15px; color:#ff6b6b;">⚠ 需要至少两个分屏图表</div>`;
            return;
        }

        // 2. 提取左右屏数据函数
        const extractData = (widgetIndex) => {
            const container = widgets[widgetIndex];
            const titles = Array.from(container.querySelectorAll('[class*="title-"]'));
            
            // 筛选符合关键词的指标
            const targets = titles.filter(t => CONFIG.keywords.some(k => t.innerText.includes(k)));
            
            // 提取数据
            return targets.map(t => {
                const parent = t.closest('[class*="legend-"]'); // 向上找容器 (可能需要根据实际DOM调整)
                if(!parent) return null;
                
                // 查找数值元素
                const valEl = parent.querySelector('[class*="valueValue-"]');
                if(!valEl) return null;

                const colorStr = window.getComputedStyle(valEl).color;
                
                return {
                    name: t.innerText.trim(),
                    value: valEl.innerText.trim(),
                    color: rgbToHex(colorStr),
                    top: t.getBoundingClientRect().top // 用于对齐排序
                };
            }).filter(d => d !== null).sort((a,b) => a.top - b.top);
        };

        const leftData = extractData(0);
        const rightData = extractData(1);

        // 3. 数据合并对齐 (简单按索引对齐，假设左右指标顺序一致)
        const rows = [];
        const maxLen = Math.max(leftData.length, rightData.length);
        
        // 获取当前时间
        const nowStr = new Date().toLocaleTimeString('zh-CN', {hour12: false});
        
        for(let i=0; i<maxLen; i++) {
            const l = leftData[i] || {name: '-', value: '-', color: '#666'};
            const r = rightData[i] || {name: '-', value: '-', color: '#666'};
            
            // 判断名称是否近似 (可选)
            const displayName = l.name !== '-' ? l.name : r.name;
            
            // 判断共振
            const isResonance = (l.color === r.color && l.value !== '-' && r.value !== '-');
            const rowBg = isResonance ? 'rgba(46, 204, 113, 0.15)' : 'transparent';
            
            rows.push({
                displayName,
                l,
                r,
                rowBg,
                isResonance
            });

            // --- 记录数据逻辑 ---
            if (isRecording) {
                recordedData.push({
                    time: nowStr,
                    name: displayName,
                    lVal: l.value,
                    lColor: l.color,
                    rVal: r.value,
                    rColor: r.color,
                    resonance: isResonance ? "是" : "否"
                });
            }
        }

        if (isRecording) recordCount += rows.length;

        // 4. 构建 HTML
        let html = `
            <div id="drag-handle" style="padding: 10px; background: #2a2e39; border-bottom: 1px solid #434651; cursor: move; display:flex; justify-content:space-between; align-items:center; border-radius: 8px 8px 0 0;">
                <span style="font-weight:bold; color:#d1d4dc;">📊 金指数据监控</span>
                <div style="display:flex; gap:5px;">
                    <button id="btn-record" style="background:${isRecording ? '#ff4757' : '#2ecc71'}; border:none; color:white; padding:4px 8px; border-radius:4px; cursor:pointer;">
                        ${isRecording ? '⏹ 停止' : '⏺ 录制'}
                    </button>
                    <button id="btn-export" style="background:#3498db; border:none; color:white; padding:4px 8px; border-radius:4px; cursor:pointer;">
                        💾 导出
                    </button>
                </div>
            </div>
            
            <div style="padding: 5px 10px; font-size:10px; color:#888; border-bottom:1px solid #434651;">
                已记录数据: <span style="color:#e0e3eb">${recordCount}</span> 行 
                ${isRecording ? '<span style="color:#e74c3c; margin-left:5px;">● 录制中...</span>' : ''}
            </div>

            <table style="width:100%; border-collapse: collapse; text-align: left;">
                <thead>
                    <tr style="color: #787b86; font-size: 10px; border-bottom: 1px solid #434651;">
                        <th style="padding: 8px;">指标名称</th>
                        <th style="padding: 8px;">左屏 (40分)</th>
                        <th style="padding: 8px;">右屏 (10分)</th>
                    </tr>
                </thead>
                <tbody>
        `;

        rows.forEach(row => {
            html += `
                <tr style="background:${row.rowBg}; border-bottom: 1px solid #363a45;">
                    <td style="padding: 6px 8px; max-width:100px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${row.displayName}</td>
                    
                    <td style="padding: 6px 8px;">
                        <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:${row.l.color}; margin-right:5px;"></span>
                        <span style="color:${row.l.color}">${row.l.value}</span>
                    </td>
                    
                    <td style="padding: 6px 8px;">
                        <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:${row.r.color}; margin-right:5px;"></span>
                        <span style="color:${row.r.color}">${row.r.value}</span>
                    </td>
                </tr>
            `;
        });

        html += `</tbody></table>`;
        
        // 渲染内容
        panel.innerHTML = html;

        // 重新绑定事件 (因为innerHTML重置了DOM)
        bindEvents();
    }

    // --- 事件绑定 ---
    function bindEvents() {
        // 拖动逻辑
        const handle = document.getElementById('drag-handle');
        if(handle) {
            handle.onmousedown = function(e) {
                let disX = e.clientX - panel.offsetLeft;
                let disY = e.clientY - panel.offsetTop;
                document.onmousemove = function(e) {
                    panel.style.left = (e.clientX - disX) + 'px';
                    panel.style.top = (e.clientY - disY) + 'px';
                    panel.style.opacity = '0.8';
                };
                document.onmouseup = function() {
                    document.onmousemove = null;
                    document.onmouseup = null;
                    panel.style.opacity = '1';
                };
            };
        }

        // 按钮逻辑
        const btnRecord = document.getElementById('btn-record');
        const btnExport = document.getElementById('btn-export');

        if(btnRecord) {
            btnRecord.onclick = () => {
                isRecording = !isRecording;
                // 立即触发一次更新以刷新UI状态
                // updatePanel 在 setInterval 中会自动调用，这里不用强制调用以免闪烁
            };
        }

        if(btnExport) {
            btnExport.onclick = () => {
                downloadCSV();
            };
        }
    }

    // --- 初始化与启动 ---
    document.body.appendChild(panel);
    
    // 定时扫描
    window.__TV_MONITOR_TIMER = setInterval(updatePanel, CONFIG.scanInterval);

    // 初次运行
    updatePanel();

})();