import { getApiBase } from './config';
import { clearToken, getToken } from '../utils/storage';

export class ApiError extends Error {
  code: string;
  statusCode: number;
  params: any;

  constructor(code: string, message: string, statusCode = 0, params?: any) {
    super(message);
    this.code = code || 'UNKNOWN_ERROR';
    this.statusCode = statusCode;
    this.params = params;
  }
}

let reloginHandler: (() => Promise<any>) | null = null;

/** 由 app.ts 注入，401 时先重登一次再重试原请求 */
export function setUnauthorizedHandler(handler: () => Promise<any>) {
  reloginHandler = handler;
}

export interface RequestOptions {
  url: string;
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT';
  data?: any;
  auth?: boolean;
  header?: Record<string, string>;
  retried?: boolean;
}

function buildQuery(params: Record<string, any>): string {
  const parts = Object.keys(params)
    .filter((key) => params[key] !== undefined && params[key] !== null && params[key] !== '')
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(String(params[key]))}`);
  return parts.length ? `?${parts.join('&')}` : '';
}

export function withQuery(url: string, params: Record<string, any>): string {
  return `${url}${buildQuery(params)}`;
}

function normalizeBody(body: any): any {
  if (typeof body === 'string') {
    try {
      return JSON.parse(body);
    } catch (e) {
      return body;
    }
  }
  return body;
}

function resolveResponse(resolve: (value: any) => void, reject: (reason?: any) => void, res: any, options: RequestOptions) {
  const status = res.statusCode || 0;
  const body = normalizeBody(res.data);

  if (status === 401 && options.auth !== false && !options.retried && reloginHandler) {
    reloginHandler()
      .then(() => request<any>({ ...options, retried: true }))
      .then(resolve)
      .catch(() => {
        clearToken();
        reject(new ApiError('AUTH_REQUIRED', '登录已失效，请重新进入', 401));
      });
    return;
  }

  if (status === 401) {
    clearToken();
    reject(new ApiError('AUTH_REQUIRED', '登录已失效，请重新进入', 401));
    return;
  }

  if (body && typeof body === 'object' && body.ok === false) {
    reject(new ApiError(body.code || 'UNKNOWN_ERROR', body.message || '请求失败', status, body.params));
    return;
  }

  if (status < 200 || status >= 300) {
    reject(new ApiError(`HTTP_${status}`, (body && body.message) || `请求失败（${status}）`, status));
    return;
  }

  if (body && typeof body === 'object' && body.ok === true) {
    resolve(body.data);
    return;
  }

  resolve(body);
}

export function request<T>(options: RequestOptions): Promise<T> {
  const url = /^https?:\/\//.test(options.url) ? options.url : `${getApiBase()}${options.url}`;
  const header: Record<string, string> = {
    'content-type': 'application/json',
    ...(options.header || {})
  };
  const token = getToken();
  if (options.auth !== false && token) {
    header.Authorization = `Bearer ${token}`;
  }

  return new Promise<T>((resolve, reject) => {
    wx.request({
      url,
      method: options.method || 'GET',
      data: options.data,
      header,
      timeout: 15000,
      success: (res: any) => resolveResponse(resolve as any, reject, res, options),
      fail: () => {
        reject(new ApiError('NETWORK_ERROR', '网络连接失败，请检查后端服务是否启动', 0));
      }
    });
  });
}
