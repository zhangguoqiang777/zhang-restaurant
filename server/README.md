# 小张的餐厅 · 后端服务

Fastify + better-sqlite3 + TypeScript 实现的单店 API。对应 `docs/方案设计.md` v0.3 与 `docs/架构与数据模型.md` v1.0，包含客户、商家、超级用户三个视角。

本期明确不做：价格/金额/支付、库存扣减、取餐方式与桌号、多语言、AI 推荐。

## 1. 环境与启动

要求 Node.js ≥ 20（本机验证使用 Node 24）。

```powershell
cd server
npm install

# 建库（可重复执行：已应用的版本会跳过）
npm run migrate

# 可选：写入 4 个分类、6 道菜、11 种食材，并生成 uploads/seed/*.svg 占位图
npm run seed

# 开发模式（tsx watch）
npm run dev

# 生产构建
npm run build
npm start
```

默认地址 `http://localhost:3000`，健康检查 `GET /health`。

数据库文件默认 `server/data/restaurant.db`，图片目录默认 `server/uploads/`，两者都被 `.gitignore` 忽略。

### 环境变量

复制 `.env.example` 为 `.env` 后按需修改：

| 变量 | 默认 | 说明 |
|---|---|---|
| `PORT` | `3000` | 监听端口 |
| `HOST` | `0.0.0.0` | 监听地址 |
| `DB_FILE` | `./data/restaurant.db` | SQLite 文件，相对 `server/` |
| `UPLOAD_DIR` | `./uploads` | 图片目录，相对 `server/` |
| `JWT_SECRET` | `dev-only-change-me` | 上线必须替换 |
| `JWT_EXPIRES_IN` | `30d` | 自有 token 有效期 |
| `WECHAT_APPID` / `WECHAT_SECRET` | 空 | 小程序凭证 |
| `WECHAT_MOCK` | 未配置时看凭证 | `1` 走 mock；两者都没配时自动 mock |
| `PUBLIC_BASE_URL` | 空 | 生成图片绝对地址用；留空按请求 Host 拼 |

## 2. 本地联调微信登录

### mock 模式（默认，无需小程序）

`WECHAT_MOCK=1`（或未配置 AppID/Secret）时，`code` 直接映射为稳定用户：

```bash
curl -X POST http://localhost:3000/api/v1/auth/wx-login \
  -H "Content-Type: application/json" \
  -d '{"code":"mock_zhang","nickname":"小张"}'
```

同一 `code` 永远对应同一个 `app_user`；换 `mock_wang` 即换一个用户。返回的 `token` 放入后续请求的 `Authorization: Bearer <token>`。

> 库里没有超管时，**第一个成功登录的用户自动成为超管**（`is_super=1`）。后续用户默认 `can_merchant=0`，需要超管在授权页开启。

### 真实微信模式

配置 `WECHAT_APPID`、`WECHAT_SECRET`，并设置 `WECHAT_MOCK=0`。小程序端用 `wx.login()` 拿到的 `code` 调本接口，服务端会请求微信 `jscode2session` 换取 `openid`。

### 权限模型

- JWT payload 只有 `uid`；每次请求都回表读 `app_user`，因此撤销商家权限后**立即生效**，无需等 token 过期。
- `is_super=1` 隐含商家权限；`can_merchant=1` 是独立开关。
- `GET /me` 返回 `roles`，前端据此渲染「吃饭人 / 做饭人 / 超级用户」入口。

## 3. 统一约定

### 响应结构

成功：

```json
{ "ok": true, "data": { } }
```

失败：

```json
{ "ok": false, "code": "ORDER_STATE_INVALID", "message": "只有待处理的订单可以开始制作", "params": { "status": "cooking" } }
```

### 分页

列表统一 `page`（默认 1）、`pageSize`（默认 20，最大 100）：

```json
{ "items": [], "page": 1, "pageSize": 20, "total": 0, "hasMore": false }
```

### 业务错误码

