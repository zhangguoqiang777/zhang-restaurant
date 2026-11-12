import { cancelOrder, fetchOrder } from '../../api/orders';
import type { Order, OrderItem } from '../../types/models';
import { errorText, toastError } from '../../utils/error';
import { formatOrderTime, statusPillClass, statusText } from '../../utils/format';

interface TimelineNode {
  key: string;
  title: string;
  time: string;
  state: string;
}

interface OrderDetailView extends Order {
  statusText: string;
  pillClass: string;
  createdText: string;
  totalQty: number;
  items: OrderItem[];
  bannerTitle: string;
  bannerDesc: string;
  bannerGlyph: string;
  canCancel: boolean;
  canReview: boolean;
  step2Class: string;
  step3Class: string;
  line1Class: string;
  line2Class: string;
  timeline: TimelineNode[];
}

function toView(order: Order): OrderDetailView {
  const completed = order.status === 'completed';
  const cooking = order.status === 'cooking';

  let bannerTitle = '等待商家接单';
  let bannerDesc = '小张马上会看到这一单，请稍候。';
  let bannerGlyph = '候';
  if (cooking) {
    bannerTitle = '正在制作';
    bannerDesc = '大约 15 分钟出餐，做好后状态会同步更新。';
    bannerGlyph = '做';
  } else if (completed) {
    bannerTitle = '这一餐完成了';
    bannerDesc = order.reviewed ? '谢谢你留下的评价。' : '给这一餐打个分，帮小张把菜做得更好。';
    bannerGlyph = '成';
  }

  const timeline: TimelineNode[] = [
    {
      key: 'created',
      title: '已下单',
      time: formatOrderTime(order.createdAt),
      state: 'done'
    },
    {
      key: 'cooking',
      title: '开始制作',
      time: order.cookingAt ? formatOrderTime(order.cookingAt) : '等待中',
      state: cooking ? 'now' : order.completedAt ? 'done' : ''
    },
    {
      key: 'completed',
      title: '制作完成',
      time: order.completedAt ? formatOrderTime(order.completedAt) : '等待中',
      state: completed ? 'done' : ''
    }
  ];

  return {
    ...order,
    statusText: statusText(order.status),
    pillClass: statusPillClass(order.status),
    createdText: formatOrderTime(order.createdAt),
    totalQty: order.items.reduce((sum, item) => sum + item.qty, 0),
    bannerTitle,
    bannerDesc,
    bannerGlyph,
    canCancel: order.status === 'pending',
    canReview: completed && !order.reviewed,
    step2Class: order.cookingAt ? (cooking ? 'now' : 'done') : '',
    step3Class: completed ? 'done' : '',
    line1Class: order.cookingAt ? 'done' : '',
    line2Class: completed ? 'done' : '',
    timeline
  };
}

Page({
  data: {
    id: 0,
    detail: null as OrderDetailView | null,
    loading: true,
    error: ''
  },

  timer: 0,
  loadingLock: false,

  onLoad(query: any) {
    const id = Number(query && query.id) || 0;
    if (!id) {
      this.setData({ loading: false, error: '缺少订单编号' });
      return;
    }
    this.setData({ id });
    this.load(true);
  },

  onShow() {
    if (!this.data.loading && this.data.detail) this.load(false);
    this.stopTimer();
    this.timer = setInterval(() => {
      if (this.data.detail && this.data.detail.status !== 'completed') {
        this.load(false);
      }
    }, 30000);
  },

  onHide() {
    this.stopTimer();
  },

  onUnload() {
    this.stopTimer();
  },

  onPullDownRefresh() {
    this.load(false).then(() => wx.stopPullDownRefresh());
  },

  stopTimer() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = 0;
    }
  },

  async load(showLoading: boolean): Promise<void> {
    if (this.loadingLock) return;
    this.loadingLock = true;
    if (showLoading) this.setData({ loading: true, error: '' });
    try {
      const order = await fetchOrder(this.data.id);
      this.setData({ detail: toView(order), loading: false, error: '' });
    } catch (err: any) {
      if (showLoading || !this.data.detail) {
        this.setData({ loading: false, error: errorText(err) });
      }
    } finally {
      this.loadingLock = false;
    }
  },

  refresh() {
    this.load(false).then(() => {
      if (this.data.error) {
        toastError({ code: 'NETWORK_ERROR' });
        return;
      }
      wx.showToast({ title: '已刷新', icon: 'none', duration: 700 });
    });
  },

  cancel() {
    wx.showModal({
      title: '取消这一单？',
      content: '取消后商家将不再看到这一单。',
      confirmText: '取消订单',
      confirmColor: '#A5483B',
      success: async (res: any) => {
        if (!res.confirm) return;
        try {
          await cancelOrder(this.data.id);
          wx.showToast({ title: '已取消', icon: 'none' });
          this.load(false);
        } catch (err: any) {
          toastError(err);
          this.load(false);
        }
      }
    });
  },

  goReview() {
    wx.navigateTo({ url: `/packageCustomer/review/index?orderId=${this.data.id}` });
  },

  goMenu() {
    wx.reLaunch({ url: '/pages/customer/menu/index' });
  },

  reload() {
    this.load(true);
  }
});
