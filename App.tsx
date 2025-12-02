import React, { useState, useEffect } from 'react';
import WebApp from '@twa-dev/sdk';
import { User, Newspaper, ShoppingBag, Trophy, Grid3X3 } from 'lucide-react';

// Компоненты
import Dashboard from './components/Dashboard';
import ContentHub from './components/NewsFeed';
import Marketplace from './components/Shop';
import Leaderboard from './components/Leaderboard';
import ChessboardModal from './components/Chessboard';
import { UserProfile, DailyQuest, ConstructionUpdate, ShopItem, LeaderboardEntry, ProjectStat, CurrencyType } from './types';

// Типы вкладок
enum Tab {
  PROFILE = 'PROFILE',
  CONTENT = 'CONTENT',
  MARKET = 'MARKET',
  LEADERBOARD = 'LEADERBOARD',
}

// Тип юзера с сервера
interface ServerUser {
  id: number;
  telegram_id: string;
  first_name: string;
  username: string;
  balance: number;
  is_registered: boolean;
  phone?: string;
  company?: string; // <-- Теперь тут company вместо city
}

interface AppUserProfile extends UserProfile {
  is_registered: boolean;
}

// Заглушки (Mock Data)
const MOCK_DEFAULTS = {
  avatar: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?ixlib=rb-4.0.3&auto=format&fit=crop&w=256&q=80',
  level: 1,
  currentXP: 0,
  nextLevelXP: 1000,
  goldCoins: 0,
  dealsClosed: 0,
  telegram: '',
  whatsapp: ''
};

// Статистика (твоя заглушка)
const PROJECT_STATS: ProjectStat[] = [
  { id: 'p1', name: 'ЖК Бруклин', sales: 8, totalUnits: 120, color: 'bg-brand-black' },
  { id: 'p2', name: 'ЖК Бабайка', sales: 12, totalUnits: 450, color: 'bg-brand-gold' },
  { id: 'p3', name: 'ЖК Манхэттен', sales: 3, totalUnits: 80, color: 'bg-brand-grey' },
  { id: 'p4', name: 'ЖК Харизма', sales: 5, totalUnits: 200, color: 'bg-stone-400' },
];

const DAILY_QUESTS: DailyQuest[] = [
  { id: 'q1', title: 'Репост новости ЖК Бруклин', rewardXP: 50, rewardAmount: 100, rewardCurrency: CurrencyType.SILVER, isCompleted: false, type: 'SHARE' },
  { id: 'q2', title: 'Тест: Планировки ЖК Харизма', rewardXP: 100, rewardAmount: 200, rewardCurrency: CurrencyType.SILVER, isCompleted: false, type: 'TEST' },
  { id: 'q3', title: 'Продать 2-к квартиру', rewardXP: 1000, rewardAmount: 10, rewardCurrency: CurrencyType.GOLD, isCompleted: false, type: 'DEAL' },
];

// Данные для других вкладок
const NEWS_UPDATES: ConstructionUpdate[] = [
  { id: 'n1', title: 'Заливка 20 этажа', projectName: 'ЖК Бруклин', description: 'В ЖК Бруклин строители приступили к финальной стадии.', checklist: [], images: ['https://images.unsplash.com/photo-1541888946425-d81bb19240f5?auto=format&fit=crop&w=800&q=80'], date: '2 часа назад', progress: 65 },
];
const SHOP_ITEMS: ShopItem[] = [
  { id: 's1', name: 'Худи', price: 5000, currency: CurrencyType.SILVER, image: '🧥' },
];
const LEADERS: LeaderboardEntry[] = [
  { id: 1, name: 'Елена В.', deals: 52, company: 'АН Этажи' },
];

