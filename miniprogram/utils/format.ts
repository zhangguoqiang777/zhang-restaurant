function pad2(value: number): string {
  return value < 10 ? `0${value}` : `${value}`;
}

export function parseDate(value?: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return isNaN(date.getTime()) ? null : date;
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  );
}

export function dateKey(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function todayKey(): string {
  return dateKey(new Date());
}

export function monthKey(date: Date = new Date()): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
}

export function shiftMonth(month: string, delta: number): string {
  const parts = month.split('-');
  const year = Number(parts[0]);
  const mon = Number(parts[1]);
  const date = new Date(year, mon - 1 + delta, 1);
  return monthKey(date);
}

export function monthTitle(month: string): string {
  const parts = month.split('-');
  return `${Number(parts[0])} 年 ${Number(parts[1])} 月`;
}

export function formatDateCN(key: string): string {
  if (!key) return '';
  const parts = key.split('-');
  if (parts.length < 3) return key;
  return `${Number(parts[1])} 月 ${Number(parts[2])} 日`;
}

export function formatClock(value?: string | null): string {
  const date = parseDate(value);
  if (!date) return '';
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

export function formatDayLabel(value?: string | null): string {
  const date = parseDate(value);
  if (!date) return '';
  const now = new Date();
  if (sameDay(date, now)) return '今天';
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (sameDay(date, yesterday)) return '昨天';
  if (date.getFullYear() === now.getFullYear()) {
    return `${date.getMonth() + 1} 月 ${date.getDate()} 日`;
  }
  return `${date.getFullYear()} 年 ${date.getMonth() + 1} 月 ${date.getDate()} 日`;
}

export function formatOrderTime(value?: string | null): string {
  const date = parseDate(value);
  if (!date) return '';
  return `${formatDayLabel(value)} ${formatClock(value)}`;
}

export function formatLoginTime(value?: string | null): string {
  const date = parseDate(value);
  if (!date) return '—';
  const now = new Date();
  if (sameDay(date, now) || date.getFullYear() === now.getFullYear()) {
    return `${formatDayLabel(value)} ${formatClock(value)}`;
  }
  return `${date.getFullYear()} 年 ${date.getMonth() + 1} 月 ${date.getDate()} 日`;
}

export interface CalendarCell {
  key: string;
  day: number;
  dim: boolean;
  today: boolean;
}

/** 周一为一周起点，固定 6 行 42 格 */
export function buildMonthCells(month: string): CalendarCell[] {
  const parts = month.split('-');
  const year = Number(parts[0]);
  const mon = Number(parts[1]);
  const first = new Date(year, mon - 1, 1);
  const offset = (first.getDay() + 6) % 7;
  const start = new Date(year, mon - 1, 1 - offset);
  const today = todayKey();
  const cells: CalendarCell[] = [];
  for (let i = 0; i < 42; i += 1) {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const key = dateKey(date);
    cells.push({
      key,
      day: date.getDate(),
      dim: date.getMonth() !== mon - 1,
      today: key === today
    });
  }
  return cells;
}

export function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 5) return '夜深了';
  if (hour < 11) return '早上好';
  if (hour < 14) return '中午好';
  if (hour < 18) return '下午好';
  return '晚上好';
}

export function initial(name?: string): string {
  const text = (name || '').trim();
  if (!text) return '客';
  return Array.from(text)[0];
}

export function maskOpenid(openid?: string): string {
  const text = openid || '';
  if (!text) return '';
  // 后端已脱敏（形如 mock_1****abcd）时不再二次处理
  if (text.indexOf('…') >= 0 || text.indexOf('...') >= 0 || text.indexOf('*') >= 0) return text;
  if (text.length <= 8) return text;
  return `${text.slice(0, 4)}…${text.slice(-4)}`;
}

export function statusText(status: string): string {
  if (status === 'cooking') return '制作中';
  if (status === 'completed') return '完成';
  return '待处理';
}

export function statusPillClass(status: string): string {
  if (status === 'cooking') return 'pill-cooking';
  if (status === 'completed') return 'pill-completed';
  return 'pill-pending';
}
