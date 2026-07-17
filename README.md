# 残明余烬 1.6 前端脚本

本仓库基于
[StageDog/tavern_helper_template](https://github.com/StageDog/tavern_helper_template)，公开托管《残明余烬 1.6》随角色卡运行的前端脚本，并由 GitHub
Actions 自动生成 `dist/` 产物。

## 发布内容

- `src/cmyj-1.6/`：可阅读、可审计的脚本源码。
- `dist/cmyj-1.6/`：模板自动构建、供角色卡远程加载的产物。
- `src/cmyj-1.6/loader/`：共享加载器，负责依赖顺序、去重和错误恢复。

角色卡通过以下固定入口加载：

```js
import { boot } from 'https://cmyj-frontend.pages.dev/cmyj-1.6/loader/index.js';
```

## 开发与版本约定

正式源码只在 `src/cmyj-1.6/` 中维护；`dist/` 由构建流程生成，不接受手工修改。角色卡目录里的同名脚本只是上述固定入口的轻量包装，不用于保存功能实现。

状态栏顶部显示的版本来自 `src/cmyj-1.6/statusbar/index.js` 中的 `STATUSBAR_VERSION`。它代表整套 1.6 前端：任何模块发生用户可见更新时，都应同步升级该版本号。补丁修复递增第三位，兼容的新功能递增第二位，不兼容变更递增第一位。GitHub 自动生成的 `v0.0.x` 构建标签与用户可见版本无关。

供 AI 和维护者执行的完整源码位置、角色卡注册边界、验证命令及上线确认步骤见 [`AGENTS.md`](./AGENTS.md)。

## 仓库边界

本仓库不发布世界书、角色卡正文、首条消息、正则文件、用户作品、后端 Worker、数据库、管理员后台或任何密钥。脚本中使用的公开图片链接属于运行配置的一部分，不在仓库中保存图片文件。

创意工坊的登录、服务器成员与身份组验证、作品审核和管理员权限全部由独立后端执行，不信任前端传入的权限结论。

## 本地验证

```bash
pnpm install
pnpm build:pages
pnpm check:cmyj
pnpm smoke:cmyj
```

## Cloudflare Pages

生产环境使用 Cloudflare Pages 从 `main` 分支自动构建：

- 构建命令：`pnpm build:pages`
- 输出目录：`dist`
- Node.js：24

`build:pages` 会生成 `dist/_headers`，让 `/cmyj-1.6/*`
每次加载时重新验证版本，并允许酒馆页面跨域加载脚本。作品封面、动图和作品包仍由 R2 保存，不进入本仓库。

## 内容说明

项目面向成年人，部分运行配置可能包含成熟主题。仓库只提供软件功能实现；任何内容的使用与分发仍须遵守所在地法律和托管平台规则。
