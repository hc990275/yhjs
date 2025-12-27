// ==UserScript==
// @name         ChatGPT 身份认证全自动助手 (V19.0 持续点击修复版)
// @namespace    http://tampermonkey.net/
// @version      19.0
// @description  自动从搜索结果页面提取数据并填充表单，智能检测页面加载
// @author       CreatorEdition
// @match        https://gravelocator.cem.va.gov/*
// @match        https://services.sheerid.com/*
// @match        https://chatgpt.com/veterans-claim/*
// @match        https://chatgpt.com/veterans-claim
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @license MIT
// @downloadURL https://update.greasyfork.org/scripts/560355/ChatGPT%20%E8%BA%AB%E4%BB%BD%E8%AE%A4%E8%AF%81%E5%85%A8%E8%87%AA%E5%8A%A8%E5%8A%A9%E6%89%8B%20%28V190%20%E6%8C%81%E7%BB%AD%E7%82%B9%E5%87%BB%E4%BF%AE%E5%A4%8D%E7%89%88%29.user.js
// @updateURL https://update.greasyfork.org/scripts/560355/ChatGPT%20%E8%BA%AB%E4%BB%BD%E8%AE%A4%E8%AF%81%E5%85%A8%E8%87%AA%E5%8A%A8%E5%8A%A9%E6%89%8B%20%28V190%20%E6%8C%81%E7%BB%AD%E7%82%B9%E5%87%BB%E4%BF%AE%E5%A4%8D%E7%89%88%29.meta.js

