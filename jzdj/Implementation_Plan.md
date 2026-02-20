# 司机调度页面独立刷新逻辑

## 目标描述
用户希望“司机调度”页面的刷新/暂停状态与“订单管理”页面**完全独立**。目前两者共享同一个 `state.manualPause` 状态，互相干扰。

## 变更方案

### [wg.js](file:///d:/DeskTop/GitHub/txt/wg.js)

#### [修改] 状态初始化
- 在全局 `state` 中新增 `driverManualPause`，默认值从 `GM_getValue('driverManualPause', false)` 读取。

#### [新增] 辅助函数
- `const isPaused = () => isOrderPage() ? state.manualPause : (isDriverPage() ? state.driverManualPause : false);`
- 用于统一判断当前页面是否处于暂停状态。

#### [修改] 核心逻辑
- `performAction()`: 检查 `isPaused()` 而不是直接检查 `state.manualPause`。
- `startCountdown()`: 在倒计时循环中检查 `isPaused()`。
- `updateStatusText()`: 使用 `isPaused()` 来决定显示的文本（暂停/倒计时）和颜色。

#### [修改] UI 渲染 (`renderMainContent`)
- 使用 `isPaused()` 来决定按钮的文案（暂停刷新/恢复刷新）和样式（红色/绿色）。
- **新增**：在悬浮窗头部（Header）增加一个快捷的**启停按钮**（Icon + 文字），状态与主按钮同步。

#### [修改] 事件处理 (`bindEvents` / 头部按钮事件)
- 点击暂停/恢复按钮时：
    - 如果是 **订单页面** (`isOrderPage()`): 切换 `state.manualPause` 并保存。
    - 如果是 **司机页面** (`isDriverPage()`): 切换 `state.driverManualPause` 并保存。
    - 调用 `updateUI()` 刷新界面。

## 验证计划
1. 打开“司机调度”页面。
2. 点击暂停/恢复，确认状态已独立保存，且头部按钮与主按钮状态同步。
3. 切换到“订单管理”页面。
4. 确认其刷新状态不受第2步操作的影响。
5. 再次切换回“司机调度”页面。
6. 确认之前的暂停状态被正确保留。
