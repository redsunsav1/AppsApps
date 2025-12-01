import React, { useEffect, useState } from 'react';
import WebApp from '@twa-dev/sdk';
import { UserProfile, DailyQuest, ConstructionUpdate, ShopItem, LeaderboardEntry, ProjectStat, CurrencyType } from './types';
import { User, Newspaper, ShoppingBag, Trophy, Grid3X3, Zap, Lock, ArrowRight } from 'lucide-react';
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

interface ServerUserData {
  id: number;
  telegram_id: string;
  first_name: string;
  username: string;
  balance: number;
}

// --- MOCK DATA ---

const INITIAL_USER_TEMPLATE: UserProfile = {
  id: 'u1',
  name: 'Неизвестный',
  avatar: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?ixlib=rb-4.0.3&auto=format&fit=crop&w=256&q=80',
  level: 1,
  currentXP: 0,
  nextLevelXP: 1000,
  silverCoins: 0,
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
    description: 'В ЖК Бруклин строители приступили к финальной стадии монолитных работ в корпусе А.',
    checklist: ['Завершен монтаж опалубки', 'Начато остекление', 'Коммуникации по графику'],
    images: ['https://images.unsplash.com/photo-1541888946425-d81bb19240f5?auto=format&fit=crop&w=800&q=80'],
    date: '2 часа назад', 
    progress: 65 
  },
  { 
    id: 'n2', 
    title: 'Старт продаж паркинга', 
    projectName: 'ЖК Харизма',
    description: 'Открыто бронирование машиномест в подземном паркинге.', 
    checklist: ['Всего мест: 140', 'Цена от 800 000 руб'],
    images: ['https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=800&q=80'],
    date: 'Вчера', 
    progress: 20 
  },
];

const SHOP_ITEMS: ShopItem[] = [
  { id: 's1', name: 'Брендированный Худи', category: 'MERCH', price: 5000, currency: CurrencyType.SILVER, image: '🧥', inStock: true },
  { id: 's2', name: 'Сертификат OZON 3000₽', category: 'EXPERIENCE', price: 15000, currency: CurrencyType.SILVER, image: '💳', inStock: true },
  { id: 's4', name: 'Apple AirPods Pro 2', category: 'TECH', price: 20, currency: CurrencyType.GOLD, image: '🎧', inStock: true },
  { id: 's6', name: 'iPhone 16 Pro Max', category: 'TECH', price: 120, currency: CurrencyType.GOLD, image: '📱', inStock: true },
];

