# 小张的餐厅 · 微信小程序端

原生微信小程序 + TypeScript 实现，覆盖客户、商家、超级用户三种视角。视觉规范取自 `prototype/`，接口与数据模型对齐 `docs/架构与数据模型.md`。

本期不包含：价格金额、支付、库存、取餐、桌号、中英文切换、AI 推荐。

## 1. 在微信开发者工具中打开

1. 打开微信开发者工具，选择「导入项目」。
2. 项目目录选择本仓库下的 `miniprogram/`（不是仓库根目录）。
3. AppID 使用测试号占位：`project.config.json` 中已写入 `touristappid`；如有自己的测试号，替换该字段即可。
4. 确认导入后直接编译运行，无需 `npm install`、无需构建步骤。

已配置：

- `useCompilerPlugins: ["typescript"]`，开发者工具会直接编译 `.ts`。
- `urlCheck: false`；若仍在真机/工具中请求失败，请在「详情 → 本地设置」勾选「不校验合法域名、web-view（业务域名）、TLS 版本以及 HTTPS 证书」。
- 开发期默认连接本机 `http://localhost:3000`，请先启动 `server/` 后端；真机调试时把 baseUrl 改成电脑局域网 IP（如 `http://192.168.1.10:3000`），并确保手机与电脑同网。
- 测试号无法使用 `wx.login` 的真实 code 换取正式用户时，后端在开发环境提供 mock 登录：未配置 `WECHAT_APPID` 时，开发者工具的真实 code 固定映射为 `mock_dev`；显式传 `mock_zhang` / `mock_wang` 等 code 可得到不同测试用户（见「联调结果」与 `docs/联调报告.md`）。

## 2. 配置 baseUrl 与 appid

### baseUrl

- 默认值：`http://localhost:3000`，定义在 `api/config.ts` 的 `DEFAULT_BASE_URL`。
- 运行期可改：客户/商家/管理员「我的」→「接口地址」→「修改接口地址」，填写 `http://` 或 `https://` 开头的地址，重启页面后生效；也可「恢复默认」。
- 只填协议 + 域名 + 端口，不要带 `/api/v1`；请求层会自动拼接。图片按 `{baseUrl}/uploads/{image_key}` 拼接。

### appid

- 占位：`project.config.json → appid: "touristappid"`。
- 换成自己的测试号时，同时确认后端 `WX_APPID` / `WX_SECRET` 与该 appid 一致。

## 3. 页面地图

### 主包

| 路径 | 页面 | 角色 | 说明 |
|---|---|---|---|
| `pages/entry/index` | 视角选择 | 全部 | 客户/商家/超级用户角色卡，按权限显示入口 |
| `pages/customer/menu/index` | 客户菜单 | 客户 | 左侧分类、右侧菜品卡片、加购悬浮条 |

### 客户分包 `packageCustomer`

| 路径 | 页面 | 说明 |
|---|---|---|
| `dish/index` | 菜品详情 | 大图/评分/食材/份数/加入购物车 |
| `cart/index` | 购物车下单 | 改数量、整单备注、提交订单 |
| `orders/index` | 订单列表 | 全部/待处理/制作中/已完成、取消、去评价 |
| `order-detail/index` | 订单详情 | 状态横幅、三状态进度、明细、时间线 |
| `review/index` | 评价 | 整单星级 + 每菜星级/短评，已评价只读 |
| `calendar/index` | 日历 | 月视图、每日订单数、某日订单卡片 |

### 商家分包 `packageMerchant`

| 路径 | 页面 | 说明 |
|---|---|---|
| `board/index` | 订单看板 | 按日期分组、待处理/制作中/已完成、推进状态 |
| `order-detail/index` | 订单处理 | 明细、备注、三状态进度、取消/开始/完成 |
| `purchase/index` | 采购清单 | 按日汇总食材、涉及订单与菜名 |
| `dishes/index` | 菜品管理 | 搜索、筛选、上下架、分类管理（新增/改名/启停/排序） |
| `dish-edit/index` | 菜品编辑 | 名称/分类/简介/图片上传/食材配方/上架开关 |
| `ingredients/index` | 食材库 | 新增、改名、启停 |

### 超级用户分包 `packageAdmin`

| 路径 | 页面 | 说明 |
|---|---|---|
| `users/index` | 用户授权 | 搜索用户、开关商家端权限；自己和超级用户不可改 |

### 公共分包 `packageCommon`

| 路径 | 页面 | 说明 |
|---|---|---|
| `profile/index` | 我的 | 账号信息、角色切换、常用入口、接口地址、关于 |

## 4. 分包与 tabBar 说明

- 按文档使用分包：`packageCustomer`、`packageMerchant`、`packageAdmin`、`packageCommon`。
- 原生 tabBar 要求所有 tab 页在主包，与上面的分包方式冲突，因此没有使用 `app.json.tabBar`，改为公共组件 `components/tab-bar`：
  - 客户：点餐 / 订单 / 日历 / 我的
  - 商家：订单 / 采购 / 菜品 / 我的
  - 超级用户：用户 / 订单 / 采购 / 菜品 / 我的（复用商家的看板、采购、菜品页面）
