
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
  company: string;
  telegram: string;
  whatsapp: string;
  is_admin?: boolean;
  is_registered?: boolean;
  approval_status?: 'none' | 'pending' | 'approved' | 'rejected';
  last_name?: string;
  company_type?: 'agency' | 'ip';
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
  description: string;
  checklist: string[];
  materialsLink?: string;
  images: string[];
  date: string;
  progress: number;
}

export interface ShopItem {
  id: string;
  name: string;
  category: 'TECH' | 'MERCH' | 'LUXURY' | 'EXPERIENCE';
  price: number;
  currency: CurrencyType;
  image: string;
  inStock: boolean;
}

export interface LeaderboardEntry {
  id: string;
  name: string;
  deals: number;
  xp: number;
  avatar: string;
  trend: 'up' | 'down' | 'neutral';
}

export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  date: string;
  time: string;
  type: 'TOUR' | 'TRAINING' | 'PARTY';
  spotsTotal: number;
  spotsTaken: number;
  isRegistered: boolean;
}

export interface ChessUnit {
  id: string;
  number: string;
  rooms: number;
  area: number;
  price: number;
  status: 'FREE' | 'BOOKED' | 'SOLD';
  floor: number;
  layoutImage?: string;
  section?: string;
}

export interface ProjectData {
  id: string;
  name: string;
  description?: string;
  floors: number;
  unitsPerFloor: number;
  image: string;
  profitbaseUrl?: string;
}

export interface MortgageProgram {
  id: string;
  name: string;
  rate: number;
  description?: string;
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

export interface BookingRecord {
  id: number;
  unit_id: string;
  unit_number: string;
  unit_floor: number;
  unit_area: number;
  unit_rooms: number;
  unit_price: number;
  project_name: string;
  stage: 'INIT' | 'PASSPORT_SENT' | 'DOCS_SENT' | 'COMPLETE' | 'CANCELLED';
  passport_sent: boolean;
  docs_sent: boolean;
  buyer_name?: string;
  buyer_phone?: string;
  created_at: string;
}

export interface Application {
  id: number;
  telegram_id: number;
  first_name: string;
  last_name: string;
  company: string;
  company_type: string;
  phone: string;
  approval_status: string;
  created_at: string;
}
