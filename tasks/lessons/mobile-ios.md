# 手机端（iOS 风格）适配：做法与教训

> L2 route 指向本文件；触发条件「修改 `frontend/src` 下任何页面、组件或样式前」。进度见 `tasks/todo/mobile-ios.md`。

## 做法

- 手机端和网页端是同一套代码：用 `hooks/useIsMobile.js` 判断是否手机宽度，手机上换一套呈现；数据、状态和处理函数沿用网页端原有的，网页端的代码路径不动。
- 框架在 `components/layout/AppLayout.jsx` 的手机分支里：顶部 `MobileNavBar`、底部 `MobileTabBar`。页面要改导航栏标题或右上角按钮，调 `useMobileNav`，用法见 `components/mobile/MobileNavBar.jsx` 里的注释。
- 现成的手机组件在 `components/mobile/`：底部操作菜单 `MobileActionSheet`、带搜索的选择面板 `MobilePickerSheet`。新页面优先复用，不另造。
- 网页端的弹窗（确认框除外）和右键／长按菜单，手机上由 `styles/mobile.css` 统一改成从底部弹出的样式，页面里一般不用单独处理。
- 样式只写进 `styles/mobile.css`，作用域规则见该文件开头的注释。
- 底部标签栏放不下的入口统一收进「我的」（`pages/MobileMePage.jsx`），和网页端侧边栏保持一致。

## 教训

- 输入框字号小于 16px 时，iOS 聚焦会放大整个页面。`mobile.css` 已把输入框统一设为 16px，新加的输入框要确认没有被别的规则改小。
- 全局输入框规则带了多个 `:not()`，优先级很高。手机端要覆盖它，得写同样的 `:not([type="checkbox"]):not([type="radio"])` 或加 `!important`；行内样式只能靠 `!important` 覆盖。
- 网页端靠鼠标悬停才出现的按钮（删除、下载等），手机上没有悬停，要改成常显。
- 全局 `.btn-primary` 默认 `width: 100%`，放进工具栏或页头时要写 `width: auto`，否则会被拉满整行。
- 列表行里操作按钮多于一个时，手机上收进「···」，用 `MobileActionSheet` 弹出，别让按钮挤掉标题宽度。
- PDF 这类异步渲染的内容，截图常常早于绘制完成而显示空白；判断是否画出来，要读画布像素，不看截图。
- 页面跳转后上一页的滚动位置会带到新页，已由 `MobileNavBar` 统一处理（非后退跳转时滚回顶部），页面里不用再各自处理。
- 表单报错要滚到可见处（参照 `ScheduleForm`）：同一个错误重复提交时 effect 不会重跑，要用提交计数触发；平滑滚动在预览里有延迟，用立即滚动。
- 造测试数据要符合后端约束。例如"需日程拥有者审核"的日程要带 `requires_owner_review=1`，而且只有拥有者能批准，否则接口返回 403，容易被误判成前端 bug。

## 验证

- 测试环境和正式环境完全隔离，测试数据只进测试库。测试环境固定放在 `~/schedule-manager-test/`，不放系统临时目录：`/private/tmp` 开机即清空，每天 0 点还会删掉 3 天没读写过的文件。
  1. 测试库是该文件夹里的 `test.db`，上传文件在 `uploads/`。重建空库用 `create_test_db.sh`（会删掉旧库，用 `Base.metadata.create_all` 建表）；假 PDF 和演示数据用 `make_fake_pdfs.py`、`seed_case_review.py` 生成。
  2. 后端用 `start-backend.sh` 在 8001 端口起，前端用 `start-frontend.sh` 在 5174 端口起；`.claude/launch.json` 的两个测试项调用的就是这两个脚本。
  3. 前端用该文件夹里的 `vite.test.config.mjs`。要点：`root` 指向 `frontend/`；`/api` 代理到 8001；`cacheDir` 放该文件夹，避免和 5173 的正式前端共用缓存；`esbuild.jsx` 设为 `automatic`，因为配置文件不在项目里，引不到 React 插件。
  4. 测试账号用注册接口 `/api/v1/auth/register` 创建；需要特殊字段值时，直接改测试库。
  5. 库里存的是上传文件的绝对路径：挪动测试环境后，要把 `review_case_files`、`review_daily_report_files` 的 `file_path` 和 `review_annotations` 的 `audio_path` 改成新位置，否则页面仍去旧位置找文件。
- 每个页面改完，在手机宽度下把该页功能逐项走一遍，再切到 1280px 确认网页端没有变化。
- 内置预览窗口约 346px 宽，手机截图用 340×736 视口。截图和动画可能滞后，以用 JS 读到的页面状态为准。
