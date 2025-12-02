import React, { useState, useEffect } from 'react';
import WebApp from '@twa-dev/sdk';
import { User, Newspaper, ShoppingBag, Trophy, Grid3X3 } from 'lucide-react';

// Компоненты
import Dashboard from './components/Dashboard';
import ContentHub from './components/NewsFeed';
import Marketplace from './components/Shop';
import Leaderboard from './components/Leaderboard';
import ChessboardModal from './components/Chessboard';
import { AdminPanel } from './components/AdminPanel'; // <-- НОВОЕ: Импорт админки

import { UserProfile, DailyQuest, ProjectStat, CurrencyType } from './types';

// Типы
enum Tab {
  PROFILE = 'PROFILE',
  CONTENT = 'CONTENT',
  MARKET = 'MARKET',
  LEADERBOARD = 'LEADERBOARD',
}

interface ServerUser {
  id: number;
  telegram_id: string;
  first_name: string;
  username: string;
  balance: number;
  is_registered: boolean;
  phone?: string;
  company?: string;
  is_admin?: boolean; // <-- НОВОЕ: Флаг админа
}

interface AppUserProfile extends UserProfile {
  is_registered: boolean;
  is_admin: boolean; // <-- НОВОЕ
}

// ... (ТВОИ ЗАГЛУШКИ MOCK_DEFAULTS, PROJECT_STATS, DAILY_QUESTS ОСТАВЛЯЕМ КАК БЫЛИ) ...
const MOCK_DEFAULTS = {
  avatar: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?ixlib=rb-4.0.3&auto=format&fit=crop&w=256&q=80',
  level: 1, currentXP: 0, nextLevelXP: 1000, goldCoins: 0, dealsClosed: 0, telegram: '', whatsapp: ''
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

const App: React.FC = () => {
  const [user, setUser] = useState<AppUserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  
  const [activeTab, setActiveTab] = useState<Tab>(Tab.PROFILE);
  const [quests, setQuests] = useState<DailyQuest[]>(DAILY_QUESTS);
  const [isChessboardOpen, setIsChessboardOpen] = useState(false);
  
  // --- НОВОЕ: Состояние для новостей ---
  const [news, setNews] = useState<any[]>([]); 

  // --- Форма регистрации ---
  const [regName, setRegName] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regCompany, setRegCompany] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Функция загрузки новостей
  const fetchNews = () => {
    fetch('/api/news')
      .then(res => res.json())
      .then(data => setNews(data))
      .catch(console.error);
  };

  // 1. Вход + Загрузка новостей
  useEffect(() => {
    WebApp.ready();
    WebApp.expand();
    
    // Сразу грузим новости
    fetchNews();

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
            company: serverUser.company || '',
            is_admin: serverUser.is_admin || false, // <-- Сохраняем админа
          });
          if (serverUser.first_name) setRegName(serverUser.first_name);
        }
      })
      .catch(err => console.error("Auth error:", err))
      .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const handleRegistration = () => {
    if(!regPhone || !regCompany || !regName) return;
    setIsSubmitting(true);

    fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        initData: WebApp.initData,
        phone: regPhone, company: regCompany, name: regName 
      }),
    })
    .then(res => res.json())
    .then(data => {
      if (data.success && user) {
        setUser({ 
            ...user, is_registered: true, phone: regPhone, company: regCompany, name: regName 
        });
      }
    })
    .catch(err => alert("Ошибка сохранения"))
    .finally(() => setIsSubmitting(false));
  };

  const onClaimQuest = (id: string) => { console.log("Claim", id); };

  if (loading) return <div className="flex items-center justify-center h-screen bg-brand-cream w-full">Загрузка...</div>;
  if (!user) return <div className="flex items-center justify-center h-screen bg-brand-cream p-4">Open in Telegram</div>;

  // --- ЭКРАН РЕГИСТРАЦИИ (Твой) ---
  if (!user.is_registered) {
    return (
      <div className="flex flex-col h-screen w-full bg-brand-cream text-brand-black p-6 justify-center max-w-md mx-auto">
        {/* ... (ВЕСЬ ТВОЙ КОД ВЕРСТКИ РЕГИСТРАЦИИ ОСТАЕТСЯ ЗДЕСЬ БЕЗ ИЗМЕНЕНИЙ) ... */}
        <div className="mb-8 text-center">
          <div className="w-20 h-20 bg-brand-gold rounded-full mx-auto mb-4 flex items-center justify-center shadow-lg"><User size={40} className="text-white" /></div>
          <h1 className="text-2xl font-bold mb-2">Добро пожаловать!</h1>
          <p className="text-gray-600">Заполните анкету для входа в клуб партнеров.</p>
        </div>
        <div className="space-y-4 bg-white p-6 rounded-2xl shadow-sm border border-brand-beige">
          <div><label className="block text-xs font-bold uppercase text-gray-500 mb-1">Имя и Фамилия</label><input type="text" value={regName} onChange={e => setRegName(e.target.value)} placeholder="Иван Иванов" className="w-full p-3 bg-brand-light rounded-xl border-none focus:ring-2 focus:ring-brand-gold outline-none"/></div>
          <div><label className="block text-xs font-bold uppercase text-gray-500 mb-1">Компания / ИП</label><input type="text" value={regCompany} onChange={e => setRegCompany(e.target.value)} placeholder="Например: АН Этажи" className="w-full p-3 bg-brand-light rounded-xl border-none focus:ring-2 focus:ring-brand-gold outline-none"/></div>
          <div><label className="block text-xs font-bold uppercase text-gray-500 mb-1">Ваш телефон</label><input type="tel" value={regPhone} onChange={e => setRegPhone(e.target.value)} placeholder="+7 (999) 000-00-00" className="w-full p-3 bg-brand-light rounded-xl border-none focus:ring-2 focus:ring-brand-gold outline-none"/></div>
          <button onClick={handleRegistration} disabled={isSubmitting || !regPhone || !regCompany || !regName} className="w-full py-4 bg-brand-black text-white rounded-xl font-bold text-lg mt-4 active:scale-95 transition-transform disabled:opacity-50 disabled:scale-100">{isSubmitting ? 'Сохранение...' : 'Вступить в клуб'}</button>
        </div>
      </div>
    );
  }

  // --- ОСНОВНОЕ ПРИЛОЖЕНИЕ ---
  return (
    <div className="flex flex-col h-[100dvh] w-full max-w-md mx-auto bg-brand-cream relative shadow-2xl overflow-hidden text-brand-black">
      <div className="flex-1 overflow-y-auto custom-scrollbar pb-24">
        {activeTab === Tab.PROFILE && <Dashboard user={user} quests={quests} stats={PROJECT_STATS} onClaimQuest={onClaimQuest} />}
        
        {/* 👇 Передаем новости в твой компонент ContentHub (Важно: тебе нужно обновить сам ContentHub, чтобы он принимал проп 'news') */}
        {activeTab === Tab.CONTENT && <ContentHub news={news} />}
        
        {activeTab === Tab.MARKET && <Marketplace userSilver={user.silverCoins} userGold={user.goldCoins} />}
        {activeTab === Tab.LEADERBOARD && <Leaderboard />}
      </div>

      {/* АДМИНКА: Появляется поверх всего, если ты админ */}
      {user.is_admin && <AdminPanel onNewsAdded={fetchNews} />}

      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 pb-6 pt-2">
        <div className="flex justify-around items-center h-[60px] px-2 max-w-md mx-auto">
            <NavBtn icon={User} label="Профиль" active={activeTab === Tab.PROFILE} onClick={() => setActiveTab(Tab.PROFILE)} />
            <NavBtn icon={Newspaper} label="Новости" active={activeTab === Tab.CONTENT} onClick={() => setActiveTab(Tab.CONTENT)} />
            <button onClick={() => setIsChessboardOpen(true)} className="flex flex-col items-center justify-center w-14 h-full -mt-8 group relative z-10">
              <div className="w-12 h-12 bg-brand-black text-brand-gold rounded-full flex items-center justify-center shadow-lg border-4 border-white group-active:scale-95 transition-transform"><Grid3X3 size={22} /></div>
              <span className="text-[9px] font-bold text-brand-black mt-1">Проекты</span>
            </button>
            <NavBtn icon={ShoppingBag} label="Маркет" active={activeTab === Tab.MARKET} onClick={() => setActiveTab(Tab.MARKET)} />
            <NavBtn icon={Trophy} label="Топ" active={activeTab === Tab.LEADERBOARD} onClick={() => setActiveTab(Tab.LEADERBOARD)} />
        </div>
      </div>

      {isChessboardOpen && <ChessboardModal onClose={() => setIsChessboardOpen(false)} />}
    </div>
  );
};

const NavBtn = ({ icon: Icon, label, active, onClick }: any) => (
  <button onClick={onClick} className={`flex flex-col items-center justify-center w-14 h-full gap-1 transition-all ${active ? 'text-brand-black' : 'text-gray-400'}`}>
    <div className={`p-1 rounded-xl transition-all ${active ? 'bg-brand-cream' : ''}`}><Icon size={22} strokeWidth={active ? 2.5 : 2} /></div>
    <span className="text-[9px] font-bold">{label}</span>
  </button>
);

export default App;
