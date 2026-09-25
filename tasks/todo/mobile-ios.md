# 手机端 iOS 风格适配（企业微信自建应用）

> 本工作流在根目录 `AGENTS.md` 的 ROUTES 表中对应「修改 `frontend/src` 下任何页面、组件或样式前」那一行。

目标：企业微信自建应用里打开的网页，在手机上呈现 iOS 风格，功能与网页端一致；同一套代码，网页端不受影响。工作分支 `claude/mobile-ios`。

每个页面的验证方式：按 `tasks/lessons/mobile-ios.md` §验证，在测试环境里把该页功能在手机宽度下逐项走一遍，再确认网页端 1280px 没有变化。

## 已完成

- [x] 整体框架：顶部导航栏、底部标签栏、「我的」页、保持登录（`bda8a55`）
- [x] 日历页（`bda8a55`）
- [x] 日程详情页、新建／编辑表单（`bda8a55`）
- [x] 消息页、底部弹出面板、长按菜单（`4f91be4`）

## 待做

- [ ] 待审核页 `ReviewPage`
- [ ] 通知页 `NotificationPage`
- [ ] 「我的」下的子页：仪表盘 `DashboardPage`；备忘录总览 `MemoOverviewPage`；个人备忘录 `PersonalMemoPage` 及其下的病例、文件、收藏、共享文件（`PatientListPage`、`PatientDetailPage`、`PersonalFilePage`、`PersonalCollectionPage`）；团队群聊备忘录 `TeamMemoPage` 及其下的公告、待办、共享文件（`TeamSectionPage`）
- [ ] 联系人 `ChatContactsPage`、电话簿 `ContactsPage`
- [ ] 搜索结果 `SearchResultPage`、用户管理 `UserManagementPage`
- [ ] 登录、注册、忘记密码页：不在 `AppLayout` 里，目前没有任何手机样式
- [ ] 补测已适配页面里还没测过的功能：消息页发图片／文件／视频、语音输入、键盘弹起时的输入栏；日程附件上传；分类管理弹窗、查看者列表、共享文件、收藏与标签面板
- [ ] iOS 模拟器验证 —— 前提：Xcode 装好，用户执行过 `sudo xcode-select -s /Applications/Xcode.app/Contents/Developer`；验证：在模拟器的 Safari 里走一遍登录和各标签页
- [ ] 企业微信真机验证 —— 前提：原作者把代码部署到他的服务器；验证：在企业微信自建应用里走一遍登录和各标签页，语音输入、录音也在这一步补测（需要 https，局域网 http 预览里用不了）
- [ ] 收尾：删掉 `.claude/launch.json` 里的 `test-backend`、`test-frontend` 两项并停掉测试服务；只挑出代码提交交给原作者，不带 `AGENTS.md` 和 `tasks/`（交付方式待定：原作者给仓库权限、fork 后提 PR，或直接发代码）

## Review

（全部完成后填写：结果、遗留问题、教训的去向。）
