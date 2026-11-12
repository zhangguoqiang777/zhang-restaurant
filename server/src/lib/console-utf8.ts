import { spawnSync } from 'node:child_process';

let applied = false;

/**
 * Windows 控制台默认使用本地代码页（简体中文通常是 936/GBK），
 * 而 Node 的 stdout/stderr 始终输出 UTF-8 字节，中文日志会被按 GBK 解码成乱码。
 * 在进程启动早期把控制台切到 UTF-8（65001），即可让 npm run dev / start 直接显示中文。
 *
 * - 仅 Windows 执行，Linux/macOS 完全不受影响；
 * - chcp 是 cmd 内建命令，没有独立可执行文件，因此通过 cmd /c 调用；
 * - 失败时静默降级，不阻塞服务启动。
 */
export function ensureUtf8Console(): void {
  if (applied || process.platform !== 'win32') return;
  applied = true;
  try {
    // 注意不要设置 windowsHide：它会给子进程创建新的隐藏控制台，
    // chcp 只会改到那个新控制台，父进程仍然乱码。
    spawnSync('cmd', ['/d', '/c', 'chcp', '65001'], { stdio: 'ignore' });
  } catch {
    // 切换失败最多继续显示乱码，不影响业务
  }
}
