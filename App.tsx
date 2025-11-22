
import React, { useState } from 'react';
import { CurrencyType, UserProfile, NewsItem, LeaderboardEntry } from './types';
import { Home, Gamepad2, ShoppingBag, Trophy, User, PlusCircle, Zap, ArrowLeft, Settings, ShieldCheck, ShieldAlert } from 'lucide-react';
import TowerGame from './components/games/TowerGame';
import FlappyGame from './components/games/FlappyGame';
import ConstructionMahjong from './components/games/ConstructionMahjong';
import SnakeGame from './components/games/SnakeGame';
import TetrisGame from './components/games/TetrisGame';
import Shop from './components/Shop';
import Leaderboard from './components/Leaderboard';
import NewsFeed from './components/NewsFeed';

enum Tab {
  HOME = 'HOME',
  GAMES = 'GAMES',
  SHOP = 'SHOP',
  LEADERBOARD = 'LEADERBOARD',
  PROFILE = 'PROFILE'
}

// Initial Data
const INITIAL_NEWS: NewsItem[] = [
  { id: '1', title: 'Старт продаж ЖК "Северный"', content: 'Открыто бронирование квартир во второй очереди. Повышенная комиссия до 30 числа.', date: 'Сегодня', type: 'promo' },
  { id: '2', title: 'Корпоратив для партнеров', content: 'Приглашаем всех лучших риелторов на закрытую вечеринку в честь дня строителя.', date: 'Вчера', type: 'event' },
  { id: '3', title: 'Изменение условий ипотеки', content: 'Банк-партнер обновил ставки по семейной ипотеке. Ознакомьтесь в личном кабинете.', date: '10.05.2024', type: 'news' }
];

