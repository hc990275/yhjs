/* TradingView 云端逻辑 (坐标识别版) */

(function() {
    // ================= 配置区 =================
    const MULTIPLIER = 4;           // 分屏倍数
    const TIME_PRESETS = [3, 5, 10, 15]; // 预设时间
    const ACTION_DELAY = 400;       // 操作延迟(毫秒)，太快容易漏键
    // ==========================================

    if (document.getElementById('tv-helper-panel')) return;

    // 延时加载UI
    setTimeout(createControlPanel, 1000);

    // --- UI 创建部分 ---
    function createControlPanel() {
        const panel = document.createElement('div');
        panel.id = 'tv-helper-panel';
        // 初始位置放在顶部中间偏下一点，移除transform，方便拖拽
        panel.style.cssText = `
            position: fixed; top: 50px; left: 50%; margin-left: -150px;
            z-index: 999998; background-color: #1e222d; padding: 6px 10px;
            border-radius: 6px; box-shadow: 0 4px 10px rgba(0,0,0,0.6);
            display: flex; align-items: center; gap: 8px;
            border: 1px solid #434651; color: #d1d4dc;
            font-family: sans-serif; font-size: 12px;
            cursor: move; user-select: none;
        `;
        panel.title = "按住空白处可拖动";

        // 1. 布局按钮
        const layoutGroup = document.createElement('div');
        layoutGroup.style.cssText = 'display: flex; gap: 4px; border-right: 1px solid #434651; padding-right: 8px;';
        layoutGroup.appendChild(createButton('单屏', () => toggleLayout('1')));
        layoutGroup.appendChild(createButton('双屏', () => toggleLayout('2')));

        // 2. 时间按钮
        const timeGroup = document.createElement('div');
        timeGroup.style.cssText = 'display: flex; gap: 4px; border-right: 1px solid #434651; padding-right: 8px;';
        TIME_PRESETS.forEach(min => {
            const btn = createButton(`${min}m`, () => applySmartTime(min));
            btn.title = `主屏${min}分 | 分屏${min * MULTIPLIER}分`;
            timeGroup.appendChild(btn);
        });

        // 3. 重载按钮 (刷新网页)
        const actionGroup = document.createElement('div');
        const btnReload = createButton('↻', () => location.reload());
        btnReload.style.color = "#f0ad4e";
        actionGroup.appendChild(btnReload);

        panel.appendChild(layoutGroup);
        panel.appendChild(timeGroup);
        panel.appendChild(actionGroup);

        document.body.appendChild(panel);
        
        // 启用拖拽
        makeDraggable(panel);
    }

    function createButton(text, onClick) {
        const btn = document.createElement('button');
        btn.innerText = text;
        btn.onclick = (e) => {
            e.stopPropagation(); // 阻止冒泡，防止触发拖拽
            onClick();
        };
        btn.style.cssText = `
            cursor: pointer; background-color: #2a2e39; border: 1px solid #434651;
            color: #d1d4dc; padding: 4px 10px; border-radius: 4px; font-size: 12px;
            transition: background 0.2s;
        `;
        btn.onmouseover = () => btn.style.backgroundColor = text === '↻' ? '#444' : '#2962ff';
        btn.onmouseout = () => btn.style.backgroundColor = '#2a2e39';
        return btn;
    }

    // --- 拖拽功能实现 ---
    function makeDraggable(el) {
        let isDragging = false;
        let startX, startY, initialLeft, initialTop;

        el.addEventListener('mousedown', (e) => {
            if (e.target.tagName === 'BUTTON') return;
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            initialLeft = el.offsetLeft;
            initialTop = el.offsetTop;
            el.style.opacity = '0.9';
        });

        window.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            el.style.left = `${initialLeft + (e.clientX - startX)}px`;
            el.style.top = `${initialTop + (e.clientY - startY)}px`;
            // 清除 margin 以防止位置计算错误
            el.style.margin = '0';
            el.style.transform = 'none';
        });

        window.addEventListener('mouseup', () => {
            isDragging = false;
            el.style.opacity = '1';
        });
    }

    // --- 核心逻辑: 智能时间设置 ---
    async function applySmartTime(baseMinutes) {
        // 1. 获取所有的图表 Widget
        // chart-widget 是 TV 图表的最外层容器
        const chartWidgets = Array.from(document.querySelectorAll('.chart-widget'));
        
        if (chartWidgets.length === 0) {
            console.error('未找到图表组件');
            return;
        }

        // 2. 根据屏幕位置(X坐标)进行排序
        // getBoundingClientRect().x 越小，说明越在左边
        chartWidgets.sort((a, b) => {
            return a.getBoundingClientRect().x - b.getBoundingClientRect().x;
        });

        const mainChart = chartWidgets[0]; // 永远是左边第一个
        const splitChart = chartWidgets.length > 1 ? chartWidgets[1] : null; // 如果有第二个，就是右边那个

        console.log(`识别到 ${chartWidgets.length} 个图窗`);

        // 3. 设置主屏时间
        await setChartTime(mainChart, baseMinutes);

        // 4. 如果存在分屏，则设置分屏时间 (4倍)
        if (splitChart) {
            // 稍等一下再设置右边，给 UI 一点反应时间
            setTimeout(async () => {
                await setChartTime(splitChart, baseMinutes * MULTIPLIER);
            }, ACTION_DELAY);
        }
    }

    // 单个图表设置时间的底层逻辑：点击 -> 输入数字 -> 回车
    function setChartTime(chartElement, minutes) {
        return new Promise((resolve) => {
            if (!chartElement) { resolve(); return; }

            // 第一步：点击图表区域，确保它获得焦点
            // 我们点击图表的中心位置，避免点到边界
            simulateClick(chartElement);

            setTimeout(() => {
                const inputStr = minutes.toString();
                console.log(`正在向图表输入: ${inputStr}`);

                // 模拟键盘敲击数字
                for (let i = 0; i < inputStr.length; i++) {
                    dispatchKey(inputStr[i]);
                }

                // 稍微延迟后敲击回车
                setTimeout(() => {
                    dispatchEnter();
                    resolve();
                }, 150);
            }, 150);
        });
    }

    // --- 辅助：模拟点击与按键 ---
    function simulateClick(element) {
        // 获取元素中心坐标，确保点在实处
        const rect = element.getBoundingClientRect();
        const clientX = rect.left + rect.width / 2;
        const clientY = rect.top + rect.height / 2;

        ['mousedown', 'mouseup', 'click'].forEach(evtType => {
            const evt = new MouseEvent(evtType, {
                bubbles: true, cancelable: true, view: window,
                clientX: clientX, clientY: clientY
            });
            element.dispatchEvent(evt);
        });
    }

    function dispatchKey(key) {
        const evtOpts = { key: key, code: `Digit${key}`, keyCode: key.charCodeAt(0), bubbles: true, cancelable: true };
        ['keydown', 'keypress', 'keyup'].forEach(type => document.dispatchEvent(new KeyboardEvent(type, evtOpts)));
    }

    function dispatchEnter() {
        const evtOpts = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true };
        ['keydown', 'keypress', 'keyup'].forEach(type => document.dispatchEvent(new KeyboardEvent(type, evtOpts)));
    }

    // --- 布局切换 ---
    function toggleLayout(type) {
        const layoutBtn = document.querySelector('[data-name="header-toolbar-layout-button"]');
        if (!layoutBtn) return;
        simulateClick(layoutBtn);
        setTimeout(() => {
            const menuItems = document.querySelectorAll('[data-name="menu-inner"] div[role="button"]');
            if (type === '1' && menuItems[0]) simulateClick(menuItems[0]); // 单屏
            else if (type === '2') {
                // 寻找双屏垂直 (根据实际情况可能是第2个或第4个)
                if (menuItems.length > 3) simulateClick(menuItems[3]); 
                else if (menuItems[1]) simulateClick(menuItems[1]);
            }
        }, 300);
    }

})();