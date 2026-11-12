import type { FastifyInstance } from 'fastify';
import { AppError, errors } from '../lib/errors';
import { boolOf } from '../lib/urls';
import { ok, paged, parsePage } from '../lib/response';
import { nowIso } from '../lib/time';

interface AdminUserRow {
  id: number;
  openid: string;
  nickname: string | null;
  is_super: number;
  can_merchant: number;
  merchant_granted_by: number | null;
  merchant_granted_at: string | null;
  last_role: string;
  created_at: string;
  last_login_at: string;
}

function toAdminUser(row: AdminUserRow) {
  return {
    id: row.id,
    nickname: row.nickname,
    openidMasked: `${row.openid.slice(0, 6)}****${row.openid.slice(-4)}`,
    isSuper: boolOf(row.is_super),
    canMerchant: boolOf(row.can_merchant),
    merchantAccess: boolOf(row.is_super) || boolOf(row.can_merchant),
    lastRole: row.last_role,
    merchantGrantedBy: row.merchant_granted_by,
    merchantGrantedAt: row.merchant_granted_at,
    lastLoginAt: row.last_login_at,
    createdAt: row.created_at,
  };
}

export default async function adminRoutes(app: FastifyInstance): Promise<void> {
  const superOnly = { preHandler: [app.authenticate, app.requireSuper] };

  app.get<{ Querystring: { keyword?: string } }>(
    '/admin/users',
    {
      ...superOnly,
      schema: {
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: {
            keyword: { type: 'string', maxLength: 40 },
            page: { type: 'integer' },
            pageSize: { type: 'integer' },
          },
        },
      },
    },
    async (request, reply) => {
      const pageQuery = parsePage(request.query as Record<string, unknown>, 20);
      const where: string[] = ['1 = 1'];
      const params: unknown[] = [];

      if (request.query.keyword?.trim()) {
        where.push("(IFNULL(nickname, '') LIKE ? ESCAPE '\\' OR openid LIKE ? ESCAPE '\\')");
        const pattern = `%${escapeLike(request.query.keyword.trim())}%`;
        params.push(pattern, pattern);
      }
      const whereSql = `WHERE ${where.join(' AND ')}`;

      const total = (
        app.db.prepare(`SELECT COUNT(*) AS n FROM app_user ${whereSql}`).get(...params) as { n: number }
      ).n;

      const rows = app.db
        .prepare(`SELECT * FROM app_user ${whereSql} ORDER BY created_at ASC, id ASC LIMIT ? OFFSET ?`)
        .all(...params, pageQuery.pageSize, pageQuery.offset) as AdminUserRow[];

      return ok(reply, paged(rows.map(toAdminUser), total, pageQuery));
    },
  );

  // 授权 / 撤销商家权限：只有超级用户可调用，且每次请求现查库
  app.patch<{ Params: { id: number }; Body: { allowed: boolean } }>(
    '/admin/users/:id/merchant-access',
    {
      ...superOnly,
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'integer', minimum: 1 } },
        },
        body: {
          type: 'object',
          required: ['allowed'],
          additionalProperties: false,
          properties: { allowed: { type: 'boolean' } },
        },
      },
    },
    async (request, reply) => {
      const target = app.db.prepare('SELECT * FROM app_user WHERE id = ?').get(request.params.id) as
        | AdminUserRow
        | undefined;
      if (!target) throw new AppError('USER_NOT_FOUND', '用户不存在');
      // 与前端一致：不允许修改自己，也不允许修改其他超级用户
      if (target.id === request.currentUser.id || target.is_super === 1) {
        throw errors.forbidden('不能修改自己或超级用户的权限');
      }

      const now = nowIso();
      app.db
        .prepare(
          `UPDATE app_user
              SET can_merchant = ?,
                  merchant_granted_by = ?,
                  merchant_granted_at = ?,
                  updated_at = ?
            WHERE id = ?`,
        )
        .run(request.body.allowed ? 1 : 0, request.currentUser.id, now, now, target.id);

      const updated = app.db.prepare('SELECT * FROM app_user WHERE id = ?').get(target.id) as AdminUserRow;
      return ok(reply, toAdminUser(updated));
    },
  );
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}
