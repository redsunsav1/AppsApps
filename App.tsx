import React, { useState, useEffect } from 'react';
import WebApp from '@twa-dev/sdk';
import { User, Newspaper, ShoppingBag, Trophy, Grid3X3 } from 'lucide-react';

// Компоненты (твои существующие)
import Dashboard from './components/Dashboard';
import ContentHub from './components/NewsFeed';
import Marketplace from './components/Shop';
import Leaderboard from './components/Leaderboard';
import ChessboardModal from './components/Chessboard';
import { AdminPanel } from './components/AdminPanel';
import { UserProfile, DailyQuest, ProjectStat, CurrencyType } from './types';

// --- ЗАГЛУШКИ (Чтобы фронт не падал без данных) ---
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

enum Tab { PROFILE = 'PROFILE', CONTENT = 'CONTENT', MARKET = 'MARKET', LEADERBOARD = 'LEADERBOARD' }

const App: React.FC = () => {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  // 🔥 СПЕЦИАЛЬНОЕ ПОЛЕ ДЛЯ ОШИБКИ
  const [debugError, setDebugError] = useState<string>('');

  const [activeTab, setActiveTab] = useState<Tab>(Tab.PROFILE);
  const [quests, setQuests] = useState<DailyQuest[]>(DAILY_QUESTS);
  const [isChessboardOpen, setIsChessboardOpen] = useState(false);
  const [news, setNews] = useState<any[]>([]); 
  const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [regName, setRegName] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regCompany, setRegCompany] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchNews = () => {
    fetch('/api/news')
      .then(res => res.json())
      .then(data => setNews(data))
      .catch(e => console.log('News error (не критично)'));
  };

  useEffect(() => {
    // 1. Пытаемся инициализировать Telegram
    try {
        WebApp.ready();
        WebApp.expand();
    } catch (e) {
        console.log("Not in telegram");
    }
    
    fetchNews();

    const initData = WebApp.initData;
    
    // 2. Если данные есть - стучимся на сервер
    if (initData) {
      fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData }),
      })
      .then(async (res) => {
        // ЕСЛИ СЕРВЕР ОТВЕТИЛ ОШИБКОЙ (500, 502, 404)
        if (!res.ok) {
            const text = await res.text();
            throw new Error(`Server Error ${res.status}: ${text.slice(0, 100)}`);
        }
        return res.json();
      })
      .then((data) => {
        if (data.user) {
          const sUser = data.user;
          setUser({
            ...MOCK_DEFAULTS,
            id: String(sUser.telegram_id),
            name: sUser.first_name, 
            silverCoins: sUser.balance,
            is_registered: sUser.is_registered,
            phone: sUser.phone,
            company: sUser.company,
            is_admin: sUser.is_admin,
          });
          if (sUser.first_name) setRegName(sUser.first_name);
        } else {
            throw new Error("Сервер не вернул пользователя (data.user is missing)");
        }
      })
      .catch(err => {
          // 🔥 ЛОВИМ ОШИБКУ И ПОКАЗЫВАЕМ ЕЁ
          console.error(err);
          setDebugError(err.message || "Неизвестная ошибка соединения");
      })
      .finally(() => setLoading(false));
    } else {
      setLoading(false);
      // Если мы не в телеграм - это не ошибка, просто показываем заглушку
    }
  }, []);

  const handleRegistration = () => {
    if(!regPhone || !regCompany || !regName) return;
    setIsSubmitting(true);
    fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData: WebApp.initData, phone: regPhone, company: regCompany, name: regName }),
    })
    .then(res => res.json())
    .then(data => {
      if (data.success && user) {
        setUser({ ...user, is_registered: true, phone: regPhone, company: regCompany, name: regName });
      }
    })
    .catch(err => alert("Ошибка сохранения"))
    .finally(() => setIsSubmitting(false));
  };

  const handleOpenCreate = () => { setEditingItem(null); setIsAdminModalOpen(true); };
  const handleOpenEdit = (item: any) => { setEditingItem(item); setIsAdminModalOpen(true); };
  const onClaimQuest = () => {};

  // --- ЭКРАН С ОШИБКОЙ (Вместо Open in Telegram) ---
  if (debugError) {
      return (
          <div className="flex flex-col items-center justify-center h-screen bg-white p-6 text-center">
              <div className="text-red-500 font-bold text-xl mb-4">ОШИБКА ЗАПУСКА</div>
              <div className="bg-gray-100 p-4 rounded text-xs font-mono text-left w-full mb-4 break-all text-black">
                  {debugError}
              </div>
              <p className="text-gray-500 mb-4">Сделайте скриншот и отправьте разработчику.</p>
              <button onClick={() => window.location.reload()} className="bg-blue-500 text-white py-3 px-6 rounded-xl">Попробовать снова</button>
          </div>
      );
  }

  if (loading) return <div className="flex items-center justify-center h-screen bg-brand-cream w-full text-black">Загрузка...</div>;
  
  // Если нет юзера и нет ошибки - значит мы реально не в телеграм
  if (!user) return (
      <div className="flex items-center justify-center h-screen bg-brand-cream p-4 text-black text-center">
          <p>Откройте это приложение внутри Telegram.</p>
          <p className="text-xs text-gray-400 mt-2">InitData not found</p>
      </div>
  );

  // --- ДАЛЕЕ ТВОЙ ОБЫЧНЫЙ РЕНДЕР ---
  if (!user.is_registered) {
    return (
      <div className="flex flex-col h-screen w-full bg-brand-cream text-brand-black p-6 justify-center max-w-md mx-auto">
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

  return (
    <div className="flex flex-col h-[100dvh] w-full max-w-md mx-auto bg-brand-cream relative shadow-2xl overflow-hidden text-brand-black">
      <div className="flex-1 overflow-y-auto custom-scrollbar pb-24">
        {activeTab === Tab.PROFILE && <Dashboard user={user} quests={quests} stats={PROJECT_STATS} onClaimQuest={onClaimQuest} />}
        {activeTab === Tab.CONTENT && <ContentHub news={news} isAdmin={user.is_admin} onEdit={handleOpenEdit} onRefresh={fetchNews} />}
        {activeTab === Tab.MARKET && <Marketplace userSilver={user.silverCoins} userGold={user.goldCoins} />}
        {activeTab === Tab.LEADERBOARD && <Leaderboard />}
      </div>
      {user.is_admin && !isAdminModalOpen && (
        <button onClick={handleOpenCreate} style={{ position: 'fixed', bottom: '90px', right: '20px', background: '#e74c3c', color: 'white', border: 'none', borderRadius: '50%', width: '50px', height: '50px', fontSize: '24px', zIndex: 100, cursor: 'pointer', boxShadow: '0 4px 10px rgba(0,0,0,0.3)' }}>⚙️</button>
      )}
      {isAdminModalOpen && <AdminPanel onNewsAdded={fetchNews} onClose={() => setIsAdminModalOpen(false)} editData={editingItem} />}
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
