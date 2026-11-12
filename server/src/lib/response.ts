import type { FastifyReply } from 'fastify';
import { errors } from './errors';

export interface PageQuery {
  page: number;
  pageSize: number;
  offset: number;
}

export interface Paged<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
}

export function parsePage(query: Record<string, unknown>, defaultSize = 20, maxSize = 100): PageQuery {
  const rawPage = Number(query.page ?? 1);
  const rawSize = Number(query.pageSize ?? defaultSize);
  if (!Number.isFinite(rawPage) || rawPage < 1) throw errors.validation('page 必须是大于 0 的整数');
  if (!Number.isFinite(rawSize) || rawSize < 1) throw errors.validation('pageSize 必须是大于 0 的整数');
  const page = Math.floor(rawPage);
  const pageSize = Math.min(Math.floor(rawSize), maxSize);
  return { page, pageSize, offset: (page - 1) * pageSize };
}

export function paged<T>(items: T[], total: number, q: PageQuery): Paged<T> {
  return {
    items,
    page: q.page,
    pageSize: q.pageSize,
    total,
    hasMore: q.offset + items.length < total,
  };
}

/** 统一成功响应 { ok:true, data } */
export function ok<T>(reply: FastifyReply, data: T, statusCode = 200) {
  return reply.code(statusCode).send({ ok: true, data });
}
