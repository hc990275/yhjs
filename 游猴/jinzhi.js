/* 云端脚本 - 纯净注入版 */
(function() {
    console.log(">>> 云端脚本 V6.2 (Blob注入版) 启动");

    // 1. 创建面板
    var panel = document.createElement('div');
    panel.id = 'tv-monitor-panel-v6';
    // 面板样式
    panel.style.cssText = "position:fixed; top:60px; right:10px; width:300px; background:rgba(0,0,0,0.85); color:#00ff00; padding:10px; font-family:monospace; font-size:12px; z-index:999990; pointer-events:none; border-radius:5px;";
    panel.innerHTML = '正在初始化...';
    document.body.appendChild(panel);

    // 2. 注册到全局变量 (给加载器清理用)
    if (window.__TV_HOT_CONTEXT) {
        window.__TV_HOT_CONTEXT.panel = panel;
    }

    // 3. 核心逻辑
    function updatePanel() {
        var html = "<strong>🎯 V6.2 监控中</strong><hr>";
        var widgets = document.querySelectorAll('.chart-widget');
        
        // 简单的时间戳显示
        var now = new Date();
        var timeStr = now.getHours() + ":" + now.getMinutes() + ":" + now.getSeconds();

        widgets.forEach(function(widget, index) {
            if(index > 1) return;
            html += "<div style='color:yellow;margin-top:5px;'>📺 分屏 #" + (index + 1) + "</div>";
            
            var titles = widget.querySelectorAll('div[class*="title-"]');
            var found = false;

            titles.forEach(function(t) {
                var txt = t.innerText;
                if ((txt.includes("金指") || txt.includes("数据智能")) && txt.length < 50) {
                    found = true;
                    html += "<div style='color:#00d2d3;'>Found: " + txt.substring(0,8) + "...</div>";
                    
                    // 向上找父级
                    var p = t; 
                    var vals = [];
                    for(var i=0; i<4; i++) {
                        if(!p.parentElement) break;
                        p = p.parentElement;
                        // 向下找数值
                        var vs = p.querySelectorAll('div[class*="valueValue-"]');
                        if(vs.length > 0) {
                            vs.forEach(function(v){ 
                                if(v.innerText && /\d/.test(v.innerText)) vals.push(v.innerText); 
                            });
                            if(vals.length > 0) break;
                        }
                    }

                    if(vals.length > 0) {
                        html += "<div style='display:grid;grid-template-columns:1fr 1fr;gap:5px;'>";
                        vals.forEach(function(v, i) {
                            html += "<div style='color:white;'><span style='color:#ff9ff3;'>[" + (i+1) + "]</span> " + v + "</div>";
                        });
                        html += "</div>";
                    } else {
                        html += "<div style='color:red;'>未找到数值</div>";
                    }
                }
            });
            if(!found) html += "<div style='color:gray;'>无目标指标</div>";
        });
        
        html += "<div style='color:#aaa;margin-top:5px;font-size:10px;'>更新: " + timeStr + "</div>";
        panel.innerHTML = html;
    }

    // 4. 启动定时器
    var timer = setInterval(updatePanel, 1000);
    
    // 注册定时器到全局
    if (window.__TV_HOT_CONTEXT) {
        window.__TV_HOT_CONTEXT.timer = timer;
    }
})();