/**
 * 轻量运行时声明：避免项目额外依赖 npm 类型包。
 * 业务代码只依赖微信小程序全局 API，页面数据在各自文件内声明。
 */
declare const wx: any;
declare function App(options: any): void;
declare function Page(options: any): void;
declare function Component(options: any): void;
declare function getApp<T = any>(): T;
declare function getCurrentPages(): any[];
declare function requirePlugin(name: string): any;
declare const console: {
  log: (...args: any[]) => void;
  warn: (...args: any[]) => void;
  error: (...args: any[]) => void;
};
declare function setTimeout(handler: (...args: any[]) => void, timeout?: number): number;
declare function clearTimeout(id: number): void;
declare function setInterval(handler: (...args: any[]) => void, timeout?: number): number;
declare function clearInterval(id: number): void;

interface IAppOption {
  globalData: {
    user: any;
    loginPromise: Promise<any> | null;
  };
  ensureLogin(force?: boolean): Promise<any>;
  setUser(user: any): void;
  refreshUser(): Promise<any>;
}
