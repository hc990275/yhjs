/* TradingView 云端逻辑核心
   修改此文件后，客户端刷新页面即可生效
*/

(function() {
    // ================= 配置区 =================
    const MULTIPLIER = 4;           // 分屏倍数
    const TIME_PRESETS = [3, 5, 10, 15]; // 预设时间按钮
    const ACTION_DELAY = 300;       // 操作延迟(毫秒)
    // ==========================================

    // 防止重复注入 (如果网络波动导致请求了两次)
    if (document.getElementById('tv-helper-panel')) return;

    // 等待 TV 页面加载就绪
    // 因为是异步拉取的，通常执行到这里时页面已经好了，但为了稳妥还是用 setTimeout
    setTimeout(createControlPanel, 1000);

    function createControlPanel() {
        const panel = document.createElement('div');
        panel.id = 'tv-helper-panel';
        panel.style.cssText = `
            position: fixed; top: 5px; left: 50%; transform: translateX(-50%);
            z-index: 999999; background-color: #1e222d; padding: 4px 8px;
            border-radius: 6px; box-shadow: 0 2px 5px rgba(0,0,0,0.5);
            display: flex; align-items: center; gap: 8px;
            border: 1px solid #434651; color: #d1d4dc;
            font-family: sans-serif; font-size: 12px;
        `;

        // 1. 布局按钮
        const layoutGroup = document.createElement('div');
        layoutGroup.style.cssText = 'display: flex; gap: 4px; border-right: 1px solid #434651; padding-right: 6px;';
        layoutGroup.appendChild(createButton('单屏', () => toggleLayout('1')));
        layoutGroup.appendChild(createButton('双屏', () => toggleLayout('2')));

        // 2. 时间按钮
        const timeGroup = document.createElement('div');
        timeGroup.style.cssText = 'display: flex; gap: 4px; border-right: 1px solid #434651; padding-right: 6px;';
        TIME_PRESETS.forEach(min => {
            const btn = createButton(`${min}m`, () => applyTimeFrame(min));
            btn.title = `主屏${min}分 / 分屏${min * MULTIPLIER}分`;
            timeGroup.appendChild(btn);
        });

        // 3. 重载/更新按钮
        // 这里的 location.reload() 会刷新网页，从而触发本地油猴脚本重新去服务器拉取最新代码
        const actionGroup = document.createElement('div');
        const btnReload = createButton('↻', () => location.reload());
        btnReload.title = "刷新页面并获取最新脚本";
        btnReload.style.color = "#f0ad4e";
        actionGroup.appendChild(btnReload);

        panel.appendChild(layoutGroup);
        panel.appendChild(timeGroup);
        panel.appendChild(actionGroup);
        document.body.appendChild(panel);
    }

    function createButton(text, onClick) {
        const btn = document.createElement('button');
        btn.innerText = text;
        btn.onclick = onClick;
        btn.style.cssText = `
            cursor: pointer; background-color: #2a2e39; border: 1px solid #434651;
            color: #d1d4dc; padding: 4px 8px; border-radius: 4px; font-size: 12px;
            transition: background 0.2s;
        `;
        btn.onmouseover = () => btn.style.backgroundColor = text === '↻' ? '#444' : '#2962ff';
        btn.onmouseout = () => btn.style.backgroundColor = '#2a2e39';
        return btn;
    }

    // --- 核心逻辑 ---

    function toggleLayout(type) {
        const layoutBtn = document.querySelector('[data-name="header-toolbar-layout-button"]');
        if (!layoutBtn) return alert('未找到布局按钮');
        simulateClick(layoutBtn);
        setTimeout(() => {
            const menuItems = document.querySelectorAll('[data-name="menu-inner"] div[role="button"]');
            if (type === '1' && menuItems[0]) simulateClick(menuItems[0]);
            else if (type === '2') {
                // 尝试点击双屏垂直 (通常是第4个或第2个)
                if (menuItems.length > 3) simulateClick(menuItems[3]);
                else if (menuItems[1]) simulateClick(menuItems[1]);
            }
        }, ACTION_DELAY);
    }

    async function applyTimeFrame(baseMinutes) {
        const secondaryMinutes = baseMinutes * MULTIPLIER;
        const charts = document.querySelectorAll('.chart-widget');
        if (charts.length === 0) return;
        
        await setChartInterval(charts[0], baseMinutes);
        if (charts.length > 1) {
            setTimeout(async () => await setChartInterval(charts[1], secondaryMinutes), ACTION_DELAY * 1.5);
        }
    }

    function setChartInterval(chartElement, minutes) {
        return new Promise((resolve) => {
            simulateClick(chartElement);
            let inputStr = minutes.toString();
            setTimeout(() => {
                for (let char of inputStr) dispatchKey(char);
                setTimeout(() => { dispatchEnter(); resolve(); }, 150);
            }, 100);
        });
    }

    // --- 模拟操作工具 ---
    function simulateClick(el) {
        if(!el) return;
        ['mousedown', 'mouseup', 'click'].forEach(evt => 
            el.dispatchEvent(new MouseEvent(evt, { bubbles: true, cancelable: true, view: window }))
        );
    }

    function dispatchKey(key) {
        const opts = { key: key, code: `Digit${key}`, keyCode: key.charCodeAt(0), bubbles: true, cancelable: true };
        ['keydown', 'keypress', 'keyup'].forEach(evt => document.dispatchEvent(new KeyboardEvent(evt, opts)));
    }

    function dispatchEnter() {
        const opts = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true };
        ['keydown', 'keypress', 'keyup'].forEach(evt => document.dispatchEvent(new KeyboardEvent(evt, opts)));
    }
})();