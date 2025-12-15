/* TradingView 云端逻辑 v3.1 (画布激活增强版) */
/* 修复了点击图表不生效、无法输入数字的问题 */

(function() {
    // 1. 防止重复注入
    if (document.getElementById('tv-helper-panel')) return;
    
    console.log('>>> [Cloud v3.1] 脚本启动，使用 Canvas 激活模式');

    // ================= 配置区 =================
    const CONFIG = {
        multiplier: 4,               // 分屏倍数
        presets: [3, 5, 10, 15],     // 预设时间
        delay: 300                   // 动作间隔 (太快会丢失)
    };
    // ==========================================

    // --- 增强版工具集 ---
    const utils = {
        // 创建按钮 (彻底解决拖拽冲突)
        createBtn: function(text, color, onClick) {
            const btn = document.createElement('button');
            btn.innerText = text;
            btn.style.cssText = `
                cursor: pointer; background-color: #2a2e39; border: 1px solid #434651;
                color: ${color || '#d1d4dc'}; padding: 4px 10px; border-radius: 4px; 
                font-size: 12px; font-family: sans-serif; transition: all 0.2s;
                min-width: 40px; text-align: center;
            `;
            
            // 鼠标悬停变色
            btn.onmouseenter = () => btn.style.backgroundColor = text === '↻' ? '#444' : '#2962ff';
            btn.onmouseleave = () => btn.style.backgroundColor = '#2a2e39';

            // 【关键】阻断 mousedown 冒泡，防止触发面板拖拽
            btn.onmousedown = (e) => { e.stopPropagation(); };
            
            // 绑定点击事件
            btn.onclick = (e) => {
                e.stopPropagation(); // 防止冒泡
                e.preventDefault();  // 防止默认行为
                onClick();
            };
            return btn;
        },

        // 模拟点击 (核心修复：支持点击 Canvas)
        click: function(el) {
            if (!el) return;
            const rect = el.getBoundingClientRect();
            // 计算中心点
            const x = rect.left + rect.width / 2;
            const y = rect.top + rect.height / 2;
            
            // 依次触发完整的鼠标事件链
            ['mouseover', 'mousedown', 'mouseup', 'click'].forEach(evtType => {
                const evt = new MouseEvent(evtType, {
                    bubbles: true, cancelable: true, view: window,
                    clientX: x, clientY: y, buttons: 1
                });
                el.dispatchEvent(evt);
            });
        },

        // 模拟键盘输入 (兼容性增强)
        typeKey: function(key) {
            // 对应数字键的 keyCode (48-57)
            const keyCode = key.charCodeAt(0); 
            const evtOpts = { 
                key: key, code: `Digit${key}`, keyCode: keyCode, which: keyCode,
                bubbles: true, cancelable: true, view: window 
            };
            
            // TradingView 主要监听 keydown/keypress
            document.dispatchEvent(new KeyboardEvent('keydown', evtOpts));
            document.dispatchEvent(new KeyboardEvent('keypress', evtOpts));
            document.dispatchEvent(new KeyboardEvent('keyup', evtOpts));
        },

        enter: function() {
            const evtOpts = { 
                key: 'Enter', code: 'Enter', keyCode: 13, which: 13, 
                bubbles: true, cancelable: true, view: window 
            };
            document.dispatchEvent(new KeyboardEvent('keydown', evtOpts));
            document.dispatchEvent(new KeyboardEvent('keyup', evtOpts));
        }
    };

    // --- 业务逻辑 ---

    // 1. 切换布局
    const setLayout = (type) => {
        const btn = document.querySelector('[data-name="header-toolbar-layout-button"]');
        if (!btn) return alert('请先登录或检查网络');
        
        utils.click(btn);
        
        // 菜单弹出需要时间，稍作延迟
        setTimeout(() => {
            const items = document.querySelectorAll('[data-name="menu-inner"] div[role="button"]');
            if (type === '1' && items[0]) {
                utils.click(items[0]);
            } else if (type === '2') {
                // 尝试找双屏垂直图标 (通常是第4个，索引3)
                // 如果菜单项很少，说明只有基础版，可能无法双屏
                if (items.length > 3) utils.click(items[3]);
                else if (items[1]) utils.click(items[1]);
            }
        }, 300);
    };

    // 2. 设置时间 (核心修复)
    const setTime = async (minutes) => {
        const widgets = Array.from(document.querySelectorAll('.chart-widget'));
        if (widgets.length === 0) return;

        // 按屏幕位置排序 (左 -> 右)
        widgets.sort((a, b) => a.getBoundingClientRect().x - b.getBoundingClientRect().x);

        // --- 内部执行函数 ---
        const applyToChart = (widget, min) => {
            return new Promise(resolve => {
                if (!widget) return resolve();

                // 【关键修复】找到 widget 内部的 canvas 元素进行点击
                // 只有点击 canvas，TradingView 才会认为你选中了这个图表
                const canvas = widget.querySelector('canvas');
                const target = canvas || widget; // 找不到 canvas 就点 widget (保底)

                // 1. 激活图表
                utils.click(target);

                setTimeout(() => {
                    // 2. 输入数字
                    const str = min.toString();
                    for (let char of str) utils.typeKey(char);
                    
                    // 3. 回车确认
                    setTimeout(() => { 
                        utils.enter(); 
                        resolve(); 
                    }, 200); // 等待输入框反应
                }, 150); // 等待点击激活
            });
        };

        // 执行序列
        // 先设左屏
        await applyToChart(widgets[0], minutes);

        // 再设右屏 (如果有)
        if (widgets[1]) {
            setTimeout(async () => {
                await applyToChart(widgets[1], minutes * CONFIG.multiplier);
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
        panel.title = "按住空白处拖动";

        // 分组容器样式
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
            btn.title = `主:${m}分 / 副:${m * CONFIG.multiplier}分`;
            grp2.appendChild(btn);
        });

        // 组3: 刷新
        const btnRef = utils.createBtn('↻', '#f0ad4e', () => location.reload());
        btnRef.style.border = 'none'; // 去掉边框显得特殊点

        panel.appendChild(grp1);
        panel.appendChild(grp2);
        panel.appendChild(btnRef);
        document.body.appendChild(panel);

        // --- 拖拽逻辑 (无冲突版) ---
        let isDrag = false, sx, sy, ix, iy;
        
        // 只有点在 panel 本身才触发，点在 button 上已经被 button 的 stopPropagation 拦住了
        panel.onmousedown = (e) => {
            if (e.target.tagName === 'BUTTON') return; // 双重保险
            isDrag = true;
            sx = e.clientX; sy = e.clientY;
            ix = panel.offsetLeft; iy = panel.offsetTop;
            panel.style.cursor = 'grabbing';
            panel.style.margin = 0; // 开始拖拽时移除 margin 带来的干扰
            panel.style.transform = 'none'; // 移除 transform
            // 设置初始位置防止跳动
            panel.style.left = ix + 'px';
            panel.style.top = iy + 'px';
        };

        window.addEventListener('mousemove', (e) => {
            if (!isDrag) return;
            e.preventDefault();
            const nx = ix + (e.clientX - sx);
            const ny = iy + (e.clientY - sy);
            panel.style.left = nx + 'px';
            panel.style.top = ny + 'px';
        });

        window.addEventListener('mouseup', () => {
            isDrag = false;
            panel.style.cursor = 'default';
        });
    };

    // 启动
    setTimeout(buildUI, 1000);

})();