import React from 'react';
import { CurrencyType, ShopItem } from '../types';
import { Lock, ShoppingBag } from 'lucide-react';

interface ShopProps {
  wallet: { [key in CurrencyType]: number };
  onPurchase: (cost: number, type: CurrencyType) => void;
}

const MERCH_ITEMS: ShopItem[] = [
  { id: 'm1', name: 'Кружка', description: 'Оранжевая керамика', cost: 50, currency: CurrencyType.COMMON, image: '☕' },
  { id: 'm2', name: 'Футболка', description: 'Строим Будущее', cost: 120, currency: CurrencyType.COMMON, image: '👕' },
  { id: 'm3', name: 'Каска', description: 'Сувенирная защита', cost: 300, currency: CurrencyType.COMMON, image: '⛑️' },
];

const RARE_ITEMS: ShopItem[] = [
  { id: 'r1', name: 'Колонка', description: 'Яндекс Станция', cost: 5, currency: CurrencyType.RARE, image: '🔊' },
  { id: 'r2', name: 'Сертификат', description: 'Ozon 5000р', cost: 10, currency: CurrencyType.RARE, image: '💳' },
];

const LEGENDARY_ITEMS: ShopItem[] = [
  { id: 'l1', name: 'Путевка', description: 'Сочи, 7 ночей', cost: 1, currency: CurrencyType.LEGENDARY, image: '🏖️' },
  { id: 'l2', name: 'MacBook', description: 'Air M2', cost: 2, currency: CurrencyType.LEGENDARY, image: '💻' },
  { id: 'l3', name: 'Бонус', description: '100,000р на счет', cost: 1, currency: CurrencyType.LEGENDARY, image: '💰' },
];

const ShopSection: React.FC<{ 
  title: string; 
  items: ShopItem[]; 
  currencyIcon: string; 
  userBalance: number; 
  onBuy: (item: ShopItem) => void;
}> = ({ title, items, currencyIcon, userBalance, onBuy }) => (
  <div className="mb-10 pl-6">
    <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center justify-between pr-6">
      {title}
      <span className="text-xs font-bold bg-slate-100 text-slate-500 px-2 py-1 rounded-lg">
        Доступно: {userBalance} {currencyIcon}
      </span>
    </h3>
    
    <div className="flex overflow-x-auto pb-8 gap-4 snap-x pr-6 no-scrollbar">
      {items.map(item => {
        const canAfford = userBalance >= item.cost;
        return (
          <div 
            key={item.id} 
            className={`
              min-w-[160px] bg-white rounded-[2rem] p-5 flex flex-col items-center text-center snap-center relative group transition-all duration-300
              ${canAfford ? 'shadow-[0_10px_30px_-5px_rgba(0,0,0,0.05)] hover:scale-[1.02]' : 'opacity-60 grayscale-[0.5] shadow-none border border-slate-100'}
            `}
          >
            <div className="w-20 h-20 mb-4 flex items-center justify-center text-5xl emoji-3d group-hover:scale-110 transition-transform duration-300">
              {item.image}
            </div>
            
            <h4 className="font-bold text-slate-800 mb-1 text-sm">{item.name}</h4>
            <p className="text-[10px] text-slate-400 mb-4 line-clamp-2 h-8 font-medium">{item.description}</p>
            
            <button
              onClick={() => onBuy(item)}
              disabled={!canAfford}
              className={`
                w-full py-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1 transition-all
                ${canAfford 
                  ? 'bg-slate-900 text-white hover:bg-orange-600 shadow-lg hover:shadow-orange-200' 
                  : 'bg-slate-100 text-slate-400 cursor-not-allowed'}
              `}
            >
              {!canAfford && <Lock size={10} />}
              {item.cost} {currencyIcon}
            </button>
          </div>
        );
      })}
    </div>
  </div>
);

const Shop: React.FC<ShopProps> = ({ wallet, onPurchase }) => {
  const handleBuy = (item: ShopItem) => {
    if (wallet[item.currency] >= item.cost) {
      if (window.confirm(`Купить "${item.name}" за ${item.cost}?`)) {
        onPurchase(item.cost, item.currency);
      }
    }
  };

  return (
    <div className="pt-6 pb-24 animate-slide-up">
      <header className="px-6 mb-6">
        <h2 className="text-3xl font-extrabold text-slate-800 tracking-tight flex items-center gap-3">
          Маркет <ShoppingBag className="text-orange-500 fill-current" size={24} />
        </h2>
        <p className="text-slate-500 text-sm mt-1 font-medium">Обменивайте достижения на призы</p>
      </header>

      <ShopSection 
        title="Мерч" 
        items={MERCH_ITEMS} 
        currencyIcon="🧱" 
        userBalance={wallet[CurrencyType.COMMON]} 
        onBuy={handleBuy}
      />
      <ShopSection 
        title="Техника" 
        items={RARE_ITEMS} 
        currencyIcon="🏆" 
        userBalance={wallet[CurrencyType.RARE]} 
        onBuy={handleBuy}
      />
      <ShopSection 
        title="Эксклюзив" 
        items={LEGENDARY_ITEMS} 
        currencyIcon="💎" 
        userBalance={wallet[CurrencyType.LEGENDARY]} 
        onBuy={handleBuy}
      />
    </div>
  );
};

export default Shop;