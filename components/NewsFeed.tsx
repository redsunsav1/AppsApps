import React, { useState } from 'react';
import { Clock, ChevronRight, X, CheckCircle2, Building2, TrendingUp } from 'lucide-react';
import { ConstructionUpdate } from '../types';

// Данные с этапами строительства (Чек-листами)
const NEWS: ConstructionUpdate[] = [
  {
    id: '1',
    title: 'Ход строительства: Корпус 5',
    projectName: 'ЖК Бруклин',
    description: 'Строительная бригада вышла на финишную прямую по монолитным работам. Параллельно ведется установка оконных блоков на нижних этажах.',
    checklist: [
      'Заливка бетона 20-го этажа',
      'Монтаж лифтового оборудования',
      'Установка стеклопакетов (3-10 этажи)',
      'Прокладка внутренних коммуникаций'
    ],
    images: ['https://images.unsplash.com/photo-1541888946425-d81bb19240f5?auto=format&fit=crop&w=800&q=80'],
    date: 'Сегодня, 10:00',
    progress: 75
  },
  {
    id: '2',
    title: 'Старт продаж паркинга',
    projectName: 'ЖК Харизма',
    description: 'Открыто бронирование машиномест в подземном отапливаемом паркинге. Доступна рассрочка 0%.',
    checklist: [
      'Старт бронирования (-1 уровень)',
      'Открытие шоу-рума паркинга',
      'Запуск системы бесконтактного доступа'
    ],
    images: ['https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=800&q=80'],
    date: 'Вчера, 14:30',
    progress: 100
  },
  {
    id: '3',
    title: 'Отчет за Декабрь',
    projectName: 'ЖК Манхэттен',
    description: 'Завершены фасадные работы. Начинаем благоустройство придомовой территории и высадку крупномеров.',
    checklist: [
      'Монтаж клинкерного кирпича',
      'Архитектурная подсветка фасада',
      'Подготовка грунта во дворе'
    ],
    images: ['https://images.unsplash.com/photo-1590644365607-1c5a2e97a39e?auto=format&fit=crop&w=800&q=80'],
    date: '2 дня назад',
    progress: 90
  }
];

const NewsFeed: React.FC = () => {
  // Состояние для открытой новости
  const [selectedNews, setSelectedNews] = useState<ConstructionUpdate | null>(null);

  return (
    <div className="pb-36 pt-6 px-4 space-y-5 animate-fade-in">
      <h2 className="text-2xl font-extrabold text-[#433830] pl-2">Новости и Ход строительства</h2>
      
      {/* Список новостей */}
      {NEWS.map(item => (
        <div 
          key={item.id} 
          onClick={() => setSelectedNews(item)}
          className="bg-white rounded-2xl shadow-sm overflow-hidden border border-[#EAE0D5] active:scale-[0.98] transition-transform cursor-pointer group"
        >
          <div className="h-44 w-full overflow-hidden relative">
            <img src={item.images[0]} alt="" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
            
            {/* Бейдж с названием ЖК */}
            <div className="absolute top-4 left-4 bg-white/90 backdrop-blur-md px-3 py-1 rounded-full text-xs font-bold text-[#433830] flex items-center gap-1 shadow-sm">
              <Building2 size={12} className="text-[#BA8F50]" />
              {item.projectName}
            </div>
          </div>

          <div className="p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-1 text-xs text-gray-400">
                <Clock size={12} /> {item.date}
              </div>
              {/* Мини-индикатор прогресса */}
              <div className="flex items-center gap-1.5 text-xs font-bold text-[#BA8F50]">
                <TrendingUp size={14} />
                {item.progress}% готовности
              </div>
            </div>

            <h3 className="font-bold text-lg mb-2 text-[#433830] leading-tight">{item.title}</h3>
            <p className="text-gray-500 text-sm leading-relaxed mb-4 line-clamp-2">{item.description}</p>
            
            <div className="flex items-center text-[#BA8F50] text-sm font-bold group-hover:underline decoration-2 underline-offset-4">
              Смотреть этапы <ChevronRight size={16} />
            </div>
          </div>
        </div>
      ))}

      {/* --- МОДАЛЬНОЕ ОКНО (ДЕТАЛИ) --- */}
      {selectedNews && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-[#433830]/60 backdrop-blur-sm p-4 animate-fade-in">
          {/* Подложка для закрытия кликом вне окна */}
          <div className="absolute inset-0" onClick={() => setSelectedNews(null)} />
          
          <div className="bg-white w-full max-w-md rounded-[2rem] overflow-hidden shadow-2xl relative z-10 animate-slide-up max-h-[85vh] flex flex-col">
            
            {/* Кнопка закрыть */}
            <button 
              onClick={() => setSelectedNews(null)}
              className="absolute top-4 right-4 z-20 w-8 h-8 bg-black/20 backdrop-blur-md rounded-full flex items-center justify-center text-white active:scale-90 transition-transform"
            >
              <X size={18} />
            </button>

            {/* Картинка */}
            <div className="h-56 w-full shrink-0">
              <img src={selectedNews.images[0]} alt="" className="w-full h-full object-cover" />
            </div>

            {/* Контент (с прокруткой) */}
            <div className="p-6 overflow-y-auto custom-scrollbar">
              <div className="flex items-center gap-2 mb-2">
                <span className="bg-[#F2EBDF] text-[#433830] px-3 py-1 rounded-lg text-xs font-bold uppercase tracking-wider">
                  {selectedNews.projectName}
                </span>
                <span className="text-gray-400 text-xs flex items-center gap-1">
                  <Clock size={12} /> {selectedNews.date}
                </span>
              </div>

              <h2 className="text-2xl font-extrabold text-[#433830] mb-4 leading-tight">
                {selectedNews.title}
              </h2>

              {/* Прогресс бар */}
              <div className="mb-6 bg-[#F2EBDF] p-4 rounded-xl border border-[#EAE0D5]">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-bold text-[#433830]">Общий прогресс</span>
                  <span className="text-sm font-bold text-[#BA8F50]">{selectedNews.progress}%</span>
                </div>
                <div className="h-2.5 w-full bg-white rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-[#BA8F50] rounded-full transition-all duration-1000"
                    style={{ width: `${selectedNews.progress}%` }}
                  />
                </div>
              </div>

              <p className="text-gray-600 text-sm leading-relaxed mb-6">
                {selectedNews.description}
              </p>

              {/* Чек-лист (То, что ты хотел) */}
              <div className="space-y-3">
                <h3 className="font-bold text-[#433830] text-sm uppercase tracking-wide">Выполненные этапы</h3>
                {selectedNews.checklist.map((item, idx) => (
                  <div key={idx} className="flex items-start gap-3">
                    <div className="mt-0.5 min-w-[20px]">
                      <CheckCircle2 size={20} className="text-[#BA8F50] fill-[#F2EBDF]" />
                    </div>
                    <span className="text-sm text-gray-700">{item}</span>
                  </div>
                ))}
              </div>

              <button 
                onClick={() => setSelectedNews(null)}
                className="w-full mt-8 py-4 bg-[#433830] text-white rounded-xl font-bold text-lg active:scale-95 transition-transform shadow-lg"
              >
                Понятно
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default NewsFeed;
