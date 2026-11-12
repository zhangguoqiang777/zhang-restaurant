import fastifyMultipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyError } from 'fastify';
import fs from 'node:fs';
import { config } from './config';
import { closeDb, getDb } from './db';
import { AppError } from './lib/errors';
import { registerAuth } from './plugins/auth';
import adminRoutes from './routes/admin';
import authRoutes from './routes/auth';
import calendarRoutes from './routes/calendar';
import catalogRoutes from './routes/catalog';
import merchantCatalogRoutes from './routes/merchant-catalog';
import merchantOrderRoutes from './routes/merchant-orders';
import purchaseRoutes from './routes/merchant-purchases';
import orderRoutes from './routes/orders';

export async function buildApp() {
  const app = Fastify({
    logger: { level: process.env.LOG_LEVEL ?? 'info' },
    trustProxy: true,
    bodyLimit: 1024 * 1024,
  });

  const db = getDb();
  app.decorate('db', db);
  registerAuth(app, db);

  // 允许空 JSON 请求体：小程序 wx.request 默认就给所有请求带上
  // content-type: application/json，而「开始制作 / 完成 / 取消」这类接口本身没有请求体。
  // Fastify 默认 JSON 解析器会把空 body 判为 FST_ERR_CTP_EMPTY_JSON_BODY（400），
  // 这里把空 body 视为 {}，请求体仍由后续 schema 正常校验。
  app.removeContentTypeParser('application/json');
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_request, body, done) => {
    const text = typeof body === 'string' ? body.trim() : '';
    if (!text) {
      done(null, {});
      return;
    }
    try {
      done(null, JSON.parse(text));
    } catch {
      done(new AppError('VALIDATION_FAILED', '请求体不是合法的 JSON'));
    }
  });

  fs.mkdirSync(config.uploadDir, { recursive: true });
  await app.register(fastifyStatic, {
    root: config.uploadDir,
    prefix: '/uploads/',
    index: false,
    cacheControl: true,
    maxAge: '7d',
  });
  await app.register(fastifyMultipart, {
    limits: { fileSize: config.upload.maxBytes, files: 1 },
  });

  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (error instanceof AppError) {
      return reply.code(error.statusCode).send({
        ok: false,
        code: error.code,
        message: error.message,
        params: error.params,
      });
    }

    if (error.validation) {
      return reply.code(400).send({
        ok: false,
        code: 'VALIDATION_FAILED',
        message: '请求参数不合法',
        params: {
          fields: error.validation.map((v) => ({
            field: v.instancePath || String(v.params?.missingProperty ?? ''),
            message: v.message,
          })),
        },
      });
    }

    if ((error as FastifyError & { code?: string }).code === 'FST_REQ_FILE_TOO_LARGE') {
      return reply.code(400).send({
        ok: false,
        code: 'UPLOAD_INVALID',
        message: '图片超过 5MB 限制',
      });
    }

    // Content-Type / 请求体解析类错误（如不支持的 media type）也给可读提示，
    // 不再统一落到「服务器内部错误」。
    const fastifyCode = (error as FastifyError & { code?: string }).code ?? '';
    if (fastifyCode.startsWith('FST_ERR_CTP_')) {
      return reply.code(400).send({
        ok: false,
        code: 'VALIDATION_FAILED',
        message: '请求体格式不正确（Content-Type 或 JSON 内容有误）',
      });
    }

    request.log.error(error);
    return reply.code(error.statusCode && error.statusCode < 500 ? error.statusCode : 500).send({
      ok: false,
      code: 'INTERNAL_ERROR',
      message: '服务器内部错误',
    });
  });

  app.setNotFoundHandler((request, reply) => {
    return reply.code(404).send({ ok: false, code: 'NOT_FOUND', message: '接口不存在' });
  });

  app.get('/health', async () => ({ ok: true, data: { status: 'up', time: new Date().toISOString() } }));

  await app.register(authRoutes, { prefix: '/api/v1' });
  await app.register(catalogRoutes, { prefix: '/api/v1' });
  await app.register(orderRoutes, { prefix: '/api/v1' });
  await app.register(calendarRoutes, { prefix: '/api/v1' });
  await app.register(merchantOrderRoutes, { prefix: '/api/v1' });
  await app.register(purchaseRoutes, { prefix: '/api/v1' });
  await app.register(merchantCatalogRoutes, { prefix: '/api/v1' });
  await app.register(adminRoutes, { prefix: '/api/v1' });

  app.addHook('onClose', async () => {
    closeDb();
  });

  return app;
}
