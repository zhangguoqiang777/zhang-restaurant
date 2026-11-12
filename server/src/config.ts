import 'dotenv/config';
import path from 'node:path';

const root = path.resolve(__dirname, '..');

function pickString(value: string | undefined, fallback: string): string {
  const v = value?.trim();
  return v ? v : fallback;
}

const appId = (process.env.WECHAT_APPID ?? '').trim();
const appSecret = (process.env.WECHAT_SECRET ?? '').trim();

/** 未显式配置 WECHAT_MOCK 时：没有真实凭证则自动进入 mock，方便本地联调 */
const mockFlag = process.env.WECHAT_MOCK?.trim();
const wechatMock = mockFlag ? mockFlag === '1' || mockFlag.toLowerCase() === 'true' : !(appId && appSecret);

export const config = {
  root,
  port: Number(process.env.PORT ?? 3000),
  host: pickString(process.env.HOST, '0.0.0.0'),
  dbFile: path.resolve(root, pickString(process.env.DB_FILE, './data/restaurant.db')),
  uploadDir: path.resolve(root, pickString(process.env.UPLOAD_DIR, './uploads')),
  jwtSecret: pickString(process.env.JWT_SECRET, 'dev-only-change-me'),
  jwtExpiresIn: pickString(process.env.JWT_EXPIRES_IN, '30d'),
  publicBaseUrl: (process.env.PUBLIC_BASE_URL ?? '').trim().replace(/\/+$/, ''),
  wechat: {
    appId,
    appSecret,
    mock: wechatMock,
  },
  upload: {
    maxBytes: 5 * 1024 * 1024,
    mimeExt: {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'image/gif': 'gif',
    } as Record<string, string>,
  },
} as const;

export function isProd(): boolean {
  return process.env.NODE_ENV === 'production';
}
