/* TradingView 云端逻辑 v6.2 (靶向爆破版) */
/* 修复“不回车”问题：
   1. 回车键直接发送给 Input 元素，而不是 document
   2. 增加模糊搜索点击，只要看到包含数字的菜单项就点
*/

(function() {
    if (document.getElementById('tv-helper-panel')) return;
    
    console.log('>>> [Cloud v6.2] 靶向确认模式启动');

    // ================= 配置区 =================
    const CONFIG = {
        multiplier: 4,               // 分屏倍数
        presets: [3, 5, 10, 15],     // 预设时间
        dialogWait: 300,             // 等输入框弹出的时间
        resultWait: 500              // 【关键】输完数字后，多等一会，让搜索结果加载出来
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

        // 触发弹窗
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

        // 【核心改进】靶向确认逻辑
        forceConfirm: function(inputElement, minutes) {
            // 1. 靶向回车：直接对着 Input 元素按回车 (之前是对 body 按)
            const enterCode = 13;
            const enterEvent = {
                key: 'Enter', code: 'Enter', keyCode: enterCode, which: enterCode, 
                bubbles: true, cancelable: true, view: window
            };
            inputElement.dispatchEvent(new KeyboardEvent('keydown', enterEvent));
            inputElement.dispatchEvent(new KeyboardEvent('keypress', enterEvent));
            inputElement.dispatchEvent(new KeyboardEvent('keyup', enterEvent));

            console.log('>>> 已发送靶向回车');

            // 2. 视觉搜索点击 (双重保险)
            // 搜索所有可能的菜单项
            setTimeout(() => {
                const candidates = document.querySelectorAll('div[class*="item-"], div[data-role="menuitem"], span[class*="title-"]');
                const targetText = minutes.toString();
                
                for (let i = candidates.length - 1; i >= 0; i--) {
                    const el = candidates[i];
                    // 获取文本并去除空格
                    const text = el.innerText.trim();
                    
                    // 逻辑：如果文本包含数字 (比如 "15" 或 "15分钟") 且 元素是可见的
                    if ((text === targetText || text.startsWith(targetText + ' ') || text.startsWith(targetText + 'm')) && el.offsetParent !== null) {
                        console.log('>>> 视觉捕获菜单项，执行点击:', text);
                        
                        const clickOpts = { bubbles: true, cancelable: true, view: window };
                        el.dispatchEvent(new MouseEvent('mousedown', clickOpts));
                        el.dispatchEvent(new MouseEvent('mouseup', clickOpts));
                        el.dispatchEvent(new MouseEvent('click', clickOpts));
                        return; // 点到一个就收工
                    }
                }
                console.warn('>>> 未找到视觉匹配项，仅依靠回车');
            }, 50);
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
                // 备用选择器
                const dialogs = document.querySelectorAll('div[class*="dialog"] input');
                if (dialogs.length > 0) {
                    inputEl = dialogs[dialogs.length - 1]; 
                    break;
                }
            }

            if (inputEl) {
                // 4. 暴力注入
                utils.reactSetValue(inputEl, min.toString());
                
                // 5. 【关键】等待搜索结果加载 (时间调长到了 500ms)
                // 如果这里等得不够久，菜单还没出来，点击就会失败
                await new Promise(r => setTimeout(r, CONFIG.resultWait));

                // 6. 靶向确认 (回车 + 点击)
                utils.forceConfirm(inputEl, min);
            }
        };

        // 左屏
        await doInject(widgets[0], minutes);

        // 右屏
        if (widgets[1]) {
            await new Promise(r => setTimeout(r, 800)); // 增加间隔，防止干扰
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