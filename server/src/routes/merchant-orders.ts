import type { FastifyInstance } from 'fastify';
import { AppError, errors } from '../lib/errors';
import {
  getOrderIngredients,
  getOrderItems,
  getOrderRow,
  getReviewsByOrderIds,
  serializeOrder,
  type OrderRow,
} from '../lib/orders';
import { ok, paged, parsePage } from '../lib/response';
import { businessDateOf, isDateString, isRealDate, nowIso } from '../lib/time';

type MerchantOrderRow = OrderRow & { customer_nickname: string | null };

export default async function merchantOrderRoutes(app: FastifyInstance): Promise<void> {
  // 商家订单看板：默认当天，date=all 查全部；summary 不受状态筛选影响
  app.get<{ Querystring: { date?: string; status?: OrderRow['status'] } }>(
    '/merchant/orders',
    {
      preHandler: [app.authenticate, app.requireMerchant],
      schema: {
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: {
            date: { type: 'string' },
            status: { type: 'string', enum: ['pending', 'cooking', 'completed'] },
            page: { type: 'integer' },
            pageSize: { type: 'integer' },
          },
        },
      },
    },
    async (request, reply) => {
      const dateParam = request.query.date ?? businessDateOf();
      const dateAll = dateParam === 'all';
      if (!dateAll && (!isDateString(dateParam) || !isRealDate(dateParam))) {
        throw errors.validation('date 格式应为 YYYY-MM-DD 或 all');
      }

      const pageQuery = parsePage(request.query as Record<string, unknown>, 20);
      const where = ['o.deleted_at IS NULL'];
      const params: unknown[] = [];

      if (!dateAll) {
        where.push('o.business_date = ?');
        params.push(dateParam);
      }
      if (request.query.status) {
        where.push('o.status = ?');
        params.push(request.query.status);
      }
      const whereSql = `WHERE ${where.join(' AND ')}`;

      const total = (
        app.db
          .prepare(`SELECT COUNT(*) AS n FROM orders o ${whereSql}`)
          .get(...params) as { n: number }
      ).n;

      const rows = app.db
        .prepare(
          `SELECT o.*, u.nickname AS customer_nickname
             FROM orders o
             JOIN app_user u ON u.id = o.customer_id
             ${whereSql}
            ORDER BY o.created_at DESC, o.id DESC
            LIMIT ? OFFSET ?`,
        )
        .all(...params, pageQuery.pageSize, pageQuery.offset) as MerchantOrderRow[];

      const ids = rows.map((r) => r.id);
      const items = getOrderItems(app.db, ids);
      const reviews = getReviewsByOrderIds(app.db, ids);

      const summaryWhere = dateAll ? 'WHERE o.deleted_at IS NULL' : 'WHERE o.deleted_at IS NULL AND o.business_date = ?';
      const summaryRows = app.db
        .prepare(`SELECT o.status, COUNT(*) AS n FROM orders o ${summaryWhere} GROUP BY o.status`)
        .all(...(dateAll ? [] : [dateParam])) as { status: OrderRow['status']; n: number }[];

      const summary = { pending: 0, cooking: 0, completed: 0, total: 0 };
      for (const row of summaryRows) {
        summary[row.status] = row.n;
        summary.total += row.n;
      }

      return ok(reply, {
        ...paged(
          rows.map((row) =>
            serializeOrder(row, items.get(row.id) ?? [], [], reviews.get(row.id) ?? null, {
              customer: { id: row.customer_id, nickname: row.customer_nickname ?? '未设置昵称' },
              customerId: row.customer_id,
              customerNickname: row.customer_nickname ?? '未设置昵称',
            }),
          ),
          total,
          pageQuery,
        ),
        date: dateAll ? 'all' : dateParam,
        summary,
      });
    },
  );

  // 商家订单详情：不按客户过滤
  app.get<{ Params: { id: number } }>(
    '/merchant/orders/:id',
    {
      preHandler: [app.authenticate, app.requireMerchant],
      schema: { params: { type: 'object', required: ['id'], properties: { id: { type: 'integer', minimum: 1 } } } },
    },
    async (request, reply) => {
      const row = app.db
        .prepare(
          `SELECT o.*, u.nickname AS customer_nickname
             FROM orders o JOIN app_user u ON u.id = o.customer_id
            WHERE o.id = ? AND o.deleted_at IS NULL`,
        )
        .get(request.params.id) as MerchantOrderRow | undefined;
      if (!row) throw errors.orderNotFound();

      const items = getOrderItems(app.db, [row.id]).get(row.id) ?? [];
      const review = getReviewsByOrderIds(app.db, [row.id]).get(row.id) ?? null;

      return ok(
        reply,
        serializeOrder(row, items, getOrderIngredients(app.db, row.id), review, {
          customer: { id: row.customer_id, nickname: row.customer_nickname ?? '未设置昵称' },
          customerId: row.customer_id,
          customerNickname: row.customer_nickname ?? '未设置昵称',
        }),
      );
    },
  );

  // 待处理 → 制作中
  app.post<{ Params: { id: number } }>(
    '/merchant/orders/:id/start',
    {
      preHandler: [app.authenticate, app.requireMerchant],
      schema: { params: { type: 'object', required: ['id'], properties: { id: { type: 'integer', minimum: 1 } } } },
    },
    async (request, reply) => {
      const order = getOrderRow(app.db, request.params.id);
      if (!order) throw errors.orderNotFound();
      if (order.status !== 'pending') {
        throw new AppError('ORDER_STATE_INVALID', '只有待处理的订单可以开始制作', { status: order.status });
      }

      const now = nowIso();
      app.db
        .prepare(
          `UPDATE orders SET status = 'cooking', cooking_at = ?, updated_at = ?
            WHERE id = ? AND status = 'pending' AND deleted_at IS NULL`,
        )
        .run(now, now, order.id);

      return ok(reply, { id: order.id, status: 'cooking', cookingAt: now });
    },
  );

  // 制作中 → 完成
  app.post<{ Params: { id: number } }>(
    '/merchant/orders/:id/complete',
    {
      preHandler: [app.authenticate, app.requireMerchant],
      schema: { params: { type: 'object', required: ['id'], properties: { id: { type: 'integer', minimum: 1 } } } },
    },
    async (request, reply) => {
      const order = getOrderRow(app.db, request.params.id);
      if (!order) throw errors.orderNotFound();
      if (order.status !== 'cooking') {
        throw new AppError('ORDER_STATE_INVALID', '只有制作中的订单可以完成', { status: order.status });
      }

      const now = nowIso();
      app.db
        .prepare(
          `UPDATE orders SET status = 'completed', completed_at = ?, updated_at = ?
            WHERE id = ? AND status = 'cooking' AND deleted_at IS NULL`,
        )
        .run(now, now, order.id);

      return ok(reply, { id: order.id, status: 'completed', completedAt: now });
    },
  );

  // 商家取消：仅待处理，软删除并记录操作人
  app.delete<{ Params: { id: number } }>(
    '/merchant/orders/:id',
    {
      preHandler: [app.authenticate, app.requireMerchant],
      schema: { params: { type: 'object', required: ['id'], properties: { id: { type: 'integer', minimum: 1 } } } },
    },
    async (request, reply) => {
      const order = getOrderRow(app.db, request.params.id);
      if (!order) throw errors.orderNotFound();
      if (order.status !== 'pending') {
        throw new AppError('ORDER_NOT_DELETABLE', '只有待处理的订单可以取消', { status: order.status });
      }

      const now = nowIso();
      app.db
        .prepare(
          `UPDATE orders SET deleted_at = ?, deleted_by_user_id = ?, updated_at = ?
            WHERE id = ? AND deleted_at IS NULL`,
        )
        .run(now, request.currentUser.id, now, order.id);

      return ok(reply, { id: order.id, deleted: true, deletedAt: now });
    },
  );
}
