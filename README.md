# UMMoodle Timeline

UMMoodle Timeline 是一个 Chrome 扩展程序，旨在帮助澳门大学的学生更好地管理他们的学习任务和截止日期。

## 主要功能

1. **自动同步**: 从 UMMoodle 平台自动提取课程时间线和截止日期。
2. **Google 日历集成**: 将 UMMoodle 的事件无缝同步到您的 Google 日历。
3. **直观界面**: 清晰、简洁的用户界面，轻松查看和管理所有学习事件。

## 使用指南

### 安装依赖
本扩展不需要额外的依赖，直接使用原生 JavaScript。

### 使用方法
1. 克隆仓库：
   ```bash
   git clone https://github.com/JinLong0314/ummoodle-timeline.git
   cd ummoodle-timeline
   ```
   
2. 在 Chrome 中加载扩展：
   - 打开 Chrome 扩展管理页面 (chrome://extensions/)
   - 启用"开发者模式"
   - 点击"加载已解压的扩展程序"
   - 选择项目的 `app` 目录

3. 取得重定向 URI：
   - 打开 Chrome 扩展管理页面 (chrome://extensions/)
   - 点击"视图背景页"
   - 在控制台复制Redirect URI 形如：https://*.chromiumapp.org/
   - 将URI填入 Google Cloud Console

4. 将OAuth 2.0 客户端 ID 和密钥填入文件：
   ```javascript
   const clientId = 'YOUR_CLIENT_ID';
   const clientSecret = 'YOUR_CLIENT_SECRET';
   ```

## 如何使用

1. 从 Chrome 网上应用店安装 UMMoodle Timeline 扩展。
2. 登录您的 UMMoodle 账户。
3. 点击扩展图标，授权访问您的 Google 日历。
4. 享受自动同步的便利！

## 隐私和安全

我们高度重视用户的隐私和数据安全。UMMoodle Timeline 不会存储或传输您的个人信息。所有数据同步操作都在您的设备上本地进行。

- [隐私政策](https://jinlong0314.github.io/ummoodle-timeline/privacy-policy.html)
- [服务条款](https://jinlong0314.github.io/ummoodle-timeline/terms-of-service.html)

## 技术栈

- JavaScript
- Chrome Extension API
- Google Calendar API

## 贡献

我们欢迎社区贡献！如果您有任何改进建议或发现了 bug，请创建一个 issue 或提交 pull request。

## 联系我们

如果您有任何问题或建议，请通过以下方式联系我们：

- GitHub Issues：[创建新 issue](https://github.com/JinLong0314/ummoodle-timeline/issues)

## 许可证

本项目采用 [MIT Non-Commercial License](LICENSE)。该许可证允许您自由使用、修改和分发本软件，但不允许用于商业目的。

---

开发者：假龙
版本：2.0
最后更新：2024年10月31日