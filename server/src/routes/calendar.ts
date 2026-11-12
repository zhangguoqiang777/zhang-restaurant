import type { FastifyInstance } from 'fastify';
import { errors } from '../lib/errors';
import { getOrderItems, getReviewsByOrderIds, type OrderRow } from '../lib/orders';
import { ok } from '../lib/response';
import { businessDateOf, isMonthString, isRealDate, monthRange } from '../lib/time';

export default async function calendarRoutes(app: FastifyInstance): Promise<void> {
  // 月视图：只返回有订单的日期与当日订单数
  app.get<{ Querystring: { month?: string } }>(
    '/calendar',
    {
      preHandler: [app.authenticate],
      schema: {
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: { month: { type: 'string' } },
        },
      },
    },
    async (request, reply) => {
      const month = request.query.month ?? businessDateOf().slice(0, 7);
      if (!isMonthString(month)) throw errors.validation('month 格式应为 YYYY-MM');

      const { start, endExclusive } = monthRange(month);
      const rows = app.db
        .prepare(
          `SELECT business_date AS date, COUNT(*) AS count
             FROM orders
            WHERE customer_id = ?
              AND deleted_at IS NULL
              AND business_date >= ?
              AND business_date < ?
            GROUP BY business_date
            ORDER BY business_date ASC`,
        )
        .all(request.currentUser.id, start, endExclusive) as { date: string; count: number }[];

      return ok(reply, {
        month,
        totalOrders: rows.reduce((sum, r) => sum + r.count, 0),
        days: rows,
      });
    },
  );

  // 某日已吃菜品：只统计本人、未取消订单
  app.get<{ Params: { date: string } }>(
    '/calendar/:date',
    {
      preHandler: [app.authenticate],
      schema: {
        params: {
          type: 'object',
          required: ['date'],
          properties: { date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' } },
        },
      },
    },
    async (request, reply) => {
      const { date } = request.params;
      if (!isRealDate(date)) throw errors.validation('date 不是有效日期');

      const orders = app.db
        .prepare(
          `SELECT * FROM orders
            WHERE customer_id = ? AND business_date = ? AND deleted_at IS NULL
            ORDER BY created_at ASC, id ASC`,
        )
        .all(request.currentUser.id, date) as OrderRow[];

      const ids = orders.map((o) => o.id);
      const items = getOrderItems(app.db, ids);
      const reviews = getReviewsByOrderIds(app.db, ids);

      return ok(reply, {
        date,
        total: orders.length,
        orders: orders.map((order) => {
          const review = reviews.get(order.id) ?? null;
          return {
            id: order.id,
            status: order.status,
            createdAt: order.created_at,
            cookingAt: order.cooking_at,
            completedAt: order.completed_at,
            reviewed: Boolean(review),
            rating: review?.rating ?? null,
            items: (items.get(order.id) ?? []).map((i) => ({ dishId: i.dish_id, nameZh: i.name_zh, qty: i.qty })),
          };
        }),
      });
    },
  );
}
