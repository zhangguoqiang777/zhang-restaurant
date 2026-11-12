import { fetchOrder, fetchOrderReview, submitReview } from '../../api/orders';
import type { Order, Review } from '../../types/models';
import { errorText, toastError } from '../../utils/error';
import { formatOrderTime } from '../../utils/format';

interface ExistingItemView {
  dishId: number;
  nameZh: string;
  rating: number;
  content: string;
}

interface ExistingReviewView extends Review {
  createdText: string;
  items: ExistingItemView[];
}

interface ReviewDish {
  dishId: number;
  nameZh: string;
  rating: number;
  content: string;
}

const RATING_WORDS = ['点星星打分', '很不满意', '不太满意', '一般', '满意', '很满意'];

Page({
  data: {
    orderId: 0,
    order: null as Order | null,
    existing: null as ExistingReviewView | null,
    stars: [1, 2, 3, 4, 5],
    rating: 5,
    ratingText: RATING_WORDS[5],
    content: '',
    contentLen: 0,
    items: [] as ReviewDish[],
    loading: true,
    saving: false,
    error: ''
  },

  onLoad(query: any) {
    const orderId = Number(query && query.orderId) || 0;
    if (!orderId) {
      this.setData({ loading: false, error: '缺少订单编号' });
      return;
    }
    this.setData({ orderId });
    this.load();
  },

  async load() {
    this.setData({ loading: true, error: '' });
    try {
      const results = await Promise.all([
        fetchOrder(this.data.orderId),
        fetchOrderReview(this.data.orderId).catch(() => null)
      ]);
      const order = results[0];
      const review = results[1];
      if (review) {
        this.setData({
          order,
          existing: {
            ...review,
            createdText: formatOrderTime(review.createdAt),
            items: review.items.length
              ? review.items.map((item) => ({
                  dishId: item.dishId,
                  nameZh: item.nameZh,
                  rating: item.rating,
                  content: item.content
                }))
              : order.items.map((item) => ({
                  dishId: item.dishId,
                  nameZh: item.nameZh,
                  rating: review.rating,
                  content: ''
                }))
          },
          loading: false
        });
      } else {
        this.setData({
          order,
          existing: null,
          items: order.items.map((item) => ({
            dishId: item.dishId,
            nameZh: item.nameZh,
            rating: 5,
            content: ''
          })),
          loading: false
        });
      }
    } catch (err: any) {
      this.setData({ loading: false, error: errorText(err) });
    }
  },

  setRating(e: any) {
    const rating = Number(e.currentTarget.dataset.star) || 0;
    this.setData({
      rating,
      ratingText: RATING_WORDS[rating] || RATING_WORDS[0]
    });
  },

  onContent(e: any) {
    const value = e.detail.value || '';
    this.setData({ content: value, contentLen: value.length });
  },

  setItemRating(e: any) {
    const index = Number(e.currentTarget.dataset.index);
    const star = Number(e.currentTarget.dataset.star);
    this.setData({ [`items[${index}].rating`]: star });
  },

  onItemContent(e: any) {
    const index = Number(e.currentTarget.dataset.index);
    this.setData({ [`items[${index}].content`]: e.detail.value || '' });
  },

  async submit() {
    if (this.data.saving) return;
    if (!this.data.rating) {
      wx.showToast({ title: '先给这一餐打个星', icon: 'none' });
      return;
    }
    this.setData({ saving: true });
    try {
      await submitReview(this.data.orderId, {
        rating: this.data.rating,
        content: this.data.content,
        items: this.data.items.map((item) => ({
          dishId: item.dishId,
          rating: item.rating,
          content: item.content
        }))
      });
      wx.showToast({ title: '评价已提交', icon: 'success', duration: 900 });
      setTimeout(() => wx.navigateBack(), 900);
    } catch (err: any) {
      this.setData({ saving: false });
      if (err && err.code === 'REVIEW_DUPLICATED') {
        toastError(err);
        this.load();
        return;
      }
      toastError(err);
    }
  },

  back() {
    wx.navigateBack();
  }
});
