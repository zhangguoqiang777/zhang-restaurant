import fastifyJwt from '@fastify/jwt';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { DB } from '../db';
import { config } from '../config';
import { errors } from '../lib/errors';

export interface AppUserRow {
  id: number;
  openid: string;
  nickname: string | null;
  is_super: number;
  can_merchant: number;
  merchant_granted_by: number | null;
  merchant_granted_at: string | null;
  last_role: 'customer' | 'merchant' | 'admin';
  locale: string;
  created_at: string;
  updated_at: string;
  last_login_at: string;
}

export interface SessionUser {
  id: number;
  openid: string;
  nickname: string | null;
  isSuper: boolean;
  canMerchant: boolean;
  merchantAccess: boolean;
  lastRole: 'customer' | 'merchant' | 'admin';
  createdAt: string;
}

export function toSessionUser(row: AppUserRow): SessionUser {
  const isSuper = row.is_super === 1;
  const canMerchant = row.can_merchant === 1;
  return {
    id: row.id,
    openid: row.openid,
    nickname: row.nickname,
    isSuper,
    canMerchant,
    merchantAccess: isSuper || canMerchant,
    lastRole: row.last_role,
    createdAt: row.created_at,
  };
}

export function findUserById(db: DB, id: number): AppUserRow | undefined {
  return db.prepare('SELECT * FROM app_user WHERE id = ?').get(id) as AppUserRow | undefined;
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { uid: number };
    user: { uid: number };
  }
}

declare module 'fastify' {
  interface FastifyRequest {
    currentUser: SessionUser;
  }
  interface FastifyInstance {
    db: DB;
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireMerchant: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireSuper: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

/** 注册 JWT 与鉴权装饰器；权限每次从数据库现查，撤销立即生效 */
export function registerAuth(app: FastifyInstance, db: DB): void {
  app.register(fastifyJwt, {
    secret: config.jwtSecret,
    sign: { expiresIn: config.jwtExpiresIn },
  });

  app.decorateRequest('currentUser');

  app.decorate('authenticate', async (request: FastifyRequest) => {
    const header = request.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) throw errors.authRequired();

    let payload: { uid?: number };
    try {
      payload = await request.jwtVerify<{ uid: number }>();
    } catch {
      throw errors.authInvalid();
    }

    const uid = Number(payload.uid);
    if (!Number.isInteger(uid) || uid <= 0) throw errors.authInvalid();

    const row = findUserById(db, uid);
    if (!row) throw errors.authInvalid();

    request.currentUser = toSessionUser(row);
  });

  app.decorate('requireMerchant', async (request: FastifyRequest) => {
    if (!request.currentUser) throw errors.authRequired();
    if (!request.currentUser.merchantAccess) throw errors.forbidden('需要商家权限');
  });

  app.decorate('requireSuper', async (request: FastifyRequest) => {
    if (!request.currentUser) throw errors.authRequired();
    if (!request.currentUser.isSuper) throw errors.forbidden('仅超级用户可操作');
  });
}
