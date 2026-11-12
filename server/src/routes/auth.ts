import type { FastifyInstance } from 'fastify';
import { AppError } from '../lib/errors';
import { ok } from '../lib/response';
import { nowIso } from '../lib/time';
import { code2session } from '../lib/wechat';
import { findUserById, toSessionUser, type AppUserRow } from '../plugins/auth';

interface LoginBody {
  code: string;
  nickname?: string;
}

export default async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: LoginBody }>(
    '/auth/wx-login',
    {
      schema: {
        body: {
          type: 'object',
          required: ['code'],
          additionalProperties: false,
          properties: {
            code: { type: 'string', minLength: 1, maxLength: 128 },
            nickname: { type: 'string', minLength: 1, maxLength: 40 },
          },
        },
      },
    },
    async (request, reply) => {
      const { code, nickname } = request.body;
      const session = await code2session(code.trim());
      const db = app.db;
      const now = nowIso();

      const login = db.transaction(() => {
        const existing = db.prepare('SELECT * FROM app_user WHERE openid = ?').get(session.openid) as
          | AppUserRow
          | undefined;

        if (existing) {
          db.prepare(
            `UPDATE app_user
                SET last_login_at = ?, updated_at = ?, nickname = COALESCE(?, nickname)
              WHERE id = ?`,
          ).run(now, now, nickname ?? null, existing.id);
          return { row: findUserById(db, existing.id)!, created: false };
        }

        // 库里没有超管时，第一个成功登录的用户自动成为超管
        const hasSuper = db.prepare('SELECT 1 FROM app_user WHERE is_super = 1 LIMIT 1').get();
        const info = db
          .prepare('INSERT INTO app_user (openid, nickname, is_super, can_merchant, last_login_at) VALUES (?, ?, ?, 0, ?)')
          .run(session.openid, nickname ?? null, hasSuper ? 0 : 1, now);

        return { row: findUserById(db, Number(info.lastInsertRowid))!, created: true };
      });

      const { row, created } = login();
      const user = toSessionUser(row);
      const token = app.jwt.sign({ uid: user.id });

      return ok(
        reply,
        {
          token,
          userId: user.id,
          nickname: user.nickname,
          isSuper: user.isSuper,
          canMerchant: user.merchantAccess,
          lastRole: user.lastRole,
          roles: buildRoles(user.isSuper, user.merchantAccess),
          isNewUser: created,
          mocked: session.mocked,
        },
        200,
      );
    },
  );

  app.get('/me', { preHandler: [app.authenticate] }, async (request, reply) => {
    const row = findUserById(app.db, request.currentUser.id)!;
    return ok(reply, toUserPayload(row));
  });

  app.patch<{ Body: { lastRole?: 'customer' | 'merchant' | 'admin'; nickname?: string } }>(
    '/me',
    {
      preHandler: [app.authenticate],
      schema: {
        body: {
          type: 'object',
          minProperties: 1,
          additionalProperties: false,
          properties: {
            lastRole: { type: 'string', enum: ['customer', 'merchant', 'admin'] },
            nickname: { type: 'string', minLength: 1, maxLength: 40 },
          },
        },
      },
    },
    async (request, reply) => {
      const { lastRole, nickname } = request.body;
      const u = request.currentUser;

      if (lastRole === 'merchant' && !u.merchantAccess) throw new AppError('ROLE_FORBIDDEN', '没有商家权限');
      if (lastRole === 'admin' && !u.isSuper) throw new AppError('ROLE_FORBIDDEN', '仅超级用户可切换该视角');

      const now = nowIso();
      app.db
        .prepare(
          `UPDATE app_user
              SET last_role = COALESCE(?, last_role),
                  nickname = COALESCE(?, nickname),
                  updated_at = ?
            WHERE id = ?`,
        )
        .run(lastRole ?? null, nickname ?? null, now, u.id);

      const row = findUserById(app.db, u.id)!;
      // 返回完整用户信息：前端会用该响应当作新的全局用户对象
      return ok(reply, toUserPayload(row));
    },
  );
}

function maskOpenid(openid: string): string {
  return `${openid.slice(0, 6)}****${openid.slice(-4)}`;
}

/** /me 与 PATCH /me 的统一出参，字段与小程序 UserInfo 对齐 */
function toUserPayload(row: AppUserRow) {
  const user = toSessionUser(row);
  return {
    id: user.id,
    nickname: user.nickname,
    openidMasked: maskOpenid(user.openid),
    isSuper: user.isSuper,
    canMerchant: user.merchantAccess,
    merchantSwitch: user.canMerchant,
    lastRole: user.lastRole,
    roles: buildRoles(user.isSuper, user.merchantAccess),
    lastLoginAt: row.last_login_at,
    createdAt: user.createdAt,
  };
}

function buildRoles(isSuper: boolean, merchantAccess: boolean): string[] {
  const roles = ['customer'];
  if (merchantAccess) roles.push('merchant');
  if (isSuper) roles.push('admin');
  return roles;
}
