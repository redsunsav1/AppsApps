import React, { useEffect, useState } from 'react';
import WebApp from '@twa-dev/sdk';
import { UserProfile, DailyQuest, ConstructionUpdate, ShopItem, LeaderboardEntry, ProjectStat, CurrencyType } from './types';
import { User, Newspaper, ShoppingBag, Trophy, Grid3X3, Zap } from 'lucide-react';
import Dashboard from './components/Dashboard';
import ContentHub from './components/NewsFeed';
import Marketplace from './components/Shop';
import Leaderboard from './components/Leaderboard';
import ChessboardModal from './components/Chessboard';

// --- ТИПЫ ДАННЫХ ---

enum Tab {
  PROFILE = 'PROFILE',
  CONTENT = 'CONTENT',
  MARKET = 'MARKET',
  LEADERBOARD = 'LEADERBOARD',
}

// Тип данных, которые придут от нашего сервера (Бэкенд)
interface ServerUserData {
  id: number;
  telegram_id: string;
  first_name: string;
  username: string;
  balance: number;
}

// --- MOCK DATA (ДАННЫЕ ДЛЯ ИНТЕРФЕЙСА) ---

const INITIAL_USER_TEMPLATE: UserProfile = {
  id: 'u1',
  name: 'Гость', // Будет заменено на реальное имя
  avatar: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?ixlib=rb-4.0.3&auto=format&fit=crop&w=256&q=80',
  level: 1,
  currentXP: 0,
  nextLevelXP: 1000,
  silverCoins: 0, // Будет заменено на баланс из базы
  goldCoins: 0,
  dealsClosed: 0,
  phone: '',
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
    id: 'n1', 
    title: 'Заливка 20 этажа', 
    projectName: 'ЖК Бруклин',
    description: 'В ЖК Бруклин строители приступили к финальной стадии монолитных работ в корпусе А. Успейте предложить клиентам видовые квартиры на верхних этажах.',
    checklist: [
      'Завершен монтаж опалубки 19 этажа',
      'Начато остекление 5-10 этажей',
      'Прокладка коммуникаций идет по графику',
      'Ожидаемое повышение цен: +5% с 1 октября'
    ],
    images: [
        'https://images.unsplash.com/photo-1541888946425-d81bb19240f5?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1590649807327-6315d3af152d?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=800&q=80'
    ],
    date: '2 часа назад', 
    progress: 65 
  },
  { 
    id: 'n2', 
    title: 'Старт продаж паркинга', 
    projectName: 'ЖК Харизма',
    description: 'Открыто бронирование машиномест в подземном паркинге. Теплый паркинг с лифтом сразу на этаж.', 
    checklist: [
      'Всего мест: 140',
      'Цена от 800 000 руб',
      'Есть семейные места (на 2 авто)',
      'Рассрочка 0% на 12 месяцев'
    ],
    images: [
        'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1506521781263-d8422e82f27a?auto=format&fit=crop&w=800&q=80'
    ],
    date: 'Вчера', 
    progress: 20 
  },
];

const SHOP_ITEMS: ShopItem[] = [
  { id: 's1', name: 'Брендированный Худи', category: 'MERCH', price: 5000, currency: CurrencyType.SILVER, image: '🧥', inStock: true },
  { id: 's2', name: 'Сертификат OZON 3000₽', category: 'EXPERIENCE', price: 15000, currency: CurrencyType.SILVER, image: '💳', inStock: true },
  { id: 's3', name: 'Ужин в ресторане', category: 'EXPERIENCE', price: 30000, currency: CurrencyType.SILVER, image: '🥂', inStock: true },
  { id: 's4', name: 'Apple AirPods Pro 2', category: 'TECH', price: 20, currency: CurrencyType.GOLD, image: '🎧', inStock: true },
  { id: 's5', name: 'Apple Watch Ultra 2', category: 'TECH', price: 60, currency: CurrencyType.GOLD, image: '⌚️', inStock: true },
  { id: 's6', name: 'iPhone 16 Pro Max', category: 'TECH', price: 120, currency: CurrencyType.GOLD, image: '📱', inStock: true },
  { id: 's7', name: 'MacBook Pro 14 M3', category: 'TECH', price: 200, currency: CurrencyType.GOLD, image: '💻', inStock: true },
  { id: 's8', name: 'Rolex Submariner', category: 'LUXURY', price: 1500, currency: CurrencyType.GOLD, image: '🕰️', inStock: false },
];

