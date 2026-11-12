import type {
  AdminUser,
  CalendarDay,
  Category,
  Dish,
  DishRating,
  DishReview,
  Ingredient,
  Order,
  OrderItem,
  OrderStatus,
  PurchaseIngredient,
  PurchaseSummary,
  Review,
  ReviewItem,
  Role,
  UserInfo
} from '../types/models';

export function str(value: any): string {
  if (value === null || value === undefined) return '';
  return String(value);
}

export function num(value: any): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function bool(value: any): boolean {
  return value === true || value === 1 || value === '1';
}

export function normalizeRole(value: any): Role {
  if (value === 'merchant' || value === 'admin' || value === 'customer') return value;
  return 'customer';
}

export function normalizeStatus(value: any): OrderStatus {
  if (value === 'cooking' || value === 'completed') return value;
  return 'pending';
}

/** 列表结果兼容数组与 { items / list / rows } 包装 */
export function extractList(data: any): any[] {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== 'object') return [];
  const keys = ['items', 'list', 'rows', 'records', 'orders', 'dishes', 'categories', 'ingredients', 'users', 'days'];
  for (const key of keys) {
    if (Array.isArray(data[key])) return data[key];
  }
  return [];
}

export function normalizeUser(raw: any): UserInfo {
  const source = raw && raw.user ? raw.user : raw || {};
  return {
    id: num(source.id || source.userId || source.user_id),
    nickname: str(source.nickname),
    isSuper: bool(source.isSuper !== undefined ? source.isSuper : source.is_super),
    canMerchant: bool(source.canMerchant !== undefined ? source.canMerchant : source.can_merchant),
    lastRole: normalizeRole(source.lastRole !== undefined ? source.lastRole : source.last_role),
    openid: str(source.openid || source.openidMasked || source.openid_masked),
    lastLoginAt: str(source.lastLoginAt || source.last_login_at),
    createdAt: str(source.createdAt || source.created_at)
  };
}

export function normalizeCategory(raw: any): Category {
  return {
    id: num(raw.id),
    nameZh: str(raw.nameZh !== undefined ? raw.nameZh : raw.name_zh || raw.name),
    sortOrder: num(raw.sortOrder !== undefined ? raw.sortOrder : raw.sort_order),
    isActive: bool(raw.isActive !== undefined ? raw.isActive : raw.is_active !== undefined ? raw.is_active : 1)
  };
}

export function normalizeIngredient(raw: any): Ingredient {
  return {
    id: num(raw.id),
    nameZh: str(raw.nameZh !== undefined ? raw.nameZh : raw.name_zh || raw.name),
    isActive: bool(raw.isActive !== undefined ? raw.isActive : raw.is_active !== undefined ? raw.is_active : 1)
  };
}

export function normalizeDish(raw: any): Dish {
  const ingredients = Array.isArray(raw.ingredients) ? raw.ingredients.map(normalizeIngredient) : [];
  const idsSource = raw.ingredientIds || raw.ingredient_ids;
  const ingredientIds = Array.isArray(idsSource)
    ? idsSource.map((v: any) => num(typeof v === 'object' ? v.id : v))
    : ingredients.map((item) => item.id);
  const rating = raw.rating || {};

  return {
    id: num(raw.id),
    categoryId: num(raw.categoryId !== undefined ? raw.categoryId : raw.category_id),
    nameZh: str(raw.nameZh !== undefined ? raw.nameZh : raw.name_zh || raw.name),
    introZh: str(raw.introZh !== undefined ? raw.introZh : raw.intro_zh || raw.intro),
    imageKey: str(raw.imageKey !== undefined ? raw.imageKey : raw.image_key),
    isAvailable: bool(raw.isAvailable !== undefined ? raw.isAvailable : raw.is_available !== undefined ? raw.is_available : 1),
    sortOrder: num(raw.sortOrder !== undefined ? raw.sortOrder : raw.sort_order),
    categoryName: str(raw.categoryName || raw.category_name || (raw.category && raw.category.nameZh) || ''),
    ingredientCount: num(
      raw.ingredientCount !== undefined
        ? raw.ingredientCount
        : raw.ingredient_count !== undefined
          ? raw.ingredient_count
          : ingredientIds.length
    ),
    ingredientIds,
    ingredients,
    ratingAvg: num(
      raw.ratingAvg !== undefined
        ? raw.ratingAvg
        : raw.avgRating !== undefined
          ? raw.avgRating
          : raw.avg_rating !== undefined
            ? raw.avg_rating
            : rating.avg
    ),
    ratingCount: num(
      raw.ratingCount !== undefined
        ? raw.ratingCount
        : raw.reviewCount !== undefined
          ? raw.reviewCount
          : raw.review_count !== undefined
            ? raw.review_count
            : rating.count
    )
  };
}

export function normalizeDishRating(raw: any): DishRating {
  const source = raw && raw.rating ? raw.rating : raw || {};
  return {
    avg: num(source.avg !== undefined ? source.avg : source.avgRating !== undefined ? source.avgRating : source.avg_rating),
    count: num(source.count !== undefined ? source.count : source.reviewCount !== undefined ? source.reviewCount : source.review_count)
  };
}

