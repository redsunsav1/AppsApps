import React, { useState, useEffect } from 'react';
import { ShoppingBag, Lock, Trash2 } from 'lucide-react';
import WebApp from '@twa-dev/sdk';
import { ShopItem, CurrencyType } from '../types';

interface Props {
  userSilver: number;
  userGold: number;
  isAdmin?: boolean; 
}

const Shop: React.FC<Props> = ({ userSilver, userGold, isAdmin }) => {
  const [items, setItems] = useState<ShopItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchProducts = () => {
    fetch('/api/products')
        .then(res => res.json())
        .then(data => setItems(data))
        .catch(console.error)
        .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  const handleBuy = async (item: ShopItem) => {
    if (!window.confirm(`Купить "${item.title}" за ${item.price}?`)) return;
    
    try {
        const res = await fetch('/api/buy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ initData: WebApp.initData, productId: item.id })
        });
        
        if (res.ok) {
            alert('Покупка успешна! Менеджер свяжется с вами.');
            window.location.reload(); 
        } else {
            alert('Ошибка: Недостаточно средств');
        }
    } catch (e) {
        alert('Ошибка сети');
    }
  };

  const handleDelete = async (id: number) => {
      if(!window.confirm('Удалить товар?')) return;
      await fetch(`/api/products/${id}`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ initData: WebApp.initData })
      });
      fetchProducts();
  };

  return (
    <div className="pb-36 pt-6 px-4 animate-fade-in">
      {/* Баланс */}
      <div className="bg-[#433830] text-white p-5 rounded-2xl mb-6 flex justify-between items-center shadow-lg relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-[#BA8F50] opacity-10 rounded-full -mr-10 -mt-10 pointer-events-none" />
        <span className="text-sm font-medium opacity-80">Доступно:</span>
        <div className="flex gap-4 font-bold text-lg z-10">
          <span className="flex items-center gap-1">{userSilver} 🪙</span>
          <span className="flex items-center gap-1 text-[#BA8F50]">{userGold} 🏆</span>
        </div>
      </div>

      <h2 className="font-extrabold text-2xl text-[#433830] mb-4 pl-2">Витрина</h2>
      
      {items.length === 0 ? (
          <div className="text-center text-gray-400 mt-10">Витрина пока пуста...</div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
            {items.map(item => {
            const canBuy = item.currency === 'SILVER' ? userSilver >= item.price : userGold >= item.price;
            
            return (
                <div key={item.id} className="bg-white p-3 rounded-2xl border border-[#EAE0D5] shadow-sm flex flex-col relative overflow-hidden h-56 group">
                
                {/* Админское удаление */}
                {isAdmin && (
                    <button onClick={() => handleDelete(item.id)} className="absolute top-2 left-2 bg-red-500 text-white p-1 rounded z-20 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Trash2 size={14} />
                    </button>
                )}

                {/* Бейдж валюты */}
                <div className={`absolute top-0 right-0 px-2.5 py-1 text-[9px] font-bold rounded-bl-xl text-white ${item.currency === 'SILVER' ? 'bg-gray-400' : 'bg-[#BA8F50]'}`}>
                    {item.currency === 'SILVER' ? 'БОНУСЫ' : 'ЗОЛОТО'}
                </div>

                {/* Картинка */}
                <div className="h-24 w-full mb-2 flex items-center justify-center bg-gray-50 rounded-xl overflow-hidden">
                    {item.image_url ? (
                        <img src={item.image_url} className="w-full h-full object-cover" />
                    ) : (
                        <span className="text-2xl">🎁</span>
                    )}
                </div>
                
                <div className="flex-1 min-h-0">
                    <h3 className="font-bold text-xs leading-tight text-[#433830] line-clamp-2">{item.title}</h3>
                </div>
                
                <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100">
                    <span className={`font-bold text-sm ${item.currency === 'GOLD' ? 'text-[#BA8F50]' : 'text-gray-600'}`}>
                    {item.price} {item.currency === 'SILVER' ? '🪙' : '🏆'}
                    </span>
                    
                    <button 
                    disabled={!canBuy}
                    onClick={() => handleBuy(item)}
                    className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${canBuy ? 'bg-[#433830] text-white active:scale-95' : 'bg-gray-100 text-gray-300'}`}
                    >
                    {canBuy ? <ShoppingBag size={14} /> : <Lock size={14} />}
                    </button>
                </div>
                </div>
            );
            })}
        </div>
      )}
    </div>
  );
};

export default Shop;
