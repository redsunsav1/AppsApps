import React, { useState, useEffect } from 'react';
import WebApp from '@twa-dev/sdk';
import { User, Newspaper, ShoppingBag, Trophy, Grid3X3 } from 'lucide-react';

// --- Импорт твоих компонентов (убедись, что файлы существуют) ---
import Dashboard from './components/Dashboard';
import ContentHub from './components/NewsFeed';
import Marketplace from './components/Shop';
import Leaderboard from './components/Leaderboard';
import ChessboardModal from './components/Chessboard';
import { UserProfile, DailyQuest, ConstructionUpdate, ShopItem, LeaderboardEntry, ProjectStat, CurrencyType } from './types';
import './App.css';

// --- ТИПЫ ---

enum Tab {
  PROFILE = 'PROFILE',
  CONTENT = 'CONTENT',
  MARKET = 'MARKET',
  LEADERBOARD = 'LEADERBOARD',
}

// Данные, которые приходят с ТВОЕГО сервера
interface ServerUser {
  id: number;
  telegram_id: string;
  first_name: string;
  username: string;
  balance: number;
  is_registered: boolean;
  phone?: string;
  city?: string;
}

// Объединенный тип профиля (Сервер + UI)
interface AppUserProfile extends UserProfile {
  is_registered: boolean;
}

// --- MOCK DATA (Оставляем для красоты, пока сервер не научится отдавать всё) ---

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

const NEWS_UPDATES: ConstructionUpdate[] = [
  { 
    id: 'n1', title: 'Заливка 20 этажа', projectName: 'ЖК Бруклин',
    description: 'В ЖК Бруклин строители приступили к финальной стадии монолитных работ в корпусе А.',
    checklist: ['Завершен монтаж опалубки', 'Начато остекление'],
    images: ['https://images.unsplash.com/photo-1541888946425-d81bb19240f5?auto=format&fit=crop&w=800&q=80'],
    date: '2 часа назад', progress: 65 
  },
  { 
    id: 'n2', title: 'Старт продаж паркинга', projectName: 'ЖК Харизма',
    description: 'Открыто бронирование машиномест в подземном паркинге.', 
    checklist: ['Всего мест: 140', 'Цена от 800 000 руб'],
    images: ['https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=800&q=80'],
    date: 'Вчера', progress: 20 
  },
];

const SHOP_ITEMS: ShopItem[] = [
  { id: 's1', name: 'Брендированный Худи', category: 'MERCH', price: 5000, currency: CurrencyType.SILVER, image: '🧥', inStock: true },
  { id: 's2', name: 'Сертификат OZON 3000₽', category: 'EXPERIENCE', price: 15000, currency: CurrencyType.SILVER, image: '💳', inStock: true },
];

