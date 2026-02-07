import React, { useMemo, useState, useEffect } from 'react';
import { ShopItem, CurrencyType } from '../types';
import { Lock } from 'lucide-react';
import WebApp from '@twa-dev/sdk';

interface MarketplaceProps {
  items?: ShopItem[];
  silver?: number;
  gold?: number;
  userSilver?: number;
  userGold?: number;
  isAdmin?: boolean;
  onPurchase?: (item: ShopItem) => void;
}

const Marketplace: React.FC<MarketplaceProps> = ({ items: propItems, silver: silverProp, gold: goldProp, userSilver, userGold, isAdmin, onPurchase }) => {
  const silver = userSilver ?? silverProp ?? 0;
  const gold = userGold ?? goldProp ?? 0;

  const [fetchedItems, setFetchedItems] = useState<ShopItem[]>([]);

  useEffect(() => {
    fetch('/api/products')
      .then(res => res.json())
      .then(data => {
        const mapped: ShopItem[] = data.map((p: any) => ({
          id: String(p.id),
          name: p.title || '',
          category: p.category || 'MERCH',
          price: p.price || 0,
          currency: p.currency === 'GOLD' ? CurrencyType.GOLD : CurrencyType.SILVER,
          image: p.image_url || '🎁',
          inStock: p.is_active !== false,
        }));
        setFetchedItems(mapped);
      })
      .catch(e => console.error('Products fetch error:', e));
  }, []);

  const items = propItems && propItems.length > 0 ? propItems : fetchedItems;

  const handlePurchase = (item: ShopItem) => {
    if (onPurchase) { onPurchase(item); return; }
    const initData = WebApp.initData;
    if (!initData) return;
    fetch('/api/buy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData, productId: parseInt(item.id) }),
    })
    .then(res => res.json())
    .then(data => {
      if (data.success) alert('Покупка успешна!');
      else alert(data.error || 'Ошибка покупки');
    })
    .catch(() => alert('Ошибка сети'));
  };

  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => {
        if (a.currency !== b.currency) return a.currency === CurrencyType.GOLD ? 1 : -1;
        return a.price - b.price;
    });
  }, [items]);

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

      <div className="px-4 py-4 grid grid-cols-2 gap-3">
        {sortedItems.length === 0 && (
          <div className="col-span-2 text-center py-10 text-brand-grey text-sm">Товаров пока нет</div>
        )}
        {sortedItems.map((item) => {
          const userBalance = item.currency === CurrencyType.SILVER ? silver : gold;
          const canAfford = userBalance >= item.price;
          const isGold = item.currency === CurrencyType.GOLD;

          return (
            <div 
              key={item.id} 
              className={`
                group p-4 rounded-2xl shadow-sm border flex flex-col relative overflow-hidden transition-all active:scale-[0.98]
                ${isGold 
                    ? 'bg-gradient-to-br from-[#D6C4A8] to-[#C5B191] border-[#C5B191]' 
                    : 'bg-brand-white border-brand-light'}
              `}
            >
              {/* Image Placeholder */}
              <div className={`aspect-square rounded-xl mb-4 flex items-center justify-center text-5xl group-hover:scale-105 transition-transform duration-500 ${isGold ? 'bg-white/20' : 'bg-brand-cream'}`}>
                {item.image}
              </div>

              <div className="flex-1 flex flex-col">
                <div className="mb-2">
                   <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md border ${isGold ? 'text-brand-black/60 border-brand-black/10' : 'text-brand-grey border-brand-cream'}`}>
                     {item.category}
                   </span>
                </div>
                <h3 className={`font-bold text-sm leading-tight mb-1 ${isGold ? 'text-brand-black' : 'text-brand-black'}`}>{item.name}</h3>
                <div className="mt-auto pt-3">
                    <button
                    onClick={() => handlePurchase(item)}
                    disabled={!canAfford || !item.inStock}
                    className={`
                        w-full py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all
                        ${isGold 
                            ? (canAfford ? 'bg-brand-black text-brand-gold hover:bg-brand-black/80' : 'bg-black/10 text-black/30') 
                            : (canAfford ? 'bg-brand-black text-brand-gold hover:bg-brand-black/80' : 'bg-brand-light text-white')}
                    `}
                    >
                    {!canAfford && <Lock size={12} />}
                    {item.inStock ? (
                        <>
                            {item.price.toLocaleString()} 
                            {isGold 
                                ? <div className="w-3 h-3 rounded-full bg-brand-gold border border-brand-black flex items-center justify-center text-[6px] font-bold text-black">X</div>
                                : <div className="w-3 h-3 rounded-full bg-slate-300 border border-slate-400"></div>
                            }
                        </>
                    ) : 'Нет в наличии'}
                    </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default Marketplace;