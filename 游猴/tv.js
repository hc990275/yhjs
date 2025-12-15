/* TradingView 云端逻辑 - 修正版 v1.4 */

// ================= 配置区 =================
const MULTIPLIER = 4;           // 分屏倍数
const TIME_PRESETS = [3, 5, 10, 15]; // 预设时间
const ACTION_DELAY = 400;       // 操作延迟
// ==========================================

console.log('>>> 云端脚本正在启动...');

// 1. 检查是否重复运行
// 因为 Loader 用的是 new Function，这里的 return 是合法的
if (document.getElementById('tv-helper-panel')) {
    console.log('>>> 面板已存在，跳过初始化');
    return;
}

// 2. 延时加载 UI (等待页面完全就绪)
setTimeout(createControlPanel, 1000);

// --- UI 创建逻辑 ---
function createControlPanel() {
    const panel = document.createElement('div');
    panel.id = 'tv-helper-panel';
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

    // 布局按钮
    const layoutGroup = document.createElement('div');
    layoutGroup.style.cssText = 'display: flex; gap: 4px; border-right: 1px solid #434651; padding-right: 8px;';
    layoutGroup.appendChild(createButton('单屏', () => toggleLayout('1')));
    layoutGroup.appendChild(createButton('双屏', () => toggleLayout('2')));

    // 时间按钮
    const timeGroup = document.createElement('div');
    timeGroup.style.cssText = 'display: flex; gap: 4px; border-right: 1px solid #434651; padding-right: 8px;';
    TIME_PRESETS.forEach(min => {
        const btn = createButton(`${min}m`, () => applySmartTime(min));
        btn.title = `主屏${min}分 | 分屏${min * MULTIPLIER}分`;
        timeGroup.appendChild(btn);
    });

    // 刷新页面按钮
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
    console.log('>>> 面板创建成功');
}

function createButton(text, onClick) {
    const btn = document.createElement('button');
    btn.innerText = text;
    btn.onclick = (e) => {
        e.stopPropagation(); 
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

// --- 拖拽功能 ---
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
        el.style.margin = '0'; // 清除居中偏移
        el.style.transform = 'none';
    });

    window.addEventListener('mouseup', () => {
        isDragging = false;
        el.style.opacity = '1';
    });
}

// --- 业务逻辑 ---

async function applySmartTime(baseMinutes) {
    const chartWidgets = Array.from(document.querySelectorAll('.chart-widget'));
    
    if (chartWidgets.length === 0) {
        console.error('未找到图表组件');
        return;
    }

    // 按 X 坐标排序 (左->右)
    chartWidgets.sort((a, b) => a.getBoundingClientRect().x - b.getBoundingClientRect().x);

    const mainChart = chartWidgets[0];
    const splitChart = chartWidgets.length > 1 ? chartWidgets[1] : null;

    console.log(`识别到 ${chartWidgets.length} 个图窗`);

    // 设置主屏
    await setChartTime(mainChart, baseMinutes);

    // 设置分屏
    if (splitChart) {
        setTimeout(async () => {
            await setChartTime(splitChart, baseMinutes * MULTIPLIER);
        }, ACTION_DELAY);
    }
}

function setChartTime(chartElement, minutes) {
    return new Promise((resolve) => {
        if (!chartElement) { resolve(); return; }

        simulateClick(chartElement);

        setTimeout(() => {
            const inputStr = minutes.toString();
            // 模拟输入
            for (let i = 0; i < inputStr.length; i++) dispatchKey(inputStr[i]);
            
            // 模拟回车
            setTimeout(() => { dispatchEnter(); resolve(); }, 150);
        }, 150);
    });
}

// --- 模拟操作 ---
function simulateClick(element) {
    const rect = element.getBoundingClientRect();
    const clientX = rect.left + rect.width / 2;
    const clientY = rect.top + rect.height / 2;
    ['mousedown', 'mouseup', 'click'].forEach(evtType => {
        element.dispatchEvent(new MouseEvent(evtType, {
            bubbles: true, cancelable: true, view: window,
            clientX: clientX, clientY: clientY
        }));
    });
}

function dispatchKey(key) {
    const opts = { key: key, code: `Digit${key}`, keyCode: key.charCodeAt(0), bubbles: true, cancelable: true };
    ['keydown', 'keypress', 'keyup'].forEach(type => document.dispatchEvent(new KeyboardEvent(type, opts)));
}

function dispatchEnter() {
    const opts = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true };
    ['keydown', 'keypress', 'keyup'].forEach(type => document.dispatchEvent(new KeyboardEvent(type, opts)));
}

function toggleLayout(type) {
    const layoutBtn = document.querySelector('[data-name="header-toolbar-layout-button"]');
    if (!layoutBtn) return;
    simulateClick(layoutBtn);
    setTimeout(() => {
        const menuItems = document.querySelectorAll('[data-name="menu-inner"] div[role="button"]');
        if (type === '1' && menuItems[0]) simulateClick(menuItems[0]);
        else if (type === '2') {
            if (menuItems.length > 3) simulateClick(menuItems[3]); 
            else if (menuItems[1]) simulateClick(menuItems[1]);
        }
    }, 300);
}