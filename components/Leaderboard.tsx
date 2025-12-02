import React from 'react';
import { Trophy } from 'lucide-react';

const USERS = [
  { id: 1, name: 'Елена Волкова', deals: 12, company: 'АН Этажи' },
  { id: 2, name: 'Алексей Смирнов', deals: 10, company: 'ИП Смирнов' },
  { id: 3, name: 'Мария Иванова', deals: 8, company: 'Самолет Плюс' },
  { id: 4, name: 'Дмитрий Петров', deals: 7, company: 'Частный брокер' },
  { id: 5, name: 'Ольга Соколова', deals: 5, company: 'Владис' },
  { id: 6, name: 'Иван Сидоров', deals: 3, company: 'ИП Сидоров' },
  { id: 7, name: 'Анна Кузнецова', deals: 2, company: 'Инком' },
  { id: 8, name: 'Петр Васильев', deals: 1, company: 'Миэль' },
  { id: 9, name: 'Виктория Ким', deals: 1, company: 'Аякс' },
  { id: 10, name: 'Сергей Морозов', deals: 0, company: 'Новичок' },
];

const Leaderboard: React.FC = () => {
  return (
    <div className="pb-36 pt-6 px-4 animate-fade-in">
      {/* Заголовок */}
      <div className="bg-gradient-to-r from-[#BA8F50] to-[#d4a056] text-white p-6 rounded-2xl shadow-lg mb-6 text-center relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-full bg-black opacity-10" />
        <div className="relative z-10">
            <Trophy size={40} className="mx-auto mb-2 opacity-90" />
            <h2 className="text-2xl font-bold">Топ Партнеров</h2>
            <p className="opacity-90 text-sm">Лидеры продаж за Декабрь</p>
        </div>
      </div>

      {/* Список */}
      <div className="space-y-3">
        {USERS.map((u, index) => (
          <div key={u.id} className="bg-white p-4 rounded-xl flex items-center gap-4 shadow-sm border border-[#EAE0D5]">
            {/* Место в рейтинге */}
            <div className={`font-bold text-lg w-8 h-8 flex items-center justify-center rounded-full shrink-0 ${index < 3 ? 'bg-[#BA8F50] text-white shadow-md' : 'bg-gray-100 text-gray-400'}`}>
              {index + 1}
            </div>
            
            {/* Инфо */}
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-[#433830] truncate">{u.name}</h3>
              <p className="text-xs text-gray-500 truncate">{u.company}</p>
            </div>
            
            {/* Сделки */}
            <div className="text-right shrink-0">
              <span className="font-bold text-lg block text-[#433830] leading-none">{u.deals}</span>
              <span className="text-[10px] text-gray-400 uppercase font-bold">Сделок</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Leaderboard;
