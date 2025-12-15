/* TradingView 云端逻辑 v2.0 (安全架构版) */

// 只有当面板不存在时才执行逻辑
if (!document.getElementById('tv-helper-panel')) {

    console.log('>>> [Cloud] 脚本开始执行');

    // --- 配置 ---
    const CONFIG = {
        multiplier: 4,
        presets: [3, 5, 10, 15],
        delay: 400
    };

    // --- 辅助函数定义 ---
    const utils = {
        // 创建按钮
        createBtn: function(text, color, onClick) {
            const btn = document.createElement('button');
            btn.innerText = text;
            btn.onclick = (e) => { e.stopPropagation(); onClick(); };
            btn.style.cssText = `
                cursor: pointer; background-color: #2a2e39; border: 1px solid #434651;
                color: ${color || '#d1d4dc'}; padding: 4px 10px; border-radius: 4px; 
                font-size: 12px; transition: background 0.2s;
            `;
            btn.onmouseover = () => btn.style.backgroundColor = text === '↻' ? '#444' : '#2962ff';
            btn.onmouseout = () => btn.style.backgroundColor = '#2a2e39';
            return btn;
        },
        // 模拟点击
        click: function(el) {
            if(!el) return;
            const rect = el.getBoundingClientRect();
            const x = rect.left + rect.width / 2;
            const y = rect.top + rect.height / 2;
            ['mousedown', 'mouseup', 'click'].forEach(evt => {
                el.dispatchEvent(new MouseEvent(evt, { bubbles: true, clientX: x, clientY: y }));
            });
        },
        // 模拟按键
        key: function(k) {
            const opts = { key: k, code: `Digit${k}`, keyCode: k.charCodeAt(0), bubbles: true };
            ['keydown', 'keypress', 'keyup'].forEach(t => document.dispatchEvent(new KeyboardEvent(t, opts)));
        },
        enter: function() {
            const opts = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true };
            ['keydown', 'keypress', 'keyup'].forEach(t => document.dispatchEvent(new KeyboardEvent(t, opts)));
        }
    };

    // --- 业务逻辑 ---
    
    // 设置时间的主函数
    const setTime = async (minutes) => {
        const charts = Array.from(document.querySelectorAll('.chart-widget'));
        if (charts.length === 0) return console.warn('没找到图表');

        // 按位置排序：左 -> 右
        charts.sort((a, b) => a.getBoundingClientRect().x - b.getBoundingClientRect().x);

        const doSet = (chart, min) => {
            return new Promise(resolve => {
                if(!chart) return resolve();
                utils.click(chart); // 激活窗口
                setTimeout(() => {
                    const str = min.toString();
                    for(let char of str) utils.key(char);
                    setTimeout(() => { utils.enter(); resolve(); }, 150);
                }, 150);
            });
        };

        // 设置左屏
        await doSet(charts[0], minutes);

        // 设置右屏 (如果有)
        if (charts[1]) {
            setTimeout(async () => {
                await doSet(charts[1], minutes * CONFIG.multiplier);
            }, CONFIG.delay);
        }
    };

    // 切换布局
    const setLayout = (type) => {
        const btn = document.querySelector('[data-name="header-toolbar-layout-button"]');
        if(!btn) return;
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

    // --- UI 构建 ---
    const buildUI = () => {
        const panel = document.createElement('div');
        panel.id = 'tv-helper-panel';
        panel.style.cssText = `
            position: fixed; top: 50px; left: 50%; margin-left: -150px;
            z-index: 999998; background: #1e222d; padding: 6px 10px;
            border-radius: 6px; box-shadow: 0 4px 10px rgba(0,0,0,0.6);
            display: flex; gap: 8px; border: 1px solid #434651; 
            cursor: move; user-select: none;
        `;
        panel.title = "按住拖动";

        // 布局组
        const grp1 = document.createElement('div');
        grp1.style.cssText = 'display:flex;gap:4px;border-right:1px solid #434651;padding-right:8px';
        grp1.appendChild(utils.createBtn('单屏', null, () => setLayout('1')));
        grp1.appendChild(utils.createBtn('双屏', null, () => setLayout('2')));

        // 时间组
        const grp2 = document.createElement('div');
        grp2.style.cssText = 'display:flex;gap:4px;border-right:1px solid #434651;padding-right:8px';
        CONFIG.presets.forEach(m => {
            const btn = utils.createBtn(`${m}m`, null, () => setTime(m));
            btn.title = `主:${m}m / 副:${m*CONFIG.multiplier}m`;
            grp2.appendChild(btn);
        });

        // 重载
        const btnRef = utils.createBtn('↻', '#f0ad4e', () => location.reload());

        panel.appendChild(grp1);
        panel.appendChild(grp2);
        panel.appendChild(btnRef);
        document.body.appendChild(panel);

        // 简单的拖拽实现
        let isDrag=false, sx, sy, il, it;
        panel.addEventListener('mousedown',e=>{
            if(e.target.tagName==='BUTTON')return;
            isDrag=true; sx=e.clientX; sy=e.clientY; il=panel.offsetLeft; it=panel.offsetTop;
        });
        window.addEventListener('mousemove',e=>{
            if(!isDrag)return;
            panel.style.left=(il+e.clientX-sx)+'px';
            panel.style.top=(it+e.clientY-sy)+'px';
            panel.style.margin=0;
        });
        window.addEventListener('mouseup',()=>isDrag=false);
    };

    // 延时启动
    setTimeout(buildUI, 1000);

} else {
    console.log('>>> [Cloud] 面板已存在，跳过');
}