| code | HTTP | 含义 |
|---|---|---|
| `AUTH_REQUIRED` | 401 | 缺少 Bearer token |
| `AUTH_INVALID` | 401 | token 无效或用户已不存在 |
| `WX_LOGIN_FAILED` | 401 | 微信换取 openid 失败 |
| `ROLE_FORBIDDEN` | 403 | 当前视角无权限 |
| `VALIDATION_FAILED` | 400 | 参数校验失败，`params.fields` 给出字段 |
| `NOT_FOUND` | 404 | 路由不存在 |
| `USER_NOT_FOUND` | 404 | 用户不存在 |
| `CATEGORY_NOT_FOUND` | 404 | 分类不存在 |
| `DISH_NOT_FOUND` | 404 | 菜品不存在或已下架 |
| `DISH_UNAVAILABLE` | 409 | 下单时菜品已下架，`params.dishIds` |
| `INGREDIENT_NOT_FOUND` | 404 | 食材不存在，`params.ingredientIds` |
| `ORDER_NOT_FOUND` | 404 | 订单不存在/已取消/不属于当前用户 |
| `ORDER_STATE_INVALID` | 409 | 状态推进不合法 |
| `ORDER_NOT_DELETABLE` | 409 | 非待处理订单不能取消 |
| `REVIEW_NOT_ALLOWED` | 409 | 非完成订单不能评价 |
| `REVIEW_DUPLICATED` | 409 | 一单一评 |
| `REVIEW_NOT_FOUND` | 404 | 评价不存在 |
| `UPLOAD_INVALID` | 400 | 图片格式/大小/字段不合法 |
| `INTERNAL_ERROR` | 500 | 未预期错误 |

## 4. 接口清单与示例

以下示例默认已登录，`TOKEN` 为登录返回的 token；`BASE=http://localhost:3000/api/v1`。

### 4.1 登录与用户

**POST `/auth/wx-login`**

```json
{ "code": "mock_zhang", "nickname": "小张" }
```

```json
{
  "ok": true,
  "data": {
    "token": "eyJhbGciOi...",
    "userId": 1,
    "nickname": "小张",
    "isSuper": true,
    "canMerchant": true,
    "lastRole": "customer",
    "roles": ["customer", "merchant", "admin"],
    "isNewUser": true,
    "mocked": true
  }
}
```

**GET `/me`**

```json
{
  "ok": true,
  "data": {
    "id": 1, "nickname": "小张", "openidMasked": "mock_m****hang",
    "isSuper": true, "canMerchant": true,
    "merchantSwitch": false, "lastRole": "customer",
    "roles": ["customer", "merchant", "admin"],
    "lastLoginAt": "2026-11-11T11:51:31.782Z",
    "createdAt": "2026-11-11T11:51:31.782Z"
  }
}
```

**PATCH `/me`** — 记录最近视角 / 修改昵称，至少传一个字段；返回与 `GET /me` 相同的完整用户对象（前端会用它整体覆盖本地用户）。

```json
{ "lastRole": "merchant" }
```

无商家权限时切 `merchant`、非超管切 `admin` 返回 `ROLE_FORBIDDEN`。

### 4.2 菜单（客户）

**GET `/categories`**

```json
{ "ok": true, "data": [{ "id": 1, "nameZh": "招牌", "sortOrder": 10 }] }
```

**GET `/dishes?categoryId=1&page=1&pageSize=50`** — 只返回启用分类下的在售菜品：

```json
{
  "ok": true,
  "data": {
    "items": [
      {
        "id": 1, "categoryId": 1, "categoryName": "招牌",
        "nameZh": "番茄鸡蛋面", "introZh": "手擀面配沙瓤番茄，微酸开胃",
        "imageKey": "seed/tomato-noodle.svg",
        "imageUrl": "http://localhost:3000/uploads/seed/tomato-noodle.svg",
        "isAvailable": true, "sortOrder": 10,
        "rating": { "avg": 4.8, "count": 12 }
      }
    ],
    "page": 1, "pageSize": 50, "total": 1, "hasMore": false
  }
}
```

**GET `/dishes/:id`** — 在上一结构上增加食材：

```json
{
  "ok": true,
  "data": {
    "id": 1, "nameZh": "番茄鸡蛋面", "rating": { "avg": 5, "count": 1 },
    "ingredients": [{ "id": 1, "nameZh": "番茄" }, { "id": 2, "nameZh": "鸡蛋" }]
  }
}
```

