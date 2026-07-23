# 残明余烬 1.7 发布说明

## 三条通道

- `cmyj-1.6`：旧正式版，只接受兼容性和安全修复。
- `cmyj-1.7-beta`：DLC 测试版，只连接 staging Worker，数据与正式环境隔离。
- `cmyj-1.7`：1.7 正式版，连接正式 Worker，不覆盖 1.6 的远程入口。

## 兼容策略

- 1.7 沿用正式版登录、用户和安装记录的本地存储键，升级后不要求重新配置账号。
- 1.7 沿用万象生成器的 API 配置、自定义模块、排序与世界书选择。
- 1.7 使用独立的发布草稿和当前身份 DLC 状态，避免与 1.6 的草稿互相污染。
- 1.6 遇到身份 DLC 时拒绝安装并提示升级，不能把跳过安装显示为成功。
- 创意工坊 API 地址不变；正式后端完成数据库迁移后，新旧作品仍使用同一个创意工坊。

## 发布顺序

1. 在候选分支构建并校验 `cmyj-1.7`。
2. 使用内嵌脚本的正式候选角色卡完成酒馆回归。
3. 备份正式 D1，再应用身份 DLC 类型迁移。
4. 部署正式 Worker，并验证旧作品浏览、登录、下载和安装。
5. 合并前端候选分支，让 Pages 发布 `/cmyj-1.7/`。
6. 将正式角色卡脚本切换为 `https://cmyj-frontend.pages.dev/cmyj-1.7/loader/index.js?v=1.7.0`。

正式 D1 迁移、Worker 部署与 Pages 生产发布必须在候选卡验收后执行。

## 校验命令

```bash
pnpm build:pages
pnpm check:cmyj
pnpm smoke:cmyj
pnpm test:scenario-generator
pnpm test:scenario-generator:release
node scripts/package-release-card.mjs --check
```
