/** 时间工具：库内存 UTC ISO；业务日期按 Asia/Shanghai 计算 */

export function nowIso(): string {
  return new Date().toISOString();
}

const shanghaiDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** 返回 YYYY-MM-DD（Asia/Shanghai） */
export function businessDateOf(date: Date = new Date()): string {
  return shanghaiDateFormatter.format(date);
}

export function todayBusinessDate(): string {
  return businessDateOf();
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export function isDateString(value: unknown): value is string {
  return typeof value === 'string' && DATE_RE.test(value);
}

export function isMonthString(value: unknown): value is string {
  return typeof value === 'string' && MONTH_RE.test(value);
}

/** 校验真实存在的日历日期（如 2026-02-30 判为非法） */
export function isRealDate(value: string): boolean {
  if (!isDateString(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function monthRange(month: string): { start: string; endExclusive: string } {
  const [y, m] = month.split('-').map(Number);
  const nextY = m === 12 ? y + 1 : y;
  const nextM = m === 12 ? 1 : m + 1;
  return {
    start: `${month}-01`,
    endExclusive: `${nextY}-${String(nextM).padStart(2, '0')}-01`,
  };
}
