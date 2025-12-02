import React, { useState } from 'react';
import { Clock, ChevronRight, X, CheckCircle2, Building2, TrendingUp, Trash2, Pencil } from 'lucide-react';
import WebApp from '@twa-dev/sdk';

interface NewsFeedProps {
  news: any[];
  isAdmin: boolean;           // Новый проп: админ или нет
  onEdit: (item: any) => void; // Функция: открыть редактирование
  onRefresh: () => void;       // Функция: обновить список после удаления
}

const NewsFeed: React.FC<NewsFeedProps> = ({ news, isAdmin, onEdit, onRefresh }) => {
  const [selectedNews, setSelectedNews] = useState<any | null>(null);

  // Функция удаления
  const handleDelete = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation(); // Чтобы не открылась модалка новости
    if (!window.confirm('Удалить новость?')) return;

    try {
      await fetch(`/api/news/${id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData: WebApp.initData }) // Подтверждаем права
      });
      onRefresh(); // Обновляем список
    } catch (error) {
      alert('Ошибка удаления');
    }
  };

  // Функция редактирования
  const handleEdit = (e: React.MouseEvent, item: any) => {
    e.stopPropagation();
    onEdit(item); // Передаем наверх в App.tsx, чтобы открыть админку
  };

  return (
    <div className="pb-36 pt-6 px-4 space-y-5 animate-fade-in relative">
      <h2 className="text-2xl font-extrabold text-[#433830] pl-2">Новости и События</h2>
      
      {news.length === 0 ? (
        <div className="text-center text-gray-400 py-10">Пока новостей нет...</div>
      ) : (
        news.map(item => (
          <div 
            key={item.id} 
            onClick={() => setSelectedNews(item)}
            className="bg-white rounded-2xl shadow-sm overflow-hidden border border-[#EAE0D5] active:scale-[0.98] transition-transform cursor-pointer group relative"
          >
            {/* --- КНОПКИ АДМИНА (Поверх картинки) --- */}
            {isAdmin && (
              <div className="absolute top-2 right-2 z-20 flex gap-2">
                <button 
                  onClick={(e) => handleEdit(e, item)}
                  className="w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center shadow-lg active:scale-90"
                >
                  <Pencil size={14} />
                </button>
                <button 
                  onClick={(e) => handleDelete(e, item.id)}
                  className="w-8 h-8 bg-red-500 text-white rounded-full flex items-center justify-center shadow-lg active:scale-90"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            )}

            <div className="h-44 w-full overflow-hidden relative">
              <img src={item.image_url || 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab'} alt="" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
              
              <div className="absolute top-4 left-4 bg-white/90 backdrop-blur-md px-3 py-1 rounded-full text-xs font-bold text-[#433830] flex items-center gap-1 shadow-sm">
                <Building2 size={12} className="text-[#BA8F50]" />
                {item.project_name || 'Новости'}
              </div>
            </div>

            <div className="p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-1 text-xs text-gray-400">
                  <Clock size={12} /> {new Date(item.created_at).toLocaleDateString()}
                </div>
                {item.progress > 0 && (
                  <div className="flex items-center gap-1.5 text-xs font-bold text-[#BA8F50]">
                    <TrendingUp size={14} /> {item.progress}%
                  </div>
                )}
              </div>

              <h3 className="font-bold text-lg mb-2 text-[#433830] leading-tight">{item.title}</h3>
              <p className="text-gray-500 text-sm leading-relaxed mb-4 line-clamp-2">{item.text}</p>
            </div>
          </div>
        ))
      )}

      {/* --- МОДАЛКА ПРОСМОТРА (Тут ничего не меняем особо) --- */}
      {selectedNews && (
        <div className="fixed top-0 left-0 w-full h-full z-[100] flex items-center justify-center bg-[#433830]/60 backdrop-blur-sm p-4 animate-fade-in">
          <div className="absolute inset-0" onClick={() => setSelectedNews(null)} />
          <div className="bg-white w-full max-w-md rounded-[2rem] overflow-hidden shadow-2xl relative z-10 animate-slide-up max-h-[85vh] flex flex-col">
            <button onClick={() => setSelectedNews(null)} className="absolute top-4 right-4 z-20 w-8 h-8 bg-black/20 backdrop-blur-md rounded-full flex items-center justify-center text-white active:scale-90"><X size={18} /></button>
            <div className="h-56 w-full shrink-0">
              <img src={selectedNews.image_url || 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab'} className="w-full h-full object-cover" />
            </div>
            <div className="p-6 overflow-y-auto custom-scrollbar">
              <h2 className="text-2xl font-extrabold text-[#433830] mb-4">{selectedNews.title}</h2>
              <p className="text-gray-600 text-sm mb-6 whitespace-pre-wrap">{selectedNews.text}</p>
              
              {/* Чеклист */}
              {selectedNews.checklist && Array.isArray(selectedNews.checklist) && (
                <div className="space-y-3">
                  <h3 className="font-bold text-[#433830] text-sm uppercase">Этапы</h3>
                  {selectedNews.checklist.map((text: string, i: number) => (
                    <div key={i} className="flex gap-2"><CheckCircle2 size={18} className="text-[#BA8F50]"/> <span className="text-sm">{text}</span></div>
                  ))}
                </div>
              )}
              
              <button onClick={() => setSelectedNews(null)} className="w-full mt-8 py-4 bg-[#433830] text-white rounded-xl font-bold">Закрыть</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default NewsFeed;
