
import React, { useState } from 'react';
import { ConstructionUpdate } from '../types';
import { Check, FolderOpen, Image as ImageIcon, X, ChevronLeft, ChevronRight, Edit3, Trash2 } from 'lucide-react';
import WebApp from '@twa-dev/sdk';

interface ContentHubProps {
  news?: any[];
  updates?: ConstructionUpdate[];
  isAdmin?: boolean;
  onEdit?: (item: any) => void;
  onRefresh?: () => void;
  onGenerate?: (id: string) => void;
}

const ContentHub: React.FC<ContentHubProps> = ({ news, updates, isAdmin, onEdit, onRefresh, onGenerate }) => {
  const items: ConstructionUpdate[] = (news as ConstructionUpdate[]) || updates || [];
  const [selectedNews, setSelectedNews] = useState<ConstructionUpdate | null>(null);

  const handleDeleteNews = async (newsId: string) => {
    if (!confirm('Удалить новость?')) return;
    try {
      await fetch(`/api/news/${newsId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData: WebApp.initData }),
      });
      if (onRefresh) onRefresh();
    } catch (e) { console.error('Delete news error:', e); }
  };

  return (
    <div className="pb-36 animate-fade-in">
      <header className="px-6 pt-8 pb-6">
        <h2 className="text-2xl font-bold text-brand-black">Медиа-центр</h2>
        <p className="text-brand-grey text-sm mt-1">Ход строительства и новости</p>
      </header>

      <div className="px-4 space-y-4">
        {items.map((item, idx) => (
          <div
            key={item.id}
            onClick={() => setSelectedNews(item)}
            className="bg-brand-white rounded-2xl overflow-hidden shadow-sm border border-brand-light active:scale-[0.99] transition-transform cursor-pointer"
            style={{ animationDelay: `${idx * 100}ms` }}
          >
            {/* Image Area */}
            <div className="h-48 bg-brand-light relative overflow-hidden">
              {item.images && item.images[0] ? (
                <img src={item.images[0]} alt={item.title} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-brand-cream to-brand-light flex items-center justify-center">
                  <ImageIcon size={40} className="text-brand-gold/30" />
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent"></div>
              <div className="absolute bottom-0 left-0 right-0 p-4">
                {item.projectName && (
                  <span className="text-white/80 text-[10px] font-semibold uppercase tracking-wider block truncate">{item.projectName}</span>
                )}
                <h3 className="text-base font-bold text-white leading-snug line-clamp-2">{item.title}</h3>
              </div>
              {typeof item.progress === 'number' && item.progress > 0 && (
                <div className="absolute top-3 right-3 bg-brand-gold text-white text-[10px] font-bold px-2 py-0.5 rounded-md shadow-md">
                  {item.progress}%
                </div>
              )}
              {isAdmin && (
                <div className="absolute top-3 left-3 flex gap-1.5 z-20">
                  <button
                    onClick={(e) => { e.stopPropagation(); onEdit && onEdit(item); }}
                    className="w-7 h-7 bg-white/90 backdrop-blur text-brand-black rounded-full flex items-center justify-center shadow"
                  >
                    <Edit3 size={12} />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeleteNews(item.id); }}
                    className="w-7 h-7 bg-red-500 text-white rounded-full flex items-center justify-center shadow"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              )}
            </div>

            {/* Card footer with date */}
            {item.date && (
              <div className="px-4 py-2.5 border-t border-brand-light/50">
                <span className="text-[11px] text-brand-grey font-medium">{item.date}</span>
              </div>
            )}
          </div>
        ))}
        {items.length === 0 && (
            <div className="text-center py-10 text-brand-grey text-sm">Новостей пока нет</div>
        )}
      </div>

      {/* Pop-up Detail Modal */}
      {selectedNews && (
        <NewsDetailModal 
            item={selectedNews} 
            onClose={() => setSelectedNews(null)} 
            onGenerate={onGenerate || (() => {})}
        />
      )}
    </div>
  );
};

const NewsDetailModal: React.FC<{ item: ConstructionUpdate, onClose: () => void, onGenerate: (id: string) => void }> = ({ item, onClose, onGenerate }) => {
    const [currentImage, setCurrentImage] = useState(0);

    const nextImage = (e: React.MouseEvent) => {
        e.stopPropagation();
        setCurrentImage((prev) => (prev + 1) % item.images.length);
    };

    const prevImage = (e: React.MouseEvent) => {
        e.stopPropagation();
        setCurrentImage((prev) => (prev - 1 + item.images.length) % item.images.length);
    };

    const handleOpenMaterials = () => {
        if(item.materialsLink) {
            window.open(item.materialsLink, '_blank');
        } else {
            alert('Ссылка на материалы не указана');
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-brand-black/20 backdrop-blur-sm animate-fade-in p-0 sm:p-4">
            <div className="bg-brand-white w-full h-[90vh] sm:h-auto sm:max-w-md rounded-t-[2rem] sm:rounded-[2rem] overflow-hidden flex flex-col shadow-2xl animate-slide-up text-brand-black">
                
                {/* Carousel Header */}
                <div className="relative h-64 bg-brand-light shrink-0 group">
                    <img 
                        src={item.images[currentImage]} 
                        alt="Gallery" 
                        className="w-full h-full object-cover transition-opacity duration-300" 
                    />
                    <button 
                        onClick={onClose}
                        className="absolute top-4 right-4 w-10 h-10 bg-black/20 backdrop-blur-md rounded-full flex items-center justify-center text-white z-20"
                    >
                        <X size={20} />
                    </button>
                    
                    {/* Navigation */}
                    {item.images.length > 1 && (
                        <>
                            <button onClick={prevImage} className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-black/20 backdrop-blur text-white rounded-full flex items-center justify-center"><ChevronLeft size={16}/></button>
                            <button onClick={nextImage} className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-black/20 backdrop-blur text-white rounded-full flex items-center justify-center"><ChevronRight size={16}/></button>
                            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5">
                                {item.images.map((_, idx) => (
                                    <div key={idx} className={`w-1.5 h-1.5 rounded-full transition-all ${idx === currentImage ? 'bg-white scale-125' : 'bg-white/40'}`} />
                                ))}
                            </div>
                        </>
                    )}
                </div>

                {/* Content */}
                <div className="p-6 overflow-y-auto custom-scrollbar flex-1">
                    <div className="mb-6">
                        <span className="text-brand-gold text-xs font-bold uppercase tracking-widest">{item.projectName}</span>
                        <h2 className="text-2xl font-bold text-brand-black mt-1">{item.title}</h2>
                        <p className="text-brand-grey text-xs mt-1">{item.date}</p>
                    </div>

                    {/* Check-list style description */}
                    <div className="space-y-3 mb-8">
                        <p className="text-brand-black text-sm font-medium leading-relaxed mb-4">
                            {item.description}
                        </p>
                        {item.checklist && item.checklist.length > 0 && (
                            <>
                                <h4 className="text-sm font-bold text-brand-black border-b border-brand-cream pb-2">Ключевые моменты:</h4>
                                <ul className="space-y-2">
                                    {item.checklist.map((point, idx) => (
                                        <li key={idx} className="flex items-start gap-3 text-sm text-brand-grey">
                                            <div className="mt-1 w-4 h-4 rounded-full bg-brand-cream flex items-center justify-center shrink-0">
                                                <Check size={10} className="text-brand-gold" />
                                            </div>
                                            {point}
                                        </li>
                                    ))}
                                </ul>
                            </>
                        )}
                    </div>

                    {/* Action Button: Yandex Disk */}
                    <button 
                        onClick={handleOpenMaterials}
                        className="w-full py-4 rounded-xl bg-brand-black text-brand-gold font-bold text-sm flex items-center justify-center gap-2 shadow-lg active:scale-[0.98]"
                    >
                        <FolderOpen size={18} />
                        Актуальные материалы (Яндекс.Диск)
                    </button>
                    {item.materialsLink && <div className="text-[10px] text-center mt-2 text-brand-grey">Ссылка на внешнее хранилище</div>}
                </div>
            </div>
        </div>
    );
};

export default ContentHub;
