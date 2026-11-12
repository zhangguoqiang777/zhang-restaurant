import { buildApp } from './app';
import { config } from './config';
import { isProd } from './config';
import { ensureUtf8Console } from './lib/console-utf8';

// 必须在创建 logger、输出任何中文之前执行，否则 Windows 控制台会先按 GBK 解码
ensureUtf8Console();

async function main(): Promise<void> {
  const app = await buildApp();

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, '正在关闭服务');
    try {
      await app.close();
      process.exit(0);
    } catch (err) {
      app.log.error(err, '关闭失败');
      process.exit(1);
    }
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  try {
    await app.listen({ port: config.port, host: config.host });
    if (!isProd() && config.wechat.mock) {
      app.log.warn('微信登录处于 mock 模式：开发者工具 code 固定映射 mock_dev，mock_* code 映射为独立测试用户；上线前请配置 WECHAT_APPID/WECHAT_SECRET');
    }
    if (config.jwtSecret === 'dev-only-change-me') {
      app.log.warn('JWT_SECRET 仍为默认值，上线前请替换');
    }
  } catch (err) {
    app.log.error(err, '启动失败');
    process.exit(1);
  }
}

void main();
