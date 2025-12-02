import React, { useState, useEffect } from 'react';
import WebApp from '@twa-dev/sdk';
import { User, Newspaper, ShoppingBag, Trophy, Grid3X3 } from 'lucide-react';

// Компоненты
import Dashboard from './components/Dashboard';
import ContentHub from './components/NewsFeed';
import Marketplace from './components/Shop';
import Leaderboard from './components/Leaderboard';
import ChessboardModal from './components/Chessboard';
import { UserProfile, ProjectStat } from './types';

// Заглушка статистики
const PROJECT_STATS: ProjectStat[] = [
  { id: 'p1', name: 'ЖК Бруклин', sales: 8, totalUnits: 120, color: 'bg-brand-black' },
  { id: 'p2', name: 'ЖК Бабайка', sales: 12, totalUnits: 450, color: 'bg-brand-gold' },
];

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
}

// Объединяем типы
interface AppUserProfile extends UserProfile {
  is_registered: boolean;
}

// Данные по умолчанию
const MOCK_DEFAULTS = {
  avatar: 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png',
  level: 1,
  currentXP: 0,
  nextLevelXP: 1000,
  goldCoins: 0,
  dealsClosed: 0,
  telegram: '',
  whatsapp: ''
};

const App: React.FC = () => {
  const [user, setUser] = useState<AppUserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  
  const [activeTab, setActiveTab] = useState<Tab>(Tab.PROFILE);
  const [isChessboardOpen, setIsChessboardOpen] = useState(false);

  // Для формы регистрации
  const [regPhone, setRegPhone] = useState('');
  const [regCompany, setRegCompany] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 1. Вход при запуске
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
            company: serverUser.company || '',
          });
        }
      })
      .catch(err => console.error("Auth error:", err))
      .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  // 2. Отправка регистрации
  const handleRegistration = () => {
    if(!regPhone || !regCompany) return;
    setIsSubmitting(true);

    fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        initData: WebApp.initData,
        phone: regPhone, 
        company: regCompany
      }),
    })
    .then(res => res.json())
    .then(data => {
      if (data.success && user) {
        setUser({ ...user, is_registered: true, phone: regPhone, company: regCompany });
      }
    })
    .catch(() => alert("Ошибка соединения"))
    .finally(() => setIsSubmitting(false));
  };

  if (loading) return <div className="flex items-center justify-center h-screen bg-[#F2EBDF] text-[#BA8F50]">Загрузка...</div>;
  if (!user) return <div className="flex items-center justify-center h-screen bg-[#F2EBDF] p-4">Откройте через Telegram</div>;

  // --- ЭКРАН 1: РЕГИСТРАЦИЯ (Если не зарегистрирован) ---
  if (!user.is_registered) {
    return (
      <div className="flex flex-col h-screen w-full bg-[#F2EBDF] text-[#433830] p-6 justify-center max-w-md mx-auto">
        <div className="mb-8 text-center">
          <div className="w-20 h-20 bg-[#BA8F50] rounded-full mx-auto mb-4 flex items-center justify-center shadow-lg">
            <User size={40} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold mb-2">Добро пожаловать!</h1>
          <p className="text-gray-600">Чтобы попасть в базу партнеров, заполните данные.</p>
        </div>

        <div className="space-y-4 bg-white p-6 rounded-2xl shadow-sm border border-[#E0CCAF]">
          <div>
            <label className="block text-xs font-bold uppercase text-gray-500 mb-1">Как вас зовут?</label>
            <input disabled value={user.name} className="w-full p-3 bg-gray-100 rounded-xl text-gray-500 cursor-not-allowed" />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase text-gray-500 mb-1">Компания / ИП</label>
            <input 
              type="text" 
              value={regCompany} 
              onChange={e => setRegCompany(e.target.value)} 
              placeholder="Например: АН Этажи" 
              className="w-full p-3 bg-[#EAE0D5] rounded-xl outline-none focus:ring-2 focus:ring-[#BA8F50]" 
            />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase text-gray-500 mb-1">Телефон</label>
            <input 
              type="tel" 
              value={regPhone} 
              onChange={e => setRegPhone(e.target.value)} 
              placeholder="+7 (999) 000-00-00" 
              className="w-full p-3 bg-[#EAE0D5] rounded-xl outline-none focus:ring-2 focus:ring-[#BA8F50]" 
            />
          </div>
          <button 
            onClick={handleRegistration} 
            disabled={isSubmitting || !regPhone || !regCompany} 
            className="w-full py-4 bg-[#433830] text-white rounded-xl font-bold text-lg mt-4 disabled:opacity-50"
          >
            {isSubmitting ? 'Сохраняем...' : 'Вступить в клуб'}
          </button>
        </div>
      </div>
    );
  }

  // --- ЭКРАН 2: ГЛАВНОЕ ПРИЛОЖЕНИЕ ---
  return (
    <div className="flex flex-col h-[100dvh] w-full max-w-md mx-auto bg-[#F2EBDF] relative shadow-2xl overflow-hidden text-[#433830]">
      <div className="flex-1 overflow-y-auto pb-24">
        {activeTab === Tab.PROFILE && <Dashboard user={user} stats={PROJECT_STATS} />}
        {activeTab === Tab.CONTENT && <ContentHub />}
        {activeTab === Tab.MARKET && <Marketplace userSilver={user.silverCoins} userGold={user.goldCoins} />}
        {activeTab === Tab.LEADERBOARD && <Leaderboard />}
      </div>

      {/* Меню снизу */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 pb-6 pt-2">
        <div className="flex justify-around items-center h-[60px] px-2 max-w-md mx-auto">
            <NavBtn icon={User} label="Профиль" active={activeTab === Tab.PROFILE} onClick={() => setActiveTab(Tab.PROFILE)} />
            <NavBtn icon={Newspaper} label="Новости" active={activeTab === Tab.CONTENT} onClick={() => setActiveTab(Tab.CONTENT)} />
            
            <button onClick={() => setIsChessboardOpen(true)} className="flex flex-col items-center justify-center w-14 h-full -mt-8 group relative z-10">
              <div className="w-12 h-12 bg-[#433830] text-[#BA8F50] rounded-full flex items-center justify-center shadow-lg border-4 border-white group-active:scale-95 transition-transform">
                <Grid3X3 size={22} />
              </div>
              <span className="text-[9px] font-bold text-[#433830] mt-1">Проекты</span>
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
  <button onClick={onClick} className={`flex flex-col items-center justify-center w-14 h-full gap-1 transition-all ${active ? 'text-[#433830]' : 'text-gray-400'}`}>
    <div className={`p-1 rounded-xl transition-all ${active ? 'bg-[#F2EBDF]' : ''}`}>
      <Icon size={22} strokeWidth={active ? 2.5 : 2} />
    </div>
    <span className="text-[9px] font-bold">{label}</span>
  </button>
);

export default App;
