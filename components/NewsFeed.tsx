import React from 'react';
import { Clock, ChevronRight } from 'lucide-react';

const NEWS = [
  {
    id: 1,
    title: 'Старт продаж: Корпус 5',
    desc: 'Открыто бронирование квартир с видом на парк. Скидки первым покупателям до 15%.',
    image: 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=800&q=80',
    date: 'Сегодня, 10:00'
  },
  {
    id: 2,
    title: 'Изменение условий ипотеки',
    desc: 'С 1 числа меняются ставки по семейной ипотеке. Успейте подать заявку до повышения.',
    image: 'https://images.unsplash.com/photo-1560518883-ce09059eeffa?auto=format&fit=crop&w=800&q=80',
    date: 'Вчера'
  },
  {
    id: 3,
    title: 'Отчет о ходе строительства',
    desc: 'ЖК "Бруклин": завершены фасадные работы, начата внутренняя отделка.',
    image: 'https://images.unsplash.com/photo-1590644365607-1c5a2e97a39e?auto=format&fit=crop&w=800&q=80',
    date: '2 дня назад'
  }
];

const NewsFeed: React.FC = () => {
  return (
    <div className="pb-36 pt-6 px-4 space-y-5 animate-fade-in">
      <h2 className="text-2xl font-extrabold text-[#433830] pl-2">Новости</h2>
      
      {NEWS.map(item => (
        <div key={item.id} className="bg-white rounded-2xl shadow-sm overflow-hidden border border-[#EAE0D5] active:scale-[0.98] transition-transform">
          <div className="h-40 w-full overflow-hidden">
            <img src={item.image} alt="" className="w-full h-full object-cover" />
          </div>
          <div className="p-4">
            <div className="flex items-center gap-1 text-xs text-gray-400 mb-2">
              <Clock size={12} /> {item.date}
            </div>
            <h3 className="font-bold text-lg mb-2 text-[#433830] leading-tight">{item.title}</h3>
            <p className="text-gray-600 text-sm leading-relaxed mb-3">{item.desc}</p>
            <div className="flex items-center text-[#BA8F50] text-sm font-bold">
              Читать далее <ChevronRight size={16} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default NewsFeed;