export function normalizeDishReview(raw: any): DishReview {
  return {
    id: num(raw.id),
    rating: num(raw.rating),
    content: str(raw.content),
    createdAt: str(raw.createdAt || raw.created_at)
  };
}

export function normalizeOrderItem(raw: any): OrderItem {
  return {
    id: num(raw.id),
    dishId: num(raw.dishId !== undefined ? raw.dishId : raw.dish_id),
    nameZh: str(raw.nameZh !== undefined ? raw.nameZh : raw.name_zh || raw.name),
    qty: num(raw.qty || raw.quantity || 1),
    imageKey: str(raw.imageKey !== undefined ? raw.imageKey : raw.image_key || (raw.dish && raw.dish.imageKey) || '')
  };
}

export function normalizeOrder(raw: any): Order {
  const source = raw && raw.order ? raw.order : raw || {};
  const itemsSource = source.items || source.orderItems || source.order_items || [];
  const review = source.review || null;
  const customer = source.customer || {};
  return {
    id: num(source.id),
    status: normalizeStatus(source.status),
    remark: str(source.remark),
    businessDate: str(source.businessDate || source.business_date),
    createdAt: str(source.createdAt || source.created_at),
    cookingAt: str(source.cookingAt || source.cooking_at),
    completedAt: str(source.completedAt || source.completed_at),
    items: Array.isArray(itemsSource) ? itemsSource.map(normalizeOrderItem) : [],
    customerId: num(
      source.customerId !== undefined ? source.customerId : source.customer_id !== undefined ? source.customer_id : customer.id
    ),
    customerNickname: str(
      source.customerNickname || source.customer_nickname || customer.nickname || source.nickname
    ),
    reviewed:
      bool(source.reviewed) ||
      bool(source.hasReview !== undefined ? source.hasReview : source.has_review) ||
      !!review ||
      num(source.reviewId || source.review_id) > 0
  };
}

export function normalizeReviewItem(raw: any): ReviewItem {
  return {
    dishId: num(raw.dishId !== undefined ? raw.dishId : raw.dish_id),
    nameZh: str(raw.nameZh !== undefined ? raw.nameZh : raw.name_zh || raw.name),
    rating: num(raw.rating),
    content: str(raw.content)
  };
}

export function normalizeReview(raw: any): Review {
  const source = raw && raw.review ? raw.review : raw || {};
  const itemsSource = source.items || source.reviewItems || source.review_items || [];
  return {
    id: num(source.id),
    orderId: num(source.orderId !== undefined ? source.orderId : source.order_id),
    rating: num(source.rating),
    content: str(source.content),
    createdAt: str(source.createdAt || source.created_at),
    hidden: bool(source.hidden !== undefined ? source.hidden : source.isHidden !== undefined ? source.isHidden : source.is_hidden),
    items: Array.isArray(itemsSource) ? itemsSource.map(normalizeReviewItem) : []
  };
}

export function normalizeCalendarDay(raw: any): CalendarDay {
  return {
    date: str(raw.date || raw.businessDate || raw.business_date || raw.day),
    count: num(raw.count !== undefined ? raw.count : raw.total)
  };
}

export function normalizePurchaseIngredient(raw: any): PurchaseIngredient {
  const dishNames = raw.dishNames || raw.dish_names || [];
  const orderIds = raw.orderIds || raw.order_ids || [];
  return {
    ingredientId: num(raw.ingredientId !== undefined ? raw.ingredientId : raw.ingredient_id || raw.id),
    nameZh: str(raw.nameZh !== undefined ? raw.nameZh : raw.name_zh || raw.name),
    orderCount: num(raw.orderCount !== undefined ? raw.orderCount : raw.order_count || raw.orders),
    orderIds: Array.isArray(orderIds) ? orderIds.map((v: any) => num(v)) : [],
    dishNames: Array.isArray(dishNames) ? dishNames.map((v: any) => str(v)) : []
  };
}

export function normalizePurchase(raw: any): PurchaseSummary {
  const source = raw || {};
  const list = extractList(source.ingredients || source.items || source);
  return {
    date: str(source.date || source.businessDate || source.business_date),
    orderCount: num(source.orderCount !== undefined ? source.orderCount : source.order_count),
    ingredientCount: num(source.ingredientCount !== undefined ? source.ingredientCount : source.ingredient_count || list.length),
    ingredients: list.map(normalizePurchaseIngredient)
  };
}

export function normalizeAdminUser(raw: any): AdminUser {
  return {
    id: num(raw.id),
    nickname: str(raw.nickname),
    openid: str(raw.openid || raw.openidMasked || raw.openid_masked),
    canMerchant: bool(raw.canMerchant !== undefined ? raw.canMerchant : raw.can_merchant),
    isSuper: bool(raw.isSuper !== undefined ? raw.isSuper : raw.is_super),
    lastLoginAt: str(raw.lastLoginAt || raw.last_login_at),
    createdAt: str(raw.createdAt || raw.created_at)
  };
}
