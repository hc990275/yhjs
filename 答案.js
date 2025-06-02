// ==UserScript==
// @name         自动刷新悬浮窗的题目信息
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  在多个页面中持续显示并刷新题目信息的悬浮窗
// @author       You
// @match        https://www.lnonl.com/post/*
// @match        https://gbwlxy.dtdjzx.gov.cn/*
// @grant        GM_setValue
// @grant        GM_getValue
// ==/UserScript==

(function() {
    'use strict';

    // 获取当前页面的URL
    const currentURL = window.location.href;

    // 函数：创建悬浮窗
    function createFloatingWindow(content) {
        let floatingWindow = document.createElement('div');
        floatingWindow.style.position = 'fixed';
        floatingWindow.style.top = '20px';
        floatingWindow.style.right = '20px';
        floatingWindow.style.width = '300px';
        floatingWindow.style.maxHeight = '400px';
        floatingWindow.style.overflowY = 'auto';
        floatingWindow.style.backgroundColor = 'white';
        floatingWindow.style.border = '1px solid black';
        floatingWindow.style.padding = '10px';
        floatingWindow.style.zIndex = '9999';
        floatingWindow.style.fontSize = '16px'; // 将默认字体大小加大
        document.body.appendChild(floatingWindow);
        floatingWindow.innerHTML = content;
    }

    // 函数：更新悬浮窗内容
    function updateFloatingWindow() {
        let storedContent = GM_getValue('storedContent', '没有找到存储的内容。');
        let floatingWindow = document.querySelector('#floatingWindow');
        if (floatingWindow) {
            floatingWindow.innerHTML = storedContent;
        } else {
            createFloatingWindow(storedContent);
        }
    }

    // 如果在提取题目的页面
    if (currentURL.includes('lnonl.com')) {
        // 提取文章标题
        let title = document.querySelector('title').textContent.trim();

        // 用于存储提取的信息
        let resultGroups = [];
        let currentGroup = [];
        let previousNumber = null;

        // 选择所有包含题目、题号和答案的元素
        let questionElements = document.querySelectorAll('p, span, div');

        questionElements.forEach(function(element) {
            let text = element.textContent.trim();

            // 匹配选择题的题号和选项
            let choiceMatch = text.match(/^(\d+)\.\s*([A-Z]+)\s+/);
            if (choiceMatch) {
                let number = choiceMatch[1];
                let answer = choiceMatch[2];

                if (previousNumber !== null && number < previousNumber) {
                    // 在这里合并重复项
                    currentGroup = [...new Set(currentGroup)];
                    resultGroups.push(currentGroup);
                    currentGroup = [];
                }

                currentGroup.push(`${number}:${answer}`);
                previousNumber = number;
            }

            // 匹配判断题的题号和答案
            let judgeMatch = text.match(/^(\d+)\.\s*(正确|错误|A正确|B错误)\s+/);
            if (judgeMatch) {
                let number = judgeMatch[1];
                let answer = judgeMatch[2];

                if (previousNumber !== null && number < previousNumber) {
                    // 在这里合并重复项
                    currentGroup = [...new Set(currentGroup)];
                    resultGroups.push(currentGroup);
                    currentGroup = [];
                }

                currentGroup.push(`${number}:${answer}`);
                previousNumber = number;
            }
        });

        // 将最后一组添加到结果中并去除重复项
        if (currentGroup.length > 0) {
            currentGroup = [...new Set(currentGroup)];
            resultGroups.push(currentGroup);
        }

        // 构建内容
        let content = `<h3>文章标题: ${title}</h3>`;
        const labels = ['上', '中', '下'];
        const colors = ['#FF6347', '#4682B4', '#32CD32']; // 颜色数组
        resultGroups.forEach(function(group, index) {
            const label = labels[index] || (index + 1); // 如果有超过3组，则使用数字
            const color = colors[index] || '#000000'; // 超过3组时使用黑色
            content += `<p><strong style="color:${color}; font-size:18px;">答案组 ${label}:</strong> `;
            content += `<span style="color:${color};">${group.join(' ')}</span>`; // 横向排列答案，答案与题号之间加入冒号
            content += `</p>`;
        });

        if (resultGroups.length === 0) {
            content += "<p>未找到题号和答案，请检查选择器或手动查找。</p>";
        }

        // 将内容存储在浏览器中以供以后使用
        GM_setValue('storedContent', content);

        // 创建悬浮窗
        createFloatingWindow(content);

    } else if (currentURL.includes('dtdjzx.gov.cn')) {
        // 在目标答题页面上更新并显示之前存储的内容
        updateFloatingWindow();

        // 添加一个定时器，每隔5秒刷新一次内容
        setInterval(updateFloatingWindow, 1000);
    }
})();