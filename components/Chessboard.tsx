import React, { useState, useEffect } from 'react';
import { X, Building2, ArrowLeft, Loader2 } from 'lucide-react';
import { ProjectData, ChessUnit } from '../types';

interface ChessboardProps {
  onClose: () => void;
}

const ChessboardModal: React.FC<ChessboardProps> = ({ onClose }) => {
    const [selectedProject, setSelectedProject] = useState<ProjectData | null>(null);
    const [projects, setProjects] = useState<ProjectData[]>([]);
    const [units, setUnits] = useState<ChessUnit[]>([]);
    const [loading, setLoading] = useState(false);
    
    // Состояние для красивой модалки бронирования (вместо alert)
    const [bookingUnit, setBookingUnit] = useState<ChessUnit | null>(null);

    // 1. Загружаем проекты
    useEffect(() => {
        fetch('/api/projects')
            .then(res => res.json())
            .then(data => {
                const mapped = data.map((p: any) => ({
                    id: p.id,
                    name: p.name,
                    floors: p.floors,
                    unitsPerFloor: p.units_per_floor,
                    image: p.image_url || 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00'
                }));
                setProjects(mapped);
            });
    }, []);

    // 2. Загружаем квартиры при выборе
    const handleProjectSelect = (p: ProjectData) => {
        setSelectedProject(p);
        setLoading(true);
        
        fetch(`/api/units/${p.id}`)
            .then(res => res.json())
            .then(data => {
                // Если квартир нет вообще - предложим сгенерировать демо (на всякий случай)
                if (data.length === 0) {
                    fetch(`/api/generate-demo/${p.id}`, {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({ floors: p.floors, unitsPerFloor: p.unitsPerFloor })
                    }).then(() => handleProjectSelect(p));
                } else {
                    setUnits(data);
                }
            })
            .finally(() => setLoading(false));
    };

    const formatPrice = (price: number) => {
        return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(price);
    };

    return (
        <div className="fixed inset-0 z-50 flex flex-col bg-brand-cream animate-fade-in text-brand-black">
            
            {/* --- ШАПКА --- */}
            <div className="px-6 pt-8 pb-4 flex justify-between items-center bg-brand-white border-b border-brand-light">
                {selectedProject ? (
                    <button onClick={() => setSelectedProject(null)} className="flex items-center gap-2 text-brand-black font-bold hover:text-brand-gold transition-colors">
                        <ArrowLeft size={20} /> Назад
                    </button>
                ) : (
                    <h2 className="text-2xl font-bold text-brand-black">Выбор проекта</h2>
                )}
                <button onClick={onClose} className="w-10 h-10 rounded-full bg-brand-cream flex items-center justify-center text-brand-black hover:bg-brand-light transition-colors">
                    <X size={20} />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
                {!selectedProject ? (
                    // СПИСОК ПРОЕКТОВ
                    <div className="grid grid-cols-1 gap-4">
                        {projects.map(p => (
                            <div 
                                key={p.id}
                                onClick={() => handleProjectSelect(p)}
                                className="bg-brand-white rounded-2xl p-2 flex gap-4 items-center border border-transparent hover:border-brand-gold transition-all cursor-pointer active:scale-[0.98]"
                            >
                                <img src={p.image} alt={p.name} className="w-24 h-24 rounded-xl object-cover bg-brand-light" />
                                <div>
                                    <h3 className="text-lg font-bold text-brand-black">{p.name}</h3>
                                    <p className="text-sm text-brand-grey">{p.floors} этажей</p>
                                    <div className="mt-2 flex items-center gap-2 text-brand-gold text-xs font-bold">
                                        <Building2 size={14} />
                                        Показать шахматку
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    // ШАХМАТКА
                    <div className="animate-slide-up pb-20">
                         {loading ? (
                             <div className="flex justify-center mt-20"><Loader2 className="animate-spin text-brand-gold" /></div>
                         ) : (
                             <>
                                <div className="flex items-center gap-4 mb-6 justify-center text-xs font-medium text-brand-grey sticky top-0 bg-brand-cream py-2 z-10">
                                    <div className="flex items-center gap-1"><div className="w-3 h-3 bg-white border border-brand-light rounded-sm"></div> Свободно</div>
                                    <div className="flex items-center gap-1"><div className="w-3 h-3 bg-brand-cream border border-brand-gold rounded-sm"></div> Бронь</div>
                                    <div className="flex items-center gap-1"><div className="w-3 h-3 bg-brand-light rounded-sm"></div> Продано</div>
                                </div>

                                <div className="space-y-1">
                                    {/* Рендер этажей (сверху вниз) */}
                                    {Array.from({length: selectedProject.floors}).map((_, i) => {
                                        const floorNum = selectedProject.floors - i;
                                        const floorUnits = units.filter(u => u.floor === floorNum);
                                        
                                        // Сортировка: слева направо по номеру квартиры
                                        floorUnits.sort((a, b) => {
                                            const numA = parseInt(a.number.replace(/\D/g, '')) || 0;
                                            const numB = parseInt(b.number.replace(/\D/g, '')) || 0;
                                            return numA - numB;
                                        });

                                        return (
                                            <div key={floorNum} className="flex gap-2 items-center">
                                                <div className="w-6 text-xs font-bold text-brand-grey text-center">{floorNum}</div>
                                                <div className="flex-1 flex gap-1 flex-wrap">
                                                    {floorUnits.length > 0 ? floorUnits.map(unit => (
                                                        <div 
                                                            key={unit.id}
                                                            onClick={() => setBookingUnit(unit)}
                                                            className={`
                                                                h-10 w-10 sm:w-12 rounded-md flex flex-col items-center justify-center border text-[9px] transition-all cursor-pointer
                                                                ${unit.status === 'FREE' ? 'bg-white border-brand-light hover:border-brand-gold hover:bg-brand-cream shadow-sm' : ''}
                                                                ${unit.status === 'BOOKED' ? 'bg-brand-cream border-brand-gold/30 text-brand-gold' : ''}
                                                                ${unit.status === 'SOLD' ? 'bg-brand-light border-transparent text-white opacity-60' : ''}
                                                            `}
                                                        >
                                                            <span className="font-bold">{unit.rooms}к</span>
                                                            {unit.status === 'FREE' && <span>{unit.area}</span>}
                                                        </div>
                                                    )) : (
                                                        // Пустой этаж (заглушка)
                                                        <div className="text-[10px] text-gray-300 italic w-full text-center">Нет квартир</div>
                                                    )}
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                             </>
                         )}
                    </div>
                )}
            </div>

            {/* --- КРАСИВАЯ МОДАЛКА БРОНИРОВАНИЯ --- */}
            {bookingUnit && (
                <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in p-4">
                    {/* Подложка для закрытия по клику вне */}
                    <div className="absolute inset-0" onClick={() => setBookingUnit(null)} />
                    
                    <div className="bg-white w-full max-w-sm rounded-2xl p-6 shadow-2xl animate-slide-up relative z-10">
                        <button onClick={() => setBookingUnit(null)} className="absolute top-4 right-4 text-gray-400 hover:text-black">
                            <X size={20} />
                        </button>

                        <div className="mb-4">
                            <div className={`inline-block px-3 py-1 rounded-full text-xs font-bold mb-2 
                                ${bookingUnit.status === 'FREE' ? 'bg-green-100 text-green-700' : ''}
                                ${bookingUnit.status === 'BOOKED' ? 'bg-yellow-100 text-yellow-700' : ''}
                                ${bookingUnit.status === 'SOLD' ? 'bg-gray-100 text-gray-500' : ''}
                            `}>
                                {bookingUnit.status === 'FREE' ? 'Свободна' : bookingUnit.status === 'BOOKED' ? 'Забронирована' : 'Продана'}
                            </div>
                            <h3 className="text-2xl font-bold text-brand-black">Квартира №{bookingUnit.number}</h3>
                            <p className="text-gray-500 text-sm">Этаж {bookingUnit.floor}</p>
                        </div>

                        <div className="space-y-3 mb-6">
                            <div className="flex justify-between border-b border-gray-100 pb-2">
                                <span className="text-gray-500">Площадь</span>
                                <span className="font-bold">{bookingUnit.area} м²</span>
                            </div>
                            <div className="flex justify-between border-b border-gray-100 pb-2">
                                <span className="text-gray-500">Комнат</span>
                                <span className="font-bold">{bookingUnit.rooms}</span>
                            </div>
                            <div className="flex justify-between items-center pt-2">
                                <span className="text-gray-500">Цена</span>
                                <span className="text-xl font-bold text-brand-gold">{formatPrice(bookingUnit.price)}</span>
                            </div>
                        </div>

                        <div className="flex gap-3">
                            <button 
                                onClick={() => setBookingUnit(null)}
                                className="flex-1 py-3 bg-gray-100 text-gray-700 rounded-xl font-bold active:scale-95 transition-transform"
                            >
                                Закрыть
                            </button>
                            
                            {bookingUnit.status === 'FREE' && (
                                <button 
                                    onClick={() => {
                                        alert('Заявка отправлена вашему менеджеру!');
                                        setBookingUnit(null);
                                    }}
                                    className="flex-1 py-3 bg-brand-black text-white rounded-xl font-bold shadow-lg active:scale-95 transition-transform"
                                >
                                    Забронировать
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
};

export default ChessboardModal;
