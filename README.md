# 小张的餐厅

一个单店自用的微信小程序餐厅点餐系统：客户在小程序里看菜单、点餐、查看订单与评价；商家在同一套小程序里处理订单、看采购清单、维护菜品与食材。后端是单进程 Node 服务，数据存在一个本地 SQLite 文件里，不做多店、多实例。

当前版本只做「点餐 + 出餐 + 采购」这条主链路，不含任何价格与支付逻辑，菜单只呈现名称、图片、简介和分类。

## 功能范围

**客户**

- 选择视角进入（只有客户权限时直接进菜单）
- 按分类浏览菜单，菜品详情带图片、简介、食材与评分
- 加入购物车、调整份数、填写整单备注后下单
- 查看自己的订单列表与详情，取消仍处于「待处理」的订单
- 对已完成订单打分、写短评（整单一条，可按菜品单独评分）
- 日历查看某天吃了什么

**商家**

- 订单看板：按日期、状态筛选全部用户订单
- 推进状态：待处理 → 制作中 → 完成，只有单向推进
- 采购清单：按食材聚合当天所需食材，去重并标注涉及订单数
- 菜品管理：分类的增改、排序与启停；菜品上下架、编辑、图片上传、配置食材
- 食材库：新增、改名、启停

**超级用户**

- 在用户授权页把商家端访问权限授予或撤销给其他登录用户
- 隐含商家全部权限，可查看全部订单与维护菜品

权限说明：JWT 里只有用户 id，每次请求都会回表读取 `is_super` / `can_merchant`，因此撤销商家权限立即生效。

## 当前不包含

- 在线支付、价格与金额（数据库无金额字段）
- 库存管理与扣减（配方只记录「这道菜用到哪些食材」，没有用量和单位）
- 取餐、叫号、核销与桌号
- 中英文切换（仅保留 `name_en` 等预留字段，不读写、无切换入口）
- AI 推荐菜品（仅保留设计位置，未建表、未做接口）

中英文切换与 AI 推荐属于预留设计，详见 `docs/架构与数据模型.md`。

## 数据与约定

- 共 10 张表：`app_user`、`dish_category`、`dish`、`ingredient`、`dish_ingredient`、`orders`、`order_item`、`order_ingredient`、`review`、`review_item`。
- 订单只有 `pending` / `cooking` / `completed` 三种状态；取消用 `orders.deleted_at` 软删除表达，不新增第四种状态。
- 订单明细与采购快照都存名称快照，菜品改名或下架不影响历史订单。
- 业务日期 `business_date` 按 `Asia/Shanghai` 记为 `YYYY-MM-DD`，其余时间存 UTC ISO8601。
- 迁移文件在 `server/src/db/migrations.ts`，编号只追加不修改，重复执行安全。

## 技术栈

- 小程序：原生小程序 + TypeScript（无框架、无构建步骤，开发者工具直接编译）
- 后端：Node.js（≥ 20）+ Fastify + TypeScript
- 数据库：SQLite + better-sqlite3，开启 WAL，预编译 SQL + 编号迁移，不引入 ORM
- 图片：服务器本地 `server/uploads/` 目录存储，数据库只存相对 `image_key`

## 目录结构

```
.
├── server/       后端 API：Fastify 路由、SQLite 迁移与种子数据、图片上传
├── miniprogram/  微信小程序：入口页 + 客户/商家/超级用户分包、自定义 tabBar
├── prototype/    高保真静态界面稿（单页 HTML + 样式），不接后端
├── docs/         方案设计、架构与数据模型、前后端联调报告
└── index.html    架构与流程图册（单页 HTML）
```

## 快速开始

### 1. 启动后端

```powershell
cd server
npm install

# 建库（可重复执行，已应用的迁移会跳过）
npm run migrate

# 可选：写入 4 个分类、6 道菜、11 种食材，并生成 uploads/seed/*.svg 占位图
npm run seed

npm run dev        # 开发模式，默认 http://localhost:3000
```

接口统一前缀 `/api/v1`，健康检查 `GET /health`。环境变量见 `server/.env.example`，复制为 `.env` 后按需修改（`JWT_SECRET` 上线前必须替换）。未配置 `WECHAT_APPID` / `WECHAT_SECRET` 时后端自动进入 mock 登录模式，无需真实小程序凭证即可联调。

### 2. 打开小程序

1. 微信开发者工具选择「导入项目」，目录选仓库下的 `miniprogram/`（不是仓库根目录）。
2. AppID 使用测试号，或直接使用游客模式；在 `miniprogram/project.config.json` 中替换 `appid` 即可。
3. 在「详情 → 本地设置」勾选「不校验合法域名、web-view（业务域名）、TLS 版本以及 HTTPS 证书」。
4. 直接编译运行，无需 `npm install`。默认请求 `http://localhost:3000`，可在「我的 → 接口地址」中修改；真机调试时改成电脑的局域网 IP。

**第一个成功登录的用户自动成为超级用户**（数据库中还没有超级用户时触发一次），之后登录的用户默认只有客户视角，需要由超级用户在授权页开启商家端权限。

## 相关文档

- [方案设计](docs/方案设计.md)：功能边界、状态机、权限模型、接口清单、页面结构
- [架构与数据模型](docs/架构与数据模型.md)：架构图、ER 图、10 张表的字段与索引、预留设计
- [联调报告](docs/联调报告.md)：前后端对齐项、端到端验证结果、已知限制
- [界面效果图](prototype/index.html)：静态高保真原型，断网可看

后端接口细节见 [server/README.md](server/README.md)，小程序页面与分包说明见 [miniprogram/README.md](miniprogram/README.md)。