const INITIAL_LEADERS: LeaderboardEntry[] = [
  { id: '1', name: 'Анна Смирнова', deals: 42, points: 1250, avatar: 'https://picsum.photos/seed/anna/100/100' },
  { id: '2', name: 'Игорь Петров', deals: 38, points: 1100, avatar: 'https://picsum.photos/seed/igor/100/100' },
  { id: '3', name: 'Елена Волкова', deals: 35, points: 980, avatar: 'https://picsum.photos/seed/elena/100/100' },
  { id: '4', name: 'Сергей Козлов', deals: 20, points: 600, avatar: 'https://picsum.photos/seed/sergey/100/100' },
  { id: '5', name: 'Мария Попова', deals: 18, points: 550, avatar: 'https://picsum.photos/seed/maria/100/100' },
];

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>(Tab.HOME);
  const [isAdmin, setIsAdmin] = useState(false);
  const [activeGame, setActiveGame] = useState<string | null>(null);

  // App Data State (Lifted for persistence)
  const [news, setNews] = useState<NewsItem[]>(INITIAL_NEWS);
  const [leaders, setLeaders] = useState<LeaderboardEntry[]>(INITIAL_LEADERS);
  
  const [user, setUser] = useState<UserProfile>({
    id: 'user-me',
    name: 'Алексей Риелтор',
    rank: 'Опытный Партнер',
    avatar: 'https://picsum.photos/seed/me/150/150',
    dealsClosed: 8,
    wallet: {
      [CurrencyType.COMMON]: 150,
      [CurrencyType.RARE]: 2,
      [CurrencyType.LEGENDARY]: 0,
    }
  });

  const addCurrency = (amount: number, type: CurrencyType) => {
    setUser(prev => ({
      ...prev,
      wallet: { ...prev.wallet, [type]: prev.wallet[type] + amount }
    }));
  };

  const simulateDeal = () => {
    const newDeals = user.dealsClosed + 1;
    let rareBonus = 1;
    let legendaryBonus = 0;

    if (newDeals % 10 === 0) {
      legendaryBonus = 1;
    }

    setUser(prev => ({
      ...prev,
      dealsClosed: newDeals,
      wallet: {
        ...prev.wallet,
        [CurrencyType.RARE]: prev.wallet[CurrencyType.RARE] + rareBonus,
        [CurrencyType.LEGENDARY]: prev.wallet[CurrencyType.LEGENDARY] + legendaryBonus
      }
    }));
  };

  const handlePurchase = (cost: number, type: CurrencyType) => {
    setUser(prev => ({
      ...prev,
      wallet: { ...prev.wallet, [type]: prev.wallet[type] - cost }
    }));
  };

  // Admin Actions
  const handleAddNews = (item: NewsItem) => setNews(prev => [item, ...prev]);
  const handleDeleteNews = (id: string) => setNews(prev => prev.filter(n => n.id !== id));
  const handleUpdateLeader = (id: string, name: string, points: number, deals: number) => {
    setLeaders(prev => prev.map(l => l.id === id ? { ...l, name, points, deals } : l));
  };
  const handleAdminUpdateUser = (field: string, value: any) => {
    if (field === 'common') setUser(p => ({ ...p, wallet: { ...p.wallet, [CurrencyType.COMMON]: parseInt(value) || 0 } }));
    if (field === 'rare') setUser(p => ({ ...p, wallet: { ...p.wallet, [CurrencyType.RARE]: parseInt(value) || 0 } }));
    if (field === 'legendary') setUser(p => ({ ...p, wallet: { ...p.wallet, [CurrencyType.LEGENDARY]: parseInt(value) || 0 } }));
    if (field === 'deals') setUser(p => ({ ...p, dealsClosed: parseInt(value) || 0 }));
  };

  const renderContent = () => {
    switch (activeTab) {
      case Tab.HOME:
        return (
            <div className="animate-fade-in">
                <NewsFeed 
                    news={news} 
                    isAdmin={isAdmin} 
                    onAddNews={handleAddNews} 
                    onDeleteNews={handleDeleteNews} 
                />
            </div>
        );
      
      case Tab.GAMES:
        if (activeGame) {
          return (
            <div className="h-[85vh] animate-fade-in flex flex-col">
              <div className="px-4 py-2 flex items-center gap-2 cursor-pointer group" onClick={() => setActiveGame(null)}>
                <div className="p-2 bg-white rounded-full shadow-sm group-hover:bg-slate-100 transition-colors">
                  <ArrowLeft size={20} className="text-slate-600" />
                </div>
                <span className="font-bold text-slate-600 text-sm">Назад к играм</span>
              </div>
              <div className="flex-1 rounded-3xl overflow-hidden shadow-xl mx-2 mb-2 relative">
                {activeGame === 'tower' && <TowerGame onReward={(n) => addCurrency(n, CurrencyType.COMMON)} />}
                {activeGame === 'flappy' && <FlappyGame onReward={(n) => addCurrency(n, CurrencyType.COMMON)} />}
                {activeGame === 'mahjong' && <ConstructionMahjong onReward={(n) => addCurrency(n, CurrencyType.COMMON)} />}
                {activeGame === 'snake' && <SnakeGame onReward={(n) => addCurrency(n, CurrencyType.COMMON)} />}
                {activeGame === 'tetris' && <TetrisGame onReward={(n) => addCurrency(n, CurrencyType.COMMON)} />}
              </div>
            </div>
          );
        }
        
        return (
          <div className="px-6 pt-6 space-y-6 animate-slide-up pb-24">
             <header className="mb-8">
               <h2 className="text-3xl font-extrabold text-slate-800 tracking-tight">Игротека</h2>
               <p className="text-slate-500 mt-2 font-medium">Зарабатывайте кирпичи в перерывах</p>
             </header>
             
             <div className="grid gap-6">
               <GameCard 
                 title="Змейка" 
                 desc="Собирай кирпичи" 
                 icon="🐍" 
                 color="from-green-400 to-green-600" 
                 onClick={() => setActiveGame('snake')} 
               />
               <GameCard 
                 title="Тетрис-Блок" 
                 desc="Строй ряды" 
                 icon="🧱" 
                 color="from-purple-400 to-purple-600" 
                 onClick={() => setActiveGame('tetris')} 
               />
               <GameCard 
                 title="Небоскреб" 
                 desc="Строй выше всех" 
                 icon="🏗️" 
                 color="from-orange-400 to-orange-600" 
                 onClick={() => setActiveGame('tower')} 
               />
               <GameCard 
                 title="Авиа-Доставка" 
                 desc="Уклоняйся от труб" 
                 icon="🚁" 
                 color="from-sky-400 to-sky-600" 
                 onClick={() => setActiveGame('flappy')} 
               />
               <GameCard 
                 title="Строй-Пара" 
                 desc="Тренируй память" 
                 icon="🧩" 
                 color="from-slate-600 to-slate-800" 
                 onClick={() => setActiveGame('mahjong')} 
               />
             </div>
          </div>
        );

      case Tab.SHOP:
        return <div className="animate-fade-in"><Shop wallet={user.wallet} onPurchase={handlePurchase} /></div>;

      case Tab.LEADERBOARD:
        return (
            <div className="animate-fade-in">
                <Leaderboard 
                    entries={leaders} 
                    isAdmin={isAdmin} 
                    onUpdateEntry={handleUpdateLeader} 
                />
            </div>
        );

      case Tab.PROFILE:
        return (
          <div className="px-6 pt-6 space-y-8 animate-slide-up pb-24">
            <div className="flex flex-col items-center pt-4">
               <div className="relative">
                 <div className={`absolute inset-0 rounded-full blur-2xl opacity-50 animate-pulse ${isAdmin ? 'bg-red-500' : 'bg-orange-200'}`}></div>
                 <img src={user.avatar} className="w-28 h-28 rounded-[2rem] shadow-[0_10px_40px_-10px_rgba(0,0,0,0.15)] object-cover relative z-10 border-4 border-white" alt="Profile" />
                 <div className="absolute -bottom-2 -right-2 bg-white p-2 rounded-xl shadow-lg z-20 text-xl">
                   {isAdmin ? '🛡️' : '🏆'}
                 </div>
               </div>
               <h2 className="text-2xl font-black text-slate-800 mt-4">{user.name}</h2>
               <div className={`px-3 py-1 rounded-full text-xs font-bold tracking-wide mt-1 uppercase ${isAdmin ? 'bg-red-100 text-red-600' : 'bg-orange-50 text-orange-600'}`}>
                 {isAdmin ? 'Администратор' : user.rank}
               </div>
               <p className="text-slate-400 text-xs mt-1 font-mono">ID: {user.id}</p>
            </div>

            {isAdmin ? (
               <div className="bg-red-50 border-2 border-red-100 p-6 rounded-3xl space-y-4">
                  <h3 className="font-bold text-red-800 flex items-center gap-2"><Settings size={18} /> Редактирование профиля</h3>
                  <div className="space-y-2">
                     <div className="flex justify-between items-center">
                        <label className="text-xs font-bold text-slate-600">Кирпичи</label>
                        <input type="number" value={user.wallet[CurrencyType.COMMON]} onChange={(e) => handleAdminUpdateUser('common', e.target.value)} className="w-24 p-1 rounded border" />
                     </div>
                     <div className="flex justify-between items-center">
                        <label className="text-xs font-bold text-slate-600">Золото</label>
                        <input type="number" value={user.wallet[CurrencyType.RARE]} onChange={(e) => handleAdminUpdateUser('rare', e.target.value)} className="w-24 p-1 rounded border" />
                     </div>
                     <div className="flex justify-between items-center">
                        <label className="text-xs font-bold text-slate-600">Ключи</label>
                        <input type="number" value={user.wallet[CurrencyType.LEGENDARY]} onChange={(e) => handleAdminUpdateUser('legendary', e.target.value)} className="w-24 p-1 rounded border" />
                     </div>
                     <div className="flex justify-between items-center">
                        <label className="text-xs font-bold text-slate-600">Сделки</label>
                        <input type="number" value={user.dealsClosed} onChange={(e) => handleAdminUpdateUser('deals', e.target.value)} className="w-24 p-1 rounded border" />
                     </div>
                  </div>
               </div>
            ) : (
                <div className="grid grid-cols-3 gap-4">
                    <StatCard icon="🧱" value={user.wallet[CurrencyType.COMMON]} label="Кирпичи" />
                    <StatCard icon="🏆" value={user.wallet[CurrencyType.RARE]} label="Золото" delay={100} />
                    <StatCard icon="💎" value={user.wallet[CurrencyType.LEGENDARY]} label="Ключи" delay={200} />
                </div>
            )}

            {!isAdmin && (
                <div className="bg-white p-6 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100/50">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="font-bold text-slate-800 text-lg">Ваш Прогресс</h3>
                    <Zap className="text-yellow-500 fill-current" size={20} />
                </div>
                
                <div className="space-y-4">
                    <div className="flex justify-between items-center">
                    <span className="text-slate-500 text-sm font-medium">Закрыто сделок</span>
                    <span className="font-bold text-xl text-slate-800">{user.dealsClosed}</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
                        <div className="bg-orange-500 h-full rounded-full" style={{ width: `${(user.dealsClosed % 10) * 10}%` }}></div>
                    </div>
                    <div className="text-xs text-slate-400 text-center font-medium">
                    Ещё <span className="text-orange-500 font-bold">{10 - (user.dealsClosed % 10)}</span> сделок до Легендарного Ключа
                    </div>
                </div>
                </div>
            )}

            {!isAdmin && (
                <button 
                onClick={simulateDeal}
                className="w-full py-4 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl font-bold flex items-center justify-center gap-3 active:scale-[0.98] transition-all shadow-xl shadow-slate-200"
                >
                <PlusCircle size={20} />
                Симулировать Продажу
                </button>
            )}

            <button
                onClick={() => setIsAdmin(!isAdmin)}
                className={`w-full py-3 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all border ${isAdmin ? 'bg-slate-200 text-slate-600 border-slate-300' : 'bg-transparent text-slate-400 border-slate-200'}`}
            >
                {isAdmin ? <ShieldAlert size={18} /> : <ShieldCheck size={18} />}
                {isAdmin ? 'Выйти из админки' : 'Войти как Администратор'}
            </button>
          </div>
        );
        
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col h-screen max-w-md mx-auto bg-[#F8FAFC] relative overflow-hidden">
      {/* Header */}
      <div className="glass px-6 py-4 flex justify-between items-center sticky top-0 z-30 border-b border-slate-100/50">
        <div className="font-black text-xl tracking-tight text-slate-800 flex items-center gap-2">
           <div className="bg-gradient-to-br from-orange-400 to-orange-600 text-white w-9 h-9 flex items-center justify-center rounded-xl shadow-lg shadow-orange-200">
             <span className="text-lg">P</span>
           </div>
           PartnerBuild
        </div>
        <div className="flex items-center gap-3 bg-white/80 px-4 py-2 rounded-full shadow-sm border border-slate-100 backdrop-blur-md">
           <span className="font-bold text-slate-700 text-xs flex items-center gap-1">🧱 {user.wallet[CurrencyType.COMMON]}</span>
           <span className="w-[1px] h-3 bg-slate-200"></span>
           <span className="font-bold text-slate-700 text-xs flex items-center gap-1">🏆 {user.wallet[CurrencyType.RARE]}</span>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {renderContent()}
      </div>

      {/* Bottom Navigation */}
      <div className="glass absolute bottom-6 left-4 right-4 rounded-[2rem] border border-white/50 shadow-[0_8px_40px_-10px_rgba(0,0,0,0.1)] flex justify-around items-center px-2 py-1 z-40">
        <NavBtn icon={Home} active={activeTab === Tab.HOME} onClick={() => setActiveTab(Tab.HOME)} />
        <NavBtn icon={Gamepad2} active={activeTab === Tab.GAMES} onClick={() => { setActiveTab(Tab.GAMES); setActiveGame(null); }} />
        <div className="w-px h-8 bg-slate-200 mx-1"></div>
        <NavBtn icon={ShoppingBag} active={activeTab === Tab.SHOP} onClick={() => setActiveTab(Tab.SHOP)} />
        <NavBtn icon={Trophy} active={activeTab === Tab.LEADERBOARD} onClick={() => setActiveTab(Tab.LEADERBOARD)} />
        <NavBtn icon={User} active={activeTab === Tab.PROFILE} onClick={() => setActiveTab(Tab.PROFILE)} />
      </div>
    </div>
  );
};

// Components for clean structure

const GameCard: React.FC<{ title: string, desc: string, icon: string, color: string, onClick: () => void }> = ({ title, desc, icon, color, onClick }) => (
  <div 
    onClick={onClick}
    className="group relative bg-white p-6 rounded-[2rem] shadow-[0_10px_30px_-5px_rgba(0,0,0,0.05)] cursor-pointer hover:shadow-[0_20px_40px_-5px_rgba(0,0,0,0.1)] transition-all duration-300 border border-slate-50 overflow-hidden"
  >
    <div className={`absolute top-0 right-0 w-32 h-32 bg-gradient-to-br ${color} opacity-5 rounded-bl-[4rem] transition-transform group-hover:scale-110`} />
    <div className="flex items-center gap-6 relative z-10">
      <div className="text-5xl emoji-3d group-hover:animate-float">{icon}</div>
      <div>
        <h3 className="text-xl font-black text-slate-800 group-hover:text-orange-600 transition-colors">{title}</h3>
        <p className="text-slate-400 font-medium text-sm mt-1">{desc}</p>
      </div>
    </div>
  </div>
);

const StatCard: React.FC<{ icon: string, value: number, label: string, delay?: number }> = ({ icon, value, label, delay = 0 }) => (
  <div 
    className="bg-white p-4 rounded-3xl shadow-[0_10px_30px_-10px_rgba(0,0,0,0.05)] border border-slate-50 flex flex-col items-center justify-center animate-slide-up"
    style={{ animationDelay: `${delay}ms` }}
  >
    <div className="text-3xl mb-2 emoji-3d">{icon}</div>
    <div className="font-black text-xl text-slate-800">{value}</div>
    <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mt-1">{label}</div>
  </div>
);

const NavBtn: React.FC<{ icon: React.ElementType, active: boolean, onClick: () => void }> = ({ icon: Icon, active, onClick }) => (
  <button 
    onClick={onClick}
    className={`relative w-12 h-12 flex items-center justify-center rounded-full transition-all duration-300 ${active ? 'text-orange-500 bg-orange-50' : 'text-slate-400 hover:text-slate-600'}`}
  >
    <Icon size={24} strokeWidth={active ? 3 : 2} />
    {active && (
      <span className="absolute -bottom-1 w-1 h-1 bg-orange-500 rounded-full"></span>
    )}
  </button>
);

export default App;
