export enum CurrencyType {
  SILVER = 'SILVER', // Regular coins (Daily tasks)
  GOLD = 'GOLD',   // Premium coins (Sales only)
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
  // Contact Info for Business Card
  phone: string;
  company: string; // <--- ДОБАВИЛ ТОЛЬКО ЭТО (нужно для регистрации)
  telegram: string;
  whatsapp: string;
}

export interface ProjectStat {
  id: string;
  name: string; // "ЖК Бруклин"
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
  description: string; // Main text
  checklist: string[]; // Bullet points for popup
  generatedText?: string;
  images: string[]; // Array for carousel
  date: string;
  progress: number;
}

export interface ShopItem {
  id: string | number;
  name: string;
  category?: 'TECH' | 'MERCH' | 'LUXURY' | 'EXPERIENCE';
  price: number;
  currency: CurrencyType; // Используем это для определения цены
  image: string; // Тут эмодзи или ссылка
  inStock?: boolean;
}

export interface LeaderboardEntry {
  id: string | number;
  name: string;
  deals: number;
  company: string; // <--- ДОБАВИЛ, чтобы выводить "АН Этажи" в топе
  xp?: number;
  avatar?: string;
  trend?: 'up' | 'down' | 'neutral';
}

export interface ChessUnit {
  id: string;
  number: string;
  rooms: number; // 1, 2, 3, Studio (0)
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

// Helper to calculate Rank based on deals
export const getRank = (deals: number): string => {
  if (deals >= 50) return 'Гуру Недвижимости';
  if (deals >= 35) return 'Мастер';
  if (deals >= 20) return 'Эксперт';
  if (deals >= 10) return 'Специалист';
  if (deals >= 5) return 'Агент';
  return 'Новичок';
};
