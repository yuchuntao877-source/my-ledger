# 我的账本（界面优化版）

采用更简洁的苹果风格卡片、清晰的金额层级和手机底部导航。

一款面向手机的轻量个人记账网页应用，适配 iPhone 和 Windows 浏览器。

## 功能
- 支出、收入、账户间转账
- 分类、日期、备注与明细搜索
- 月度收支统计、分类占比、每日支出柱状图
- 月预算及使用进度
- 现金、微信、支付宝、银行卡等账户与余额估算
- 借款、借出及还款进度登记
- CSV 导出、JSON 完整备份与恢复
- 数据保存在当前浏览器的 localStorage，不上传服务器

## 部署到 GitHub Pages
1. 在 GitHub 新建一个公开仓库，例如 `my-ledger`。
2. 将 `index.html`、`style.css`、`app.js`、`manifest.json` 和 `README.md` 上传到仓库根目录。
3. 打开仓库 Settings → Pages。
4. 在 Build and deployment 中选择 `Deploy from a branch`。
5. Branch 选择 `main`，目录选择 `/(root)`，点击 Save。
6. 等待部署完成后，打开页面提供的 `https://你的用户名.github.io/my-ledger/` 地址。

## 添加到 iPhone 主屏幕
1. 在 iPhone 上用 Safari 打开 GitHub Pages 地址。
2. 点击分享按钮（方框向上箭头）。
3. 选择“添加到主屏幕”。
4. 名称可设为“我的账本”，点击“添加”。

## 重要数据说明
- localStorage 绑定于具体浏览器和网站地址。不要清除该网站的数据；换设备或浏览器前先导出 JSON，并在新设备恢复。
- 此版本没有云同步、账号系统或服务器备份。
- GitHub Pages 托管的是应用代码；账单数据不会提交到 GitHub。
- CSV 主要用于查看和分析；JSON 用于完整备份和恢复。
- 账户余额是根据初始余额、收入、支出和转账自动估算；借还记录为独立登记，不自动改变日常收支。
