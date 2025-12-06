export enum CurrencyType {
  SILVER = 'SILVER', // Regular coins (Daily tasks)
  GOLD = 'GOLD',     // Premium coins (Sales only)
}

export interface UserProfile {
  id: string;
  name: string;
  avatar: string;
  level: number;
  currentXP: number;
  nextLevelXP: number;
  silverCoins: number;
  goldCoins: number;
  dealsClosed: number;
  // Contact Info
  phone: string;
  company: string; 
  telegram: string;
  whatsapp: string;
  is_admin?: boolean; // <--- НУЖНО ДЛЯ АДМИНКИ
  is_registered?: boolean; // <--- НУЖНО ДЛЯ ЛОГИКИ ВХОДА
}

export interface ProjectStat {
  id: string;
  name: string; 
  sales: number;
  totalUnits: number;
  color: string;
}

export interface DailyQuest {
  id: string;
  title: string;
  rewardXP: number;
  rewardAmount: number;
  rewardCurrency: CurrencyType;
  isCompleted: boolean;
  type: 'SHARE' | 'TEST' | 'DEAL';
}

export interface ConstructionUpdate {
  id: string;
  title: string;
  projectName: string;
  description: string; 
  checklist: string[]; 
  generatedText?: string;
  images: string[]; 
  date: string;
  progress: number;
}

// Обновил под Базу Данных (было name/image, стало title/image_url)
export interface ShopItem {
  id: number;
  title: string;       // В базе это title
  price: number;
  currency: CurrencyType;
  image_url: string;   // В базе это image_url
  is_active: boolean;  // В базе это поле есть
}

export interface LeaderboardEntry {
  id: string | number;
  name: string;
  deals: number;
  company: string; // <--- ОСТАВИЛ ТВОЕ ПОЛЕ
  xp?: number;
  avatar?: string;
  trend?: 'up' | 'down' | 'neutral';
}

export interface ChessUnit {
  id: string;
  number: string;
  rooms: number; 
  area: number;
  price: number;
  status: 'FREE' | 'BOOKED' | 'SOLD';
  floor: number;
}

export interface ProjectData {
  id: string;
  name: string;
  floors: number;
  unitsPerFloor: number;
  image: string;
}

// ТВОЯ ФУНКЦИЯ (ВЕРНУЛ)
export const getRank = (deals: number): string => {
  if (deals >= 50) return 'Гуру Недвижимости';
  if (deals >= 35) return 'Мастер';
  if (deals >= 20) return 'Эксперт';
  if (deals >= 10) return 'Специалист';
  if (deals >= 5) return 'Агент';
  return 'Новичок';
};
