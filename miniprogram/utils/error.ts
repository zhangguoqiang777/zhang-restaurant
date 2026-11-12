const ERROR_TEXT: Record<string, string> = {
  NETWORK_ERROR: '网络连接失败，请检查后端服务是否启动',
  AUTH_REQUIRED: '登录已失效，请重新进入',
  ROLE_FORBIDDEN: '当前账号没有该操作权限',
  ORDER_NOT_FOUND: '订单不存在或已取消',
  ORDER_STATE_INVALID: '订单状态已变化，请刷新后重试',
  ORDER_NOT_DELETABLE: '当前状态不可取消',
  REVIEW_DUPLICATED: '这一单已经评价过了',
  UPLOAD_INVALID: '图片格式或大小不符合要求',
  DISH_UNAVAILABLE: '有菜品已下架，请重新选择',
  DISH_NOT_FOUND: '菜品不存在或已下架',
  WX_LOGIN_FAILED: '微信登录失败，请重试',
  AUTH_INVALID: '登录状态已失效，请重新进入',
  VALIDATION_FAILED: '提交内容不符合要求，请检查后重试',
  NOT_FOUND: '请求的资源不存在',
  USER_NOT_FOUND: '用户不存在',
  CATEGORY_NOT_FOUND: '分类不存在',
  CATEGORY_IN_USE: '该分类下还有菜品，无法删除',
  INGREDIENT_NOT_FOUND: '食材不存在',
  ORDER_ITEMS_EMPTY: '请先选择菜品',
  REVIEW_NOT_ALLOWED: '订单完成后才能评价',
  INTERNAL_ERROR: '服务暂时不可用，请稍后重试',
  HTTP_500: '服务暂时不可用，请稍后重试'
};

export function errorText(err: any): string {
  if (!err) return '操作失败，请稍后重试';
  if (err.code && ERROR_TEXT[err.code]) return ERROR_TEXT[err.code];
  if (err.message) return String(err.message);
  return '操作失败，请稍后重试';
}

export function toastError(err: any, redirectOnAuth = true) {
  const code = err && err.code;
  wx.showToast({ title: errorText(err), icon: 'none', duration: 2200 });
  if (!redirectOnAuth) return;
  if (code === 'AUTH_REQUIRED' || code === 'ROLE_FORBIDDEN') {
    const pages = getCurrentPages();
    const current = pages.length ? pages[pages.length - 1].route || '' : '';
    if (current.indexOf('pages/entry/index') === -1) {
      setTimeout(() => {
        wx.reLaunch({ url: '/pages/entry/index?force=1' });
      }, 1000);
    }
  }
}
