// Компоненты
import Dashboard from './components/Dashboard';
import ContentHub from './components/NewsFeed';
import Marketplace from './components/Shop';
import Leaderboard from './components/Leaderboard';
import ChessboardModal from './components/Chessboard';
import EventCalendar from './components/tools/EventCalendar';
import MortgageCalc from './components/tools/MortgageCalc';
import { AdminPanel } from './components/AdminPanel';
import { UserProfile, DailyQuest, ConstructionUpdate, ShopItem, ProjectStat, CurrencyType, ProjectData } from './types';
import React, { useState, useEffect } from 'react';
import { User, Newspaper, ShoppingBag, Grid3X3, Menu, Trophy, X, Lock, Calendar, Calculator, Settings } from 'lucide-react';
import WebApp from '@twa-dev/sdk';

enum Tab {
  PROFILE = 'PROFILE',
  CONTENT = 'CONTENT',
  MARKET = 'MARKET',
  LEADERBOARD = 'LEADERBOARD',
}

// --- ЗАГЛУШКИ (Для полей, которые не приходят с сервера) ---
const MOCK_DEFAULTS = {
  avatar: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?ixlib=rb-4.0.3&auto=format&fit=crop&w=256&q=80',
  level: 1, currentXP: 0, nextLevelXP: 1000, telegram: '', whatsapp: ''
};

// Цвета для статистики проектов
const PROJECT_COLORS = ['bg-brand-black', 'bg-brand-gold', 'bg-brand-grey', 'bg-stone-400', 'bg-blue-500', 'bg-green-500'];

