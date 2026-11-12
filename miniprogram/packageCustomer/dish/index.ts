import { fetchDish, fetchDishReviews } from '../../api/menu';
import type { Dish, DishRating, DishReview } from '../../types/models';
import { addToCart } from '../../utils/cart';
import { errorText, toastError } from '../../utils/error';
import { formatDayLabel } from '../../utils/format';

interface ReviewView extends DishReview {
  day: string;
}

Page({
  data: {
    id: 0,
    dish: null as Dish | null,
    rating: { avg: 0, count: 0 } as DishRating,
    ratingText: '',
    filledStars: 0,
    stars: [1, 2, 3, 4, 5],
    reviews: [] as ReviewView[],
    qty: 1,
    actionText: '加入购物车 · 1 份',
    loading: true,
    error: ''
  },

  onLoad(query: any) {
    const id = Number(query && query.id) || 0;
    if (!id) {
      this.setData({ loading: false, error: '缺少菜品编号' });
      return;
    }
    this.setData({ id });
    this.load();
  },

  async load() {
    this.setData({ loading: true, error: '' });
    try {
      const results = await Promise.all([
        fetchDish(this.data.id),
        fetchDishReviews(this.data.id).catch(() => [] as DishReview[])
      ]);
      const dish = results[0].dish;
      const rating = results[0].rating;
      const reviews: ReviewView[] = (results[1] as DishReview[]).map((review) => ({
        ...review,
        day: formatDayLabel(review.createdAt)
      }));
      const qty = this.data.qty;
      this.setData({
        dish,
        rating,
        ratingText: rating.avg ? rating.avg.toFixed(1) : '—',
        filledStars: Math.round(rating.avg),
        reviews,
        loading: false,
        actionText: dish.isAvailable ? `加入购物车 · ${qty} 份` : '该菜品已下架'
      });
    } catch (err: any) {
      this.setData({ loading: false, error: errorText(err) });
    }
  },

  minus() {
    if (this.data.qty <= 1) return;
    this.setQty(this.data.qty - 1);
  },

  plus() {
    if (this.data.qty >= 99) return;
    this.setQty(this.data.qty + 1);
  },

  setQty(qty: number) {
    const dish = this.data.dish;
    this.setData({
      qty,
      actionText: dish && dish.isAvailable ? `加入购物车 · ${qty} 份` : '该菜品已下架'
    });
  },

  addToCart() {
    const dish = this.data.dish;
    if (!dish) return;
    if (!dish.isAvailable) {
      wx.showToast({ title: '这道菜已下架', icon: 'none' });
      return;
    }
    try {
      addToCart(dish, this.data.qty);
      wx.showToast({ title: `已加入 ${this.data.qty} 份`, icon: 'none', duration: 900 });
    } catch (err: any) {
      toastError(err);
    }
  }
});
