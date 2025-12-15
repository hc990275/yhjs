/* TradingView 云端逻辑 v3.2 (键盘事件修复版) */
/* 修复了数字输入无效的问题：将按键事件目标改为 document */

(function() {
    // 防止重复注入
    if (document.getElementById('tv-helper-panel')) return;
    
    console.log('>>> [Cloud v3.2] 键盘增强版启动');

    // ================= 配置区 =================
    const CONFIG = {
        multiplier: 4,               // 分屏倍数
        presets: [3, 5, 10, 15],     // 预设时间
        delay: 400                   // 动作间隔
    };
    // ==========================================

    const utils = {
        // 创建按钮
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
            btn.onmousedown = (e) => e.stopPropagation(); // 防止拖拽
            btn.onclick = (e) => { e.stopPropagation(); onClick(); };
            return btn;
        },

        // 1. 点击激活图表 (点击 Canvas)
        clickChart: function(widget) {
            if (!widget) return;
            const canvas = widget.querySelector('canvas') || widget;
            const rect = canvas.getBoundingClientRect();
            const x = rect.left + rect.width / 2;
            const y = rect.top + rect.height / 2;
            
            ['mouseover', 'mousedown', 'mouseup', 'click'].forEach(evtType => {
                canvas.dispatchEvent(new MouseEvent(evtType, {
                    bubbles: true, cancelable: true, view: window,
                    clientX: x, clientY: y, buttons: 1
                }));
            });
        },

        // 2. 全局模拟按键 (发送给 Document)
        // TradingView 的快捷键监听器在 document 上
        pressKey: function(char) {
            const key = char.toString();
            const code = `Digit${key}`;
            const keyCode = key.charCodeAt(0); // 0=48, 1=49...

            // 构造详细的事件参数
            const eventInit = {
                key: key,
                code: code,
                keyCode: keyCode,
                which: keyCode,
                charCode: keyCode,
                bubbles: true,
                cancelable: true,
                view: window
            };

            // 发送完整的键盘事件链
            document.dispatchEvent(new KeyboardEvent('keydown', eventInit));
            document.dispatchEvent(new KeyboardEvent('keypress', eventInit));
            document.dispatchEvent(new KeyboardEvent('keyup', eventInit));
        },

        // 3. 模拟回车
        pressEnter: function() {
            const eventInit = {
                key: 'Enter', code: 'Enter', keyCode: 13, which: 13, charCode: 13,
                bubbles: true, cancelable: true, view: window
            };
            document.dispatchEvent(new KeyboardEvent('keydown', eventInit));
            document.dispatchEvent(new KeyboardEvent('keypress', eventInit));
            document.dispatchEvent(new KeyboardEvent('keyup', eventInit));
        }
    };

    // --- 业务逻辑 ---

    // 切换布局
    const setLayout = (type) => {
        const btn = document.querySelector('[data-name="header-toolbar-layout-button"]');
        if (!btn) return;
        
        // 点击布局菜单
        btn.dispatchEvent(new MouseEvent('click', {bubbles: true, cancelable: true, view: window}));
        
        setTimeout(() => {
            const items = document.querySelectorAll('[data-name="menu-inner"] div[role="button"]');
            if (type === '1' && items[0]) {
                items[0].dispatchEvent(new MouseEvent('click', {bubbles: true}));
            } else if (type === '2') {
                if (items.length > 3) items[3].dispatchEvent(new MouseEvent('click', {bubbles: true}));
                else if (items[1]) items[1].dispatchEvent(new MouseEvent('click', {bubbles: true}));
            }
        }, 300);
    };

    // 设置时间 (核心流程)
    const setTime = async (minutes) => {
        const widgets = Array.from(document.querySelectorAll('.chart-widget'));
        if (widgets.length === 0) return;

        // 排序：左 -> 右
        widgets.sort((a, b) => a.getBoundingClientRect().x - b.getBoundingClientRect().x);

        const changeInterval = (widget, min) => {
            return new Promise(resolve => {
                if (!widget) return resolve();

                // 1. 激活图表 (告诉 TV 这是当前操作的窗口)
                utils.clickChart(widget);

                setTimeout(() => {
                    // 2. 输入数字 (向 document 发送)
                    const str = min.toString();
                    for (let i = 0; i < str.length; i++) {
                        utils.pressKey(str[i]);
                    }
                    
                    // 3. 稍等片刻后回车
                    setTimeout(() => { 
                        utils.pressEnter(); 
                        resolve(); 
                    }, 250); // 给 TV 弹出“修改周期”对话框一点时间
                }, 150);
            });
        };

        // 左屏
        await changeInterval(widgets[0], minutes);

        // 右屏
        if (widgets[1]) {
            setTimeout(async () => {
                await changeInterval(widgets[1], minutes * CONFIG.multiplier);
            }, CONFIG.delay);
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

        // 组1: 布局
        const grp1 = document.createElement('div');
        grp1.style.cssText = groupStyle;
        grp1.appendChild(utils.createBtn('单屏', '#d1d4dc', () => setLayout('1')));
        grp1.appendChild(utils.createBtn('双屏', '#d1d4dc', () => setLayout('2')));

        // 组2: 时间
        const grp2 = document.createElement('div');
        grp2.style.cssText = groupStyle;
        CONFIG.presets.forEach(m => {
            const btn = utils.createBtn(`${m}m`, '#d1d4dc', () => setTime(m));
            btn.title = `主:${m}分 | 副:${m * CONFIG.multiplier}分`;
            grp2.appendChild(btn);
        });

        // 组3: 刷新
        const btnRef = utils.createBtn('↻', '#f0ad4e', () => location.reload());
        btnRef.style.border = 'none';

        panel.appendChild(grp1);
        panel.appendChild(grp2);
        panel.appendChild(btnRef);
        document.body.appendChild(panel);

        // 拖拽逻辑
        let isDrag = false, sx, sy, ix, iy;
        panel.onmousedown = (e) => {
            if (e.target.tagName === 'BUTTON') return;
            isDrag = true;
            sx = e.clientX; sy = e.clientY;
            ix = panel.offsetLeft; iy = panel.offsetTop;
            panel.style.cursor = 'grabbing';
            panel.style.margin = 0;
            panel.style.transform = 'none';
            panel.style.left = ix + 'px';
            panel.style.top = iy + 'px';
        };
        window.addEventListener('mousemove', (e) => {
            if (!isDrag) return;
            e.preventDefault();
            panel.style.left = (ix + e.clientX - sx) + 'px';
            panel.style.top = (iy + e.clientY - sy) + 'px';
        });
        window.addEventListener('mouseup', () => {
            isDrag = false;
            panel.style.cursor = 'default';
        });
    };

    setTimeout(buildUI, 1000);

})();