import React from 'react';
import { UserProfile, DailyQuest, ProjectStat, CurrencyType, getRank } from '../types';
import { ChevronRight, CheckCircle2, Circle, Zap, Phone, Briefcase } from 'lucide-react';

interface DashboardProps {
  user: UserProfile;
  quests: DailyQuest[];
  stats: ProjectStat[];
  onClaimQuest: (id: string) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ user, quests, stats, onClaimQuest }) => {
  const progressPercent = (user.currentXP / user.nextLevelXP) * 100;
  const currentRank = getRank(user.dealsClosed);

  return (
    <div className="pb-36 animate-fade-in">
      
      {/* 1. Header / Profile Summary (ТВОЙ КОД БЕЗ ИЗМЕНЕНИЙ) */}
      <div className="pt-8 px-6 pb-8 bg-brand-white rounded-b-[2.5rem] shadow-sm relative z-10">
         <div className="flex justify-between items-start mb-6">
            <div>
                 <h1 className="text-2xl font-extrabold text-brand-black">Привет, {user.name}!</h1>
                 <p className="text-brand-grey text-xs font-medium mt-1">Клуб партнеров</p>
            </div>
            {/* Rank Display */}
            <div className="flex flex-col items-end">
                <div className="bg-brand-gold/10 px-3 py-1.5 rounded-lg border border-brand-gold/20">
                    <span className="text-xs font-bold text-brand-gold uppercase tracking-wider block text-right">{currentRank}</span>
                </div>
                <span className="text-[10px] text-brand-grey font-bold mt-1">{user.dealsClosed} продаж</span>
            </div>
         </div>

         <div className="flex items-center gap-5 mb-8">
             <div className="relative shrink-0">
                <div className="w-20 h-20 rounded-full p-1 bg-gradient-to-br from-brand-gold to-brand-beige">
                    <img src={user.avatar} alt="Profile" className="w-full h-full rounded-full object-cover border-2 border-white" />
                </div>
                <div className="absolute -bottom-2 -right-2 bg-brand-white text-brand-black text-xs font-bold px-2.5 py-1 rounded-lg border border-brand-light shadow-sm">
                    Lvl {user.level}
                </div>
             </div>
             <div className="flex-1 space-y-3">
                 {/* Silver Balance */}
                 <div className="flex items-center justify-between bg-brand-cream p-2 rounded-xl border border-brand-beige">
                    <span className="text-xs font-semibold text-brand-black/60 uppercase">Silver</span>
                    <div className="flex items-center gap-1.5">
                        <span className="font-bold text-brand-black text-lg">{user.silverCoins.toLocaleString()}</span>
                        <div className="w-4 h-4 rounded-full bg-slate-300 border border-slate-400"></div>
                    </div>
                 </div>
                 {/* Gold Balance */}
                 <div className="flex items-center justify-between bg-gradient-to-r from-brand-gold/20 to-brand-gold/5 p-2 rounded-xl border border-brand-gold/20">
                    <span className="text-xs font-semibold text-brand-gold uppercase">Gold</span>
                    <div className="flex items-center gap-1.5">
                        <span className="font-bold text-brand-black text-lg">{user.goldCoins.toLocaleString()}</span>
                        <div className="w-4 h-4 rounded-full bg-brand-gold border border-brand-black flex items-center justify-center text-[8px] font-bold text-black">X</div>
                    </div>
                 </div>
             </div>
         </div>

         {/* Level Progress */}
         <div className="flex justify-between text-[10px] font-bold text-brand-grey uppercase tracking-wide mb-1">
            <span>До уровня {user.level + 1}</span>
            <span>{user.currentXP} / {user.nextLevelXP} XP</span>
         </div>
         <div className="h-1.5 w-full bg-brand-light rounded-full overflow-hidden">
            <div className="h-full bg-brand-gold rounded-full transition-all duration-1000 ease-out" style={{ width: `${progressPercent}%` }}></div>
         </div>
      </div>

      {/* 2. Business Card (ОБНОВЛЕНО: Добавлена компания и телефон) */}
      <div className="mt-6 mx-4">
         <div className="bg-white rounded-2xl p-5 shadow-sm border border-brand-light">
            <h3 className="text-sm font-bold text-brand-black mb-4 uppercase tracking-wide opacity-70 flex items-center gap-2">
                <Briefcase size={16} /> Визитка
            </h3>
            
            <div className="space-y-3">
                {/* Компания */}
                <div className="flex items-center justify-between p-3 bg-brand-cream/50 rounded-xl border border-brand-light/50">
                    <div>
                        <p className="text-[10px] font-bold text-brand-grey uppercase mb-0.5">Компания / ИП</p>
                        <p className="font-bold text-brand-black">{user.company || 'Не указано'}</p>
                    </div>
                </div>

                {/* Телефон + Кнопка */}
                <div className="flex gap-3">
                    <div className="flex-1 p-3 bg-brand-cream/50 rounded-xl border border-brand-light/50 flex flex-col justify-center">
                        <p className="text-[10px] font-bold text-brand-grey uppercase mb-0.5">Телефон</p>
                        <p className="font-bold text-brand-black">{user.phone}</p>
                    </div>
                    
                    <a href={`tel:${user.phone}`} 
                       className="flex items-center justify-center w-16 bg-brand-black text-brand-gold rounded-xl shadow-md active:scale-95 transition-transform"
                    >
                        <Phone size={24} />
                    </a>
                </div>
            </div>
         </div>
      </div>

      {/* 3. Daily Quests (ТВОЙ КОД БЕЗ ИЗМЕНЕНИЙ) */}
      <div className="mt-8 px-6">
        <h3 className="text-lg font-bold text-brand-black mb-4 flex items-center gap-2">
            Задачи <Zap size={16} className="text-brand-gold fill-current" />
        </h3>
        
        <div className="space-y-3">
            {quests.map(quest => (
                <div 
                    key={quest.id}
                    onClick={() => !quest.isCompleted && onClaimQuest(quest.id)}
                    className={`
                        flex items-center justify-between p-4 rounded-2xl border transition-all duration-300
                        ${quest.isCompleted ? 'bg-brand-white/50 border-transparent opacity-60' : 'bg-brand-white border-brand-light shadow-sm active:scale-[0.98] cursor-pointer'}
                    `}
                >
                    <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-full ${quest.isCompleted ? 'bg-green-100 text-green-700' : 'bg-brand-cream text-brand-grey'}`}>
                            {quest.isCompleted ? <CheckCircle2 size={18} /> : <Circle size={18} />}
                        </div>
                        <div>
                            <h4 className={`text-sm font-bold ${quest.isCompleted ? 'text-brand-grey line-through' : 'text-brand-black'}`}>{quest.title}</h4>
                            <p className="text-xs text-brand-grey mt-0.5 font-medium flex items-center gap-1">
                                Награда: <span className={`${quest.rewardCurrency === CurrencyType.GOLD ? 'text-brand-gold' : 'text-slate-500'} font-bold`}>+{quest.rewardAmount} {quest.rewardCurrency === CurrencyType.GOLD ? 'Gold' : 'Silver'}</span>
                            </p>
                        </div>
                    </div>
                    {!quest.isCompleted && <ChevronRight size={16} className="text-brand-light" />}
                </div>
            ))}
        </div>
      </div>

      {/* 4. Statistics Section (ТВОЙ КОД БЕЗ ИЗМЕНЕНИЙ) */}
      <div className="mt-10 px-6 pb-6">
          <h3 className="text-lg font-bold text-brand-black mb-4">Статистика продаж</h3>
          <div className="bg-brand-white rounded-3xl p-6 shadow-sm border border-brand-light">
              <div className="space-y-6">
                  {stats.map(stat => (
                      <div key={stat.id}>
                          <div className="flex justify-between items-end mb-2">
                              <span className="text-sm font-bold text-brand-black">{stat.name}</span>
                              <span className="text-xs font-medium text-brand-grey">{stat.sales} / {stat.totalUnits} кв.</span>
                          </div>
                          <div className="h-2 w-full bg-brand-cream rounded-full overflow-hidden">
                              <div 
                                className={`h-full rounded-full ${stat.color}`} 
                                style={{ width: `${(stat.sales / 20) * 100}%` }} 
                              ></div>
                          </div>
                      </div>
                  ))}
              </div>
              
              <div className="mt-6 pt-4 border-t border-brand-light flex justify-between items-center">
                  <span className="text-xs text-brand-grey font-medium">Всего за месяц</span>
                  <span className="text-xl font-black text-brand-black">{user.dealsClosed} сделок</span>
              </div>
          </div>
      </div>
    </div>
  );
};

export default Dashboard;
