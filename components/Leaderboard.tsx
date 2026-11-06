import React, { useState, useEffect } from 'react';
import { getRank } from '../types';
import { Trophy, Loader2 } from 'lucide-react';
import { getAuthData } from '../utils/auth';

interface LeaderboardUser {
  id: number;
  name: string;
  last_name?: string | null;
  company: string;
  deals: number;
}

type Period = 'all' | 'quarter' | 'month';

const MEDALS = ['🥇', '🥈', '🥉'];
const fullName = (u: LeaderboardUser) => [u.name, u.last_name].filter(Boolean).join(' ');

const TABS: { key: Period; label: string }[] = [
  { key: 'all', label: 'Все время' },
  { key: 'quarter', label: 'Квартал' },
  { key: 'month', label: 'Месяц' },
];

const Leaderboard: React.FC = () => {
  const [users, setUsers] = useState<LeaderboardUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>('all');

  useEffect(() => {
    setLoading(true);
    const url = period === 'all' ? '/api/leaderboard' : `/api/leaderboard?period=${period}`;
    fetch(url, { headers: { 'x-init-data': getAuthData() } })
      .then(res => res.json())
      .then(data => setUsers(Array.isArray(data) ? data : []))
      .catch(e => console.error('Leaderboard error:', e))
      .finally(() => setLoading(false));
  }, [period]);

  // Сервер отдаёт партнёров по убыванию продаж. На пьедестал попадают только
  // те, у кого есть хотя бы одна монета за сделку, остальные — в общем списке.
  const podium = users.filter(u => u.deals > 0).slice(0, 3);
  const rest = users.filter(u => !podium.includes(u));

  return (
    <div className="pb-36 pt-6 animate-fade-in">
      <header className="px-6 mb-4">
        <h2 className="text-2xl font-extrabold text-[#433830]">Топ Партнеров</h2>
        <p className="text-gray-500 text-sm mt-1">Место решают только продажи — золотые монеты за сделки</p>
      </header>

      {/* Period tabs */}
      <div className="px-4 mb-4">
        <div className="flex bg-[#F2EBDF] rounded-xl p-1 gap-1">
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setPeriod(tab.key)}
              className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${
                period === tab.key
                  ? 'bg-white shadow text-[#433830]'
                  : 'text-[#433830]/50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="animate-spin text-brand-gold" size={32} />
        </div>
      ) : (
        <>
          {/* Пьедестал: призовые места занимают только те, у кого есть продажи */}
          <div className="px-4 mb-5 space-y-2">
            {[0, 1, 2].map(place => {
              const leader = podium[place];
              return (
                <div
                  key={place}
                  className={`flex items-center p-4 rounded-2xl border ${leader ? 'bg-brand-white border-brand-light shadow-sm' : 'border-dashed border-[#EAE0D5]'}`}
                >
                  <div className="w-8 mr-3 text-center text-xl shrink-0">{MEDALS[place]}</div>
                  {leader ? (
                    <>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-bold text-[#433830] text-sm truncate">{fullName(leader)}</h4>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[9px] bg-[#F2EBDF] text-[#433830]/80 px-1.5 py-0.5 rounded-md font-bold whitespace-nowrap">
                            {getRank(leader.deals)}
                          </span>
                          <span className="text-[10px] text-gray-400 truncate">{leader.company}</span>
                        </div>
                      </div>
                      <div className="font-bold text-[#433830] text-sm shrink-0 ml-2">🪙 {leader.deals}</div>
                      {place === 0 && <Trophy size={20} className="text-brand-gold ml-3 shrink-0" />}
                    </>
                  ) : (
                    <div className="flex-1 text-sm text-[#433830]/50">Место свободно — займите его первой продажей</div>
                  )}
                </div>
              );
            })}
          </div>

          {rest.length > 0 && (
            <div className="px-4">
              <h3 className="px-2 mb-2 text-xs font-bold text-[#433830]/60 uppercase tracking-wide">Все партнёры</h3>
              <div className="space-y-1">
                {rest.map((leader, i) => (
                  <div key={leader.id} className="flex items-center px-3 py-3 rounded-xl">
                    <div className="w-8 text-sm text-gray-400 font-bold mr-3 text-center shrink-0">
                      {leader.deals > 0 ? podium.length + i + 1 : '—'}
                    </div>
                    <div className="w-9 h-9 rounded-full bg-brand-cream border border-[#EAE0D5] mr-3 shrink-0 flex items-center justify-center text-brand-black font-bold text-sm">
                      {leader.name?.charAt(0) || '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-bold text-[#433830] text-sm truncate">{fullName(leader)}</h4>
                      <span className="text-[10px] text-gray-400 truncate block">{leader.company}</span>
                    </div>
                    <div className="text-sm font-bold text-[#433830]/70 shrink-0 ml-2">🪙 {leader.deals}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default Leaderboard;