const LEADERS: LeaderboardEntry[] = [
  { id: 'l1', name: 'Елена Волкова', deals: 52, xp: 12500, avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=100&q=80', trend: 'up' },
  { id: 'l2', name: 'Алексей Смирнов', deals: 38, xp: 11000, avatar: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=100&q=80', trend: 'neutral' },
  { id: 'l3', name: 'Игорь Петров', deals: 22, xp: 9800, avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=100&q=80', trend: 'down' },
  { id: 'l4', name: 'Мария Попова', deals: 8, xp: 6000, avatar: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&w=100&q=80', trend: 'up' },
];

// --- ОСНОВНОЙ КОМПОНЕНТ ---

const App: React.FC = () => {
  // Состояния для Логики (Авторизация)
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Состояния для Интерфейса
  const [activeTab, setActiveTab] = useState<Tab>(Tab.PROFILE);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [quests, setQuests] = useState<DailyQuest[]>(DAILY_QUESTS);
  const [updates, setUpdates] = useState<ConstructionUpdate[]>(NEWS_UPDATES);
  const [isChessboardOpen, setIsChessboardOpen] = useState(false);

  // --- ЭФФЕКТ: АВТОРИЗАЦИЯ ПРИ ЗАПУСКЕ ---
  useEffect(() => {
    WebApp.ready();
    WebApp.expand(); // Разворачиваем приложение на весь экран

    const initData = WebApp.initData;

    if (initData) {
      // Отправляем запрос на регистрацию/вход
      fetch('/api/auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ initData }),
      })
        .then((res) => {
          if (!res.ok) throw new Error('Ошибка сети');
          return res.json();
        })
        .then((data: { user: ServerUserData }) => {
          if (data.user) {
            // ОБЪЕДИНЯЕМ: Данные с сервера + Структура для красивого UI
            const mergedUser: UserProfile = {
                ...INITIAL_USER_TEMPLATE,
                id: data.user.id.toString(),
                name: data.user.first_name,
                telegram: '@' + data.user.username,
                silverCoins: data.user.balance, // Баланс из базы = Серебро в игре
            };
            setUser(mergedUser);
          } else {
            setError('Не удалось получить данные пользователя');
          }
        })
        .catch((err) => {
          console.error(err);
          setError('Ошибка соединения с сервером');
        })
        .finally(() => setLoading(false));
    } else {
      // Если тестируем в браузере (не в Телеграм), используем тестового пользователя
      // setError('Приложение запущено не в Telegram');
      // setLoading(false);
      
      // РАСКОММЕНТИРУЙ СТРОКИ НИЖЕ ДЛЯ ТЕСТА В БРАУЗЕРЕ БЕЗ TELEGRAM:
       setUser(INITIAL_USER_TEMPLATE); 
       setLoading(false);
    }
  }, []);

  // --- ЛОГИКА ИНТЕРФЕЙСА (XP, Квесты, Покупки) ---

  const addXP = (amount: number) => {
    if (!user) return;
    setUser(prev => {
      if (!prev) return null;
      const newXP = prev.currentXP + amount;
      if (newXP >= prev.nextLevelXP) {
        return {
          ...prev,
          level: prev.level + 1,
          currentXP: newXP - prev.nextLevelXP,
          nextLevelXP: Math.floor(prev.nextLevelXP * 1.2),
          silverCoins: prev.silverCoins + 1000
        };
      }
      return { ...prev, currentXP: newXP };
    });
  };

  const handleClaimQuest = (id: string) => {
    const quest = quests.find(q => q.id === id);
    if (quest && !quest.isCompleted && user) {
      setUser(prev => {
         if (!prev) return null;
         return { 
            ...prev, 
            silverCoins: quest.rewardCurrency === CurrencyType.SILVER ? prev.silverCoins + quest.rewardAmount : prev.silverCoins,
            goldCoins: quest.rewardCurrency === CurrencyType.GOLD ? prev.goldCoins + quest.rewardAmount : prev.goldCoins,
         }
      });
      addXP(quest.rewardXP);
      setQuests(prev => prev.map(q => q.id === id ? { ...q, isCompleted: true } : q));
    }
  };

  const handleGenerateContent = (id: string) => {
    setUpdates(prev => prev.map(u => {
      if (u.id === id) {
        return {
          ...u,
          generatedText: `🔥 **${u.title} в ${u.projectName}**\n\n${u.description}\n\n⚡️ Факты:\n${u.checklist.map(c => `• ${c}`).join('\n')}\n\n📞 Звоните для брони: +7 (999) 000-00-00`
        };
      }
      return u;
    }));
    
    const shareQuest = quests.find(q => q.type === 'SHARE' && !q.isCompleted);
    if (shareQuest) {
        handleClaimQuest(shareQuest.id);
    }
  };

  const handlePurchase = (item: ShopItem) => {
    if (!user) return;
    const balance = item.currency === CurrencyType.SILVER ? user.silverCoins : user.goldCoins;
    if (balance >= item.price) {
      if(confirm(`Приобрести ${item.name}?`)) {
          setUser(prev => {
            if (!prev) return null;
            return { 
                ...prev, 
                silverCoins: item.currency === CurrencyType.SILVER ? prev.silverCoins - item.price : prev.silverCoins,
                goldCoins: item.currency === CurrencyType.GOLD ? prev.goldCoins - item.price : prev.goldCoins,
            }
          });
          alert("Заявка отправлена менеджеру клуба!");
      }
    }
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

  // --- ОТРИСОВКА (RENDER) ---

  // 1. Экран загрузки
  if (loading) {
      return (
          <div className="flex items-center justify-center h-screen bg-brand-cream text-brand-black">
              <p className="text-xl font-bold animate-pulse">Загрузка...</p>
          </div>
      );
  }

  // 2. Экран ошибки
  if (error) {
      return (
          <div className="flex flex-col items-center justify-center h-screen bg-brand-cream text-brand-black p-4 text-center">
              <p className="text-red-500 font-bold mb-2">Ошибка</p>
              <p>{error}</p>
          </div>
      );
  }

  // 3. Основной красивый интерфейс (если есть User)
  return (
    <div className="flex flex-col h-[100dvh] w-full max-w-md sm:max-w-full md:max-w-[480px] mx-auto bg-brand-cream relative shadow-2xl overflow-hidden text-brand-black">
      {/* Content Area */}
      <div className="flex-1 overflow-y-auto custom-scrollbar pb-24">
        {renderContent()}
      </div>

      {/* Modern Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 pb-6 pt-2">
        <div className="flex justify-around items-center h-[60px] px-2 max-w-md mx-auto">
            
            <button
              onClick={() => setActiveTab(Tab.PROFILE)}
              className={`flex flex-col items-center justify-center w-14 h-full gap-1 transition-all ${activeTab === Tab.PROFILE ? 'text-brand-black' : 'text-gray-400'}`}
            >
              <div className={`p-1 rounded-xl transition-all ${activeTab === Tab.PROFILE ? 'bg-brand-cream' : ''}`}>
                <User size={22} strokeWidth={activeTab === Tab.PROFILE ? 2.5 : 2} />
              </div>
              <span className="text-[9px] font-bold">Профиль</span>
            </button>

            <button
              onClick={() => setActiveTab(Tab.CONTENT)}
              className={`flex flex-col items-center justify-center w-14 h-full gap-1 transition-all ${activeTab === Tab.CONTENT ? 'text-brand-black' : 'text-gray-400'}`}
            >
              <div className={`p-1 rounded-xl transition-all ${activeTab === Tab.CONTENT ? 'bg-brand-cream' : ''}`}>
                <Newspaper size={22} strokeWidth={activeTab === Tab.CONTENT ? 2.5 : 2} />
              </div>
              <span className="text-[9px] font-bold">Медиа</span>
            </button>
            
            {/* Central Action Button */}
            <button
              onClick={() => setIsChessboardOpen(true)}
              className="flex flex-col items-center justify-center w-14 h-full -mt-8 group relative z-10"
            >
              <div className="w-12 h-12 bg-brand-black text-brand-gold rounded-full flex items-center justify-center shadow-lg border-4 border-white group-active:scale-95 transition-transform">
                <Grid3X3 size={22} />
              </div>
              <span className="text-[9px] font-bold text-brand-black mt-1">Проекты</span>
            </button>

            <button
              onClick={() => setActiveTab(Tab.MARKET)}
              className={`flex flex-col items-center justify-center w-14 h-full gap-1 transition-all ${activeTab === Tab.MARKET ? 'text-brand-black' : 'text-gray-400'}`}
            >
              <div className={`p-1 rounded-xl transition-all ${activeTab === Tab.MARKET ? 'bg-brand-cream' : ''}`}>
                <ShoppingBag size={22} strokeWidth={activeTab === Tab.MARKET ? 2.5 : 2} />
              </div>
              <span className="text-[9px] font-bold">Маркет</span>
            </button>

            <button
              onClick={() => setActiveTab(Tab.LEADERBOARD)}
              className={`flex flex-col items-center justify-center w-14 h-full gap-1 transition-all ${activeTab === Tab.LEADERBOARD ? 'text-brand-black' : 'text-gray-400'}`}
            >
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