**GET `/dishes/:id/reviews`** — 仅未隐藏评价：

```json
{
  "ok": true,
  "data": {
    "items": [{ "id": 1, "reviewId": 1, "rating": 5, "content": "番茄很浓", "nickname": "老王", "createdAt": "2026-11-11T11:56:07.320Z" }],
    "page": 1, "pageSize": 20, "total": 1, "hasMore": false
  }
}
```

### 4.3 订单（客户）

**POST `/orders`** — 自动生成明细快照与食材快照：

```json
{
  "items": [{ "dishId": 1, "qty": 2 }, { "dishId": 2, "qty": 1 }],
  "remark": "面少辣，宫保鸡丁不要花生"
}
```

```json
{
  "ok": true,
  "data": {
    "id": 2, "status": "pending", "remark": "面少辣，宫保鸡丁不要花生",
    "businessDate": "2026-11-11",
    "createdAt": "2026-11-11T11:55:46.985Z",
    "cookingAt": null, "completedAt": null,
    "items": [{ "dishId": 1, "nameZh": "番茄鸡蛋面", "qty": 2 }],
    "ingredients": [{ "ingredientId": 1, "nameZh": "番茄" }, { "ingredientId": 2, "nameZh": "鸡蛋" }],
    "timeline": [{ "key": "created", "at": "2026-11-11T11:55:46.985Z" }],
    "review": null, "canCancel": true, "canReview": false
  }
}
```

同一 `dishId` 重复传会合并数量；单菜上限 99；下架菜品返回 `DISH_UNAVAILABLE`。

**GET `/orders?status=pending&page=1`** — 强制按当前用户过滤，不含已取消。`items`、`review`、`canCancel`、`canReview` 都在列表里。

**GET `/orders/:id`** — 非本人返回 `ORDER_NOT_FOUND`（不暴露存在性）。

**DELETE `/orders/:id`** — 仅本人 `pending`：

```json
{ "ok": true, "data": { "id": 3, "deleted": true, "deletedAt": "2026-11-11T11:56:50.051Z" } }
```

**POST `/orders/:id/review`** — 一单一评，仅 `completed`：

```json
{
  "rating": 5,
  "content": "面和鸡丁都很稳",
  "items": [
    { "dishId": 1, "rating": 5, "content": "番茄很浓" },
    { "dishId": 2, "rating": 4 }
  ]
}
```

`items` 可省略；`dishId` 必须属于该订单，且不能重复。

**GET `/orders/:id/review`** — 返回整单评分与逐菜评分；未评价返回 `REVIEW_NOT_FOUND`。

### 4.4 日历（客户）

**GET `/calendar?month=2026-11`** — `month` 省略时取当前月：

```json
{ "ok": true, "data": { "month": "2026-11", "totalOrders": 2, "days": [{ "date": "2026-11-11", "count": 2 }] } }
```

**GET `/calendar/2026-11-11`** — 当日订单与已点菜品：

```json
{
  "ok": true,
  "data": {
    "date": "2026-11-11", "total": 2,
    "orders": [{
      "id": 2, "status": "completed", "reviewed": true, "rating": 5,
      "items": [{ "dishId": 1, "nameZh": "番茄鸡蛋面", "qty": 2 }],
      "createdAt": "2026-11-11T11:55:46.985Z",
      "cookingAt": "2026-11-11T11:55:59.204Z",
      "completedAt": "2026-11-11T11:56:03.269Z"
    }]
  }
}
```

### 4.5 商家订单

**GET `/merchant/orders?date=2026-11-11&status=pending`**

- `date` 省略取当天；`date=all` 查全部。
- 不按客户过滤；`summary` 不受 `status` 影响，便于看板顶部统计。

```json
{
  "ok": true,
  "data": {
    "items": [{
      "id": 2, "status": "pending", "items": [], "remark": "面少辣",
      "customer": { "id": 2, "nickname": "老王" },
      "createdAt": "2026-11-11T11:55:46.985Z"
    }],
    "page": 1, "pageSize": 20, "total": 1, "hasMore": false,
    "date": "2026-11-11",
    "summary": { "pending": 1, "cooking": 0, "completed": 0, "total": 1 }
  }
}
```

