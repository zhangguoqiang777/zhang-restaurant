import { ApiError } from './request';
import { getApiBase } from './config';
import { getToken } from '../utils/storage';

/**
 * 商家上传图片：multipart 字段名按 `file` 约定。
 * 返回 image_key，数据库只存相对路径。
 */
export function uploadDishImage(filePath: string): Promise<{ imageKey: string }> {
  const token = getToken();
  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url: `${getApiBase()}/merchant/uploads/image`,
      filePath,
      name: 'file',
      header: token ? { Authorization: `Bearer ${token}` } : {},
      timeout: 30000,
      success: (res: any) => {
        let body: any = res.data;
        if (typeof body === 'string') {
          try {
            body = JSON.parse(body);
          } catch (e) {
            body = {};
          }
        }
        if (res.statusCode === 401) {
          reject(new ApiError('AUTH_REQUIRED', '登录已失效，请重新进入', 401));
          return;
        }
        if (body && body.ok === false) {
          reject(new ApiError(body.code || 'UPLOAD_INVALID', body.message || '图片上传失败', res.statusCode));
          return;
        }
        const data = body && body.ok === true ? body.data : body;
        const imageKey = (data && (data.imageKey || data.image_key || data.key)) || '';
        if (!imageKey) {
          reject(new ApiError('UPLOAD_INVALID', '图片上传失败，未返回 image_key', res.statusCode));
          return;
        }
        resolve({ imageKey });
      },
      fail: () => reject(new ApiError('NETWORK_ERROR', '图片上传失败，请检查网络', 0))
    });
  });
}
