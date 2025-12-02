import React, { useState } from 'react';
import { Clock, ChevronRight, X, CheckCircle2, Building2, TrendingUp } from 'lucide-react';
// Если у тебя есть файл types.ts, убедись что ConstructionUpdate там экспортируется.
// Если нет - я продублировал тип ниже, чтобы ошибок точно не было.
import { ConstructionUpdate } from '../types'; 

interface NewsFeedProps {
  news: any[]; // Данные, которые пришли с бэкенда
}

const NewsFeed: React.FC<NewsFeedProps> = ({ news }) => {
  const [selectedNews, setSelectedNews] = useState<ConstructionUpdate | null>(null);

  // --- МАГИЯ: ПРЕВРАЩАЕМ ПРОСТЫЕ НОВОСТИ С СЕРВЕРА В КРАСИВЫЕ КАРТОЧКИ ---
  // Если новостей с сервера нет (пустой массив), можно показать заглушку или ничего.
  // Здесь мы берем news из пропсов и приводим к твоему формату ConstructionUpdate
  const displayNews: ConstructionUpdate[] = news.map((item) => ({
    id: String(item.id),
    title: item.title,
    // Так как в простой админке нет поля "Проект", ставим дефолтное
    projectName: 'Новости Клуба', 
    description: item.text,
    // В простой базе нет чек-листа, оставляем пустым или ставим заглушку
    checklist: ['Новость опубликована официально', 'Доступна для всех партнеров'], 
    // Если картинки нет, ставим красивую заглушку
    images: [item.image_url || 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=800&q=80'],
    // Форматируем дату
    date: new Date(item.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }),
    progress: 100 // Для обычных новостей ставим 100%
  }));

  return (
    <div className="pb-36 pt-6 px-4 space-y-5 animate-fade-in relative">
      <h2 className="text-2xl font-extrabold text-[#433830] pl-2">Новости и События</h2>
      
      {displayNews.length === 0 ? (
        <div className="text-center text-gray-400 py-10">Пока новостей нет...</div>
      ) : (
        displayNews.map(item => (
          <div 
            key={item.id} 
            onClick={() => setSelectedNews(item)}
            className="bg-white rounded-2xl shadow-sm overflow-hidden border border-[#EAE0D5] active:scale-[0.98] transition-transform cursor-pointer group"
          >
            <div className="h-44 w-full overflow-hidden relative">
              <img src={item.images[0]} alt="" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
              
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
                {/* Показываем прогресс только если это реально стройка (для примера всегда показываем) */}
                <div className="flex items-center gap-1.5 text-xs font-bold text-[#BA8F50]">
                  <TrendingUp size={14} />
                  Актуально
                </div>
              </div>

              <h3 className="font-bold text-lg mb-2 text-[#433830] leading-tight">{item.title}</h3>
              <p className="text-gray-500 text-sm leading-relaxed mb-4 line-clamp-2">{item.description}</p>
              
              <div className="flex items-center text-[#BA8F50] text-sm font-bold group-hover:underline decoration-2 underline-offset-4">
                Читать подробнее <ChevronRight size={16} />
              </div>
            </div>
          </div>
        ))
      )}

      {/* --- МОДАЛЬНОЕ ОКНО --- */}
      {selectedNews && (
        <div className="fixed top-0 left-0 w-full h-full z-[100] flex items-center justify-center bg-[#433830]/60 backdrop-blur-sm p-4 animate-fade-in">
          
          {/* Подложка для закрытия */}
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

            {/* Контент */}
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

              <p className="text-gray-600 text-sm leading-relaxed mb-6 whitespace-pre-wrap">
                {selectedNews.description}
              </p>

              {/* Если чек-лист есть - показываем */}
              {selectedNews.checklist && selectedNews.checklist.length > 0 && (
                <div className="space-y-3">
                  <h3 className="font-bold text-[#433830] text-sm uppercase tracking-wide">Детали</h3>
                  {selectedNews.checklist.map((item, idx) => (
                    <div key={idx} className="flex items-start gap-3">
                      <div className="mt-0.5 min-w-[20px]">
                        <CheckCircle2 size={20} className="text-[#BA8F50] fill-[#F2EBDF]" />
                      </div>
                      <span className="text-sm text-gray-700">{item}</span>
                    </div>
                  ))}
                </div>
              )}

              <button 
                onClick={() => setSelectedNews(null)}
                className="w-full mt-8 py-4 bg-[#433830] text-white rounded-xl font-bold text-lg active:scale-95 transition-transform shadow-lg"
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default NewsFeed;
