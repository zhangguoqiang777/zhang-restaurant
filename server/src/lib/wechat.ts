import { config } from '../config';
import { AppError } from '../lib/errors';

export interface WxSession {
  openid: string;
  sessionKey?: string;
  unionid?: string;
  mocked: boolean;
}

interface Code2SessionResponse {
  openid?: string;
  session_key?: string;
  unionid?: string;
  errcode?: number;
  errmsg?: string;
}

/**
 * 开发期 mock：
 * - 显式传入 `mock_zhang` / `mock_wang` 时按 code 生成不同固定用户，便于脚本联调；
 * - 其余 code（开发者工具 wx.login 每次都会变化）统一映射为 `mock_dev`，
 *   避免每次重新登录都新建用户，保证「首个登录用户即超管」在本地稳定成立。
 */
function mockSession(code: string): WxSession {
  const safe = code.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 48);
  const openid = /^mock_/.test(code) ? `mock_${safe}` : 'mock_dev';
  return { openid, mocked: true };
}

export async function code2session(code: string): Promise<WxSession> {
  if (config.wechat.mock) return mockSession(code);

  const { appId, appSecret } = config.wechat;
  if (!appId || !appSecret) {
    throw new AppError('WX_LOGIN_FAILED', '服务端未配置微信 AppID / Secret');
  }

  const url = new URL('https://api.weixin.qq.com/sns/jscode2session');
  url.searchParams.set('appid', appId);
  url.searchParams.set('secret', appSecret);
  url.searchParams.set('js_code', code);
  url.searchParams.set('grant_type', 'authorization_code');

  let payload: Code2SessionResponse;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    payload = (await res.json()) as Code2SessionResponse;
  } catch (err) {
    throw new AppError('WX_LOGIN_FAILED', '微信登录服务暂不可用，请稍后重试', {
      reason: (err as Error).message,
    });
  }

  if (payload.errcode || !payload.openid) {
    throw new AppError('WX_LOGIN_FAILED', `微信登录失败：${payload.errmsg ?? '未返回 openid'}`, {
      errcode: payload.errcode ?? -1,
    });
  }

  return {
    openid: payload.openid,
    sessionKey: payload.session_key,
    unionid: payload.unionid,
    mocked: false,
  };
}
