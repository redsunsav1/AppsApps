import React from 'react';
import { LeaderboardEntry, getRank } from '../types';
import { Trophy, TrendingUp, TrendingDown, Minus } from 'lucide-react';

// Расширенный список пользователей с фото и компаниями
const USERS: LeaderboardEntry[] = [
  { 
    id: 1, name: 'Елена Волкова', deals: 52, xp: 15000, company: 'АН Этажи', 
    avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=100&q=80', 
    trend: 'up' 
  },
  { 
    id: 2, name: 'Алексей Смирнов', deals: 38, xp: 11000, company: 'ИП Смирнов', 
    avatar: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=100&q=80', 
    trend: 'neutral' 
  },
  { 
    id: 3, name: 'Мария Иванова', deals: 25, xp: 8500, company: 'Самолет Плюс', 
    avatar: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&w=100&q=80', 
    trend: 'up' 
  },
  { 
    id: 4, name: 'Дмитрий Петров', deals: 18, xp: 6000, company: 'Частный брокер', 
    avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=100&q=80', 
    trend: 'down' 
  },
  { 
    id: 5, name: 'Ольга Соколова', deals: 12, xp: 4500, company: 'Владис', 
    avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=100&q=80', 
    trend: 'up' 
  },
  { 
    id: 6, name: 'Иван Сидоров', deals: 8, xp: 3200, company: 'ИП Сидоров', 
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=100&q=80', 
    trend: 'neutral' 
  },
  { 
    id: 7, name: 'Анна Кузнецова', deals: 5, xp: 2100, company: 'Инком-Недвижимость', 
    avatar: 'https://images.unsplash.com/photo-1554151228-14d9def656ec?auto=format&fit=crop&w=100&q=80', 
    trend: 'down' 
  },
  { 
    id: 8, name: 'Петр Васильев', deals: 3, xp: 1500, company: 'Миэль', 
    avatar: 'https://images.unsplash.com/photo-1599566150163-29194dcaad36?auto=format&fit=crop&w=100&q=80', 
    trend: 'neutral' 
  },
  { 
    id: 9, name: 'Виктория Ким', deals: 1, xp: 500, company: 'Аякс', 
    avatar: 'https://images.unsplash.com/photo-1589571894960-20bbe2815d22?auto=format&fit=crop&w=100&q=80', 
    trend: 'up' 
  },
  { 
    id: 10, name: 'Сергей Морозов', deals: 0, xp: 0, company: 'Новичок', 
    avatar: 'https://images.unsplash.com/photo-1600878459138-e1123b37cb30?auto=format&fit=crop&w=100&q=80', 
    trend: 'neutral' 
  },
];

const Leaderboard: React.FC = () => {
  return (
    <div className="pb-36 pt-6 animate-fade-in">
      {/* Шапка раздела */}
      <header className="px-6 mb-6">
        <h2 className="text-2xl font-extrabold text-[#433830]">Топ Партнеров</h2>
        <p className="text-gray-500 text-sm mt-1">Рейтинг эффективности за Декабрь</p>
      </header>

      <div className="px-4 space-y-3">
        {USERS.map((leader, index) => {
          const isTop3 = index < 3;
          const rankName = getRank(leader.deals); // Получаем звание из старой логики
          
          return (
            <div 
              key={leader.id} 
              className={`
                flex items-center p-4 rounded-2xl border transition-all
                ${isTop3 ? 'bg-white border-[#EAE0D5] shadow-sm' : 'bg-transparent border-transparent'}
              `}
            >
              {/* Номер места */}
              <div className={`
                w-8 font-bold text-sm mr-3 text-center shrink-0
                ${index === 0 ? 'text-[#BA8F50] text-lg' : 
                  index === 1 ? 'text-[#433830]/80' : 
                  index === 2 ? 'text-[#433830]/60' : 'text-gray-400'}
              `}>
                {index + 1}
              </div>
              
              {/* Аватар (Вернул!) */}
              <img 
                src={leader.avatar} 
                alt={leader.name} 
                className="w-10 h-10 rounded-full object-cover border border-[#EAE0D5] mr-3 shrink-0" 
              />
              
              {/* Инфо: Имя, Звание, Компания */}
              <div className="flex-1 min-w-0">
                <h4 className="font-bold text-[#433830] text-sm truncate">{leader.name}</h4>
                <div className="flex items-center gap-2 mt-0.5">
                  {/* Звание */}
                  <span className="text-[9px] bg-[#F2EBDF] text-[#433830]/80 px-1.5 py-0.5 rounded-md font-bold whitespace-nowrap">
                    {rankName}
                  </span>
                  {/* Компания (Новое) */}
                  <span className="text-[10px] text-gray-400 truncate">
                    {leader.company}
                  </span>
                </div>
              </div>

              {/* Статистика и Тренд */}
              <div className="text-right shrink-0 ml-2">
                 <div className="font-bold text-[#433830] text-sm">{leader.deals} сд.</div>
                 <div className="flex items-center justify-end gap-1 mt-0.5">
                    {leader.trend === 'up' && <TrendingUp size={12} className="text-green-600" />}
                    {leader.trend === 'down' && <TrendingDown size={12} className="text-red-400" />}
                    {leader.trend === 'neutral' && <Minus size={12} className="text-gray-400" />}
                 </div>
              </div>

              {/* Кубок для первого места */}
              {index === 0 && <Trophy size={20} className="text-[#BA8F50] ml-3" />}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default Leaderboard;
