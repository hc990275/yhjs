/* TradingView 云端逻辑 v3.0 (CSP 兼容版) */
/* 此代码将通过 Blob URL 直接注入页面运行 */

(function() {
    // 防止重复初始化
    if (document.getElementById('tv-helper-panel')) {
        console.log('>>> [Cloud] 面板已存在，跳过');
        return;
    }

    console.log('>>> [Cloud] 脚本注入成功，开始执行...');

    // ================= 配置区 =================
    const CONFIG = {
        multiplier: 4,               // 4倍关系
        presets: [3, 5, 10, 15],     // 按钮
        delay: 500                   // 操作延迟(毫秒)
    };
    // ==========================================

    // --- 纯原生 DOM 工具集 (不依赖 Tampermonkey) ---
    const utils = {
        createBtn: function(text, color, onClick) {
            const btn = document.createElement('button');
            btn.innerText = text;
            // 阻止冒泡，防止拖拽
            btn.onmousedown = (e) => e.stopPropagation();
            btn.onclick = (e) => { e.stopPropagation(); onClick(); };
            btn.style.cssText = `
                cursor: pointer; background-color: #2a2e39; border: 1px solid #434651;
                color: ${color || '#d1d4dc'}; padding: 4px 10px; border-radius: 4px; 
                font-size: 12px; transition: background 0.2s; font-family: sans-serif;
            `;
            btn.onmouseover = () => btn.style.backgroundColor = text === '↻' ? '#444' : '#2962ff';
            btn.onmouseout = () => btn.style.backgroundColor = '#2a2e39';
            return btn;
        },
        click: function(el) {
            if (!el) return;
            const rect = el.getBoundingClientRect();
            // 点击元素中心
            const x = rect.left + rect.width / 2;
            const y = rect.top + rect.height / 2;
            ['mousedown', 'mouseup', 'click'].forEach(evtType => {
                el.dispatchEvent(new MouseEvent(evtType, {
                    bubbles: true, cancelable: true, view: window,
                    clientX: x, clientY: y
                }));
            });
        },
        // 模拟键盘输入
        typeKey: function(key) {
            const evtOpts = { 
                key: key, code: `Digit${key}`, keyCode: key.charCodeAt(0), 
                bubbles: true, cancelable: true, view: window 
            };
            ['keydown', 'keypress', 'keyup'].forEach(type => 
                document.dispatchEvent(new KeyboardEvent(type, evtOpts))
            );
        },
        enter: function() {
            const evtOpts = { 
                key: 'Enter', code: 'Enter', keyCode: 13, which: 13, 
                bubbles: true, cancelable: true, view: window 
            };
            ['keydown', 'keypress', 'keyup'].forEach(type => 
                document.dispatchEvent(new KeyboardEvent(type, evtOpts))
            );
        }
    };

    // --- 业务逻辑 ---

    // 切换布局
    const setLayout = (type) => {
        const btn = document.querySelector('[data-name="header-toolbar-layout-button"]');
        if (!btn) return alert('未找到布局按钮');
        utils.click(btn);
        
        setTimeout(() => {
            const items = document.querySelectorAll('[data-name="menu-inner"] div[role="button"]');
            if (type === '1' && items[0]) utils.click(items[0]);
            else if (type === '2') {
                // 根据菜单长度猜测双屏位置
                if (items.length > 3) utils.click(items[3]);
                else if (items[1]) utils.click(items[1]);
            }
        }, 300);
    };

    // 设置时间
    const setTime = async (minutes) => {
        const charts = Array.from(document.querySelectorAll('.chart-widget'));
        if (charts.length === 0) return;

        // 按屏幕位置 X 坐标排序 (左 -> 右)
        charts.sort((a, b) => a.getBoundingClientRect().x - b.getBoundingClientRect().x);

        // 执行单个改时操作
        const performChange = (chart, min) => {
            return new Promise(resolve => {
                if (!chart) return resolve();
                utils.click(chart); // 激活
                
                setTimeout(() => {
                    const str = min.toString();
                    for (let char of str) utils.typeKey(char); // 输入数字
                    
                    setTimeout(() => { 
                        utils.enter(); // 回车
                        resolve(); 
                    }, 200);
                }, 200);
            });
        };

        // 1. 改主屏
        await performChange(charts[0], minutes);

        // 2. 改副屏 (如有)
        if (charts[1]) {
            setTimeout(async () => {
                await performChange(charts[1], minutes * CONFIG.multiplier);
            }, CONFIG.delay);
        }
    };

    // --- 构建 UI 面板 ---
    const buildUI = () => {
        const panel = document.createElement('div');
        panel.id = 'tv-helper-panel';
        // 初始样式
        panel.style.cssText = `
            position: fixed; top: 50px; left: 50%; margin-left: -150px;
            z-index: 999998; background: #1e222d; padding: 6px 10px;
            border-radius: 6px; box-shadow: 0 4px 10px rgba(0,0,0,0.6);
            display: flex; gap: 8px; border: 1px solid #434651; 
            cursor: move; user-select: none; align-items: center;
        `;
        panel.title = "按住空白处拖动";

        // 组1: 布局
        const grp1 = document.createElement('div');
        grp1.style.cssText = 'display:flex;gap:4px;border-right:1px solid #434651;padding-right:8px';
        grp1.appendChild(utils.createBtn('单屏', null, () => setLayout('1')));
        grp1.appendChild(utils.createBtn('双屏', null, () => setLayout('2')));

        // 组2: 时间
        const grp2 = document.createElement('div');
        grp2.style.cssText = 'display:flex;gap:4px;border-right:1px solid #434651;padding-right:8px';
        CONFIG.presets.forEach(m => {
            const btn = utils.createBtn(`${m}m`, null, () => setTime(m));
            btn.title = `主:${m}m / 副:${m * CONFIG.multiplier}m`;
            grp2.appendChild(btn);
        });

        // 组3: 重载网页
        const btnRef = utils.createBtn('↻', '#f0ad4e', () => location.reload());
        btnRef.title = "刷新整个网页";

        panel.appendChild(grp1);
        panel.appendChild(grp2);
        panel.appendChild(btnRef);
        document.body.appendChild(panel);

        // --- 拖拽逻辑 ---
        let isDrag = false, sx, sy, il, it;
        panel.onmousedown = (e) => {
            if (e.target.tagName === 'BUTTON') return;
            isDrag = true; 
            sx = e.clientX; sy = e.clientY; 
            il = panel.offsetLeft; it = panel.offsetTop;
            panel.style.cursor = 'grabbing';
        };
        window.addEventListener('mousemove', (e) => {
            if (!isDrag) return;
            e.preventDefault();
            panel.style.left = (il + e.clientX - sx) + 'px';
            panel.style.top = (it + e.clientY - sy) + 'px';
            panel.style.margin = 0; // 清除居中偏移
        });
        window.addEventListener('mouseup', () => {
            isDrag = false;
            panel.style.cursor = 'move';
        });
    };

    // 延迟 1 秒加载 UI，确保 DOM 稳定
    setTimeout(buildUI, 1000);

})();