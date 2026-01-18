
import React, { useState, useEffect } from 'react';
import { UserProfile, DailyQuest, ConstructionUpdate, ShopItem, LeaderboardEntry, ProjectStat, CurrencyType, ProjectData, CalendarEvent, MortgageProgram } from './types';
import { User, Newspaper, ShoppingBag, Grid3X3, Menu, Calendar, Calculator, Trophy, X, Settings, Lock } from 'lucide-react';
import Dashboard from './components/Dashboard';
import ContentHub from './components/NewsFeed';
import Marketplace from './components/Shop';
import Leaderboard from './components/Leaderboard';
import ChessboardModal from './components/Chessboard';
import EventCalendar from './components/tools/EventCalendar';
import MortgageCalc from './components/tools/MortgageCalc';
import AdminPanel from './components/AdminPanel';
import { api } from './services/api';

// Telegram WebApp Type declaration
declare global {
  interface Window {
    Telegram: {
      WebApp: {
        ready: () => void;
        initData: string;
        initDataUnsafe: {
            user?: {
                id: number;
                first_name: string;
                last_name?: string;
                username?: string;
                photo_url?: string;
            }
        };
        expand: () => void;
      }
    }
  }
}

enum Tab {
  PROFILE = 'PROFILE',
  CONTENT = 'CONTENT',
  MARKET = 'MARKET',
  TOOLS_CALENDAR = 'TOOLS_CALENDAR',
  TOOLS_LEADERBOARD = 'TOOLS_LEADERBOARD',
}

const DAILY_QUESTS: DailyQuest[] = [
  { id: 'q1', title: 'Репост новости ЖК Бруклин', rewardXP: 50, rewardAmount: 100, rewardCurrency: CurrencyType.SILVER, isCompleted: false, type: 'SHARE' },
  { id: 'q2', title: 'Тест: Планировки ЖК Харизма', rewardXP: 100, rewardAmount: 200, rewardCurrency: CurrencyType.SILVER, isCompleted: false, type: 'TEST' },
  { id: 'q3', title: 'Продать 2-к квартиру', rewardXP: 1000, rewardAmount: 10, rewardCurrency: CurrencyType.GOLD, isCompleted: false, type: 'DEAL' },
];

const PROJECT_STATS: ProjectStat[] = [
    { id: 'p1', name: 'ЖК Бруклин', sales: 8, totalUnits: 120, color: 'bg-brand-black' },
    { id: 'p2', name: 'ЖК Бабайка', sales: 12, totalUnits: 450, color: 'bg-brand-gold' },
    { id: 'p3', name: 'ЖК Манхэттен', sales: 3, totalUnits: 80, color: 'bg-brand-grey' },
    { id: 'p4', name: 'ЖК Харизма', sales: 5, totalUnits: 200, color: 'bg-stone-400' },
];