**GET `/merchant/orders/:id`** — 含明细、食材快照、时间线、客户、评价。

**POST `/merchant/orders/:id/start`** — 待处理 → 制作中：

```json
{ "ok": true, "data": { "id": 2, "status": "cooking", "cookingAt": "2026-11-11T11:55:59.204Z" } }
```

**POST `/merchant/orders/:id/complete`** — 制作中 → 完成，返回 `completedAt`。

**DELETE `/merchant/orders/:id`** — 仅待处理可取消（软删除，记录操作人）。

状态跃迁只允许 `pending → cooking → completed`；跳步或重复推进返回 `ORDER_STATE_INVALID`。

### 4.6 采购清单

**GET `/merchant/purchases?date=2026-11-11`**

按食材聚合去重，只返回涉及订单数，不返回数量与单位；已取消订单不计入。

```json
{
  "ok": true,
  "data": {
    "date": "2026-11-11", "orderCount": 2, "ingredientCount": 8,
    "ingredients": [{
      "ingredientId": 1, "nameZh": "番茄", "orderCount": 2, "orderIds": [1, 2],
      "dishNames": ["番茄鸡蛋面", "番茄炒蛋"]
    }]
  }
}
```

`dishNames` 为该日订单里实际点到、且配方用到该食材的菜名（去重），用于「用于…」摘要。

### 4.7 商家菜单管理

**GET `/merchant/categories`** — 含停用分类与 `dishCount`。

**POST `/merchant/categories`** / **PATCH `/merchant/categories/:id`**

```json
{ "nameZh": "凉菜", "sortOrder": 15, "isActive": true }
```

**GET `/merchant/dishes?categoryId=2&keyword=黄瓜&page=1`** — 含下架菜品、食材列表。

**POST `/merchant/dishes`**

```json
{
  "categoryId": 2, "nameZh": "拍黄瓜", "introZh": "蒜香清爽，现拍现拌",
  "imageKey": "2026/11/e42ee74a-....png", "isAvailable": true,
  "sortOrder": 0, "ingredientIds": [11, 12]
}
```

**PATCH `/merchant/dishes/:id`** — 字段均可选；传 `ingredientIds` 会整体替换配方；上下架传 `isAvailable`。

**GET `/merchant/ingredients?keyword=&includeInactive=1`** — 含 `dishCount`。

**POST `/merchant/ingredients`** / **PATCH `/merchant/ingredients/:id`**

```json
{ "nameZh": "黄瓜" }
```

重名返回 `VALIDATION_FAILED`（`params.id` 给出已有食材）。

### 4.8 图片上传

**POST `/merchant/uploads/image`**，`multipart/form-data`，字段名 `file`：

```bash
curl -X POST http://localhost:3000/api/v1/merchant/uploads/image \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@dish.png;type=image/png"
```

```json
{ "ok": true, "data": { "imageKey": "2026/11/e42ee74a-36af-4558-891f-3be9a95c7be4.png", "url": "http://localhost:3000/uploads/2026/11/e42ee74a-36af-4558-891f-3be9a95c7be4.png", "size": 190 } }
```

- 支持 jpg / png / webp / gif，单文件 ≤ 5MB。
- 把返回的 `imageKey` 通过 `PATCH /merchant/dishes/:id` 写入菜品。
- 静态访问前缀 `/uploads/`；如部署在反代后，用 `PUBLIC_BASE_URL` 固定绝对地址。
- 种子数据使用 `uploads/seed/*.svg`，无需上传即可看到带图的菜单。

### 4.9 评价管理

**PATCH `/merchant/reviews/:id`**

```json
{ "hidden": true }
```

隐藏后：菜品详情评分与 `/dishes/:id/reviews` 立即排除该评价；整单评价本身仍保留。

### 4.10 超级用户

**GET `/admin/users?keyword=王&page=1`**

```json
{
  "ok": true,
  "data": {
    "items": [{
      "id": 2, "nickname": "老王", "openidMasked": "mock_m****wang",
      "isSuper": false, "canMerchant": false, "merchantAccess": false,
      "lastRole": "customer", "merchantGrantedBy": null, "merchantGrantedAt": null,
      "lastLoginAt": "2026-11-11T11:55:42.868Z", "createdAt": "2026-11-11T11:51:53.833Z"
    }],
    "page": 1, "pageSize": 20, "total": 1, "hasMore": false
  }
}
```

