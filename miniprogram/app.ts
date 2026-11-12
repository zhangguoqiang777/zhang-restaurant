import { wxLogin } from './api/auth';
import { setUnauthorizedHandler } from './api/request';
import type { UserInfo } from './types/models';
import { normalizeUser } from './utils/normalize';
import { clearAuth, getCachedUser, getToken, setCachedUser, setToken } from './utils/storage';

App({
  globalData: {
    user: null as UserInfo | null,
    loginPromise: null as Promise<UserInfo> | null
  },

  onLaunch() {
    const cached = getCachedUser();
    if (cached) {
      this.globalData.user = cached;
    }
    setUnauthorizedHandler(() => this.ensureLogin(true).then(() => undefined));
    // 启动即静默登录，保证重启后仍映射到同一个 openid 用户
    this.ensureLogin().catch((err: any) => {
      console.warn('[app] silent login failed', err && err.code);
    });
  },

  /**
   * 静默登录。force=true 时忽略本地缓存（用于 401 后自动重登）。
   * 网络失败但有本地登录态时，回退到缓存用户，保证页面仍可展示。
   */
  ensureLogin(force = false): Promise<UserInfo> {
    const cached = getCachedUser();
    if (!force && this.globalData.user && getToken()) {
      return Promise.resolve(this.globalData.user);
    }
    if (this.globalData.loginPromise) {
      return this.globalData.loginPromise;
    }

    const task = new Promise<UserInfo>((resolve, reject) => {
      wx.login({
        success: (res: any) => {
          if (!res.code) {
            this.globalData.loginPromise = null;
            reject({ code: 'WX_LOGIN_FAILED', message: '微信登录失败，请重试' });
            return;
          }
          wxLogin(res.code)
            .then((result) => {
              const merged = normalizeUser({
                id: result.userId,
                nickname: result.nickname || (cached && cached.nickname) || '',
                isSuper: result.isSuper,
                canMerchant: result.canMerchant,
                lastRole: result.lastRole
              });
              setToken(result.token);
              setCachedUser(merged);
              this.globalData.user = merged;
              this.globalData.loginPromise = null;
              resolve(merged);
            })
            .catch((err) => {
              this.globalData.loginPromise = null;
              if (!force && cached && getToken()) {
                resolve(cached);
              } else {
                reject(err);
              }
            });
        },
        fail: () => {
          this.globalData.loginPromise = null;
          if (!force && cached && getToken()) {
            resolve(cached);
          } else {
            reject({ code: 'WX_LOGIN_FAILED', message: '微信登录失败，请重试' });
          }
        }
      });
    });

    this.globalData.loginPromise = task;
    return task;
  },

  setUser(user: UserInfo) {
    this.globalData.user = user;
    setCachedUser(user);
  },

  clearSession() {
    clearAuth();
    this.globalData.user = null;
  }
});