// ==/UserScript==
(function() {
    'use strict';
    // --- 核心配置 ---
    const FIELD_MAP = {
        status: '#sid-military-status',
        branch: '#sid-branch-of-service',
        firstName: '#sid-first-name',
        lastName: '#sid-last-name',
        bMonth: '#sid-birthdate__month',
        bDay: '#sid-birthdate-day',
        bYear: '#sid-birthdate-year',
        dMonth: '#sid-discharge-date__month',
        dDay: '#sid-discharge-date-day',
        dYear: '#sid-discharge-date-year',
        email: '#sid-email'
    };
    const SUBMIT_BTN_SELECTOR = '#sid-submit-btn-collect-info';
    const RESULT_TABLE_SELECTOR = '#searchResults tbody';
    const ERROR_BUTTON_SELECTOR = '.sid-error-button-container a.sid-btn';
    // 固定配置
    const FIXED_STATUS = "Military Veteran or Retiree";
    const FIXED_DISCHARGE_YEAR = "2025";
    const FIXED_EMAIL = "haichen505707@163.com";
    const MIN_BIRTH_YEAR = 1930;
    const FILL_DELAY = 1000; // 在 sheerid 页面延迟1秒填写
    const MONTH_MAP = {
        "01": "January", "02": "February", "03": "March", "04": "April",
        "05": "May", "06": "June", "07": "July", "08": "August",
        "09": "September", "10": "October", "11": "November", "12": "December"
    };
    // --- 状态管理 ---
    function getQueue() { return GM_getValue('global_auth_queue', []); }
    function saveQueue(arr) { GM_setValue('global_auth_queue', arr); updateUI(); }
    function getCurrentTask() { return GM_getValue('current_active_task', null); }
    function setCurrentTask(task) { GM_setValue('current_active_task', task); }
    function getSubmitState() { return GM_getValue('is_submitting_flag', false); }
    function setSubmitState(bool) { GM_setValue('is_submitting_flag', bool); }
    function getIsRunning() { return GM_getValue('is_script_running', false); }
    function setIsRunning(bool) { GM_setValue('is_script_running', bool); updateUI(); }
    function getFillingStage() { return GM_getValue('filling_stage', 0); }
    function setFillingStage(stage) { GM_setValue('filling_stage', stage); }
    function getWaitingForRetry() { return GM_getValue('waiting_for_retry', false); }
    function setWaitingForRetry(bool) { GM_setValue('waiting_for_retry', bool); }
    function getClaimPageAttempts() { return GM_getValue('claim_page_attempts', 0); }
    function setClaimPageAttempts(count) { GM_setValue('claim_page_attempts', count); }
    function getInitialFillDelay() { return GM_getValue('initial_fill_delay_done', false); }
    function setInitialFillDelay(bool) { GM_setValue('initial_fill_delay_done', bool); }
    function getLastClickedUrl() { return GM_getValue('last_clicked_url', ''); }
    function setLastClickedUrl(url) { GM_setValue('last_clicked_url', url); }
    // --- 🔥 错误检测和自动重试 ---
    function checkForErrorAndRetry() {
        const errorBtn = document.querySelector(ERROR_BUTTON_SELECTOR);

        if (errorBtn) {
            const href = errorBtn.getAttribute('href');
            log('⚠️ 检测到错误页面，准备重试...', '#ff6b6b');
            statusArea.innerHTML = "🔄 检测到错误，自动重试中...";
            statusArea.style.color = "orange";

            // 标记为等待重试状态
            setWaitingForRetry(true);
            setClaimPageAttempts(0);

            // 点击 Try Again 按钮
            setTimeout(() => {
                log('🔄 点击 Try Again 按钮...', '#ffc107');
                errorBtn.click();
            }, 500);

            return true;
        }
        return false;
    }
    // --- 🔥 在 veterans-claim 页面持续尝试点击"验证资格条件"按钮 ---
    function checkClaimPageButton() {
        const currentUrl = window.location.href;

        // 只在 veterans-claim 页面运行
        if (!currentUrl.includes('chatgpt.com/veterans-claim')) {
            return false;
        }
        const isRunning = getIsRunning();
        const isWaitingRetry = getWaitingForRetry();

        // 只有在运行状态或等待重试状态下才执行
        if (!isRunning && !isWaitingRetry) {
            return false;
        }
        // 查找"验证资格条件"按钮
        const buttons = Array.from(document.querySelectorAll('button.btn.relative.btn-primary'));
        let targetBtn = null;

        for (let btn of buttons) {
            const text = btn.textContent.trim();
            if (text.includes('验证资格条件') || text.includes('验证') || text.includes('领取优惠') || text.includes('Verify')) {
                targetBtn = btn;
                break;
            }
        }
        if (targetBtn) {
            // 检查按钮是否被禁用（加载中）
            const isDisabled = targetBtn.disabled ||
                             targetBtn.hasAttribute('disabled') ||
                             targetBtn.classList.contains('cursor-not-allowed') ||
                             targetBtn.getAttribute('data-visually-disabled') !== null;

            const attempts = getClaimPageAttempts();

            if (isDisabled) {
                // 按钮加载中
                setClaimPageAttempts(attempts + 1);
                log(`⏳ 按钮加载中，等待... (尝试 ${attempts + 1})`, '#ffc107');
                statusArea.innerHTML = `🔄 等待按钮激活中 (尝试 ${attempts + 1})...`;
                statusArea.style.color = "orange";
                return true; // 继续等待
            } else {
                // 按钮可用，准备点击
                const lastUrl = getLastClickedUrl();

                // 如果 URL 没有变化，说明还在同一页面，继续点击
                if (lastUrl === currentUrl) {
                    setClaimPageAttempts(attempts + 1);
                    log(`🎯 持续点击按钮... (第 ${attempts + 1} 次)`, '#28a745');
                    statusArea.innerHTML = `🎯 持续点击按钮 (第 ${attempts + 1} 次)...`;
                } else {
                    log(`✅ 按钮已激活，准备点击`, '#28a745');
                    statusArea.innerHTML = "🎯 按钮已激活，正在点击...";
                    setClaimPageAttempts(0);
                }

                setLastClickedUrl(currentUrl);

                setTimeout(() => {
                    targetBtn.click();
                    log('🚀 已点击按钮，等待跳转...', '#0d6efd');
                }, 300);

                return true;
            }
        } else {
            // 未找到按钮
            const attempts = getClaimPageAttempts();
            setClaimPageAttempts(attempts + 1);
            log(`⏳ 等待页面加载按钮... (尝试 ${attempts + 1})`, '#6c757d');
            statusArea.innerHTML = `⏳ 等待页面加载 (尝试 ${attempts + 1})...`;
            return true;
        }
    }
    // --- 🔥 检测是否成功跳转到 SheerID 页面 ---
    function checkIfLeftClaimPage() {
        const currentUrl = window.location.href;
        const lastUrl = getLastClickedUrl();

        // 如果从 claim 页面跳转到了其他页面
  