/* TradingView 云端逻辑 v6.1 (双重确认版) */
/* 修复“没有回车”问题：注入数字后，直接点击下方的搜索结果，代替回车键 */

(function() {
    if (document.getElementById('tv-helper-panel')) return;
    
    console.log('>>> [Cloud v6.1] 智能确认模式启动');

    // ================= 配置区 =================
    const CONFIG = {
        multiplier: 4,               // 分屏倍数
        presets: [3, 5, 10, 15],     // 预设时间
        dialogWait: 300,             // 等待弹窗
        resultWait: 200              // 输完数字后，等待搜索结果出现的时间
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
            // 发送全套事件，确保 UI 更新
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
        },

        // 终极确认：点击搜索结果
        confirmByClick: function(dialogContainer, minutes) {
            // 1. 尝试按回车 (备选方案)
            const enterCode = 13;
            const evtProps = {
                key: 'Enter', code: 'Enter', keyCode: enterCode, which: enterCode, 
                bubbles: true, cancelable: true, view: window
            };
            document.body.dispatchEvent(new KeyboardEvent('keydown', evtProps));
            
            // 2. 【核心】寻找列表里的结果并点击
            // TV 的搜索结果通常在 dialog 里的 div[data-role="menuitem"] 或者 class 包含 item 的元素
            // 我们找包含数字的那个选项
            
            // 获取所有菜单项
            // 注意：弹出的菜单可能不在 input 的父容器里，而是挂在 body 根部的 popup 层
            const allItems = document.querySelectorAll('div[data-role="menuitem"], div[class*="item-"]');
            
            // 倒序查找，因为最新的弹窗通常在 DOM 最后
            for (let i = allItems.length - 1; i >= 0; i--) {
                const item = allItems[i];
                const text = item.innerText.replace(/\s/g, ''); // 去掉空格 "15分" -> "15分"
                
                // 检查是否包含我们的分钟数 (例如 "15" 或 "15m" 或 "15Minutes")
                if (text.startsWith(minutes.toString())) {
                    console.log('>>> 找到搜索结果，点击:', item);
                    
                    // 模拟点击
                    const rect = item.getBoundingClientRect();
                    const clickOpts = {
                        bubbles: true, cancelable: true, view: window,
                        clientX: rect.left + rect.width/2, clientY: rect.top + rect.height/2
                    };
                    item.dispatchEvent(new MouseEvent('mousedown', clickOpts));
                    item.dispatchEvent(new MouseEvent('mouseup', clickOpts));
                    item.dispatchEvent(new MouseEvent('click', clickOpts));
                    
                    // 点击一次通常就够了，找到一个就退出
                    return true;
                }
            }
            console.warn('>>> 未找到可点击的搜索结果，仅发送了回车');
            return false;
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
            const strMin = min.toString();
            utils.triggerDialog(strMin[0]);

            // 3. 抓取输入框
            let inputEl = null;
            // 增加重试次数，确保抓到
            for(let i=0; i<15; i++) { 
                await new Promise(r => setTimeout(r, 50));
                if (document.activeElement && document.activeElement.tagName === 'INPUT') {
                    inputEl = document.activeElement;
                    break;
                }
                const dialogs = document.querySelectorAll('[class*="dialog"] input, [class*="popup"] input');
                if (dialogs.length > 0) {
                    inputEl = dialogs[dialogs.length - 1]; 
                    break;
                }
            }

            if (inputEl) {
                // 4. 暴力注入
                utils.reactSetValue(inputEl, strMin);
                
                // 5. 等待搜索结果渲染出来 (这步很重要，必须等列表刷新)
                await new Promise(r => setTimeout(r, CONFIG.resultWait));

                // 6. 点击搜索结果 (代替回车)
                utils.confirmByClick(null, min);
            }
        };

        // 左屏
        await doInject(widgets[0], minutes);

        // 右屏
        if (widgets[1]) {
            await new Promise(r => setTimeout(r, 600)); 
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