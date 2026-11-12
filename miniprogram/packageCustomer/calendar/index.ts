import { fetchCalendarDay, fetchCalendarMonth } from '../../api/calendar';
import type { CalendarDay, Order } from '../../types/models';
import { errorText } from '../../utils/error';
import {
  buildMonthCells,
  dateKey,
  formatClock,
  formatDateCN,
  monthKey,
  monthTitle,
  shiftMonth,
  statusPillClass,
  statusText,
  todayKey
} from '../../utils/format';

interface CalendarCellView {
  key: string;
  day: number;
  dim: boolean;
  today: boolean;
  selected: boolean;
  count: number;
}

interface DayOrderView {
  id: number;
  title: string;
  sub: string;
  statusText: string;
  pillClass: string;
  imageKey: string;
}

function selectedTitleOf(key: string): string {
  const label = formatDateCN(key);
  if (key === todayKey()) return `今天 · ${label}`;
  return label;
}

function toDayOrder(order: Order): DayOrderView {
  const names = order.items.map((item) => item.nameZh);
  const title = names.slice(0, 2).join('、') + (names.length > 2 ? ' 等' : '');
  const totalQty = order.items.reduce((sum, item) => sum + item.qty, 0);
  const timeText =
    order.status === 'completed' && order.completedAt
      ? `完成于 ${formatClock(order.completedAt)}`
      : statusText(order.status);
  const first = order.items[0];
  return {
    id: order.id,
    title: title || `订单 #${order.id}`,
    sub: `${totalQty} 份 · ${timeText}`,
    statusText: statusText(order.status),
    pillClass: statusPillClass(order.status),
    imageKey: first ? first.imageKey : ''
  };
}

Page({
  data: {
    weekdays: ['一', '二', '三', '四', '五', '六', '日'],
    month: '',
    monthTitle: '',
    isCurrentMonth: true,
    cells: [] as CalendarCellView[],
    selectedDate: '',
    selectedTitle: '',
    dayOrders: [] as DayOrderView[],
    loadingDay: true,
    dayError: '',
    monthTip: ''
  },

  counts: {} as Record<string, number>,
  monthCache: {} as Record<string, Record<string, number>>,
  monthReq: 0,
  dayReq: 0,

  onLoad() {
    const month = monthKey();
    const selected = todayKey();
    this.setData({
      month,
      monthTitle: monthTitle(month),
      selectedDate: selected,
      selectedTitle: selectedTitleOf(selected),
      isCurrentMonth: true
    });
    this.renderCells();
    this.fetchMonth();
    this.fetchDay();
  },

  renderCells() {
    const month = this.data.month;
    const counts = this.counts;
    const selected = this.data.selectedDate;
    const today = todayKey();
    const cells: CalendarCellView[] = buildMonthCells(month).map((cell) => ({
      ...cell,
      today: cell.key === today,
      selected: cell.key === selected,
      count: counts[cell.key] || 0
    }));
    this.setData({ cells });
  },

  async fetchMonth() {
    const month = this.data.month;
    const seq = ++this.monthReq;
    this.setData({ monthTip: '' });

    const cached = this.monthCache[month];
    if (cached) {
      this.counts = cached;
      this.renderCells();
    }

    try {
      const days: CalendarDay[] = await fetchCalendarMonth(month);
      if (seq !== this.monthReq) return;
      const map: Record<string, number> = {};
      days.forEach((day) => {
        if (day.date) map[day.date] = day.count;
      });
      this.monthCache[month] = map;
      this.counts = map;
      this.renderCells();
    } catch (err: any) {
      if (seq !== this.monthReq) return;
      if (!cached) {
        this.counts = {};
        this.renderCells();
      }
      this.setData({ monthTip: errorText(err) });
    }
  },

  async fetchDay() {
    const date = this.data.selectedDate;
    const seq = ++this.dayReq;
    this.setData({ loadingDay: true, dayError: '' });
    try {
      const orders = await fetchCalendarDay(date);
      if (seq !== this.dayReq) return;
      this.setData({
        dayOrders: orders.map(toDayOrder),
        loadingDay: false
      });
    } catch (err: any) {
      if (seq !== this.dayReq) return;
      this.setData({
        dayOrders: [],
        loadingDay: false,
        dayError: errorText(err)
      });
    }
  },

  selectDate(key: string) {
    if (!key) return;
    this.setData({ selectedDate: key, selectedTitle: selectedTitleOf(key) });
    this.renderCells();
    this.fetchDay();
  },

  onDay(e: any) {
    if (e.currentTarget.dataset.dim === true || e.currentTarget.dataset.dim === 'true') return;
    this.selectDate(e.currentTarget.dataset.key);
  },

  prevMonth() {
    this.changeMonth(-1);
  },

  nextMonth() {
    this.changeMonth(1);
  },

  changeMonth(delta: number) {
    const next = shiftMonth(this.data.month, delta);
    const today = todayKey();
    const selected =
      next === monthKey()
        ? today
        : `${next}-01`;
    this.setData({
      month: next,
      monthTitle: monthTitle(next),
      isCurrentMonth: next === monthKey(),
      selectedDate: selected,
      selectedTitle: selectedTitleOf(selected),
      dayError: ''
    });
    this.counts = this.monthCache[next] || {};
    this.renderCells();
    this.fetchMonth();
    this.fetchDay();
  },

  goToday() {
    const day = new Date();
    const month = monthKey(day);
    const selected = dateKey(day);
    this.setData({
      month,
      monthTitle: monthTitle(month),
      isCurrentMonth: true,
      selectedDate: selected,
      selectedTitle: selectedTitleOf(selected)
    });
    this.counts = this.monthCache[month] || {};
    this.renderCells();
    this.fetchMonth();
    this.fetchDay();
  },

  retryDay() {
    this.fetchDay();
  },

  goDetail(e: any) {
    wx.navigateTo({ url: `/packageCustomer/order-detail/index?id=${e.currentTarget.dataset.id}` });
  }
});
