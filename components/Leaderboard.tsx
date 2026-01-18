import React from 'react';
import { LeaderboardEntry, getRank } from '../types';
import { Trophy, TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface LeaderboardProps {
  entries: LeaderboardEntry[];
}

const Leaderboard: React.FC<LeaderboardProps> = ({ entries }) => {
  return (
    <div className="pb-32 animate-fade-in">
      <header className="px-6 pt-8 pb-6">
        <h2 className="text-2xl font-bold text-brand-black">Топ Партнеров</h2>
        <p className="text-brand-grey text-sm mt-1">Рейтинг эффективности за Сентябрь</p>
      </header>

      <div className="px-4 space-y-3">
        {entries.map((leader, index) => {
          const isTop3 = index < 3;
          const rankName = getRank(leader.deals);
          
          return (
            <div 
              key={leader.id} 
              className={`
                flex items-center p-4 rounded-2xl border transition-all
                ${isTop3 ? 'bg-brand-white border-brand-light shadow-sm' : 'bg-transparent border-transparent'}
              `}
            >
              <div className={`
                w-8 font-bold text-sm mr-3 text-center
                ${index === 0 ? 'text-brand-gold text-lg' : 
                  index === 1 ? 'text-brand-black/60' : 
                  index === 2 ? 'text-brand-black/50' : 'text-brand-grey'}
              `}>
                {index + 1}
              </div>
              
              <img 
                src={leader.avatar} 
                alt={leader.name} 
                className="w-10 h-10 rounded-full object-cover border border-brand-cream mr-3" 
              />
              
              <div className="flex-1">
                <h4 className="font-bold text-brand-black text-sm">{leader.name}</h4>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[10px] bg-brand-cream text-brand-black/70 px-1.5 py-0.5 rounded-md font-bold">{rankName}</span>
                </div>
              </div>

              <div className="text-right">
                 <div className="font-bold text-brand-black text-sm">{leader.deals} сд.</div>
                 <div className="flex items-center justify-end gap-1 mt-0.5">
                    {leader.trend === 'up' && <TrendingUp size={12} className="text-green-600" />}
                    {leader.trend === 'down' && <TrendingDown size={12} className="text-red-400" />}
                    {leader.trend === 'neutral' && <Minus size={12} className="text-brand-grey" />}
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