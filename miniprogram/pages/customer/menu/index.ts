import { fetchCategories, fetchDishes } from '../../../api/menu';
import type { Category, Dish } from '../../../types/models';
import { addToCart, cartCount, cartKinds } from '../../../utils/cart';
import { errorText } from '../../../utils/error';
import { greeting } from '../../../utils/format';

interface CategoryWithCount extends Category {
  count: number;
}

interface DishView extends Dish {
  categoryName: string;
  ratingText: string;
}

Page({
  data: {
    greeting: '',
    greetText: '',
    nickname: '',
    categories: [] as CategoryWithCount[],
    dishes: [] as DishView[],
    filtered: [] as DishView[],
    activeCategory: 0,
    activeCategoryName: '全部菜品',
    dishTotal: 0,
    loading: true,
    loadError: '',
    cartCount: 0,
    cartKinds: 0
  },

  onLoad() {
    this.init();
  },

  onShow() {
    this.refreshCart();
  },

  async init() {
    const app = getApp<IAppOption>();
    try {
      const user = await app.ensureLogin();
      const hello = greeting();
      const nickname = user.nickname || '';
      this.setData({
        nickname,
        greeting: hello,
        greetText: nickname ? `${hello}，${nickname}` : hello
      });
      await this.loadMenu();
    } catch (err: any) {
      this.setData({ loading: false, loadError: errorText(err) });
    }
  },

  async loadMenu() {
    this.setData({ loading: true, loadError: '' });
    try {
      const results = await Promise.all([fetchCategories(), fetchDishes()]);
      const categories = results[0].filter((item) => item.isActive !== false);
      const nameMap: Record<number, string> = {};
      categories.forEach((item) => {
        nameMap[item.id] = item.nameZh;
      });

      const dishes: DishView[] = results[1].map((dish) => ({
        ...dish,
        categoryName: dish.categoryName || nameMap[dish.categoryId] || '本店菜品',
        ratingText: dish.ratingAvg ? dish.ratingAvg.toFixed(1) : ''
      }));

      const categoriesWithCount: CategoryWithCount[] = categories.map((cat) => ({
        ...cat,
        count: dishes.filter((dish) => dish.categoryId === cat.id).length
      }));

      this.setData(
        {
          categories: categoriesWithCount,
          dishes,
          dishTotal: dishes.filter((item) => item.isAvailable).length,
          loading: false
        },
        () => this.applyFilter()
      );
    } catch (err: any) {
      this.setData({ loading: false, loadError: errorText(err) });
    }
  },

  applyFilter() {
    const activeCategory = this.data.activeCategory;
    const dishes = this.data.dishes;
    const filtered =
      activeCategory === 0 ? dishes : dishes.filter((dish) => dish.categoryId === activeCategory);
    let activeCategoryName = '全部菜品';
    if (activeCategory !== 0) {
      const cat = this.data.categories.find((item) => item.id === activeCategory);
      activeCategoryName = cat ? cat.nameZh : '本店菜品';
    }
    this.setData({ filtered, activeCategoryName });
  },

  onCategory(e: any) {
    const id = Number(e.currentTarget.dataset.id) || 0;
    this.setData({ activeCategory: id }, () => this.applyFilter());
  },

  addDish(e: any) {
    const id = Number(e.currentTarget.dataset.id);
    const dish = this.data.dishes.find((item) => item.id === id);
    if (!dish) return;
    if (!dish.isAvailable) {
      wx.showToast({ title: '这道菜已下架', icon: 'none' });
      return;
    }
    addToCart(dish, 1);
    this.refreshCart();
    wx.showToast({ title: '已加入购物车', icon: 'none', duration: 700 });
  },

  refreshCart() {
    this.setData({ cartCount: cartCount(), cartKinds: cartKinds() });
  },

  goDish(e: any) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/packageCustomer/dish/index?id=${id}` });
  },

  goCart() {
    if (!this.data.cartCount) return;
    wx.navigateTo({ url: '/packageCustomer/cart/index' });
  },

  reload() {
    this.init();
  }
});
