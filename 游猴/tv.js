/* TradingView 云端逻辑 v4.0 (菜单点击法) */
/* 不再依赖键盘输入，直接通过点击顶部工具栏切换时间 */

(function() {
    if (document.getElementById('tv-helper-panel')) return;
    
    console.log('>>> [Cloud v4.0] 菜单点击模式启动');

    // ================= 配置区 =================
    const CONFIG = {
        multiplier: 4,               // 分屏倍数
        presets: [3, 5, 10, 15],     // 预设时间
        delay: 500                   // 动作间隔 (菜单弹出需要时间，稍微调慢点)
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

        // 模拟鼠标点击
        click: function(el) {
            if (!el) return;
            const rect = el.getBoundingClientRect();
            ['mouseover', 'mousedown', 'mouseup', 'click'].forEach(evtType => {
                el.dispatchEvent(new MouseEvent(evtType, {
                    bubbles: true, cancelable: true, view: window,
                    clientX: rect.left + rect.width/2, clientY: rect.top + rect.height/2
                }));
            });
        },

        // 核心：设置单个图表的时间
        setChartInterval: async function(widget, minutes) {
            return new Promise(async (resolve) => {
                if (!widget) return resolve();

                // 1. 激活图表 (点击 Canvas)
                const canvas = widget.querySelector('canvas') || widget;
                utils.click(canvas);

                await new Promise(r => setTimeout(r, 200)); // 等待激活

                // 2. 寻找顶部工具栏的 "时间周期" 按钮
                // 这是一个难点，因为 TV 的 class 是动态的。我们需要通过属性或结构来找。
                // 通常它位于 header-toolbar-intervals 容器内
                
                // 尝试方法 A: 通过 data-role 或 aria-label (如果有)
                // 尝试方法 B: 遍历 header 中的按钮，找包含数字或 'm/h/d' 的
                
                // 在图表 widget 内部寻找 header (对于分屏，每个 chart 都有自己的 header 吗？
                // 不，TradingView 只有顶部一个共用的 Header Toolbar。
                // 这意味着：我们必须先激活图表，然后操作顶部的共用菜单。
                
                const intervalBtn = document.querySelector('[id="header-toolbar-intervals"] button') || 
                                    document.querySelector('[data-name="time-interval-button"]'); // 还是找不到就找通用位置

                if (!intervalBtn) {
                    console.error('未找到时间周期按钮');
                    return resolve();
                }

                // 3. 检查当前按钮上的字是不是我们要的 (例如已经是 "5分")
                // 比如按钮文本是 "5m"，我们要设 5，那就不用动了
                if (intervalBtn.innerText.trim() === minutes + 'm' || 
                    intervalBtn.innerText.trim() === minutes + '分') {
                    return resolve();
                }

                // 4. 点击展开菜单
                utils.click(intervalBtn);

                await new Promise(r => setTimeout(r, 300)); // 等菜单弹出

                // 5. 在弹出的菜单中寻找对应的选项
                // 菜单通常挂载在 body 的最后，class 包含 'menu-'
                const menuItems = Array.from(document.querySelectorAll('[data-role="menuitem"]'));
                
                // 寻找文本匹配的项 (例如 "5分钟", "5m", "5")
                // 正则匹配：开头是数字，且数字等于 minutes
                const targetItem = menuItems.find(item => {
                    const text = item.innerText.trim();
                    // 匹配 "5 分钟" 或 "5m" 或 "5"
                    return text.startsWith(minutes + ' ') || text === minutes + 'm' || text === minutes.toString();
                });

                if (targetItem) {
                    utils.click(targetItem);
                } else {
                    // 如果菜单里没有这个时间 (比如 3分钟可能不在常用列表)
                    // 这时候我们才用兜底的键盘输入法，因为菜单都打开了，输入焦点肯定在菜单上
                    // 或者尝试点击 "添加自定义周期" (太复杂)
                    console.warn(`菜单中未找到 ${minutes}m，尝试键盘补救`);
                    const str = minutes.toString();
                    for(let char of str) {
                        const k = char.charCodeAt(0);
                        document.dispatchEvent(new KeyboardEvent('keydown', {key:char, keyCode:k, which:k, bubbles:true}));
                        document.dispatchEvent(new KeyboardEvent('keypress', {key:char, keyCode:k, which:k, bubbles:true}));
                        document.dispatchEvent(new KeyboardEvent('keyup', {key:char, keyCode:k, which:k, bubbles:true}));
                    }
                    await new Promise(r => setTimeout(r, 200));
                    const enter = 13;
                    document.dispatchEvent(new KeyboardEvent('keydown', {key:'Enter', keyCode:enter, which:enter, bubbles:true}));
                    document.dispatchEvent(new KeyboardEvent('keyup', {key:'Enter', keyCode:enter, which:enter, bubbles:true}));
                }
                
                // 点击完稍等一下
                setTimeout(resolve, 300);
            });
        }
    };

    // --- 业务流程 ---
    
    // 切换单/双屏
    const setLayout = (type) => {
        const btn = document.querySelector('[data-name="header-toolbar-layout-button"]');
        if (!btn) return;
        utils.click(btn);
        
        setTimeout(() => {
            const items = document.querySelectorAll('[data-name="menu-inner"] div[role="button"]');
            if (type === '1' && items[0]) utils.click(items[0]);
            else if (type === '2') {
                if (items.length > 3) utils.click(items[3]);
                else if (items[1]) utils.click(items[1]);
            }
        }, 300);
    };

    // 设置时间流程
    const setTime = async (minutes) => {
        const widgets = Array.from(document.querySelectorAll('.chart-widget'));
        if (widgets.length === 0) return;
        widgets.sort((a, b) => a.getBoundingClientRect().x - b.getBoundingClientRect().x);

        // 1. 设置主屏
        await utils.setChartInterval(widgets[0], minutes);

        // 2. 设置副屏
        if (widgets[1]) {
            // 需要更长的延迟，因为切换激活状态需要时间重绘顶部工具栏
            await new Promise(r => setTimeout(r, CONFIG.delay)); 
            await utils.setChartInterval(widgets[1], minutes * CONFIG.multiplier);
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