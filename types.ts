export enum CurrencyType {
  COMMON = 'COMMON',       // "Кирпичики" - from games
  RARE = 'RARE',           // "Золотые блоки" - from deals
  LEGENDARY = 'LEGENDARY', // "Алмазные ключи" - from 10 deals
}

export interface UserProfile {
  id: string;
  name: string;
  rank: string;
  avatar: string;
  dealsClosed: number;
  wallet: {
    [CurrencyType.COMMON]: number;
    [CurrencyType.RARE]: number;
    [CurrencyType.LEGENDARY]: number;
  };
}

export interface LeaderboardEntry {
  id: string;
  name: string;
  deals: number;
  points: number;
  avatar: string;
}

export interface NewsItem {
  id: string;
  title: string;
  content: string;
  date: string;
  type: 'news' | 'event' | 'promo';
}

export interface ShopItem {
  id: string;
  name: string;
  description: string;
  cost: number;
  currency: CurrencyType;
  image: string;
}