const App: React.FC = () => {
  const [user, setUser] = useState<AppUserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  
  const [activeTab, setActiveTab] = useState<Tab>(Tab.PROFILE);
  const [quests, setQuests] = useState<DailyQuest[]>(DAILY_QUESTS);
  const [isChessboardOpen, setIsChessboardOpen] = useState(false);

  // --- Форма регистрации ---
  const [regPhone, setRegPhone] = useState('');
  const [regCompany, setRegCompany] = useState(''); // <-- Вместо City теперь Company
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 1. Вход
  useEffect(() => {
    WebApp.ready();
    WebApp.expand();
    
    const initData = WebApp.initData;
    if (initData) {
      fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData }),
      })
      .then((res) => res.json())
      .then((data) => {
        if (data.user) {
          const serverUser: ServerUser = data.user;
          setUser({
            ...MOCK_DEFAULTS,
            id: String(serverUser.telegram_id),
            name: serverUser.first_name,
            silverCoins: serverUser.balance,
            is_registered: serverUser.is_registered,
            phone: serverUser.phone || '',
            company: serverUser.company || '', // <-- Берем компанию
          });
        }
      })
      .catch(err => console.error("Auth error:", err))
      .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  // 2. Регистрация
  const handleRegistration = () => {
    if(!regPhone || !regCompany) return;
    setIsSubmitting(true);

    fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        initData: WebApp.initData,
        phone: regPhone, 
        company: regCompany // <-- Отправляем компанию
      }),
    })
    .then(res => res.json())
    .then(data => {
      if (data.success && user) {
        setUser({ ...user, is_registered: true, phone: regPhone, company: regCompany });
      }
    })
    .catch(err => alert("Ошибка сохранения"))
    .finally(() => setIsSubmitting(false));
  };

  const renderContent = () => {
    if (!user) return null;
    switch (activeTab) {
      case Tab.PROFILE:
        return <Dashboard user={user} quests={quests} stats={PROJECT_STATS} />;
      case Tab.CONTENT:
        return <ContentHub />;
      case Tab.MARKET:
        return <Marketplace userSilver={user.silverCoins} userGold={user.goldCoins} />;
      case Tab.LEADERBOARD:
        return <Leaderboard />;
      default:
        return null;
    }
  };

  if (loading) return <div className="flex items-center justify-center h-screen bg-brand-cream w-full">Loading...</div>;
  if (!user) return <div className="flex items-center justify-center h-screen bg-brand-cream p-4">Open in Telegram</div>;

  // --- ЭКРАН РЕГИСТРАЦИИ ---
  if (!user.is_registered) {
    return (
      <div className="flex flex-col h-screen w-full bg-brand-cream text-brand-black p-6 justify-center max-w-md mx-auto">
        <div className="mb-8 text-center">
          <div className="w-20 h-20 bg-brand-gold rounded-full mx-auto mb-4 flex items-center justify-center shadow-lg">
            <User size={40} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold mb-2">Добро пожаловать!</h1>
          <p className="text-gray-600">Заполните анкету для входа в клуб партнеров.</p>
        </div>

        <div className="space-y-4 bg-white p-6 rounded-2xl shadow-sm border border-brand-beige">
          <div>
            <label className="block text-xs font-bold uppercase text-gray-500 mb-1">Компания / ИП</label>
            <input 
              type="text" 
              value={regCompany}
              onChange={e => setRegCompany(e.target.value)}
              placeholder="Например: АН Этажи"
              className="w-full p-3 bg-brand-light rounded-xl border-none focus:ring-2 focus:ring-brand-gold outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase text-gray-500 mb-1">Ваш телефон</label>
            <input 
              type="tel" 
              value={regPhone}
              onChange={e => setRegPhone(e.target.value)}
              placeholder="+7 (999) 000-00-00"
              className="w-full p-3 bg-brand-light rounded-xl border-none focus:ring-2 focus:ring-brand-gold outline-none"
            />
          </div>
          
          <button 
            onClick={handleRegistration}
            disabled={isSubmitting || !regPhone || !regCompany}
            className="w-full py-4 bg-brand-black text-white rounded-xl font-bold text-lg mt-4 active:scale-95 transition-transform disabled:opacity-50"
          >
            {isSubmitting ? 'Сохранение...' : 'Вступить в клуб'}
          </button>
        </div>
      </div>
    );
  }

  // --- ОСНОВНОЕ ПРИЛОЖЕНИЕ ---
  return (
    <div className="flex flex-col h-[100dvh] w-full max-w-md mx-auto bg-brand-cream relative shadow-2xl overflow-hidden text-brand-black">
      <div className="flex-1 overflow-y-auto custom-scrollbar pb-24">
        {renderContent()}
      </div>

      {/* Навигация */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 pb-6 pt-2">
        <div className="flex justify-around items-center h-[60px] px-2 max-w-md mx-auto">
            
            <button onClick={() => setActiveTab(Tab.PROFILE)} className={`flex flex-col items-center justify-center w-14 h-full gap-1 transition-all ${activeTab === Tab.PROFILE ? 'text-brand-black' : 'text-gray-400'}`}>
              <div className={`p-1 rounded-xl transition-all ${activeTab === Tab.PROFILE ? 'bg-brand-cream' : ''}`}>
                <User size={22} strokeWidth={activeTab === Tab.PROFILE ? 2.5 : 2} />
              </div>
              <span className="text-[9px] font-bold">Профиль</span>
            </button>

            {/* Было Медиа, стало Новости */}
            <button onClick={() => setActiveTab(Tab.CONTENT)} className={`flex flex-col items-center justify-center w-14 h-full gap-1 transition-all ${activeTab === Tab.CONTENT ? 'text-brand-black' : 'text-gray-400'}`}>
              <div className={`p-1 rounded-xl transition-all ${activeTab === Tab.CONTENT ? 'bg-brand-cream' : ''}`}>
                <Newspaper size={22} strokeWidth={activeTab === Tab.CONTENT ? 2.5 : 2} />
              </div>
              <span className="text-[9px] font-bold">Новости</span>
            </button>
            
            <button onClick={() => setIsChessboardOpen(true)} className="flex flex-col items-center justify-center w-14 h-full -mt-8 group relative z-10">
              <div className="w-12 h-12 bg-brand-black text-brand-gold rounded-full flex items-center justify-center shadow-lg border-4 border-white group-active:scale-95 transition-transform">
                <Grid3X3 size={22} />
              </div>
              <span className="text-[9px] font-bold text-brand-black mt-1">Проекты</span>
            </button>

            <button onClick={() => setActiveTab(Tab.MARKET)} className={`flex flex-col items-center justify-center w-14 h-full gap-1 transition-all ${activeTab === Tab.MARKET ? 'text-brand-black' : 'text-gray-400'}`}>
              <div className={`p-1 rounded-xl transition-all ${activeTab === Tab.MARKET ? 'bg-brand-cream' : ''}`}>
                <ShoppingBag size={22} strokeWidth={activeTab === Tab.MARKET ? 2.5 : 2} />
              </div>
              <span className="text-[9px] font-bold">Маркет</span>
            </button>

            <button onClick={() => setActiveTab(Tab.LEADERBOARD)} className={`flex flex-col items-center justify-center w-14 h-full gap-1 transition-all ${activeTab === Tab.LEADERBOARD ? 'text-brand-black' : 'text-gray-400'}`}>
              <div className={`p-1 rounded-xl transition-all ${activeTab === Tab.LEADERBOARD ? 'bg-brand-cream' : ''}`}>
                <Trophy size={22} strokeWidth={activeTab === Tab.LEADERBOARD ? 2.5 : 2} />
              </div>
              <span className="text-[9px] font-bold">Топ</span>
            </button>

        </div>
      </div>

      {isChessboardOpen && <ChessboardModal onClose={() => setIsChessboardOpen(false)} />}
    </div>
  );
};

export default App;
