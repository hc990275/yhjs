/* TradingView 云端逻辑 v7.0 (焦点锁定+回车轰炸版) */
/* 修复“不回车”的最终方案：
   1. 注入数字后，执行 input.focus() 确保光标在里面
   2. 发送全套 Enter 事件
   3. 如果还是不行，直接点击列表里匹配的选项
*/

(function() {
    if (document.getElementById('tv-helper-panel')) return;
    
    console.log('>>> [Cloud v7.0] 焦点回车模式启动');

    // ================= 配置区 =================
    const CONFIG = {
        multiplier: 4,               // 分屏倍数
        presets: [3, 5, 10, 15],     // 预设时间
        dialogWait: 300,             // 等待弹窗时间
        inputProcessingWait: 400     // 【关键】输完数字后，等多久让TV去搜索结果
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

        // 触发弹窗 (输入第一个数字)
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

        // React 暴力赋值
        reactSetValue: function(input, value) {
            const lastValue = input.value;
            input.value = value;
            const tracker = input._valueTracker;
            if (tracker) {
                tracker.setValue(lastValue);
            }
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
        },

        // 【核心】终极回车方案
        stormConfirm: function(inputElement, minutes) {
            // 1. 强制聚焦 (这一步至关重要，没有焦点，回车就是空气)
            inputElement.focus();
            
            console.log('>>> [Confirm] 已强制聚焦，准备回车');

            // 2. 构造最强的回车事件
            const enterCode = 13;
            const eventInit = {
                key: 'Enter', code: 'Enter', 
                keyCode: enterCode, which: enterCode, charCode: enterCode,
                bubbles: true, cancelable: true, view: window
            };

            // 3. 连发三道金牌
            inputElement.dispatchEvent(new KeyboardEvent('keydown', eventInit));
            inputElement.dispatchEvent(new KeyboardEvent('keypress', eventInit));
            inputElement.dispatchEvent(new KeyboardEvent('keyup', eventInit));

            // 4. 双重保险：尝试查找并点击“高亮”的菜单项
            // 当你输入"15"后，列表里的"15分钟"通常会变成 active 状态
            setTimeout(() => {
                // 查找所有可能的菜单项
                const items = document.querySelectorAll('div[data-role="menuitem"], div[class*="item-"]');
                const targetText = minutes.toString();

                for (let i = items.length - 1; i >= 0; i--) {
                    const el = items[i];
                    const text = el.innerText.trim();
                    
                    // 匹配逻辑：
                    // 1. 文本以数字开头 (如 "15 分钟")
                    // 2. 或者是 "active" / "selected" 状态 (TV通常会给第一个结果加状态)
                    const isMatch = text.startsWith(targetText + ' ') || text === targetText || text === targetText + 'm';
                    const isActive = el.classList.contains('active') || el.classList.contains('selected');

                    if ((isMatch || isActive) && el.offsetParent !== null) {
                        console.log('>>> [Confirm] 捕获到菜单项，直接点击:', text);
                        const clickOpts = { bubbles: true, cancelable: true, view: window };
                        el.dispatchEvent(new MouseEvent('mousedown', clickOpts));
                        el.dispatchEvent(new MouseEvent('mouseup', clickOpts));
                        el.dispatchEvent(new MouseEvent('click', clickOpts));
                        return;
                    }
                }
            }, 100);
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

    const setTime = async (minutes) => {
        const widgets = Array.from(document.querySelectorAll('.chart-widget'));
        if (widgets.length === 0) return;
        widgets.sort((a, b) => a.getBoundingClientRect().x - b.getBoundingClientRect().x);

        const doInject = async (widget, min) => {
            if (!widget) return;
            
            // 1. 激活图表
            utils.activateChart(widget);
            await new Promise(r => setTimeout(r, 200));

            // 2. 触发弹窗
            utils.triggerDialog(min.toString()[0]);

            // 3. 抓取输入框
            let inputEl = null;
            for(let i=0; i<15; i++) { 
                await new Promise(r => setTimeout(r, 50));
                if (document.activeElement && document.activeElement.tagName === 'INPUT') {
                    inputEl = document.activeElement;
                    break;
                }
                const dialogs = document.querySelectorAll('div[class*="dialog"] input');
                if (dialogs.length > 0) {
                    inputEl = dialogs[dialogs.length - 1]; 
                    break;
                }
            }

            if (inputEl) {
                // 4. 暴力注入数字
                utils.reactSetValue(inputEl, min.toString());
                
                // 5. 【关键】给 TV 一点时间去刷新下方的搜索列表
                // 如果回车按太快，列表还没出来，TV 就不知道你要选哪个
                await new Promise(r => setTimeout(r, CONFIG.inputProcessingWait));

                // 6. 执行回车轰炸
                utils.stormConfirm(inputEl, min);
            }
        };

        // 左屏
        await doInject(widgets[0], minutes);

        // 右屏
        if (widgets[1]) {
            await new Promise(r => setTimeout(r, 800)); 
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