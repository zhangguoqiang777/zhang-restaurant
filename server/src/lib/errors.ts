/** 业务错误码与 HTTP 状态映射，统一响应结构为 { ok:false, code, message, params } */
export type ErrorCode =
  | 'AUTH_REQUIRED'
  | 'AUTH_INVALID'
  | 'WX_LOGIN_FAILED'
  | 'ROLE_FORBIDDEN'
  | 'VALIDATION_FAILED'
  | 'NOT_FOUND'
  | 'USER_NOT_FOUND'
  | 'CATEGORY_NOT_FOUND'
  | 'CATEGORY_IN_USE'
  | 'DISH_NOT_FOUND'
  | 'DISH_UNAVAILABLE'
  | 'INGREDIENT_NOT_FOUND'
  | 'ORDER_NOT_FOUND'
  | 'ORDER_STATE_INVALID'
  | 'ORDER_NOT_DELETABLE'
  | 'ORDER_ITEMS_EMPTY'
  | 'REVIEW_DUPLICATED'
  | 'REVIEW_NOT_ALLOWED'
  | 'REVIEW_NOT_FOUND'
  | 'UPLOAD_INVALID'
  | 'INTERNAL_ERROR';

const statusMap: Record<ErrorCode, number> = {
  AUTH_REQUIRED: 401,
  AUTH_INVALID: 401,
  WX_LOGIN_FAILED: 401,
  ROLE_FORBIDDEN: 403,
  VALIDATION_FAILED: 400,
  NOT_FOUND: 404,
  USER_NOT_FOUND: 404,
  CATEGORY_NOT_FOUND: 404,
  CATEGORY_IN_USE: 409,
  DISH_NOT_FOUND: 404,
  DISH_UNAVAILABLE: 409,
  INGREDIENT_NOT_FOUND: 404,
  ORDER_NOT_FOUND: 404,
  ORDER_STATE_INVALID: 409,
  ORDER_NOT_DELETABLE: 409,
  ORDER_ITEMS_EMPTY: 400,
  REVIEW_DUPLICATED: 409,
  REVIEW_NOT_ALLOWED: 409,
  REVIEW_NOT_FOUND: 404,
  UPLOAD_INVALID: 400,
  INTERNAL_ERROR: 500,
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly statusCode: number;
  readonly params?: Record<string, unknown>;

  constructor(code: ErrorCode, message: string, params?: Record<string, unknown>) {
    super(message);
    this.code = code;
    this.statusCode = statusMap[code] ?? 500;
    this.params = params;
  }
}

export const errors = {
  authRequired: () => new AppError('AUTH_REQUIRED', '请先登录'),
  authInvalid: () => new AppError('AUTH_INVALID', '登录状态已失效，请重新登录'),
  forbidden: (message = '当前视角无权访问该功能') => new AppError('ROLE_FORBIDDEN', message),
  validation: (message: string, params?: Record<string, unknown>) =>
    new AppError('VALIDATION_FAILED', message, params),
  notFound: (message = '资源不存在') => new AppError('NOT_FOUND', message),
  orderNotFound: () => new AppError('ORDER_NOT_FOUND', '订单不存在'),
  stateInvalid: (message = '订单状态不允许该操作') => new AppError('ORDER_STATE_INVALID', message),
};