const App: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [debugError, setDebugError] = useState<string>('');

  const [activeTab, setActiveTab] = useState<Tab>(Tab.PROFILE);
  const [quests, setQuests] = useState<DailyQuest[]>([]);
  const [stats, setStats] = useState<ProjectStat[]>([]);
  const [isChessboardOpen, setIsChessboardOpen] = useState(false);
  const [news, setNews] = useState<any[]>([]);
  const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [regName, setRegName] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regCompany, setRegCompany] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [regLastName, setRegLastName] = useState('');
  const [regCompanyType, setRegCompanyType] = useState<'agency' | 'ip'>('agency');
  const [approvalStatus, setApprovalStatus] = useState<string>('none');
  const [user, setUser] = useState<any>(null);
  const [projects, setProjects] = useState<ProjectData[]>([]);
  const [isToolsMenuOpen, setIsToolsMenuOpen] = useState(false);
  const [showCalculator, setShowCalculator] = useState(false);
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [adminPin, setAdminPin] = useState('');

  const fetchNews = () => {
    fetch('/api/news')
      .then(res => res.json())
      .then(data => {
        const mapped = data.map((item: any) => ({
          id: String(item.id),
          title: item.title || '',
          projectName: item.project_name || '',
          description: item.text || '',
          images: item.image_url ? [item.image_url] : [],
          progress: item.progress || 0,
          checklist: Array.isArray(item.checklist) ? item.checklist : [],
          date: item.created_at ? new Date(item.created_at).toLocaleDateString('ru-RU') : '',
          materialsLink: item.materials_link || '',
        }));
        setNews(mapped);
      })
      .catch(e => console.log('News error (не критично)'));
  };

  // ФАЗА 5: Загрузка квестов
  const fetchQuests = (dbUserId?: number) => {
    const url = dbUserId ? `/api/quests?userId=${dbUserId}` : '/api/quests';
    fetch(url)
      .then(res => res.json())
      .then(data => {
        const mapped: DailyQuest[] = data.map((q: any) => ({
          id: String(q.id),
          title: q.title,
          rewardXP: q.reward_xp,
          rewardAmount: q.reward_amount,
          rewardCurrency: q.reward_currency === 'GOLD' ? CurrencyType.GOLD : CurrencyType.SILVER,
          isCompleted: q.isCompleted || false,
          type: q.type,
        }));
        setQuests(mapped);
      })
      .catch(e => console.log('Quests error (не критично)'));
  };

  // ФАЗА 6: Загрузка статистики
  const fetchStats = () => {
    fetch('/api/statistics')
      .then(res => res.json())
      .then(data => {
        const mapped: ProjectStat[] = data.map((s: any, i: number) => ({
          id: s.id,
          name: s.name,
          sales: s.sales || 0,
          totalUnits: s.total_units || 0,
          color: PROJECT_COLORS[i % PROJECT_COLORS.length],
        }));
        setStats(mapped);
      })
      .catch(e => console.log('Stats error (не критично)'));
  };

  const fetchProjects = () => {
    fetch('/api/projects')
      .then(res => res.json())
      .then(data => {
        const mapped: ProjectData[] = data.map((p: any) => ({
          id: String(p.id),
          name: p.name,
          description: p.description || '',
          floors: p.floors || 0,
          unitsPerFloor: p.units_per_floor || 8,
          image: p.image_url || '',
          profitbaseUrl: p.feed_url || '',
        }));
        setProjects(mapped);
      })
      .catch(e => console.log('Projects error (не критично)'));
  };

  useEffect(() => {
    try {
      WebApp.ready();
      WebApp.expand();
    } catch (e) {
      console.log("Not in telegram");
    }

    fetchNews();
    fetchStats();
    fetchProjects();

    const initData = WebApp.initData;

    if (initData) {
      fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData }),
      })
      .then(async (res) => {
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
            goldCoins: sUser.gold_balance || 0,       // ФАЗА 2.1: ИСПРАВЛЕНО — теперь берём gold_balance
            dealsClosed: sUser.deals_closed || 0,       // Реальные данные из БД
            is_registered: sUser.is_registered,
            phone: sUser.phone,
            company: sUser.company,
            is_admin: sUser.is_admin,
            approval_status: sUser.approval_status || 'none',
            last_name: sUser.last_name || '',
            company_type: sUser.company_type || 'agency',
          });
          if (sUser.first_name) setRegName(sUser.first_name);
          setApprovalStatus(sUser.approval_status || 'none');
          // Загружаем квесты с userId для отметки выполненных
          fetchQuests(sUser.id);
        } else {
          throw new Error("Сервер не вернул пользователя (data.user is missing)");
        }
      })
      .catch(err => {
        console.error(err);
        setDebugError(err.message || "Неизвестная ошибка соединения");
      })
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
        firstName: regName,
        lastName: regLastName,
        companyType: regCompanyType,
        company: regCompany,
        phone: regPhone
      }),
    })
    .then(res => res.json())
    .then(data => {
      if (data.success) {
        setApprovalStatus('pending');
        if (user) {
          setUser({ ...user, approval_status: 'pending' });
        }
      }
    })
    .catch(err => alert("Ошибка сохранения"))
    .finally(() => setIsSubmitting(false));
  };

  const handleOpenCreate = () => { setEditingItem(null); setIsAdminModalOpen(true); };
  const handleOpenEdit = (item: any) => { setEditingItem(item); setIsAdminModalOpen(true); };

  // ФАЗА 5.3: Реальный обработчик выполнения квеста
  const onClaimQuest = (questId: string) => {
    fetch('/api/quests/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData: WebApp.initData, questId: parseInt(questId) }),
    })
    .then(res => res.json())
    .then(data => {
      if (data.success && data.user) {
        // Обновляем баланс юзера
        setUser((prev: any) => ({
          ...prev,
          silverCoins: data.user.balance,
          goldCoins: data.user.gold_balance || 0,
        }));
        // Помечаем квест как выполненный
        setQuests(prev => prev.map(q => q.id === questId ? { ...q, isCompleted: true } : q));
      }
    })
    .catch(err => console.error('Quest claim error:', err));
  };

  // --- ЭКРАН С ОШИБКОЙ ---
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

  if (!user) return (
    <div className="flex items-center justify-center h-screen bg-brand-cream p-4 text-black text-center">
      <p>Откройте это приложение внутри Telegram.</p>
      <p className="text-xs text-gray-400 mt-2">InitData not found</p>
    </div>
  );

  // --- WAIT-LIST: Ожидание одобрения ---
  if (approvalStatus === 'pending' || user.approval_status === 'pending') {
    return (
      <div className="flex flex-col h-screen w-full bg-brand-cream text-brand-black p-6 justify-center items-center max-w-md mx-auto text-center">
        <div className="w-24 h-24 bg-brand-gold/20 rounded-full mx-auto mb-6 flex items-center justify-center">
          <span className="text-4xl">🤝</span>
        </div>
        <h1 className="text-2xl font-bold mb-3">Мы скоро запартнёримся!</h1>
        <p className="text-gray-500 text-sm mb-6">Ваша заявка на рассмотрении. Мы уведомим вас в Telegram, как только она будет одобрена.</p>
        <div className="bg-white p-4 rounded-2xl border border-brand-beige w-full">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 bg-brand-gold rounded-full animate-pulse"></div>
            <span className="text-sm font-medium text-gray-600">Заявка обрабатывается...</span>
          </div>
        </div>
      </div>
    );
  }

  // --- REJECTED: Заявка отклонена ---
  if (approvalStatus === 'rejected' || user.approval_status === 'rejected') {
    return (
      <div className="flex flex-col h-screen w-full bg-brand-cream text-brand-black p-6 justify-center items-center max-w-md mx-auto text-center">
        <div className="w-24 h-24 bg-red-100 rounded-full mx-auto mb-6 flex items-center justify-center">
          <span className="text-4xl">😔</span>
        </div>
        <h1 className="text-2xl font-bold mb-3">Заявка отклонена</h1>
        <p className="text-gray-500 text-sm mb-6">К сожалению, ваша заявка была отклонена. Вы можете подать заявку повторно с уточнёнными данными.</p>
        <button
          onClick={() => {
            setApprovalStatus('none');
            if (user) setUser({ ...user, approval_status: 'none', is_registered: false });
          }}
          className="w-full py-4 bg-brand-black text-white rounded-xl font-bold text-lg active:scale-95 transition-transform"
        >
          Подать заявку повторно
        </button>
      </div>
    );
  }

  // --- REGISTRATION FORM ---
  if (!user.is_registered) {
    return (
      <div className="flex flex-col h-screen w-full bg-brand-cream text-brand-black p-6 justify-center max-w-md mx-auto">
        <div className="mb-8 text-center">
          <div className="w-20 h-20 bg-brand-gold rounded-full mx-auto mb-4 flex items-center justify-center shadow-lg"><User size={40} className="text-white" /></div>
          <h1 className="text-2xl font-bold mb-2">Добро пожаловать!</h1>
          <p className="text-gray-600">Заполните анкету для входа в клуб партнеров.</p>
        </div>
        <div className="space-y-4 bg-white p-6 rounded-2xl shadow-sm border border-brand-beige">
          <div><label className="block text-xs font-bold uppercase text-gray-500 mb-1">Имя</label><input type="text" value={regName} onChange={e => setRegName(e.target.value)} placeholder="Иван" className="w-full p-3 bg-brand-light rounded-xl border-none focus:ring-2 focus:ring-brand-gold outline-none"/></div>
          <div><label className="block text-xs font-bold uppercase text-gray-500 mb-1">Фамилия</label><input type="text" value={regLastName} onChange={e => setRegLastName(e.target.value)} placeholder="Иванов" className="w-full p-3 bg-brand-light rounded-xl border-none focus:ring-2 focus:ring-brand-gold outline-none"/></div>
          <div>
            <label className="block text-xs font-bold uppercase text-gray-500 mb-1">Тип</label>
            <div className="flex gap-2">
              <button onClick={() => setRegCompanyType('agency')} className={`flex-1 py-3 rounded-xl font-bold text-sm transition-all ${regCompanyType === 'agency' ? 'bg-brand-black text-white' : 'bg-brand-light text-gray-500'}`}>Агентство</button>
              <button onClick={() => setRegCompanyType('ip')} className={`flex-1 py-3 rounded-xl font-bold text-sm transition-all ${regCompanyType === 'ip' ? 'bg-brand-black text-white' : 'bg-brand-light text-gray-500'}`}>ИП</button>
            </div>
          </div>
          <div><label className="block text-xs font-bold uppercase text-gray-500 mb-1">Название компании</label><input type="text" value={regCompany} onChange={e => setRegCompany(e.target.value)} placeholder="АН Этажи" className="w-full p-3 bg-brand-light rounded-xl border-none focus:ring-2 focus:ring-brand-gold outline-none"/></div>
          <div><label className="block text-xs font-bold uppercase text-gray-500 mb-1">Ваш телефон</label><input type="tel" value={regPhone} onChange={e => setRegPhone(e.target.value)} placeholder="+7 (999) 000-00-00" className="w-full p-3 bg-brand-light rounded-xl border-none focus:ring-2 focus:ring-brand-gold outline-none"/></div>
          <button onClick={handleRegistration} disabled={isSubmitting || !regPhone || !regCompany || !regName} className="w-full py-4 bg-brand-black text-white rounded-xl font-bold text-lg mt-4 active:scale-95 transition-transform disabled:opacity-50 disabled:scale-100">{isSubmitting ? 'Отправка...' : 'Подать заявку'}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[100dvh] w-full max-w-md mx-auto bg-brand-cream relative shadow-2xl overflow-hidden text-brand-black">
      <div className="flex-1 overflow-y-auto custom-scrollbar pb-24">
        {activeTab === Tab.PROFILE && <Dashboard user={user} quests={quests} stats={stats} onClaimQuest={onClaimQuest} />}
        {activeTab === Tab.CONTENT && <ContentHub news={news} isAdmin={user.is_admin} onEdit={handleOpenEdit} onRefresh={fetchNews} />}
        {activeTab === Tab.MARKET && <Marketplace userSilver={user.silverCoins} userGold={user.goldCoins} isAdmin={user.is_admin} />}
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

      {isToolsMenuOpen && (
        <div className="absolute inset-0 z-[40] bg-black/40 backdrop-blur-sm flex items-end animate-fade-in" onClick={() => setIsToolsMenuOpen(false)}>
            <div className="w-full bg-brand-white rounded-t-3xl p-6 pb-28 animate-slide-up shadow-2xl" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-6">
                    <h3 className="font-extrabold text-xl text-brand-black">Инструменты</h3>
                    <button onClick={() => setIsToolsMenuOpen(false)} className="p-2 bg-brand-cream rounded-full"><X size={20}/></button>
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <button
                        onClick={() => { setActiveTab(Tab.PROFILE); setIsToolsMenuOpen(false); }}
                        className="flex flex-col items-center gap-3 p-4 bg-brand-cream rounded-2xl border border-brand-light active:scale-[0.98]"
                    >
                        <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center text-brand-gold shadow-sm"><Calendar size={24}/></div>
                        <span className="font-bold text-brand-black">Календарь</span>
                    </button>
                    <button
                         onClick={() => { setShowCalculator(true); setIsToolsMenuOpen(false); }}
                         className="flex flex-col items-center gap-3 p-4 bg-brand-cream rounded-2xl border border-brand-light active:scale-[0.98]"
                    >
                        <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center text-brand-gold shadow-sm"><Calculator size={24}/></div>
                        <span className="font-bold text-brand-black">Ипотека</span>
                    </button>
                    <button
                         onClick={() => { setActiveTab(Tab.LEADERBOARD); setIsToolsMenuOpen(false); }}
                         className="flex flex-col items-center gap-3 p-4 bg-brand-cream rounded-2xl border border-brand-light active:scale-[0.98]"
                    >
                        <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center text-brand-gold shadow-sm"><Trophy size={24}/></div>
                        <span className="font-bold text-brand-black">Рейтинг</span>
                    </button>

                    <button
                        onClick={() => { setShowAdminLogin(true); setIsToolsMenuOpen(false); }}
                        className="flex flex-col items-center gap-3 p-4 bg-brand-black/5 rounded-2xl border border-brand-light active:scale-[0.98]"
                    >
                        <div className="w-12 h-12 bg-brand-black rounded-full flex items-center justify-center text-white shadow-sm"><Settings size={24}/></div>
                        <span className="font-bold text-brand-black">Админка</span>
                    </button>
                </div>
            </div>
        </div>
      )}

      {/* Admin Login Modal */}
      {showAdminLogin && (
          <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6 animate-fade-in">
              <div className="bg-brand-white w-full max-w-xs rounded-2xl p-6 shadow-2xl">
                  <div className="flex justify-between items-center mb-4">
                      <h3 className="font-bold text-lg flex items-center gap-2"><Lock size={18} className="text-brand-gold"/> Доступ к админке</h3>
                      <button onClick={() => setShowAdminLogin(false)}><X size={20}/></button>
                  </div>
                  <input
                    type="password"
                    placeholder="Введите PIN (0000)"
                    className="w-full text-center text-2xl tracking-widest py-3 border rounded-xl mb-4 bg-brand-cream font-bold"
                    value={adminPin}
                    onChange={(e) => setAdminPin(e.target.value)}
                    maxLength={4}
                  />
                  <button
                    onClick={() => {
                      if (adminPin === '0000') {
                        setShowAdminLogin(false);
                        setAdminPin('');
                      } else {
                        alert('Неверный PIN');
                        setAdminPin('');
                      }
                    }}
                    className="w-full bg-brand-black text-brand-gold font-bold py-3 rounded-xl"
                  >
                      Войти
                  </button>
              </div>
          </div>
      )}

      {isChessboardOpen && <ChessboardModal projects={projects} onClose={() => setIsChessboardOpen(false)} />}
      {showCalculator && <MortgageCalc onClose={() => setShowCalculator(false)} />}
    </div>
  );
};

const NavBtn: React.FC<{ icon: React.ElementType, label: string, active: boolean, onClick: () => void, highlight?: boolean }> = ({ icon: Icon, label, active, onClick, highlight }) => (
  <button
    onClick={onClick}
    className={`
      flex flex-col items-center justify-center w-full py-2 transition-all duration-300 rounded-xl
      ${active ? 'text-brand-black' : 'text-brand-grey hover:text-brand-black/70'}
    `}
  >
    <div className={`
      p-1.5 rounded-xl transition-all duration-300 mb-0.5
      ${highlight ? 'bg-brand-black text-brand-gold shadow-lg shadow-brand-black/20 -translate-y-2' : active ? 'bg-brand-cream' : 'bg-transparent'}
    `}>
      <Icon size={24} strokeWidth={active || highlight ? 2.5 : 1.5} />
    </div>
    <span className={`text-[10px] font-medium ${active ? 'font-bold' : ''}`}>{label}</span>
  </button>
);

export default App;
