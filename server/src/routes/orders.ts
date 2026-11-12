import type { FastifyInstance } from 'fastify';
import type { DB } from '../db';
import { AppError, errors } from '../lib/errors';
import {
  getOrderIngredients,
  getOrderItems,
  getOrderRow,
  getReviewsByOrderIds,
  serializeOrder,
  serializeReviewItems,
  type OrderRow,
  type OrderIngredientRow,
  type ReviewItemRow,
  type ReviewRow,
} from '../lib/orders';
import { ok, paged, parsePage } from '../lib/response';
import { businessDateOf, nowIso } from '../lib/time';

interface CreateOrderBody {
  items: { dishId: number; qty: number }[];
  remark?: string;
}

interface ReviewBody {
  rating: number;
  content?: string;
  items?: { dishId: number; rating: number; content?: string }[];
}

interface DishLite {
  id: number;
  name_zh: string;
  is_available: number;
}

export default async function orderRoutes(app: FastifyInstance): Promise<void> {
  // 下单：生成订单明细 + 食材快照（同一食材只一行）
  app.post<{ Body: CreateOrderBody }>(
    '/orders',
    {
      preHandler: [app.authenticate],
      schema: {
        body: {
          type: 'object',
          required: ['items'],
          additionalProperties: false,
          properties: {
            items: {
              type: 'array',
              minItems: 1,
              maxItems: 50,
              items: {
                type: 'object',
                required: ['dishId', 'qty'],
                additionalProperties: false,
                properties: {
                  dishId: { type: 'integer', minimum: 1 },
                  qty: { type: 'integer', minimum: 1, maximum: 99 },
                },
              },
            },
            remark: { type: 'string', maxLength: 200 },
          },
        },
      },
    },
    async (request, reply) => {
      const uid = request.currentUser.id;
      const db = app.db;

      const merged = new Map<number, number>();
      for (const item of request.body.items) {
        merged.set(item.dishId, (merged.get(item.dishId) ?? 0) + item.qty);
      }
      for (const [dishId, qty] of merged) {
        if (qty > 99) throw errors.validation('同一道菜的数量不能超过 99', { dishId });
      }

      const dishIds = [...merged.keys()];
      const placeholders = dishIds.map(() => '?').join(',');
      const dishes = db
        .prepare(`SELECT id, name_zh, is_available FROM dish WHERE id IN (${placeholders})`)
        .all(...dishIds) as DishLite[];
      const dishMap = new Map(dishes.map((d) => [d.id, d]));

      const missing = dishIds.filter((id) => !dishMap.has(id));
      if (missing.length) throw new AppError('DISH_NOT_FOUND', '部分菜品不存在', { dishIds: missing });

      const unavailable = dishIds.filter((id) => dishMap.get(id)!.is_available !== 1);
      if (unavailable.length) {
        throw new AppError('DISH_UNAVAILABLE', '部分菜品已下架，请刷新菜单后重试', { dishIds: unavailable });
      }

      const businessDate = businessDateOf();
      const createdAt = nowIso();

      const create = db.transaction(() => {
        const info = db
          .prepare(
            `INSERT INTO orders (customer_id, status, remark, business_date, created_at, updated_at)
             VALUES (?, 'pending', ?, ?, ?, ?)`,
          )
          .run(uid, request.body.remark?.trim() || null, businessDate, createdAt, createdAt);
        const orderId = Number(info.lastInsertRowid);

        const insertItem = db.prepare('INSERT INTO order_item (order_id, dish_id, name_zh, qty) VALUES (?, ?, ?, ?)');
        for (const [dishId, qty] of merged) {
          insertItem.run(orderId, dishId, dishMap.get(dishId)!.name_zh, qty);
        }

        const ingredientRows = db
          .prepare(
            `SELECT DISTINCT di.ingredient_id, i.name_zh
               FROM dish_ingredient di
               JOIN ingredient i ON i.id = di.ingredient_id
              WHERE di.dish_id IN (${placeholders})`,
          )
          .all(...dishIds) as OrderIngredientRow[];

        const insertIngredient = db.prepare(
          `INSERT INTO order_ingredient (order_id, ingredient_id, name_zh, created_at) VALUES (?, ?, ?, ?)`,
        );
        for (const row of ingredientRows) {
          insertIngredient.run(orderId, row.ingredient_id, row.name_zh, createdAt);
        }

        return orderId;
      });

      const orderId = create();
      const order = getOrderRow(app.db, orderId)!;
      return ok(
        reply,
        serializeOrder(
          order,
          getOrderItems(app.db, [orderId]).get(orderId) ?? [],
          getOrderIngredients(app.db, orderId),
          null,
        ),
        201,
      );
    },
  );

  // 客户订单列表：强制按当前 uid 过滤
  app.get<{ Querystring: { status?: OrderRow['status'] } }>(
    '/orders',
    {
      preHandler: [app.authenticate],
      schema: {
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: {
            status: { type: 'string', enum: ['pending', 'cooking', 'completed'] },
            page: { type: 'integer' },
            pageSize: { type: 'integer' },
          },
        },
      },
    },
    async (request, reply) => {
      const uid = request.currentUser.id;
      const pageQuery = parsePage(request.query as Record<string, unknown>, 20);
      const where = ['customer_id = ?', 'deleted_at IS NULL'];
      const params: unknown[] = [uid];

      if (request.query.status) {
        where.push('status = ?');
        params.push(request.query.status);
      }

      const whereSql = `WHERE ${where.join(' AND ')}`;
      const total = (
        app.db.prepare(`SELECT COUNT(*) AS n FROM orders ${whereSql}`).get(...params) as { n: number }
      ).n;

      const orders = app.db
        .prepare(`SELECT * FROM orders ${whereSql} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`)
        .all(...params, pageQuery.pageSize, pageQuery.offset) as OrderRow[];

      const ids = orders.map((o) => o.id);
      const items = getOrderItems(app.db, ids);
      const reviews = getReviewsByOrderIds(app.db, ids);

      return ok(
        reply,
        paged(
          orders.map((order) =>
            serializeOrder(
              order,
              items.get(order.id) ?? [],
              [],
              reviews.get(order.id) ?? null,
            ),
          ),
          total,
          pageQuery,
        ),
      );
    },
  );

  // 客户订单详情：非本人一律 404，不暴露存在性
  app.get<{ Params: { id: number } }>(
    '/orders/:id',
    {
      preHandler: [app.authenticate],
      schema: { params: { type: 'object', required: ['id'], properties: { id: { type: 'integer', minimum: 1 } } } },
    },
    async (request, reply) => {
      const uid = request.currentUser.id;
      const order = app.db
        .prepare('SELECT * FROM orders WHERE id = ? AND customer_id = ? AND deleted_at IS NULL')
        .get(request.params.id, uid) as OrderRow | undefined;
      if (!order) throw errors.orderNotFound();

      const items = getOrderItems(app.db, [order.id]).get(order.id) ?? [];
      const review = getReviewsByOrderIds(app.db, [order.id]).get(order.id) ?? null;
      return ok(
        reply,
        serializeOrder(order, items, getOrderIngredients(app.db, order.id), review),
      );
    },
  );

  // 取消：仅本人 pending 订单，软删除
  app.delete<{ Params: { id: number } }>(
    '/orders/:id',
    {
      preHandler: [app.authenticate],
      schema: { params: { type: 'object', required: ['id'], properties: { id: { type: 'integer', minimum: 1 } } } },
    },
    async (request, reply) => {
      const uid = request.currentUser.id;
      const row = app.db
        .prepare('SELECT * FROM orders WHERE id = ? AND customer_id = ? AND deleted_at IS NULL')
        .get(request.params.id, uid) as OrderRow | undefined;
      if (!row) throw errors.orderNotFound();
      if (row.status !== 'pending') {
        throw new AppError('ORDER_NOT_DELETABLE', '只有待处理的订单可以取消', { status: row.status });
      }

      const now = nowIso();
      app.db
        .prepare(
          `UPDATE orders
              SET deleted_at = ?, deleted_by_user_id = ?, updated_at = ?
            WHERE id = ? AND deleted_at IS NULL`,
        )
        .run(now, uid, now, row.id);

      return ok(reply, { id: row.id, deleted: true, deletedAt: now });
    },
  );

  // 提交评价：一单一评，仅 completed 订单
  app.post<{ Params: { id: number }; Body: ReviewBody }>(
    '/orders/:id/review',
    {
      preHandler: [app.authenticate],
      schema: {
        params: { type: 'object', required: ['id'], properties: { id: { type: 'integer', minimum: 1 } } },
        body: {
          type: 'object',
          required: ['rating'],
          additionalProperties: false,
          properties: {
            rating: { type: 'integer', minimum: 1, maximum: 5 },
            content: { type: 'string', maxLength: 500 },
            items: {
              type: 'array',
              maxItems: 50,
              items: {
                type: 'object',
                required: ['dishId', 'rating'],
                additionalProperties: false,
                properties: {
                  dishId: { type: 'integer', minimum: 1 },
                  rating: { type: 'integer', minimum: 1, maximum: 5 },
                  content: { type: 'string', maxLength: 200 },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const uid = request.currentUser.id;
      const db = app.db;
      const order = db
        .prepare('SELECT * FROM orders WHERE id = ? AND customer_id = ? AND deleted_at IS NULL')
        .get(request.params.id, uid) as OrderRow | undefined;
      if (!order) throw errors.orderNotFound();
      if (order.status !== 'completed') {
        throw new AppError('REVIEW_NOT_ALLOWED', '只有已完成的订单可以评价', { status: order.status });
      }

      const existing = db.prepare('SELECT id FROM review WHERE order_id = ?').get(order.id);
      if (existing) throw new AppError('REVIEW_DUPLICATED', '该订单已评价');

      const orderItems = getOrderItems(db, [order.id]).get(order.id) ?? [];
      const orderDishIds = new Set(orderItems.map((i) => i.dish_id));
      const seen = new Set<number>();
      for (const item of request.body.items ?? []) {
        if (!orderDishIds.has(item.dishId)) {
          throw errors.validation('评价的菜品不属于该订单', { dishId: item.dishId });
        }
        if (seen.has(item.dishId)) throw errors.validation('同一道菜只能评价一次', { dishId: item.dishId });
        seen.add(item.dishId);
      }

      const now = nowIso();
      const created = db.transaction(() => {
        const info = db
          .prepare(
            `INSERT INTO review (order_id, customer_id, rating, content, is_hidden, created_at)
             VALUES (?, ?, ?, ?, 0, ?)`,
          )
          .run(order.id, uid, request.body.rating, request.body.content?.trim() || null, now);
        const reviewId = Number(info.lastInsertRowid);

        const insertItem = db.prepare(
          'INSERT INTO review_item (review_id, dish_id, rating, content, created_at) VALUES (?, ?, ?, ?, ?)',
        );
        for (const item of request.body.items ?? []) {
          insertItem.run(reviewId, item.dishId, item.rating, item.content?.trim() || null, now);
        }

        return reviewId;
      });

      const reviewId = created();
      return ok(reply, buildReviewPayload(app.db, reviewId), 201);
    },
  );

  // 查看本人订单评价
  app.get<{ Params: { id: number } }>(
    '/orders/:id/review',
    {
      preHandler: [app.authenticate],
      schema: { params: { type: 'object', required: ['id'], properties: { id: { type: 'integer', minimum: 1 } } } },
    },
    async (request, reply) => {
      const uid = request.currentUser.id;
      const order = app.db
        .prepare('SELECT id FROM orders WHERE id = ? AND customer_id = ? AND deleted_at IS NULL')
        .get(request.params.id, uid) as { id: number } | undefined;
      if (!order) throw errors.orderNotFound();

      const review = app.db.prepare('SELECT * FROM review WHERE order_id = ?').get(order.id) as
        | ReviewRow
        | undefined;
      if (!review) throw new AppError('REVIEW_NOT_FOUND', '该订单还没有评价');

      return ok(reply, buildReviewPayload(app.db, review.id));
    },
  );
}

function buildReviewPayload(db: DB, reviewId: number) {
  const review = db.prepare('SELECT * FROM review WHERE id = ?').get(reviewId) as ReviewRow;
  const items = db
    .prepare(
      `SELECT ri.*, d.name_zh
         FROM review_item ri
         JOIN dish d ON d.id = ri.dish_id
        WHERE ri.review_id = ?
        ORDER BY ri.id ASC`,
    )
    .all(reviewId) as (ReviewItemRow & { name_zh: string })[];
  return {
    id: review.id,
    orderId: review.order_id,
    rating: review.rating,
    content: review.content,
    isHidden: review.is_hidden === 1,
    createdAt: review.created_at,
    items: serializeReviewItems(items),
  };
}