const LEADERS: LeaderboardEntry[] = [
  { id: 'l1', name: 'Елена Волкова', deals: 52, xp: 12500, avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=100&q=80', trend: 'up' },
  { id: 'l2', name: 'Алексей Смирнов', deals: 38, xp: 11000, avatar: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=100&q=80', trend: 'neutral' },
];

// --- ОСНОВНОЙ КОМПОНЕНТ ---

const App: React.FC = () => {
  // Состояния авторизации
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loginInput, setLoginInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [loginError, setLoginError] = useState('');

  // Состояния приложения
  const [activeTab, setActiveTab] = useState<Tab>(Tab.PROFILE);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [quests, setQuests] = useState<DailyQuest[]>(DAILY_QUESTS);
  const [updates, setUpdates] = useState<ConstructionUpdate[]>(NEWS_UPDATES);
  const [isChessboardOpen, setIsChessboardOpen] = useState(false);

  // --- ЛОГИКА ВХОДА ---
  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (loginInput === 'test1' && passwordInput === 'test11') {
      setIsAuthenticated(true);
      // Устанавливаем данные пользователя на основе логина
      setUser({
        ...INITIAL_USER_TEMPLATE,
        id: '999',
        name: 'Тестовый Агент',
        telegram: '@' + loginInput, // Покажет @test1
        silverCoins: 5000, // Стартовый капитал
        goldCoins: 10
      });
    } else {
      setLoginError('Неверный логин или пароль');
    }
  };

  // Попытка фоновой авторизации через Telegram (если открыто в ТГ)
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
      .then(res => res.json())
      .then(data => {
        if (data.user) {
            // Если ТГ данные есть - можно сразу пускать (или ждать ручного ввода)
            // Здесь мы просто сохраняем данные, но ждем ручного ввода пароля, как ты просил
            console.log("Telegram connected:", data.user);
        }
      })
      .catch(console.error);
    }
  }, []);

  // --- ФУНКЦИИ ИНТЕРФЕЙСА ---

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
     setUpdates(prev => prev.map(u => u.id === id ? { ...u, generatedText: `Готовый пост для ${u.title}...` } : u));
  };

  const handlePurchase = (item: ShopItem) => {
    if (!user) return;
    const balance = item.currency === CurrencyType.SILVER ? user.silverCoins : user.goldCoins;
    if (balance >= item.price) {
      if(confirm(`Купить ${item.name}?`)) {
          setUser(prev => prev ? ({ 
            ...prev, 
            silverCoins: item.currency === CurrencyType.SILVER ? prev.silverCoins - item.price : prev.silverCoins,
            goldCoins: item.currency === CurrencyType.GOLD ? prev.goldCoins - item.price : prev.goldCoins,
          }) : null);
          alert("Куплено!");
      }
    }
  };

  const renderContent = () => {
    if (!user) return null;
    switch (activeTab) {
      case Tab.PROFILE:
        return (
          <div className="flex flex-col gap-4">
            <Dashboard user={user} quests={quests} stats={PROJECT_STATS} onClaimQuest={handleClaimQuest} />
            {/* ТЕХНИЧЕСКАЯ ПАНЕЛЬ С ДАННЫМИ ЛОГИНА */}
            <div className="mx-4 p-4 bg-gray-800 rounded-xl text-white text-xs font-mono shadow-lg border border-gray-600">
              <h3 className="text-brand-gold font-bold mb-2 flex items-center gap-2">
                <Zap size={14} /> ТЕКУЩАЯ СЕССИЯ
              </h3>
              <div className="space-y-1">
                <p><span className="text-gray-400">Статус:</span> Авторизован</p>
                <p><span className="text-gray-400">Логин:</span> {loginInput || user.telegram}</p>
                <p><span className="text-gray-400">Имя:</span> {user.name}</p>
                <p><span className="text-gray-400">Баланс:</span> {user.silverCoins}</p>
              </div>
            </div>
          </div>
        );
      case Tab.CONTENT: return <ContentHub updates={updates} onGenerate={handleGenerateContent} />;
      case Tab.MARKET: return <Marketplace items={SHOP_ITEMS} silver={user.silverCoins} gold={user.goldCoins} onPurchase={handlePurchase} />;
      case Tab.LEADERBOARD: return <Leaderboard entries={LEADERS} />;
      default: return null;
    }
  };

  // --- ОТРИСОВКА: ЭКРАН ВХОДА ИЛИ ПРИЛОЖЕНИЕ ---

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center h-[100dvh] w-full bg-brand-cream text-brand-black p-6">
        <div className="w-full max-w-xs bg-white p-8 rounded-2xl shadow-xl border border-gray-200">
          <div className="flex justify-center mb-6 text-brand-black">
             <div className="bg-brand-black text-white p-3 rounded-full">
               <Lock size={32} />
             </div>
          </div>
          <h2 className="text-2xl font-bold text-center mb-6">Partner App</h2>
          
          <form onSubmit={handleLogin} className="flex flex-col gap-4">
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase ml-1">Логин</label>
              <input 
                type="text" 
                value={loginInput}
                onChange={(e) => setLoginInput(e.target.value)}
                placeholder="test1"
                className="w-full p-3 rounded-xl bg-gray-50 border border-gray-200 focus:outline-none focus:border-brand-black transition-colors"
              />
            </div>
            
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase ml-1">Пароль</label>
              <input 
                type="password" 
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                placeholder="••••••"
                className="w-full p-3 rounded-xl bg-gray-50 border border-gray-200 focus:outline-none focus:border-brand-black transition-colors"
              />
            </div>

            {loginError && (
              <p className="text-red-500 text-sm text-center font-medium">{loginError}</p>
            )}

            <button 
              type="submit"
              className="mt-2 w-full bg-brand-black text-white font-bold py-3.5 rounded-xl active:scale-95 transition-transform flex items-center justify-center gap-2"
            >
              Войти <ArrowRight size={18} />
            </button>
          </form>
          
          <div className="mt-8 text-center">
             <p className="text-xs text-gray-400">Тестовый доступ</p>
          </div>
        </div>
      </div>
    );
  }

  // ЕСЛИ АВТОРИЗОВАН — ПОКАЗЫВАЕМ ОСНОВНОЙ ИНТЕРФЕЙС
  return (
    <div className="flex flex-col h-[100dvh] w-full max-w-md sm:max-w-full md:max-w-[480px] mx-auto bg-brand-cream relative shadow-2xl overflow-hidden text-brand-black">
      <div className="flex-1 overflow-y-auto custom-scrollbar pb-24">
        {renderContent()}
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 pb-6 pt-2">
        <div className="flex justify-around items-center h-[60px] px-2 max-w-md mx-auto">
            <button onClick={() => setActiveTab(Tab.PROFILE)} className={`flex flex-col items-center justify-center w-14 h-full gap-1 ${activeTab === Tab.PROFILE ? 'text-brand-black' : 'text-gray-400'}`}>
              <div className={`p-1 rounded-xl ${activeTab === Tab.PROFILE ? 'bg-brand-cream' : ''}`}><User size={22} strokeWidth={activeTab === Tab.PROFILE ? 2.5 : 2} /></div>
              <span className="text-[9px] font-bold">Профиль</span>
            </button>
            <button onClick={() => setActiveTab(Tab.CONTENT)} className={`flex flex-col items-center justify-center w-14 h-full gap-1 ${activeTab === Tab.CONTENT ? 'text-brand-black' : 'text-gray-400'}`}>
              <div className={`p-1 rounded-xl ${activeTab === Tab.CONTENT ? 'bg-brand-cream' : ''}`}><Newspaper size={22} strokeWidth={activeTab === Tab.CONTENT ? 2.5 : 2} /></div>
              <span className="text-[9px] font-bold">Медиа</span>
            </button>
            <button onClick={() => setIsChessboardOpen(true)} className="flex flex-col items-center justify-center w-14 h-full -mt-8 group relative z-10">
              <div className="w-12 h-12 bg-brand-black text-brand-gold rounded-full flex items-center justify-center shadow-lg border-4 border-white group-active:scale-95 transition-transform"><Grid3X3 size={22} /></div>
              <span className="text-[9px] font-bold text-brand-black mt-1">Проекты</span>
            </button>
            <button onClick={() => setActiveTab(Tab.MARKET)} className={`flex flex-col items-center justify-center w-14 h-full gap-1 ${activeTab === Tab.MARKET ? 'text-brand-black' : 'text-gray-400'}`}>
              <div className={`p-1 rounded-xl ${activeTab === Tab.MARKET ? 'bg-brand-cream' : ''}`}><ShoppingBag size={22} strokeWidth={activeTab === Tab.MARKET ? 2.5 : 2} /></div>
              <span className="text-[9px] font-bold">Маркет</span>
            </button>
            <button onClick={() => setActiveTab(Tab.LEADERBOARD)} className={`flex flex-col items-center justify-center w-14 h-full gap-1 ${activeTab === Tab.LEADERBOARD ? 'text-brand-black' : 'text-gray-400'}`}>
              <div className={`p-1 rounded-xl ${activeTab === Tab.LEADERBOARD ? 'bg-brand-cream' : ''}`}><Trophy size={22} strokeWidth={activeTab === Tab.LEADERBOARD ? 2.5 : 2} /></div>
              <span className="text-[9px] font-bold">Топ</span>
            </button>
        </div>
      </div>
      {isChessboardOpen && <ChessboardModal onClose={() => setIsChessboardOpen(false)} />}
    </div>
  );
};

export default App;
