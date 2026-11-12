import { fetchPurchases } from '../../api/merchant';
import type { PurchaseIngredient } from '../../types/models';
import { errorText } from '../../utils/error';
import { dateKey, formatDateCN, todayKey } from '../../utils/format';
import { guardRole } from '../../utils/role';
import { getLastRole } from '../../utils/storage';

interface IngredientView extends PurchaseIngredient {
  glyph: string;
  subText: string;
  chips: string[];
  moreCount: number;
}

function padOrderId(id: number): string {
  const text = String(id);
  return text.length < 2 ? `0${text}` : text;
}

function toView(item: PurchaseIngredient): IngredientView {
  const dishes = item.dishNames.filter(Boolean);
  let subText = `涉及 ${item.orderCount} 单`;
  if (dishes.length === 1) {
    subText += ` · 仅${dishes[0]}使用`;
  } else if (dishes.length > 1) {
    const names = dishes.slice(0, 2).join('、');
    subText += dishes.length > 2 ? ` · 用于${names}等 ${dishes.length} 道菜` : ` · 用于${names}`;
  }

  const ids = item.orderIds || [];
  const chips = ids.slice(0, 3).map((id) => `#${padOrderId(id)}`);
  const moreCount = ids.length > 3 ? ids.length - 3 : 0;

  return {
    ...item,
    glyph: Array.from(item.nameZh || '材')[0] || '材',
    subText,
    chips,
    moreCount
  };
}

function shiftDate(key: string, delta: number): string {
  const parts = key.split('-').map(Number);
  const date = new Date(parts[0], parts[1] - 1, parts[2] + delta);
  return dateKey(date);
}

Page({
  data: {
    date: '',
    dateLabel: '',
    isToday: true,
    orderCount: 0,
    ingredientCount: 0,
    items: [] as IngredientView[],
    loading: true,
    error: '',
    viewRole: 'merchant'
  },

  timer: 0,
  loadSeq: 0,
  accessReady: false,

  onLoad() {
    const date = todayKey();
    this.setData({ date, dateLabel: this.labelOf(date), isToday: true });
    this.bootstrap();
  },

  async bootstrap() {
    const app = getApp<IAppOption>();
    let user;
    try {
      user = await app.ensureLogin();
    } catch (err: any) {
      this.setData({ loading: false, error: errorText(err) });
      return;
    }
    if (!guardRole('merchant', user)) return;
    this.setData({ viewRole: user.isSuper && getLastRole() === 'admin' ? 'admin' : 'merchant' });
    this.accessReady = true;
    this.load(true);
    this.startTimer();
  },

  onShow() {
    if (this.accessReady) {
      this.load(false);
      this.startTimer();
    }
  },

  onHide() {
    this.stopTimer();
  },

  onUnload() {
    this.stopTimer();
  },

  onPullDownRefresh() {
    this.load(true).then(() => wx.stopPullDownRefresh());
  },

  startTimer() {
    this.stopTimer();
    this.timer = setInterval(() => this.load(false), 30000);
  },

  stopTimer() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = 0;
    }
  },

  labelOf(key: string): string {
    const label = formatDateCN(key);
    if (key === todayKey()) return `今天 · ${label}`;
    if (key === shiftDate(todayKey(), -1)) return `昨天 · ${label}`;
    return label;
  },

  async load(showLoading: boolean): Promise<void> {
    const seq = ++this.loadSeq;
    if (showLoading) this.setData({ loading: true, error: '' });
    try {
      const summary = await fetchPurchases(this.data.date);
      if (seq !== this.loadSeq) return;
      this.setData({
        orderCount: summary.orderCount,
        ingredientCount: summary.ingredientCount,
        items: summary.ingredients.map(toView),
        loading: false,
        error: ''
      });
    } catch (err: any) {
      if (seq !== this.loadSeq) return;
      if (showLoading || this.data.items.length === 0) {
        this.setData({ loading: false, error: errorText(err) });
      }
    }
  },

  changeDate(delta: number) {
    this.applyDate(shiftDate(this.data.date, delta));
  },

  onDateChange(e: any) {
    this.applyDate(e.detail.value);
  },

  goToday() {
    this.applyDate(todayKey());
  },

  applyDate(date: string) {
    this.setData({
      date,
      dateLabel: this.labelOf(date),
      isToday: date === todayKey(),
      items: [],
      orderCount: 0,
      ingredientCount: 0
    });
    this.load(true);
  },

  retry() {
    this.load(true);
  }
});
