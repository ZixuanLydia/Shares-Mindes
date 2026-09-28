# Firebase 接入说明

`shared-mindes` 项目、Realtime Database 和 Web 应用已配置；匿名登录已启用，用户已发布权限规则。2026-09-28 实测通过云端保存/恢复、分享副本公开读取、拒绝访客和其他匿名身份读取私人草稿及修改分享。以下步骤保留供后续维护参考。

网站保留本地草稿；云端保存与发布分享需要用户主动点击按钮。

1. 在 https://console.firebase.google.com/ 用你自己的 Google 账号登录，创建独立课程项目。不要为这个练习开启付费服务或提交付款信息。若控制台要求升级，先停下确认原因。
2. 在项目里注册 Web 应用（`</>`）。网站继续用 GitHub Pages，不需要改用 Firebase Hosting，也不需要 Analytics。
3. 创建 **Realtime Database**（不是 Cloud Firestore），选择锁定模式。将 `database.rules.json` 的内容放到数据库 Rules 中并发布。不要使用 `.read: true` / `.write: true` 的全开放规则。
4. 在 Authentication → Sign-in method 中启用 **Anonymous**。这是保护每个人数据的匿名身份，不需要访客填写密码。姓名只作标签，不能作为安全边界。
5. 项目设置 → Your apps → Web app → SDK setup and configuration，取得公开的 `firebaseConfig` 对象，确保包括实际 Realtime Database 的 `databaseURL`。
6. 编辑 `firebase-config.js`：填写配置对象（本项目已填写）。只使用 Web 配置；不要放 service-account JSON、私钥、管理员凭据或用户密码。
7. 刷新页面，确认显示 Firebase connected。创建三幕，点击 Save to cloud；只有服务器确认后才显示 Cloud copy saved。
8. 修改一个场景但不点击云端保存，点 Open cloud copy，确认载入之前的云端版本。检查数据库里 `users/{uid}/week04` 有 `version`、`payload`、`updatedAt`。
9. 测试第二个独立浏览器身份不能读取第一个身份的数据，未登录请求应拒绝。发布前完成规则模拟器/实际隔离测试。
10. 点击 Create / update share link，确认后生成独立只读快照。用未登录页面打开链接，确认可以播放、没有编辑功能；数据库仍应拒绝未授权修改和列出全部分享。
11. 点击 Turn sharing off 后重新打开链接，确认不可读；重新发布可恢复。同一链接更新快照，不会自动同步私人编辑。只读不等于保密，持有链接的人可以转发或保存内容。

每个匿名浏览器身份只有一份云端作品，Save to cloud 更新这一份。清除浏览器数据可能丢失访问身份；本地和 GitHub Pages 是不同来源，也会获得不同身份。跨设备传作品请先 Export JSON，再 Import JSON。本版本不声称支持用姓名登录或跨设备账户同步。

官方参考：
- https://firebase.google.com/docs/auth/web/anonymous-auth
- https://firebase.google.com/docs/database/rest/auth
- https://firebase.google.com/docs/database/security
- https://firebase.google.com/docs/web/alt-setup
