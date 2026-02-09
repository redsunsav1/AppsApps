import React from 'react';
import { Trophy, Calendar, Calculator, ArrowRight } from 'lucide-react';

export type SectionView = 'hub' | 'leaderboard' | 'calendar' | 'mortgage';

interface SectionsHubProps {
  onNavigate: (view: SectionView) => void;
}

const CARDS = [
  {
    key: 'leaderboard' as SectionView,
    icon: Trophy,
    title: 'Рейтинг',
    subtitle: 'Топ партнёров по сделкам',
    gradient: 'from-amber-50 to-orange-50',
    iconBg: 'bg-amber-100 text-amber-600',
  },
  {
    key: 'calendar' as SectionView,
    icon: Calendar,
    title: 'Календарь',
    subtitle: 'Брокер-туры и мероприятия',
    gradient: 'from-blue-50 to-indigo-50',
    iconBg: 'bg-blue-100 text-blue-600',
  },
  {
    key: 'mortgage' as SectionView,
    icon: Calculator,
    title: 'Ипотека',
    subtitle: 'Калькулятор и программы',
    gradient: 'from-emerald-50 to-teal-50',
    iconBg: 'bg-emerald-100 text-emerald-600',
  },
];

const SectionsHub: React.FC<SectionsHubProps> = ({ onNavigate }) => {
  return (
    <div className="pb-36 pt-6 animate-fade-in">
      <header className="px-6 mb-6">
        <h2 className="text-2xl font-extrabold text-brand-black">Разделы</h2>
        <p className="text-brand-grey text-sm mt-1">Полезные инструменты и рейтинг</p>
      </header>

      <div className="px-4 space-y-4">
        {CARDS.map((card) => (
          <button
            key={card.key}
            onClick={() => onNavigate(card.key)}
            className={`
              w-full flex items-center gap-4 p-5 rounded-2xl border border-brand-light
              bg-gradient-to-r ${card.gradient}
              shadow-sm active:scale-[0.98] transition-all text-left
            `}
          >
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${card.iconBg} shrink-0`}>
              <card.icon size={28} />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-extrabold text-brand-black text-lg">{card.title}</h3>
              <p className="text-brand-grey text-sm mt-0.5">{card.subtitle}</p>
            </div>
            <ArrowRight size={20} className="text-brand-grey shrink-0" />
          </button>
        ))}
      </div>
    </div>
  );
};

export default SectionsHub;
