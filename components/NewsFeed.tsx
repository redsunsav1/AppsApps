
import React, { useState } from 'react';
import { NewsItem } from '../types';
import { Calendar, Tag, Sparkles, Trash2, Plus, X } from 'lucide-react';

interface NewsFeedProps {
  news: NewsItem[];
  isAdmin: boolean;
  onAddNews: (item: NewsItem) => void;
  onDeleteNews: (id: string) => void;
}

const NewsFeed: React.FC<NewsFeedProps> = ({ news, isAdmin, onAddNews, onDeleteNews }) => {
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newType, setNewType] = useState<'news' | 'event' | 'promo'>('news');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle || !newContent) return;

    const item: NewsItem = {
      id: Date.now().toString(),
      title: newTitle,
      content: newContent,
      date: new Date().toLocaleDateString('ru-RU'),
      type: newType
    };

    onAddNews(item);
    setNewTitle('');
    setNewContent('');
    setShowAddForm(false);
  };

  return (
    <div className="pb-32 animate-slide-up">
      <header className="px-6 pt-6 pb-4 flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-extrabold text-slate-800 tracking-tight flex items-center gap-2">
            Новости <Sparkles className="text-orange-400 fill-current animate-pulse" size={20} />
          </h2>
          <p className="text-slate-500 text-sm mt-1 font-medium">Свежие обновления для партнеров</p>
        </div>
        {isAdmin && (
          <button 
            onClick={() => setShowAddForm(true)}
            className="bg-orange-500 text-white p-2 rounded-full shadow-lg hover:bg-orange-600 transition-colors"
          >
            <Plus size={24} />
          </button>
        )}
      </header>
      
      {/* Admin Add Form */}
      {showAddForm && (
        <div className="mx-6 mb-6 bg-white p-4 rounded-2xl shadow-lg border-2 border-orange-100">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-bold text-slate-700">Добавить новость</h3>
            <button onClick={() => setShowAddForm(false)}><X size={20} className="text-slate-400" /></button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-3">
            <input 
              className="w-full bg-slate-50 p-3 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-orange-200"
              placeholder="Заголовок"
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
            />
            <textarea 
              className="w-full bg-slate-50 p-3 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-orange-200 min-h-[80px]"
              placeholder="Текст новости"
              value={newContent}
              onChange={e => setNewContent(e.target.value)}
            />
            <div className="flex gap-2">
              {(['news', 'event', 'promo'] as const).map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setNewType(t)}
                  className={`px-3 py-1 rounded-full text-xs font-bold capitalize ${newType === t ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-500'}`}
                >
                  {t === 'news' ? 'Инфо' : t === 'event' ? 'Событие' : 'Акция'}
                </button>
              ))}
            </div>
            <button type="submit" className="w-full bg-slate-900 text-white py-3 rounded-xl font-bold text-sm hover:bg-slate-800">
              Опубликовать
            </button>
          </form>
        </div>
      )}

      <div className="px-6 space-y-6">
        {news.length === 0 && (
          <div className="text-center text-slate-400 py-10">Новостей пока нет</div>
        )}
        
        {news.map((item, idx) => (
          <div 
            key={item.id} 
            className="group relative bg-white p-6 rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_20px_40px_-5px_rgba(0,0,0,0.1)] transition-all duration-300 border border-slate-50"
            style={{ animationDelay: `${idx * 100}ms` }}
          >
            {isAdmin && (
              <button 
                onClick={() => onDeleteNews(item.id)}
                className="absolute top-4 right-4 text-slate-300 hover:text-red-500 transition-colors"
              >
                <Trash2 size={16} />
              </button>
            )}

            <div className="flex items-center gap-3 mb-4">
              <span className={`
                px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center gap-1
                ${item.type === 'promo' ? 'bg-red-50 text-red-600' : 
                  item.type === 'event' ? 'bg-purple-50 text-purple-600' : 'bg-blue-50 text-blue-600'}
              `}>
                <Tag size={10} strokeWidth={3} />
                {item.type === 'promo' ? 'Акция' : item.type === 'event' ? 'Событие' : 'Важно'}
              </span>
              <span className="text-slate-400 text-xs font-medium flex items-center gap-1">
                <Calendar size={12} /> {item.date}
              </span>
            </div>
            
            <h3 className="text-lg font-bold text-slate-800 mb-3 leading-snug group-hover:text-orange-600 transition-colors">
              {item.title}
            </h3>
            <p className="text-slate-500 text-sm leading-relaxed font-medium">
              {item.content}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default NewsFeed;
