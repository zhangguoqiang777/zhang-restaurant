import type { FastifyRequest } from 'fastify';
import { config } from '../config';

/** image_key（如 2026/11/uuid.jpg）转成可访问 URL */
export function toImageUrl(request: FastifyRequest, imageKey: string | null | undefined): string | null {
  if (!imageKey) return null;
  if (/^https?:\/\//i.test(imageKey)) return imageKey;
  const base = config.publicBaseUrl || `${request.protocol}://${request.headers.host ?? `localhost:${config.port}`}`;
  return `${base}/uploads/${imageKey.replace(/^\/+/, '')}`;
}

/** 列表出参统一布尔化 */
export function boolOf(value: number | null | undefined): boolean {
  return value === 1;
}
