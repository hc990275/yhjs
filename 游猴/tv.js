/* TradingView 云端逻辑 v5.1 (拟人打字版) */
/* 修复数字输入错乱和回车无效的问题：增加按键间隔 */

(function() {
    if (document.getElementById('tv-helper-panel')) return;
    
    console.log('>>> [Cloud v5.1] 拟人输入模式启动');

    // ================= 配置区 =================
    const CONFIG = {
        multiplier: 4,               // 分屏倍数
        presets: [3, 5, 10, 15],     // 预设时间
        
        // --- 核心延迟设置 (单位: 毫秒) ---
        chartActivateDelay: 300,     // 点击图表后，等待激活的时间
        keyPressInterval: 200,       // 输数字的手速 (按完1，等多久按5)
        confirmDelay: 800            // 输完数字后，等多久按回车 (太快会导致回车无效)
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

        // 强制激活图表
        activateChart: function(widget) {
            if (!widget) return;
            const target = widget.querySelector('canvas') || widget; 
            const rect = target.getBoundingClientRect();
            // 模拟在图表中心点击
            const eventOpts = {
                bubbles: true, cancelable: true, view: window,
                clientX: rect.left + rect.width / 2, 
                clientY: rect.top + rect.height / 2, 
                buttons: 1
            };
            
            target.dispatchEvent(new MouseEvent('mousedown', eventOpts));
            setTimeout(() => {
                target.dispatchEvent(new MouseEvent('mouseup', eventOpts));
                target.dispatchEvent(new MouseEvent('click', eventOpts));
            }, 50);
        },

        // 模拟按键 (发送给 document.body)
        pressKey: function(key) {
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

        // 模拟回车
        pressEnter: function() {
            const enterCode = 13;
            const evtProps = {
                key: 'Enter', code: 'Enter', 
                keyCode: enterCode, which: enterCode, charCode: enterCode,
                bubbles: true, cancelable: true, view: window
            };
            document.body.dispatchEvent(new KeyboardEvent('keydown', evtProps));
            document.body.dispatchEvent(new KeyboardEvent('keypress', evtProps));
            document.body.dispatchEvent(new KeyboardEvent('keyup', evtProps));
        }
    };

    // --- 业务逻辑 ---

    // 切换单/双屏
    const setLayout = (type) => {
        const btn = document.querySelector('[data-name="header-toolbar-layout-button"]');
        if (!btn) return;
        
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

    // 设置时间 (核心流程优化)
    const setTime = async (minutes) => {
        const widgets = Array.from(document.querySelectorAll('.chart-widget'));
        if (widgets.length === 0) return;
        
        // 排序：左 -> 右
        widgets.sort((a, b) => a.getBoundingClientRect().x - b.getBoundingClientRect().x);

        const doChange = async (widget, min) => {
            if (!widget) return;
            
            // 1. 激活图表
            utils.activateChart(widget);
            
            // 等待激活完成
            await new Promise(r => setTimeout(r, CONFIG.chartActivateDelay));

            // 2. 逐个输入数字 (带间隔)
            const str = min.toString();
            for (let char of str) {
                utils.pressKey(char);
                // 【关键】输完一个数字，歇一会再输下一个
                await new Promise(r => setTimeout(r, CONFIG.keyPressInterval));
            }

            // 3. 等待对话框完全响应
            await new Promise(r => setTimeout(r, CONFIG.confirmDelay));

            // 4. 回车确认
            utils.pressEnter();
        };

        // 设左屏
        await doChange(widgets[0], minutes);

        // 设右屏
        if (widgets[1]) {
            // 中间多等一会
            await new Promise(r => setTimeout(r, 600));
            await doChange(widgets[1], minutes * CONFIG.multiplier);
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