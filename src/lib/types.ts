export type Category = {
  id: string;
  name: string;
  slug: string;
  icon: string;
  parentId?: string | null;
};
export type City = {
  id: string;
  name: string;
  regionId: string;
  regionName: string;
};
export type Producer = {
  notCookingToday?: boolean;
  id: string;
  slug: string;
  name: string;
  description: string;
  cityId: string;
  cityName: string;
  regionName: string;
  neighborhood: string | null;
  verified: boolean;
  phone: string;
  whatsapp: string | null;
  delivery: boolean;
  pickup: boolean;
  logoUrl: string | null;
  coverUrl: string | null;
  socialLinks: { platform: string; url: string }[];
  businessHours: string | null;
  website?: string | null;
  deliveryAreas?: { cityId: string; cityName: string; fee: number | null }[];
};
export type Product = {
  notCookingToday?: boolean;
  id: string;
  producerId: string;
  producerName: string;
  producerSlug: string;
  cityName: string;
  name: string;
  description: string;
  price: number | null;
  unit: string;
  status: "available" | "unavailable" | "preorder";
  imageUrl: string | null;
  categoryIds: string[];
  allergens: string[];
  ingredients: string | null;
  storage: string | null;
  shelfLife: string | null;
  preparationTime: string | null;
  story: string | null;
  delivery: boolean;
};
export type Filters = {
  region?: string;
  q?: string;
  city?: string;
  category?: string;
  status?: string;
  delivery?: string;
  /** slug أسرة لعرض منتجاتها فقط */
  producer?: string;
  /** "all" يشمل غير المتوفر؛ الافتراضي يعرض المتاح والطلب المسبق */
  include?: string;
  page?: number;
};
export type SessionUser = {
  id: string;
  name: string;
  phone: string;
  role: "customer" | "producer" | "admin";
  username?: string | null;
};