**PATCH `/admin/users/:id/merchant-access`**

```json
{ "allowed": true }
```

```json
{ "ok": true, "data": { "id": 2, "canMerchant": true, "merchantAccess": true, "merchantGrantedBy": 1 } }
```

`isSuper` 无法通过接口修改（只在初始化时产生）；修改自己或其他超级用户的权限返回 `ROLE_FORBIDDEN`。

## 5. 数据与迁移

- 迁移文件在 `src/db/migrations.ts`，编号只追加不修改；`schema_migration` 记录已应用版本，重复执行安全。
- 首次打开数据库自动执行迁移，`npm run migrate` 用于手动确认。
- 第 1 版严格对应架构文档的 10 张表与索引；额外只有 `schema_migration` 这一张迁移记录表。
- 软删除：`orders.deleted_at`，所有客户/商家订单查询都会过滤。
- 业务日期 `business_date` 固定按 `Asia/Shanghai` 计算，存 `YYYY-MM-DD`；其余时间存 UTC ISO8601。

## 6. 已知限制

- 单进程 + WAL，不支持多实例同时写同一个库。
- 商家看板用轮询，不使用 WebSocket。
- 图片只校验 MIME 与大小，不做内容扫描；如需限制尺寸可在上传后加处理。
- 未实现价格、支付、库存、取餐、桌号、i18n、AI 推荐（按方案明确不做）。

## 7. 故障排查

**`npm install` 后 `better-sqlite3` 报找不到绑定**

npm 12 默认拦截安装脚本，或 GitHub 预编译包下载超时。可执行：

```powershell
npm install-scripts approve better-sqlite3
npm install-scripts approve esbuild
npm rebuild better-sqlite3 esbuild
```

若仍失败，可手动从镜像安装预编译文件（按 Node ABI 调整文件名）：

```powershell
$url = "https://registry.npmmirror.com/-/binary/better-sqlite3/v12.11.1/better-sqlite3-v12.11.1-node-v137-win32-x64.tar.gz"
Invoke-WebRequest -Uri $url -OutFile "$env:TEMP\bs3.tar.gz"
tar -xzf "$env:TEMP\bs3.tar.gz" -C "node_modules\better-sqlite3"
```

**端口占用**

`Get-NetTCPConnection -LocalPort 3000 -State Listen` 查 PID 后停止，或改 `PORT`。

**登录一直新建用户**

确认请求带的是同一个 `code`；mock 模式下 `openid = mock_<code>`，`code` 不同就是不同用户。

**Windows PowerShell 下启动日志中文乱码（如「寰俊鐧诲綍澶勪簬 mock 妯″紡」）**

原因：Windows 简体中文控制台默认代码页是 936（GBK），而 Node 始终输出 UTF-8 字节，npm 转发子进程输出后控制台按 GBK 解码。

已修复：`src/lib/console-utf8.ts` 的 `ensureUtf8Console()` 会在进程启动最早期（Windows 下）执行 `chcp 65001`，`src/index.ts`、`scripts/migrate.ts`、`scripts/seed.ts` 均已调用，**不需要手动 chcp**，也不需要改 npm 脚本，Linux/macOS 无影响。

自己验证：

```powershell
cd server
chcp 936          # 模拟默认 GBK 控制台
npm run dev
# 另开一个窗口看日志是否正常；或在本窗口执行 chcp，应显示 65001
```

如果仍然乱码，可依次排查：

1. 用 `chcp` 确认当前代码页是否已变成 `65001`；仍是 `936` 说明进程没走到 helper（检查是否直接从别的目录启动、或运行的是旧 `dist/`）。
2. 控制台字体需为 TrueType（如「新宋体」「Consolas」），点阵字体在 65001 下会显示方块。
3. 旧版 conhost 兼容性差时可改用 Windows Terminal 或 PowerShell 7。

实现注意：`spawnSync('cmd', ['/d','/c','chcp','65001'])` **不能加 `windowsHide: true`**——那会给子进程创建独立隐藏控制台，代码页只改到隐藏控制台，父窗口仍是 936。
