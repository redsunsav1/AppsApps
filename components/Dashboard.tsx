import React, { useRef, useState } from 'react';
import BookingChecklist from './BookingChecklist';
import { UserProfile, DailyQuest, ProjectStat, CurrencyType, getRank, Mission } from '../types';
import { ChevronRight, ChevronDown, CheckCircle2, Circle, Zap, Phone, Send, MessageCircle, FileText, Camera, Target, Trophy, Key, Layers, Crown, MapPin, Globe, User, Flame } from 'lucide-react';
import WebApp from '@twa-dev/sdk';

interface DashboardProps {
  user: UserProfile;
  quests: DailyQuest[];
  stats: ProjectStat[];
  missions: Mission[];
  onClaimQuest: (id: string) => void;
}

const MISSION_ICONS: Record<string, React.ReactNode> = {
  key: <Key size={18} />,
  layers: <Layers size={18} />,
  trophy: <Trophy size={18} />,
  crown: <Crown size={18} />,
  map: <MapPin size={18} />,
  globe: <Globe size={18} />,
  user: <User size={18} />,
  flame: <Flame size={18} />,
  fire: <Flame size={18} />,
  star: <Target size={18} />,
};

const Dashboard: React.FC<DashboardProps> = ({ user, quests, stats, missions, onClaimQuest }) => {
  const progressPercent = (user.currentXP / user.nextLevelXP) * 100;
  const currentRank = getRank(user.dealsClosed);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [avatarUrl, setAvatarUrl] = useState(user.avatar || '');
  const [showMissions, setShowMissions] = useState(false);

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 500 * 1024) {
      alert('Фото слишком большое (макс. 500KB)');
      return;
    }
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const base64 = ev.target?.result as string;
      setAvatarUrl(base64);
      try {
        await fetch('/api/avatar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ initData: WebApp.initData, avatarData: base64 }),
        });
      } catch (e) {
        console.error('Avatar upload error:', e);
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="pb-36 animate-fade-in">
      {/* Header / Profile Summary */}
      <div className="pt-8 px-6 pb-8 bg-brand-white rounded-b-[2.5rem] shadow-sm relative z-10">
         <div className="flex justify-between items-start mb-6">
            <div>
                 <h1 className="text-2xl font-extrabold text-brand-black">Мой профиль</h1>
                 <p className="text-brand-grey text-xs font-medium mt-1">Клуб партнеров</p>
            </div>
            <div className="flex flex-col items-end">
                <div className="bg-brand-gold/10 px-3 py-1.5 rounded-lg border border-brand-gold/20">
                    <span className="text-xs font-bold text-brand-gold uppercase tracking-wider block text-right">{currentRank}</span>
                </div>
                <span className="text-[10px] text-brand-grey font-bold mt-1">{user.dealsClosed} продаж</span>
            </div>
         </div>

         <div className="flex items-center gap-5 mb-8">
             <div className="relative shrink-0">
                <div className="relative shrink-0">
                    <div className="w-20 h-20 rounded-full p-1 bg-gradient-to-br from-brand-gold to-brand-beige">
                        <img src={avatarUrl || 'https://images.unsplash.com/photo-1560250097-0b93528c311a?ixlib=rb-4.0.3&auto=format&fit=crop&w=256&q=80'} alt="Profile" className="w-full h-full rounded-full object-cover border-2 border-white" />
                    </div>
                    <button onClick={() => fileInputRef.current?.click()} className="absolute bottom-0 right-0 w-7 h-7 bg-brand-gold rounded-full flex items-center justify-center text-white shadow-md border-2 border-white hover:scale-110 transition-transform">
                        <Camera size={14} />
                    </button>
                    <input ref={fileInputRef} type="file" accept="image/*" onChange={handleAvatarChange} className="hidden" />
                </div>
                <div className="absolute -bottom-2 -right-2 bg-brand-white text-brand-black text-xs font-bold px-2.5 py-1 rounded-lg border border-brand-light shadow-sm">
                    Lvl {user.level}
                </div>
             </div>
             <div className="flex-1 space-y-3">
                 <div className="flex items-center justify-between bg-brand-cream p-2 rounded-xl border border-brand-beige">
                    <span className="text-xs font-semibold text-brand-black/60 uppercase">Silver</span>
                    <div className="flex items-center gap-1.5">
                        <span className="font-bold text-brand-black text-lg">{user.silverCoins.toLocaleString()}</span>
                        <div className="w-4 h-4 rounded-full bg-slate-300 border border-slate-400"></div>
                    </div>
                 </div>
                 <div className="flex items-center justify-between bg-gradient-to-r from-brand-gold/20 to-brand-gold/5 p-2 rounded-xl border border-brand-gold/20">
                    <span className="text-xs font-semibold text-brand-gold uppercase">Gold</span>
                    <div className="flex items-center gap-1.5">
                        <span className="font-bold text-brand-black text-lg">{user.goldCoins.toLocaleString()}</span>
                        <div className="w-4 h-4 rounded-full bg-brand-gold border border-brand-black flex items-center justify-center text-[8px] font-bold text-black">X</div>
                    </div>
                 </div>
             </div>
         </div>

         <div className="flex justify-between text-[10px] font-bold text-brand-grey uppercase tracking-wide mb-1">
            <span>До уровня {user.level + 1}</span>
            <span>{user.currentXP} / {user.nextLevelXP} XP</span>
         </div>
         <div className="h-1.5 w-full bg-brand-light rounded-full overflow-hidden">
            <div className="h-full bg-brand-gold rounded-full transition-all duration-1000 ease-out" style={{ width: `${progressPercent}%` }}></div>
         </div>
      </div>

      {/* Business Card / Contacts */}
      <div className="mt-6 mx-4">
         <div className="bg-white rounded-2xl p-5 shadow-sm border border-brand-light">
            <h3 className="text-sm font-bold text-brand-black mb-4 uppercase tracking-wide opacity-70">Визитка</h3>

            <div className="grid grid-cols-3 gap-3">
                <a href={`https://t.me/${(user.telegram || '').replace('@', '')}`} target="_blank" rel="noreferrer"
                   className="flex flex-col items-center justify-center gap-2 py-4 bg-blue-50 rounded-xl border border-blue-100 active:scale-[0.97] transition-transform">
                    <div className="w-10 h-10 bg-blue-500 text-white rounded-full flex items-center justify-center shadow-md shadow-blue-200">
                        <Send size={18} className="-ml-0.5 mt-0.5" />
                    </div>
                    <span className="text-[10px] font-bold text-blue-600">Telegram</span>
                </a>

                <a href={`https://wa.me/${(user.whatsapp || '').replace(/[^0-9]/g, '')}`} target="_blank" rel="noreferrer"
                   className="flex flex-col items-center justify-center gap-2 py-4 bg-green-50 rounded-xl border border-green-100 active:scale-[0.97] transition-transform">
                    <div className="w-10 h-10 bg-green-500 text-white rounded-full flex items-center justify-center shadow-md shadow-green-200">
                        <MessageCircle size={18} />
                    </div>
                    <span className="text-[10px] font-bold text-green-600">WhatsApp</span>
                </a>

                <a href={`tel:${user.phone}`}
                   className="flex flex-col items-center justify-center gap-2 py-4 bg-brand-cream rounded-xl border border-brand-beige active:scale-[0.97] transition-transform">
                    <div className="w-10 h-10 bg-brand-black text-brand-gold rounded-full flex items-center justify-center shadow-md">
                        <Phone size={18} />
                    </div>
                    <span className="text-[10px] font-bold text-brand-black">Позвонить</span>
                </a>
            </div>

            <div className="mt-4 flex justify-center">
                <p className="text-xs text-brand-grey font-medium">{user.phone}</p>
            </div>
         </div>
      </div>

      {/* My Bookings */}
      <div className="mt-6 mx-4">
         <div className="bg-white rounded-2xl p-5 shadow-sm border border-brand-light">
            <h3 className="text-sm font-bold text-brand-black mb-4 uppercase tracking-wide opacity-70 flex items-center gap-2">
                <FileText size={16} /> Мои бронирования
            </h3>
            <BookingChecklist />
         </div>
      </div>

      {/* Missions */}
      <div className="mt-6 mx-4">
        <button
          onClick={() => setShowMissions(!showMissions)}
          className="w-full bg-white rounded-2xl p-5 shadow-sm border border-brand-light flex items-center justify-between active:scale-[0.99] transition-transform"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-brand-gold/10 rounded-full flex items-center justify-center text-brand-gold">
              <Target size={20} />
            </div>
            <div className="text-left">
              <h3 className="text-sm font-bold text-brand-black">Миссии</h3>
              <p className="text-[11px] text-brand-grey mt-0.5">
                {missions.filter(m => m.completed).length} из {missions.length} выполнено
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Mini progress ring */}
            <div className="relative w-9 h-9">
              <svg className="w-9 h-9 -rotate-90" viewBox="0 0 36 36">
                <circle cx="18" cy="18" r="15" fill="none" stroke="#f0ece4" strokeWidth="3" />
                <circle cx="18" cy="18" r="15" fill="none" stroke="#c9a96e" strokeWidth="3"
                  strokeDasharray={`${missions.length > 0 ? (missions.filter(m => m.completed).length / missions.length) * 94.2 : 0} 94.2`}
                  strokeLinecap="round" />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-brand-black">
                {missions.length > 0 ? Math.round((missions.filter(m => m.completed).length / missions.length) * 100) : 0}%
              </span>
            </div>
            {showMissions ? <ChevronDown size={18} className="text-brand-grey" /> : <ChevronRight size={18} className="text-brand-grey" />}
          </div>
        </button>

        {showMissions && (
          <div className="mt-2 space-y-2 animate-fade-in">
            {missions.map(mission => {
              const pct = Math.min((mission.progress / mission.target_count) * 100, 100);
              return (
                <div
                  key={mission.id}
                  className={`bg-white rounded-2xl p-4 border transition-all ${
                    mission.completed ? 'border-green-200 bg-green-50/30' : 'border-brand-light shadow-sm'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
                      mission.completed ? 'bg-green-100 text-green-600' : 'bg-brand-cream text-brand-gold'
                    }`}>
                      {mission.completed ? <CheckCircle2 size={18} /> : (MISSION_ICONS[mission.icon] || <Target size={18} />)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <h4 className={`text-sm font-bold ${mission.completed ? 'text-green-700' : 'text-brand-black'}`}>
                          {mission.title}
                        </h4>
                        <span className={`text-[11px] font-bold shrink-0 px-2 py-0.5 rounded-full ${
                          mission.reward_currency === 'GOLD'
                            ? 'bg-brand-gold/15 text-brand-gold'
                            : 'bg-slate-100 text-slate-500'
                        }`}>
                          +{mission.reward_amount} {mission.reward_currency === 'GOLD' ? 'Gold' : 'Silver'}
                        </span>
                      </div>
                      <p className="text-[11px] text-brand-grey mt-0.5">{mission.description}</p>
                      {!mission.completed && (
                        <div className="mt-2">
                          <div className="flex items-center justify-between text-[10px] font-bold text-brand-grey mb-1">
                            <span>Прогресс</span>
                            <span>{mission.progress} / {mission.target_count}</span>
                          </div>
                          <div className="h-1.5 w-full bg-brand-light rounded-full overflow-hidden">
                            <div
                              className="h-full bg-brand-gold rounded-full transition-all duration-500"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      )}
                      {mission.completed && (
                        <p className="text-[10px] text-green-600 font-medium mt-1">Выполнено!</p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Daily Quests */}
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

      {/* Statistics Section */}
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
