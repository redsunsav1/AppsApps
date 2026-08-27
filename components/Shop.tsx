import React from 'react';
import { Lock } from 'lucide-react';

interface MarketplaceProps {
  userSilver?: number;
  userGold?: number;
  silver?: number;
  gold?: number;
  isAdmin?: boolean;
}

// Призы показываем силуэтами: фотографий товаров нет, а под размытием от снимка
// всё равно осталось бы пятно. Форму видно, деталей — нет: ровно то, что нужно анонсу.
const IPhone = () => (
  <svg viewBox="0 0 100 120" className="h-24" aria-hidden>
    <rect x="18" y="6" width="64" height="108" rx="16" fill="#433830" />
    <rect x="23" y="11" width="54" height="98" rx="12" fill="#6B5C4E" />
    <rect x="27" y="15" width="27" height="27" rx="9" fill="#3A312A" />
    <circle cx="35" cy="23" r="4.5" fill="#241D18" />
    <circle cx="46" cy="23" r="4.5" fill="#241D18" />
    <circle cx="35" cy="34" r="4.5" fill="#241D18" />
  </svg>
);

const Headphones = () => (
  <svg viewBox="0 0 120 100" className="h-24" aria-hidden>
    <path d="M22 58 Q22 16 60 16 Q98 16 98 58" fill="none" stroke="#D6C4A8" strokeWidth="10" strokeLinecap="round" />
    <rect x="6" y="44" width="34" height="48" rx="14" fill="#E0CCAF" />
    <rect x="80" y="44" width="34" height="48" rx="14" fill="#E0CCAF" />
    <rect x="14" y="53" width="18" height="30" rx="9" fill="#D6C4A8" />
    <rect x="88" y="53" width="18" height="30" rx="9" fill="#D6C4A8" />
  </svg>
);

const Tee = () => (
  <svg viewBox="0 0 100 100" className="h-24" aria-hidden>
    <path
      d="M34 18 L44 13 Q50 22 56 13 L66 18 L88 32 L78 47 L70 40 L70 88 Q50 92 30 88 L30 40 L22 47 L12 32 Z"
      fill="#D9C3A2"
    />
    <path d="M44 13 Q50 24 56 13" fill="none" stroke="#C2AB88" strokeWidth="4" />
  </svg>
);

const Hoodie = () => (
  <svg viewBox="0 0 100 100" className="h-24" aria-hidden>
    <path
      d="M30 28 L40 22 L60 22 L70 28 L90 42 L80 56 L70 48 L70 90 Q50 94 30 90 L30 48 L20 56 L10 42 Z"
      fill="#D9C3A2"
    />
    <path d="M35 27 Q50 13 65 27 Q66 34 58 36 Q50 40 42 36 Q34 34 35 27 Z" fill="#C2AB88" />
    <rect x="34" y="60" width="32" height="19" rx="7" fill="#C2AB88" />
    <path d="M44 34 L43 50 M56 34 L57 50" stroke="#F7F2E8" strokeWidth="4" strokeLinecap="round" />
  </svg>
);

const PRIZES = [
  { name: 'iPhone 17 Pro', art: <IPhone /> },
  { name: 'AirPods Max', art: <Headphones /> },
  { name: 'Футболка клуба', art: <Tee /> },
  { name: 'Худи клуба', art: <Hoodie /> },
];

// Магазин закрыт до запуска: каталог не показываем, но даём увидеть, ради чего
// копятся баллы. Товарами по-прежнему управляет админка — как откроем, сюда
// вернётся сетка из /api/products (см. историю файла).
const Marketplace: React.FC<MarketplaceProps> = ({ userSilver, userGold, silver: silverProp, gold: goldProp }) => {
  const silver = userSilver ?? silverProp ?? 0;
  const gold = userGold ?? goldProp ?? 0;

  return (
    <div className="pb-36 animate-fade-in">
      <header className="px-6 pt-8 pb-6 sticky top-0 bg-brand-cream/95 z-20 backdrop-blur-md border-b border-brand-gold/10">
        <div className="flex justify-between items-end">
          <div>
            <h2 className="text-2xl font-bold text-brand-black">Маркет</h2>
            <p className="text-brand-grey text-sm mt-1">Каталог наград</p>
          </div>
          <div className="flex gap-2">
             {/* Silver Badge */}
             <div className="bg-brand-white px-3 py-1.5 rounded-full border border-brand-light flex items-center gap-1.5 shadow-sm">
                <div className="w-3 h-3 rounded-full bg-slate-300 border border-slate-400"></div>
                <span className="font-bold text-brand-black text-xs">{silver.toLocaleString()}</span>
             </div>
             {/* Gold Badge */}
             <div className="bg-brand-black px-3 py-1.5 rounded-full border border-brand-black flex items-center gap-1.5 shadow-sm">
                <div className="w-3 h-3 rounded-full bg-brand-gold border border-brand-black flex items-center justify-center text-[6px] font-bold text-black">X</div>
                <span className="font-bold text-brand-gold text-xs">{gold.toLocaleString()}</span>
             </div>
          </div>
        </div>
      </header>

      <div className="mx-4 mt-5 bg-brand-white rounded-2xl border border-brand-beige p-6 text-center shadow-sm">
        <div className="w-14 h-14 rounded-full bg-brand-gold/15 mx-auto flex items-center justify-center text-brand-gold">
          <Lock size={24} />
        </div>
        <h3 className="text-lg font-extrabold text-brand-black mt-4 leading-snug">
          Совсем скоро станет доступен внутренний магазин
        </h3>
        <p className="text-sm text-brand-grey mt-2 leading-relaxed">
          Баллы за брони и миссии копятся уже сейчас — потратить их можно будет здесь.
        </p>
      </div>

      {/* Витрина до открытия: силуэты видно, деталей — нет */}
      <div
        aria-hidden
        className="px-4 mt-5 grid grid-cols-2 gap-3 select-none pointer-events-none"
        style={{
          filter: 'blur(5px)',
          WebkitMaskImage: 'linear-gradient(to bottom, #000 88%, transparent 100%)',
          maskImage: 'linear-gradient(to bottom, #000 88%, transparent 100%)',
        }}
      >
        {PRIZES.map((prize) => (
          <div
            key={prize.name}
            className="bg-brand-white rounded-2xl border border-brand-light p-4 flex flex-col items-center gap-3 shadow-sm"
          >
            <div className="h-24 flex items-center justify-center">{prize.art}</div>
            <span className="text-sm font-bold text-brand-black text-center leading-tight">{prize.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Marketplace;