// Fallback data only for offline/error mode
const DEFAULT_LEADERBOARD: LeaderboardEntry[] = [
    { id: 'l1', name: 'Алексей Смирнов', deals: 12, xp: 2400, avatar: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?ixlib=rb-4.0.3&auto=format&fit=crop&w=256&q=80', trend: 'up' },
    { id: 'l2', name: 'Мария Иванова', deals: 10, xp: 2100, avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=256&q=80', trend: 'neutral' },
    { id: 'l3', name: 'Сергей Петров', deals: 8, xp: 1800, avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=256&q=80', trend: 'down' },
];

const DEFAULT_USER_TEMPLATE: UserProfile = {
    id: 'demo_partner',
    name: 'Новый Партнер',
    avatar: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?ixlib=rb-4.0.3&auto=format&fit=crop&w=256&q=80',
    level: 1,
    currentXP: 0,
    nextLevelXP: 1000,
    silverCoins: 100,
    goldCoins: 0,
    dealsClosed: 0,
    phone: '',
    telegram: '',
    whatsapp: ''
};

const App: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>(Tab.PROFILE);
  const [user, setUser] = useState<UserProfile | null>(null);
  
  // Data State
  const [news, setNews] = useState<ConstructionUpdate[]>([]);
  const [projects, setProjects] = useState<ProjectData[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [mortgagePrograms, setMortgagePrograms] = useState<MortgageProgram[]>([]);
  const [shopItems, setShopItems] = useState<ShopItem[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>(DEFAULT_LEADERBOARD);
  
  const [quests, setQuests] = useState<DailyQuest[]>(DAILY_QUESTS);

  const [isChessboardOpen, setIsChessboardOpen] = useState(false);
  const [isToolsMenuOpen, setIsToolsMenuOpen] = useState(false);
  const [showCalculator, setShowCalculator] = useState(false);
  
  // Admin & Security State
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [adminPin, setAdminPin] = useState('');
  const [adminUnlockCount, setAdminUnlockCount] = useState(0);

  // --- INITIALIZATION ---
  useEffect(() => {
    const initApp = async () => {
        try {
            let telegramUser = null;
            if (window.Telegram?.WebApp) {
                window.Telegram.WebApp.ready();
                window.Telegram.WebApp.expand();
                telegramUser = window.Telegram.WebApp.initDataUnsafe?.user;
            }

            // 1. Load User Data from DB based on ID
            const userId = telegramUser?.id?.toString() || 'demo_partner';
            let loadedUser = await api.getUser(userId);

            if (!loadedUser) {
                // Initialize new user
                loadedUser = {
                    ...DEFAULT_USER_TEMPLATE,
                    id: userId,
                    name: telegramUser ? `${telegramUser.first_name} ${telegramUser.last_name || ''}`.trim() : 'Алексей Смирнов',
                    telegram: telegramUser?.username ? `@${telegramUser.username}` : '',
                    avatar: telegramUser?.photo_url || DEFAULT_USER_TEMPLATE.avatar
                };
                // Save new user immediately
                await api.saveUser(loadedUser);
            }
            setUser(loadedUser);

            // 2. Load Content Data.
            const [n, p, e, m, s] = await Promise.all([
                api.getNews(),
                api.getProjects(),
                api.getEvents(),
                api.getMortgage(),
                api.getShop()
            ]);
            
            setNews(n);
            setProjects(p);
            setEvents(e);
            setMortgagePrograms(m);
            setShopItems(s);

        } catch (error) {
            console.error("Initialization failed, backend offline?", error);
        } finally {
            setLoading(false);
        }
    };

    initApp();
  }, []);

  // --- PERSISTENCE HELPER ---
  const saveUserProgress = (newUser: UserProfile) => {
      setUser(newUser);
      api.saveUser(newUser).catch(err => console.error("Failed to save progress", err));
  };

  // --- SAFE UPDATERS FOR ADMIN ---
  
  const handleUpdateNews = (action: React.SetStateAction<ConstructionUpdate[]>) => {
      setNews(prev => {
          const newVal = typeof action === 'function' ? (action as Function)(prev) : action;
          api.saveNews(newVal);
          return newVal;
      });
  };

  const handleUpdateProjects = (action: React.SetStateAction<ProjectData[]>) => {
      setProjects(prev => {
          const newVal = typeof action === 'function' ? (action as Function)(prev) : action;
          api.saveProjects(newVal);
          return newVal;
      });
  };

  const handleUpdateEvents = (action: React.SetStateAction<CalendarEvent[]>) => {
      setEvents(prev => {
          const newVal = typeof action === 'function' ? (action as Function)(prev) : action;
          api.saveEvents(newVal);
          return newVal;
      });
  };

  const handleUpdateMortgage = (action: React.SetStateAction<MortgageProgram[]>) => {
      setMortgagePrograms(prev => {
          const newVal = typeof action === 'function' ? (action as Function)(prev) : action;
          api.saveMortgage(newVal);
          return newVal;
      });
  };

  const handleUpdateShop = (action: React.SetStateAction<ShopItem[]>) => {
      setShopItems(prev => {
          const newVal = typeof action === 'function' ? (action as Function)(prev) : action;
          api.saveShop(newVal);
          return newVal;
      });
  };

  const addXP = (amount: number) => {
    if(!user) return;
    const newXP = user.currentXP + amount;
    let newLevel = user.level;
    let nextXP = user.nextLevelXP;
    let silver = user.silverCoins;

    if (newXP >= user.nextLevelXP) {
        newLevel++;
        nextXP = Math.floor(user.nextLevelXP * 1.2);
        silver += 1000;
    }
    
    const updatedUser = {
        ...user,
        level: newLevel,
        currentXP: newXP >= user.nextLevelXP ? newXP - user.nextLevelXP : newXP,
        nextLevelXP: nextXP,
        silverCoins: silver
    };
    saveUserProgress(updatedUser);
  };

  const handleClaimQuest = (id: string) => {
    if (!user) return;
    const quest = quests.find(q => q.id === id);
    if (quest && !quest.isCompleted) {
      const newSilver = quest.rewardCurrency === CurrencyType.SILVER ? user.silverCoins + quest.rewardAmount : user.silverCoins;
      const newGold = quest.rewardCurrency === CurrencyType.GOLD ? user.goldCoins + quest.rewardAmount : user.goldCoins;
      
      const updatedUser = { ...user, silverCoins: newSilver, goldCoins: newGold };
      saveUserProgress(updatedUser);

      addXP(quest.rewardXP);
      setQuests(prev => prev.map(q => q.id === id ? { ...q, isCompleted: true } : q));
    }
  };

  const handleGenerateContent = (id: string) => { };

  const handlePurchase = (item: ShopItem) => {
    if (!user) return;
    const balance = item.currency === CurrencyType.SILVER ? user.silverCoins : user.goldCoins;
    if (balance >= item.price) {
      if(confirm(`Приобрести ${item.name}?`)) {
          const newSilver = item.currency === CurrencyType.SILVER ? user.silverCoins - item.price : user.silverCoins;
          const newGold = item.currency === CurrencyType.GOLD ? user.goldCoins - item.price : user.goldCoins;
          
          const updatedUser = { ...user, silverCoins: newSilver, goldCoins: newGold };
          saveUserProgress(updatedUser);
          
          alert("Заявка отправлена менеджеру клуба!");
      }
    }
  };

  // --- ADMIN SECURITY ---
  const handleSecretClick = () => {
    setAdminUnlockCount(prev => {
        const newCount = prev + 1;
        if (newCount === 5) {
            setShowAdminLogin(true);
            return 0;
        }
        return newCount;
    });
  };

  const checkAdminPin = () => {
      if (adminPin === '0000') {
          setIsAdminOpen(true);
          setShowAdminLogin(false);
          setAdminPin('');
      } else {
          alert('Неверный PIN');
          setAdminPin('');
      }
  };

  const renderContent = () => {
    if (!user) return null;
    switch (activeTab) {
      case Tab.PROFILE:
        return (
            <div onClick={handleSecretClick}>
                <Dashboard user={user} quests={quests} stats={PROJECT_STATS} onClaimQuest={handleClaimQuest} />
            </div>
        );
      case Tab.CONTENT:
        return <ContentHub updates={news} onGenerate={handleGenerateContent} />;
      case Tab.MARKET:
        return <Marketplace items={shopItems} silver={user.silverCoins} gold={user.goldCoins} onPurchase={handlePurchase} />;
      case Tab.TOOLS_LEADERBOARD:
        return <Leaderboard entries={leaderboard} />;
      case Tab.TOOLS_CALENDAR:
        return <EventCalendar events={events} setEvents={handleUpdateEvents} />;
      default:
        return null;
    }
  };

  if (loading) {
      return (
          <div className="flex h-screen w-full items-center justify-center bg-brand-cream text-brand-gold">
              <div className="flex flex-col items-center gap-4">
                 <div className="w-10 h-10 border-4 border-brand-gold border-t-transparent rounded-full animate-spin"></div>
                 <span className="font-bold text-brand-black">Partner Club</span>
              </div>
          </div>
      );
  }

  return (
    <div className="flex flex-col h-full w-full max-w-md sm:max-w-full md:max-w-[480px] mx-auto bg-brand-cream relative shadow-2xl overflow-hidden text-brand-black">
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {renderContent()}
      </div>

      <div className="absolute bottom-0 left-0 right-0 z-50 bg-brand-white/90 backdrop-blur-xl border-t border-brand-light pb-safe">
        <div className="flex justify-around items-center px-2 py-2">
            <NavBtn icon={User} label="Профиль" active={activeTab === Tab.PROFILE} onClick={() => setActiveTab(Tab.PROFILE)} />
            <NavBtn icon={Newspaper} label="Медиа" active={activeTab === Tab.CONTENT} onClick={() => setActiveTab(Tab.CONTENT)} />
            <NavBtn icon={Grid3X3} label="Объекты" active={isChessboardOpen} onClick={() => setIsChessboardOpen(true)} highlight />
            <NavBtn icon={ShoppingBag} label="Маркет" active={activeTab === Tab.MARKET} onClick={() => setActiveTab(Tab.MARKET)} />
            <NavBtn icon={Menu} label="Меню" active={isToolsMenuOpen || [Tab.TOOLS_CALENDAR, Tab.TOOLS_LEADERBOARD].includes(activeTab)} onClick={() => setIsToolsMenuOpen(true)} />
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
                        onClick={() => { setActiveTab(Tab.TOOLS_CALENDAR); setIsToolsMenuOpen(false); }}
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
                         onClick={() => { setActiveTab(Tab.TOOLS_LEADERBOARD); setIsToolsMenuOpen(false); }}
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
                    onClick={checkAdminPin}
                    className="w-full bg-brand-black text-brand-gold font-bold py-3 rounded-xl"
                  >
                      Войти
                  </button>
              </div>
          </div>
      )}

      {isChessboardOpen && <ChessboardModal projects={projects} mortgagePrograms={mortgagePrograms} onClose={() => setIsChessboardOpen(false)} />}
      {showCalculator && <MortgageCalc programs={mortgagePrograms} onClose={() => setShowCalculator(false)} />}
      
      {isAdminOpen && (
          <AdminPanel 
            onClose={() => setIsAdminOpen(false)}
            updates={news} setUpdates={handleUpdateNews}
            projects={projects} setProjects={handleUpdateProjects}
            events={events} setEvents={handleUpdateEvents}
            programs={mortgagePrograms} setPrograms={handleUpdateMortgage}
            shopItems={shopItems} setShopItems={handleUpdateShop}
          />
      )}
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
