import React, { useState, useEffect } from 'react';
import { getRank } from '../types';
import { Trophy, Loader2 } from 'lucide-react';

interface LeaderboardUser {
  id: number;
  name: string;
  company: string;
  deals: number;
  xp: number;
  rank: string;
}

const Leaderboard: React.FC = () => {
  const [users, setUsers] = useState<LeaderboardUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/leaderboard')
      .then(res => res.json())
      .then(data => setUsers(data))
      .catch(e => console.error('Leaderboard error:', e))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-brand-gold" size={32} />
      </div>
    );
  }

  if (users.length === 0) {
    return (
      <div className="pb-36 pt-6 animate-fade-in">
        <header className="px-6 mb-6">
          <h2 className="text-2xl font-extrabold text-[#433830]">Топ Партнеров</h2>
          <p className="text-gray-500 text-sm mt-1">Рейтинг эффективности</p>
        </header>
        <div className="px-6 text-center text-gray-400 mt-10">
          <p>Пока нет зарегистрированных партнеров.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-36 pt-6 animate-fade-in">
      {/* Шапка раздела */}
      <header className="px-6 mb-6">
        <h2 className="text-2xl font-extrabold text-[#433830]">Топ Партнеров</h2>
        <p className="text-gray-500 text-sm mt-1">Рейтинг эффективности</p>
      </header>

      <div className="px-4 space-y-3">
        {users.map((leader, index) => {
          const isTop3 = index < 3;
          const rankName = leader.rank || getRank(leader.deals);

          return (
            <div
              key={leader.id}
              className={`
                flex items-center p-4 rounded-2xl border transition-all
                ${isTop3 ? 'bg-brand-white border-brand-light shadow-sm' : 'bg-transparent border-transparent'}
              `}
            >
              <div className={`
                w-8 font-bold text-sm mr-3 text-center shrink-0
                ${index === 0 ? 'text-[#BA8F50] text-lg' :
                  index === 1 ? 'text-[#433830]/80' :
                  index === 2 ? 'text-[#433830]/60' : 'text-gray-400'}
              `}>
                {index + 1}
              </div>

              {/* Аватар — первая буква имени */}
              <div className="w-10 h-10 rounded-full bg-brand-cream border border-[#EAE0D5] mr-3 shrink-0 flex items-center justify-center text-brand-black font-bold text-sm">
                {leader.name?.charAt(0) || '?'}
              </div>

              {/* Инфо: Имя, Звание, Компания */}
              <div className="flex-1 min-w-0">
                <h4 className="font-bold text-[#433830] text-sm truncate">{leader.name}</h4>
                <div className="flex items-center gap-2 mt-0.5">
                  {/* Звание */}
                  <span className="text-[9px] bg-[#F2EBDF] text-[#433830]/80 px-1.5 py-0.5 rounded-md font-bold whitespace-nowrap">
                    {rankName}
                  </span>
                  {/* Компания */}
                  <span className="text-[10px] text-gray-400 truncate">
                    {leader.company}
                  </span>
                </div>
              </div>

              {/* Статистика */}
              <div className="text-right shrink-0 ml-2">
                 <div className="font-bold text-[#433830] text-sm">{leader.deals} сд.</div>
                 <div className="flex items-center justify-end gap-1 mt-0.5">
                    <span className="text-[10px] text-gray-400">{leader.xp} XP</span>
                 </div>
              </div>

              {index === 0 && <Trophy size={20} className="text-brand-gold ml-3" />}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default Leaderboard;