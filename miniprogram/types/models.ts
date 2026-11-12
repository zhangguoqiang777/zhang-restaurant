export type Role = 'customer' | 'merchant' | 'admin';

export type OrderStatus = 'pending' | 'cooking' | 'completed';

export interface UserInfo {
  id: number;
  nickname: string;
  isSuper: boolean;
  canMerchant: boolean;
  lastRole: Role;
  openid?: string;
  lastLoginAt?: string;
  createdAt?: string;
}

export interface LoginResult {
  token: string;
  userId: number;
  isSuper: boolean;
  canMerchant: boolean;
  lastRole: Role;
  nickname?: string;
}

export interface Category {
  id: number;
  nameZh: string;
  sortOrder: number;
  isActive: boolean;
}

export interface Ingredient {
  id: number;
  nameZh: string;
  isActive: boolean;
}

export interface Dish {
  id: number;
  categoryId: number;
  nameZh: string;
  introZh: string;
  imageKey: string;
  isAvailable: boolean;
  sortOrder: number;
  categoryName: string;
  ingredientCount: number;
  ingredientIds: number[];
  ingredients: Ingredient[];
  ratingAvg: number;
  ratingCount: number;
}

export interface DishRating {
  avg: number;
  count: number;
}

export interface DishReview {
  id: number;
  rating: number;
  content: string;
  createdAt: string;
}

export interface OrderItem {
  id: number;
  dishId: number;
  nameZh: string;
  qty: number;
  imageKey: string;
}

export interface Order {
  id: number;
  status: OrderStatus;
  remark: string;
  businessDate: string;
  createdAt: string;
  cookingAt: string;
  completedAt: string;
  items: OrderItem[];
  customerId: number;
  customerNickname: string;
  reviewed: boolean;
}

export interface ReviewItem {
  dishId: number;
  nameZh: string;
  rating: number;
  content: string;
}

export interface Review {
  id: number;
  orderId: number;
  rating: number;
  content: string;
  createdAt: string;
  hidden: boolean;
  items: ReviewItem[];
}

export interface CalendarDay {
  date: string;
  count: number;
}

export interface PurchaseIngredient {
  ingredientId: number;
  nameZh: string;
  orderCount: number;
  orderIds: number[];
  dishNames: string[];
}

export interface PurchaseSummary {
  date: string;
  orderCount: number;
  ingredientCount: number;
  ingredients: PurchaseIngredient[];
}

export interface AdminUser {
  id: number;
  nickname: string;
  openid: string;
  canMerchant: boolean;
  isSuper: boolean;
  lastLoginAt: string;
  createdAt: string;
}

export interface CartItem {
  dishId: number;
  nameZh: string;
  introZh: string;
  imageKey: string;
  qty: number;
}
