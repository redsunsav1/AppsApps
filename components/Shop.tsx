import React from 'react';
import { ShoppingBag, Lock } from 'lucide-react';
import { CurrencyType } from '../types';

interface Props {
  userSilver: number;
  userGold: number;
}

const ITEMS = [
  { id: 1, name: 'Фирменный Худи', price: 5000, type: CurrencyType.SILVER, img: '🧥' },
  { id: 2, name: 'Сертификат OZON 3000₽', price: 15000, type: CurrencyType.SILVER, img: '💳' },
  { id: 3, name: 'PowerBank 20000mAh', price: 8000, type: CurrencyType.SILVER, img: '🔋' },
  { id: 4, name: 'Брендированный Ежедневник', price: 2000, type: CurrencyType.SILVER, img: '📔' },
  { id: 5, name: 'Ужин в ресторане "Sky"', price: 1, type: CurrencyType.GOLD, img: '🍽️' },
  { id: 6, name: 'iPhone 15 Pro', price: 10, type: CurrencyType.GOLD, img: '📱' },
  { id: 7, name: 'Путевка в Дубай', price: 50, type: CurrencyType.GOLD, img: '✈️' },
  { id: 8, name: 'MacBook Air M3', price: 25, type: CurrencyType.GOLD, img: '💻' },
];

const Shop: React.FC<Props> = ({ userSilver, userGold }) => {
  return (
    <div className="pb-36 pt-6 px-4 animate-fade-in">
      {/* Баланс */}
      <div className="bg-[#433830] text-white p-5 rounded-2xl mb-6 flex justify-between items-center shadow-lg relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-[#BA8F50] opacity-10 rounded-full -mr-10 -mt-10 pointer-events-none" />
        <span className="text-sm font-medium opacity-80">Доступно для трат:</span>
        <div className="flex gap-4 font-bold text-lg z-10">
          <span className="flex items-center gap-1">{userSilver.toLocaleString()} 🪙</span>
          <span className="flex items-center gap-1 text-[#BA8F50]">{userGold} 🏆</span>
        </div>
      </div>

      <h2 className="font-extrabold text-2xl text-[#433830] mb-4 pl-2">Витрина призов</h2>
      
      <div className="grid grid-cols-2 gap-3">
        {ITEMS.map(item => {
          const canBuy = item.type === CurrencyType.SILVER ? userSilver >= item.price : userGold >= item.price;
          
          return (
            <div key={item.id} className="bg-white p-3 rounded-2xl border border-[#EAE0D5] shadow-sm flex flex-col relative overflow-hidden h-48">
              {/* Бейдж валюты */}
              <div className={`absolute top-0 right-0 px-2.5 py-1 text-[9px] font-bold rounded-bl-xl text-white ${item.type === CurrencyType.SILVER ? 'bg-gray-400' : 'bg-[#BA8F50]'}`}>
                {item.type === CurrencyType.SILVER ? 'БОНУСЫ' : 'ЗОЛОТО'}
              </div>

              <div className="text-5xl text-center mb-2 mt-4">{item.img}</div>
              
              <div className="flex-1 min-h-0">
                 <h3 className="font-bold text-xs leading-tight text-[#433830] line-clamp-2">{item.name}</h3>
              </div>
              
              <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100">
                <span className={`font-bold text-sm ${item.type === CurrencyType.GOLD ? 'text-[#BA8F50]' : 'text-gray-600'}`}>
                  {item.price} {item.type === CurrencyType.SILVER ? '🪙' : '🏆'}
                </span>
                
                <button 
                  disabled={!canBuy}
                  className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${canBuy ? 'bg-[#433830] text-white active:scale-95' : 'bg-gray-100 text-gray-300'}`}
                >
                  {canBuy ? <ShoppingBag size={14} /> : <Lock size={14} />}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default Shop;