const LEADERS: LeaderboardEntry[] = [
  { id: 'l1', name: 'Елена Волкова', deals: 52, xp: 12500, avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=100&q=80', trend: 'up' },
  { id: 'l2', name: 'Алексей Смирнов', deals: 38, xp: 11000, avatar: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=100&q=80', trend: 'neutral' },
];

// --- MAIN APP COMPONENT ---

const App: React.FC = () => {
  // Состояния
  const [user, setUser] = useState<AppUserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Состояния интерфейса
  const [activeTab, setActiveTab] = useState<Tab>(Tab.PROFILE);
  const [quests, setQuests] = useState<DailyQuest[]>(DAILY_QUESTS);
  const [updates, setUpdates] = useState<ConstructionUpdate[]>(NEWS_UPDATES);
  const [isChessboardOpen, setIsChessboardOpen] = useState(false);

  // Состояния формы регистрации
  const [regPhone, setRegPhone] = useState('');
  const [regCity, setRegCity] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 1. Инициализация и Вход
  useEffect(() => {
    WebApp.ready();
    WebApp.expand(); // Разворачиваем на весь экран
    
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
          // Объединяем реальные данные с сервера с заглушками для красоты
          setUser({
            ...MOCK_DEFAULTS,
            id: String(serverUser.telegram_id), // Приводим к строке, т.к. в типах может быть string
            name: serverUser.first_name,
            silverCoins: serverUser.balance,
            is_registered: serverUser.is_registered,
            phone: serverUser.phone || '',
            // Остальные поля пока берем из MOCK_DEFAULTS
          });
        }
      })
      .catch(err => console.error("Auth error:", err))
      .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  // 2. Обработка регистрации
  const handleRegistration = () => {
    if(!regPhone || !regCity) return;
    setIsSubmitting(true);

    fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        initData: WebApp.initData,
        phone: regPhone, 
        city: regCity 
      }),
    })
    .then(res => res.json())
    .then(data => {
      if (data.success && user) {
        setUser({ ...user, is_registered: true, phone: regPhone });
      }
    })
    .catch(err => alert("Ошибка сохранения"))
    .finally(() => setIsSubmitting(false));
  };

  // 3. Логика приложения (Квесты, Покупки и т.д.)
  const handleClaimQuest = (id: string) => {
    const quest = quests.find(q => q.id === id);
    if (quest && !quest.isCompleted && user) {
      // Обновляем локально (в идеале - отправить запрос на сервер)
      setUser(prev => prev ? ({ 
        ...prev, 
        silverCoins: quest.rewardCurrency === CurrencyType.SILVER ? prev.silverCoins + quest.rewardAmount : prev.silverCoins,
        goldCoins: quest.rewardCurrency === CurrencyType.GOLD ? prev.goldCoins + quest.rewardAmount : prev.goldCoins,
      }) : null);
      setQuests(prev => prev.map(q => q.id === id ? { ...q, isCompleted: true } : q));
      
      // Отправка на сервер (для сохранения баланса)
      fetch('/api/click', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ initData: WebApp.initData, count: quest.rewardAmount })
      });
    }
  };

  const handlePurchase = (item: ShopItem) => {
    if (!user) return;
    const balance = item.currency === CurrencyType.SILVER ? user.silverCoins : user.goldCoins;
    if (balance >= item.price) {
      if(confirm(`Приобрести ${item.name}?`)) {
          setUser(prev => prev ? ({ 
            ...prev, 
            silverCoins: item.currency === CurrencyType.SILVER ? prev.silverCoins - item.price : prev.silverCoins,
            goldCoins: item.currency === CurrencyType.GOLD ? prev.goldCoins - item.price : prev.goldCoins,
          }) : null);
          alert("Заявка отправлена менеджеру клуба!");
      }
    }
  };

  const handleGenerateContent = (id: string) => {
    setUpdates(prev => prev.map(u => {
      if (u.id === id) {
        return { ...u, generatedText: `Текст сгенерирован для ${u.title}...` };
      }
      return u;
    }));
  };

  const renderContent = () => {
    if (!user) return null;
    switch (activeTab) {
      case Tab.PROFILE:
        return <Dashboard user={user} quests={quests} stats={PROJECT_STATS} onClaimQuest={handleClaimQuest} />;
      case Tab.CONTENT:
        return <ContentHub updates={updates} onGenerate={handleGenerateContent} />;
      case Tab.MARKET:
        return <Marketplace items={SHOP_ITEMS} silver={user.silverCoins} gold={user.goldCoins} onPurchase={handlePurchase} />;
      case Tab.LEADERBOARD:
        return <Leaderboard entries={LEADERS} />;
      default:
        return null;
    }
  };

  // --- RENDER ---

  // 1. Загрузка
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-brand-cream w-full">
        <div className="animate-pulse text-brand-gold font-bold text-xl">Загрузка Partner Club...</div>
      </div>
    );
  }

  // 2. Если не в Телеграме (или ошибка)
  if (!user) {
    return (
      <div className="flex items-center justify-center h-screen bg-brand-cream w-full p-4 text-center">
        <p>Пожалуйста, откройте приложение через Telegram</p>
      </div>
    );
  }

  // 3. ЭКРАН РЕГИСТРАЦИИ (Стилизован под твой дизайн)
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
            <label className="block text-xs font-bold uppercase text-gray-500 mb-1">Ваш телефон</label>
            <input 
              type="tel" 
              value={regPhone}
              onChange={e => setRegPhone(e.target.value)}
              placeholder="+7 (999) 000-00-00"
              className="w-full p-3 bg-brand-light rounded-xl border-none focus:ring-2 focus:ring-brand-gold outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase text-gray-500 mb-1">Ваш город</label>
            <input 
              type="text" 
              value={regCity}
              onChange={e => setRegCity(e.target.value)}
              placeholder="Москва"
              className="w-full p-3 bg-brand-light rounded-xl border-none focus:ring-2 focus:ring-brand-gold outline-none"
            />
          </div>
          
          <button 
            onClick={handleRegistration}
            disabled={isSubmitting || !regPhone || !regCity}
            className="w-full py-4 bg-brand-black text-white rounded-xl font-bold text-lg mt-4 active:scale-95 transition-transform disabled:opacity-50 disabled:scale-100"
          >
            {isSubmitting ? 'Сохранение...' : 'Вступить в клуб'}
          </button>
        </div>
      </div>
    );
  }

  // 4. ОСНОВНОЕ ПРИЛОЖЕНИЕ (Твой крутой дизайн)
  return (
    <div className="flex flex-col h-[100dvh] w-full max-w-md sm:max-w-full md:max-w-[480px] mx-auto bg-brand-cream relative shadow-2xl overflow-hidden text-brand-black">
      {/* Content Area */}
      <div className="flex-1 overflow-y-auto custom-scrollbar pb-24">
        {renderContent()}
      </div>

      {/* Navigation */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 pb-6 pt-2">
        <div className="flex justify-around items-center h-[60px] px-2 max-w-md mx-auto">
            
            <button onClick={() => setActiveTab(Tab.PROFILE)} className={`flex flex-col items-center justify-center w-14 h-full gap-1 transition-all ${activeTab === Tab.PROFILE ? 'text-brand-black' : 'text-gray-400'}`}>
              <div className={`p-1 rounded-xl transition-all ${activeTab === Tab.PROFILE ? 'bg-brand-cream' : ''}`}>
                <User size={22} strokeWidth={activeTab === Tab.PROFILE ? 2.5 : 2} />
              </div>
              <span className="text-[9px] font-bold">Профиль</span>
            </button>

            <button onClick={() => setActiveTab(Tab.CONTENT)} className={`flex flex-col items-center justify-center w-14 h-full gap-1 transition-all ${activeTab === Tab.CONTENT ? 'text-brand-black' : 'text-gray-400'}`}>
              <div className={`p-1 rounded-xl transition-all ${activeTab === Tab.CONTENT ? 'bg-brand-cream' : ''}`}>
                <Newspaper size={22} strokeWidth={activeTab === Tab.CONTENT ? 2.5 : 2} />
              </div>
              <span className="text-[9px] font-bold">Медиа</span>
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