- tab 切换使用 `wx.reLaunch`，页面通过 `role` 与 `active` 属性高亮当前项。
- 商家的看板/采购/菜品页面会读取 `zhang_last_role`：超级用户从「用户」视角进入时显示 5 个 tab，切到商家视角后显示 4 个 tab。
- 超级用户进入商家视角后可直接复用商家分包页面；权限由 `utils/role.ts` 的 `guardRole` 做前端兜底，真正的鉴权以后端为准。

## 5. 登录与持久化

- 启动时 `wx.login` 取 `code`，调用 `POST /auth/wx-login` 换 token。
- token 存本地缓存（`wx.setStorageSync`，键 `zhang_token`），用户信息缓存 `zhang_user`，重启后仍是同一用户。
- 请求层自动注入 `Authorization: Bearer <token>`；401 时自动强制重登一次并重试原请求，失败则回入口页。
- 网络失败但本地仍有登录态时，页面回退缓存用户展示，不会直接清空登录。

## 6. 已实现的交互（后端启动后即可跑通）

- 客户：菜单加购 → 购物车改数量/备注 → 提交订单 → 订单详情看状态 → 取消待处理订单 → 对已完成订单打分评论 → 日历切月份/切日期看订单。
- 商家：看板按日期筛选 → 开始制作 / 完成制作 → 订单详情继续推进或取消 → 采购清单按日汇总 → 菜品搜索/筛选/上下架 → 分类新增/改名/启停/排序 → 菜品新增/编辑/图片上传/食材多选/新建食材 → 食材库新增/改名/启停。
- 超级用户：搜索用户 → 开关商家端权限（自己和超级用户禁用）→ 即时刷新状态。
- 订单列表、看板、商家详情每 30 秒轮询，离开页面自动停止；支持下拉刷新。

## 7. 联调结果（2026-11-11）

原 18 条「待对齐」已逐条与后端实现比对，并通过真实 HTTP 调用验证。完整记录（含端到端清单、库里遗留数据、本地运行步骤）见 `docs/联调报告.md`。

| # | 对齐项 | 结果 | 处理 |
| --- | --- | --- | --- |
| 1 | 响应包装 | 一致 | 后端统一 `{ ok, data }` / `{ ok:false, code, params }`，前端无需改动 |
| 2 | 字段命名 | 一致 | 后端出参 camelCase，写请求 camelCase；`normalize.ts` 继续兼容 snake_case |
| 3 | 列表与分页 | 一致 | 分页统一 `{ items, page, pageSize, total, hasMore }`；非分页列表（分类/日历日）为数组 |
| 4 | 图片上传 | 一致 | 字段 `file`；返回 `{ imageKey, url, size }`；jpg/png/webp/gif ≤ 5MB；401 走统一错误体 |
| 5 | 菜品编辑回填 | 保留现方案 | 后端无单条详情接口，前端用列表按 id 查找；菜品量小，暂不新增接口 |
| 6 | 菜品配方字段 | 一致 | 商家菜品列表返回 `ingredients`，前端据此生成 `ingredientIds` |
| 7 | 分类接口 | 已对齐（改后端） | `sortOrder` 为整数；新增/修改改为返回完整分类（含 `sortOrder/isActive/dishCount`） |
| 8 | 食材接口 | 已对齐（改两端） | 管理页显式传 `includeInactive=1` 以看到停用项；PATCH 返回完整 `{ id, nameZh, isActive }` |
| 9 | 采购清单 | 已对齐（改后端） | 聚合键由 `items` 改为 `ingredients`，并补充 `dishNames` |
| 10 | 超管用户列表 | 一致 | 分页 `items[]`；`openidMasked` 脱敏，前端映射为展示用 openid |
| 11 | 授权接口 | 已对齐（改后端） | 后端新增「不可修改自己/超级用户」校验，返回 403 `ROLE_FORBIDDEN` |
| 12 | 订单字段 | 已对齐（改后端） | 商家订单补充扁平 `customerId/customerNickname`；订单补充 `reviewed` |
| 13 | 评价 | 一致 | 未评价返回 404 `REVIEW_NOT_FOUND`；重复评价 409 `REVIEW_DUPLICATED` |
| 14 | 时间与日期 | 一致 | 时间为 ISO 字符串；业务日期 `YYYY-MM-DD`；月份 `YYYY-MM` |
| 15 | 错误码 | 已对齐（改前端） | 后端新增码已补入 `utils/error.ts` 文案 |
| 16 | 角色权限 | 一致 | 后端逐请求校验；普通用户访问商家接口 403 已实测 |
| 17 | 图片地址 | 一致 | 相对 `imageKey` + `/uploads/` 静态前缀；种子使用 `uploads/seed/*.svg` |
| 18 | 停用语义 | 一致 | 客户分类/菜品后端已过滤停用分类；停用食材默认不出现在新配方可选范围，历史订单用快照不受影响 |
