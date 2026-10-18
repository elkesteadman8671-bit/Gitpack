# 砺行 · 警院团队协作台

蓝白警院风格的多人任务工作台。静态前端部署到 GitHub Pages，邮箱密码认证和共享 PostgreSQL 数据库由 Supabase 免费计划提供。

## 功能与权限

- 邮箱密码注册、验证、登录、退出及会话恢复。注册仅创建账户，管理员批准加入团队后才能访问任务。
- 只有数据库 `team_members` 中的账户可访问团队记录。
- 管理员新建、编辑、删除任务，并添加已开通认证账户的成员。
- 个人首页按当前账户展示姓名、本人任务统计、待办和提交记录，同时展示团队任务。
- 成员查看团队任务，启动本人的任务；完成状态由管理员审核成果后确认。
- 成果提交页支持说明、外部链接及单个不超过 5 MiB 的附件。附件保存在私有 Storage bucket，仅提交人和管理员可下载。
- 管理员审批加入申请、通过成果或退回修改；反馈与历次提交保留归档。
- 负责人筛选、任务搜索、列表与看板、完成统计。
- 页面每 15 秒刷新共享数据，重新进入页面时也会刷新。
- 写入携带记录版本，避免成员同时修改时覆盖彼此。

## 初始化 Supabase（必须完成）

1. 在自己的 Supabase 项目中打开 SQL Editor，执行 `database/001_initial.sql`。此文件只针对全新项目执行一次，不要重复执行；不要通过删除现有表来解决重复执行错误。
2. 在 Authentication → Users → Add user 创建管理员邮箱账户，自行设置密码并确认邮箱。密码不写入代码或配置。
3. 将 `database/002_bootstrap_admin.sql` 中的 `REPLACE_WITH_YOUR_EMAIL` 替换为管理员邮箱，并按需要修改姓名与职责，在 SQL Editor 执行一次。
4. 在 SQL Editor 执行 `database/003_registration_results.sql`，增加注册审批、成果记录、私有附件 bucket 和权限策略。`002` 只负责开通管理员，可以在 `003` 前后执行；没有管理员时其他注册用户只会进入待审批页。
5. 开启允许新用户注册，并保持邮箱确认要求。配置自有 SMTP 后再向团队开放邮箱注册：Supabase 默认邮件服务只面向有限的测试收件人，不适合直接给所有成员发送验证邮件。详见 <https://supabase.com/docs/guides/auth/auth-smtp>。网页注册时填写的身份资料不会授予管理员权限。
6. Authentication → URL Configuration 的 Site URL 设置为实际 GitHub Pages 地址，并将完整地址（包括 `/Gitpack/`）加入 Redirect URLs；本地验证时可另加 `http://127.0.0.1:4317/`。
6. API 地址和 Publishable key 已写入 `dist/config.js`。这是可公开的前端配置，不是管理密钥。严禁填入数据库密码、`sb_secret_` 或 `service_role`。

密码忘记时，由管理员使用认证后台的官方重置流程处理。新成员验证邮箱、登录后会提交加入申请；管理员在“审核管理”确认身份并填写分工职责后批准。也可通过认证后台预先创建账户，再在网页“＋ 成员”关联邮箱。

## 成果归档说明

文件存放于 `lixing-task-results` 私有 bucket，说明、链接、附件路径与审核反馈记录在 `task_results`。团队其他成员看不到他人的成果正文与附件。只有自己的尚未完成任务可提交成果；退回后可重新提交，保留之前的记录。重复发送同一次请求使用同一标识，避免生成重复记录。

未确认成功的网络请求不会自动删除附件，以免误删已经保存的成果。上传后尚未形成提交记录的私有孤立文件，管理员可在确认无对应记录后通过 Storage 后台清理。已产生成果记录的任务禁止直接删除，防止丢失审核档案。

## GitHub Pages

1. 免费账户需要将仓库设为公开（Settings → General → Danger Zone → Change visibility）。不要在公开仓库中保存真实名单、任务、密码或管理密钥。
2. Settings → Pages → Source 选择 **GitHub Actions**。
3. `.github/workflows/pages.yml` 会测试、构建并发布 `dist/`。第一次设置完 Pages 后，在 Actions 中手动运行该工作流。
4. 可选：在仓库 Settings → Secrets and variables → Actions → Variables 设置 `SUPABASE_URL` 与 `SUPABASE_PUBLISHABLE_KEY`。未配置时使用已提交的公开配置。
5. 后续推送到 `main` 自动部署。以 Actions 的实际成功状态和返回的 URL 为准，未完成以上设置前网站不算上线。

仓库：`elkesteadman8671-bit/Gitpack`。默认预期地址为 `https://elkesteadman8671-bit.github.io/Gitpack/`，部署完成前此地址不代表已经可访问。

## 本地开发与验证

需要 Node.js 22 或更高版本，推荐 24。

```sh
npm ci --ignore-scripts
npm test
npm run build
```

以普通静态 HTTP 服务器提供 `dist/`。`file://` 不适合认证联调。

## 依赖与来源

- Supabase JS `2.118.0`，MIT，官方：<https://github.com/supabase/supabase-js>。固定版本并打包到本地 `vendor.js`，不依赖运行时 CDN。
- esbuild `0.25.12`，MIT，仅用于构建。
- PGlite `0.5.10`，Apache-2.0，仅用于在本地运行 PostgreSQL 权限测试，不参与网页运行。
- GitHub 官方 Pages Actions。免费 Pages 是静态网页托管，不承载数据库。
- Noto Sans SC 来自 Google Fonts，无法访问时回退到系统中文字体。

Supabase 免费计划有额度限制，项目不活跃一周可能暂停；详见 <https://supabase.com/pricing>。本地 23 项测试使用真实 PostgreSQL 引擎与模拟的 Supabase auth/storage schema，覆盖注册审批、共享任务、越权拦截、附件策略、成果审核与版本冲突；不代替云端真实账户、邮件送达、实际附件大小限制和多设备验收。

## 回滚

网页可以通过恢复已验证的旧源码并重新运行 Pages 工作流回滚。不要删除或回滚已有数据库表以回滚网页；后续数据库变更应使用独立迁移。停用网站可以在 GitHub Pages 设置中取消发布，团队数据库仍保留在 Supabase。
