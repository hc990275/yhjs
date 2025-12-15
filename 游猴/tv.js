/* TradingView 云端逻辑 v6.0 (React劫持注入版) */
/* 解决输入错乱核心方案：触发弹窗 -> 抓取输入框 -> 暴力注入值 -> 提交 */

(function() {
    if (document.getElementById('tv-helper-panel')) return;
    
    console.log('>>> [Cloud v6.0] 劫持注入模式启动');

    // ================= 配置区 =================
    const CONFIG = {
        multiplier: 4,               // 分屏倍数
        presets: [3, 5, 10, 15],     // 预设时间
        dialogWait: 300              // 等待输入框弹出的时间 (毫秒)
    };
    // ==========================================

    const utils = {
        createBtn: function(text, color, onClick) {
            const btn = document.createElement('button');
            btn.innerText = text;
            btn.style.cssText = `
                cursor: pointer; background-color: #2a2e39; border: 1px solid #434651;
                color: ${color || '#d1d4dc'}; padding: 4px 10px; border-radius: 4px; 
                font-size: 12px; font-family: sans-serif; transition: all 0.2s;
                min-width: 40px; text-align: center;
            `;
            btn.onmouseenter = () => btn.style.backgroundColor = text === '↻' ? '#444' : '#2962ff';
            btn.onmouseleave = () => btn.style.backgroundColor = '#2a2e39';
            btn.onmousedown = (e) => e.stopPropagation();
            btn.onclick = (e) => { e.stopPropagation(); onClick(); };
            return btn;
        },

        // 激活图表
        activateChart: function(widget) {
            if (!widget) return;
            const target = widget.querySelector('canvas') || widget; 
            const rect = target.getBoundingClientRect();
            const eventOpts = {
                bubbles: true, cancelable: true, view: window,
                clientX: rect.left + rect.width / 2, 
                clientY: rect.top + rect.height / 2, 
                buttons: 1
            };
            target.dispatchEvent(new MouseEvent('mousedown', eventOpts));
            target.dispatchEvent(new MouseEvent('mouseup', eventOpts));
            target.dispatchEvent(new MouseEvent('click', eventOpts));
        },

        // 仅发送一个触发键 (骗出弹窗)
        triggerDialog: function(firstChar) {
            const key = firstChar.toString();
            const code = `Digit${key}`;
            const keyCode = key.charCodeAt(0);
            const evtProps = {
                key: key, code: code, 
                keyCode: keyCode, which: keyCode, charCode: keyCode,
                bubbles: true, cancelable: true, view: window
            };
            document.body.dispatchEvent(new KeyboardEvent('keydown', evtProps));
            document.body.dispatchEvent(new KeyboardEvent('keypress', evtProps));
            document.body.dispatchEvent(new KeyboardEvent('keyup', evtProps));
        },

        // 【核心黑科技】React 暴力赋值
        // 普通的 input.value = '15' 不会触发 React 更新，必须用这种方式
        reactSetValue: function(input, value) {
            const lastValue = input.value;
            input.value = value;
            const tracker = input._valueTracker;
            if (tracker) {
                tracker.setValue(lastValue);
            }
            // 触发 React 的 onChange 监听
            const event = new Event('input', { bubbles: true });
            input.dispatchEvent(event);
        },

        // 在特定元素上回车
        confirmInput: function(target) {
            const enterCode = 13;
            const evtProps = {
                key: 'Enter', code: 'Enter', 
                keyCode: enterCode, which: enterCode, charCode: enterCode,
                bubbles: true, cancelable: true, view: window
            };
            target.dispatchEvent(new KeyboardEvent('keydown', evtProps));
            target.dispatchEvent(new KeyboardEvent('keypress', evtProps));
            target.dispatchEvent(new KeyboardEvent('keyup', evtProps));
        }
    };

    // --- 业务逻辑 ---

    const setLayout = (type) => {
        const btn = document.querySelector('[data-name="header-toolbar-layout-button"]');
        if (!btn) return;
        btn.dispatchEvent(new MouseEvent('click', {bubbles: true, cancelable: true, view: window}));
        setTimeout(() => {
            const items = document.querySelectorAll('[data-name="menu-inner"] div[role="button"]');
            if (type === '1' && items[0]) items[0].dispatchEvent(new MouseEvent('click', {bubbles: true}));
            else if (type === '2') {
                if (items.length > 3) items[3].dispatchEvent(new MouseEvent('click', {bubbles: true}));
                else if (items[1]) items[1].dispatchEvent(new MouseEvent('click', {bubbles: true}));
            }
        }, 300);
    };

    // 设置时间 (注入流)
    const setTime = async (minutes) => {
        const widgets = Array.from(document.querySelectorAll('.chart-widget'));
        if (widgets.length === 0) return;
        widgets.sort((a, b) => a.getBoundingClientRect().x - b.getBoundingClientRect().x);

        const doInject = async (widget, min) => {
            if (!widget) return;
            
            // 1. 激活图表
            utils.activateChart(widget);
            await new Promise(r => setTimeout(r, 200));

            // 2. 按下第一个数字，触发弹窗
            const strMin = min.toString();
            utils.triggerDialog(strMin[0]);

            // 3. 等待输入框出现 (轮询检测)
            let inputEl = null;
            for(let i=0; i<10; i++) { // 尝试10次，每次50ms
                await new Promise(r => setTimeout(r, 50));
                // 策略A: 检查当前聚焦元素
                if (document.activeElement && document.activeElement.tagName === 'INPUT') {
                    inputEl = document.activeElement;
                    break;
                }
                // 策略B: 搜索页面上可见的 dialog input
                const dialogs = document.querySelectorAll('[class*="dialog"] input, [class*="popup"] input');
                if (dialogs.length > 0) {
                    // 找最后一个出现的通常是正确的
                    inputEl = dialogs[dialogs.length - 1]; 
                    break;
                }
            }

            if (inputEl) {
                console.log('>>> 捕获到输入框，开始注入:', min);
                
                // 4. 暴力注入完整数值 (解决输入错乱)
                utils.reactSetValue(inputEl, strMin);
                
                // 5. 稍微等一下让 React 反应过来
                await new Promise(r => setTimeout(r, 100));

                // 6. 对着这个输入框按回车 (解决回车无效)
                utils.confirmInput(inputEl);
            } else {
                console.warn('>>> 未检测到输入框弹出，可能焦点未切换成功');
            }
        };

        // 执行左屏
        await doInject(widgets[0], minutes);

        // 执行右屏
        if (widgets[1]) {
            await new Promise(r => setTimeout(r, 500)); // 间隔长一点更稳
            await doInject(widgets[1], minutes * CONFIG.multiplier);
        }
    };

    // --- UI 构建 ---
    const buildUI = () => {
        const panel = document.createElement('div');
        panel.id = 'tv-helper-panel';
        panel.style.cssText = `
            position: fixed; top: 60px; left: 50%; margin-left: -160px;
            z-index: 999998; background: #1e222d; padding: 8px 12px;
            border-radius: 6px; box-shadow: 0 4px 12px rgba(0,0,0,0.5);
            display: flex; gap: 8px; border: 1px solid #434651; 
            align-items: center; user-select: none;
        `;

        const groupStyle = 'display:flex; gap:5px; border-right:1px solid #555; padding-right:10px; margin-right:2px;';

        const grp1 = document.createElement('div');
        grp1.style.cssText = groupStyle;
        grp1.appendChild(utils.createBtn('单屏', '#d1d4dc', () => setLayout('1')));
        grp1.appendChild(utils.createBtn('双屏', '#d1d4dc', () => setLayout('2')));

        const grp2 = document.createElement('div');
        grp2.style.cssText = groupStyle;
        CONFIG.presets.forEach(m => {
            const btn = utils.createBtn(`${m}m`, '#d1d4dc', () => setTime(m));
            btn.title = `主:${m}分 | 副:${m * CONFIG.multiplier}分`;
            grp2.appendChild(btn);
        });

        const btnRef = utils.createBtn('↻', '#f0ad4e', () => location.reload());
        btnRef.style.border = 'none';

        panel.appendChild(grp1);
        panel.appendChild(grp2);
        panel.appendChild(btnRef);
        document.body.appendChild(panel);

        // 拖拽
        let isDrag = false, sx, sy, ix, iy;
        panel.onmousedown = (e) => {
            if (e.target.tagName === 'BUTTON') return;
            isDrag = true;
            sx = e.clientX; sy = e.clientY;
            ix = panel.offsetLeft; iy = panel.offsetTop;
            panel.style.cursor = 'grabbing';
            panel.style.margin = 0; panel.style.transform = 'none';
            panel.style.left = ix + 'px'; panel.style.top = iy + 'px';
        };
        window.addEventListener('mousemove', (e) => {
            if (!isDrag) return;
            e.preventDefault();
            panel.style.left = (ix + e.clientX - sx) + 'px';
            panel.style.top = (iy + e.clientY - sy) + 'px';
        });
        window.addEventListener('mouseup', () => { isDrag = false; panel.style.cursor = 'default'; });
    };

    setTimeout(buildUI, 1000);
})();