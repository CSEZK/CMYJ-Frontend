# 酒馆助手前端界面或脚本编写

@.cursor/rules/项目基本概念.mdc
@.cursor/rules/mcp.mdc
@.cursor/rules/酒馆变量.mdc
@.cursor/rules/酒馆助手接口.mdc
@.cursor/rules/前端界面.mdc
@.cursor/rules/脚本.mdc
@.cursor/rules/mvu变量框架.mdc
@.cursor/rules/mvu角色卡.mdc

# 残明余烬 1.6 前端开发规范

以下规范适用于本仓库的《残明余烬 1.6》前端。开始修改前，先遵守上方引用的酒馆助手规则。

## 唯一可信源码

- 所有正式修改都应落在 `src/cmyj-1.6/`。
- 状态栏：`src/cmyj-1.6/statusbar/index.js`
- 云端创意工坊：`src/cmyj-1.6/workshop/index.js`
- 万象生成器：`src/cmyj-1.6/generator/index.js`
- 变量修改器：`src/cmyj-1.6/variable-editor/index.js`
- 变量结构：`src/cmyj-1.6/schema/index.js`
- 旧档兼容：`src/cmyj-1.6/legacy/index.js`
- 共享远程入口：`src/cmyj-1.6/loader/index.js`

DLC 架构开发期间，测试版唯一可信源码位于 `src/cmyj-1.7-beta/`。它必须使用独立的运行时键、存储键和 staging 后端，不得改写 `src/cmyj-1.6/` 的稳定行为。测试完成后以新的正式版本目录发布，不直接覆盖 1.6。

`dist/` 是构建产物，不是源码。可以在本地构建后检查它，但不要手工编辑，也不要把本地构建产生的 `dist/` 变化加入功能提交。GitHub Actions 会在合并后重新构建并提交产物。

## 状态栏版本号

- 用户可见版本号只显示在状态栏，来源为 `src/cmyj-1.6/statusbar/index.js` 顶部的 `STATUSBAR_VERSION`。
- 该版本代表整套《残明余烬 1.6》前端，而不只是状态栏。任一模块发生用户可见的线上更新时，都要在同一个提交中更新此常量。
- 使用语义化版本：修复和小型 UI 调整增加补丁号；向后兼容的新功能增加次版本号；不兼容变更增加主版本号。
- 当前显示格式由状态栏渲染为 `残明余烬 · v${STATUSBAR_VERSION}`。不要重新加入加载时间，也不要在移动端额外占一行显示版本。
- GitHub Actions 自动生成的 `v0.0.x` 仓库标签只是构建标签，不是用户可见版本，不要拿它替代 `STATUSBAR_VERSION`。

## 角色卡包装脚本

工作区中的 `../角色卡/残明余烬1.6/脚本/*.js` 只是远程加载包装脚本，固定加载：

```js
import { boot } from 'https://cmyj-frontend.pages.dev/cmyj-1.6/loader/index.js';
```

日常功能修改不得复制回这些包装脚本。只有远程域名、入口路径或包装脚本清单发生变化时才修改它们；新增包装脚本时，还必须同步在 `../角色卡/残明余烬1.6/残明余烬1.6.yaml` 注册。

## 修改与验证流程

1. 从最新 `main` 创建 `agent/<简短说明>` 分支，只修改本次任务涉及的源码。
2. 至少运行：

   ```bash
   pnpm build:pages
   pnpm check:cmyj
   pnpm smoke:cmyj
   ```

3. 若修改了独立 JavaScript 入口，再运行 `node --check <修改的文件>`。
4. 检查 `git diff --check`。本地构建后还原未准备提交的 `dist/` 变化，只提交源码和必要配置。
5. 提交并推送功能分支，创建 PR；用户要求直接上线时，合并 PR 到 `main`。
6. 等待 GitHub `bundle` 工作流成功，并确认 Cloudflare Pages 的 `main` 生产部署为 Active。
7. 请求 `https://cmyj-frontend.pages.dev/cmyj-1.6/loader/index.js` 验证本次特征已经上线，同时确认响应头仍为 `Cache-Control: public, max-age=0, must-revalidate`。

不能把“已推送 GitHub”当作“已部署”。只有生产 URL 返回新代码后才能向用户报告上线完成。

## 仓库边界与安全

- 本仓库只保存可公开审计的前端脚本，不保存角色卡正文、世界书、首条消息、用户作品、密钥、数据库内容或私有管理资料。
- Cloudflare Worker、D1/R2、Discord 鉴权和管理员后台属于独立后端，不要因为前端任务擅自改动。
- 登录、服务器成员、已验证身份组、管理员权限、脚本与正则审核必须由后端校验；前端状态不得作为权限依据。
- 修改现有功能时保留四套状态栏主题、窄屏布局和酒馆集成环境兼容性。
