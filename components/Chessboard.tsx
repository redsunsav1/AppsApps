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
    const [bookingUnit, setBookingUnit] = useState<ChessUnit | null>(null);

    useEffect(() => {
        fetch('/api/projects')
            .then(res => res.json())
            .then(data => {
                const mapped = data.map((p: any) => ({
                    id: p.id,
                    name: p.name,
                    floors: p.floors,
                    unitsPerFloor: p.units_per_floor || 8, 
                    image: p.image_url || 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00'
                }));
                setProjects(mapped);
            });
    }, []);

    const handleProjectSelect = (p: ProjectData) => {
        setSelectedProject(p);
        setLoading(true);
        fetch(`/api/units/${p.id}`)
            .then(res => res.json())
            .then(data => setUnits(data))
            .finally(() => setLoading(false));
    };

    const formatPrice = (price: number) => {
        return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(price);
    };

    return (
        <div className="fixed inset-0 z-50 flex flex-col bg-brand-cream animate-fade-in text-brand-black">
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
                    <div className="grid grid-cols-1 gap-4">
                        {projects.map(p => (
                            <div key={p.id} onClick={() => handleProjectSelect(p)} className="bg-brand-white rounded-2xl p-2 flex gap-4 items-center border border-transparent hover:border-brand-gold transition-all cursor-pointer active:scale-[0.98]">
                                <img src={p.image} alt={p.name} className="w-24 h-24 rounded-xl object-cover bg-brand-light" />
                                <div>
                                    <h3 className="text-lg font-bold text-brand-black">{p.name}</h3>
                                    <p className="text-sm text-brand-grey">{p.floors} этажей</p>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="animate-slide-up pb-20">
                         {loading ? (
                             <div className="flex justify-center mt-20"><Loader2 className="animate-spin text-brand-gold" /></div>
                         ) : (
                             <>
                                <div className="flex items-center gap-4 mb-6 justify-center text-xs font-medium text-brand-grey sticky top-0 bg-brand-cream py-2 z-10">
                                    <div className="flex items-center gap-1"><div className="w-3 h-3 bg-white border border-brand-light rounded-sm"></div> Свободно</div>
                                    <div className="flex items-center gap-1"><div className="w-3 h-3 bg-brand-cream border border-brand-gold rounded-sm"></div> Бронь</div>
                                    <div className="flex items-center gap-1"><div className="w-3 h-3 bg-brand-light rounded-sm opacity-50"></div> Продано</div>
                                </div>

                                <div className="overflow-x-auto pb-4">
                                    <div className="space-y-1 min-w-max px-2">
                                        {Array.from({length: selectedProject.floors}).map((_, i) => {
                                            const floorNum = selectedProject.floors - i;
                                            if (floorNum < 2) return null; 

                                            const floorUnits = units.filter(u => u.floor === floorNum);
                                            
                                            // Сортировка по номеру (чтобы шли 101, 102, 103...)
                                            floorUnits.sort((a, b) => {
                                                const numA = parseInt(a.number.replace(/\D/g, '')) || 0;
                                                const numB = parseInt(b.number.replace(/\D/g, '')) || 0;
                                                return numA - numB;
                                            });
                                            
                                            // ЖЕСТКАЯ СЕТКА (берем из проекта или 8)
                                            const cols = selectedProject.unitsPerFloor || 8;

                                            return (
                                                <div key={floorNum} className="flex gap-2 items-center">
                                                    <div className="w-6 text-xs font-bold text-brand-grey text-center sticky left-0 bg-brand-cream z-10">{floorNum}</div>
                                                    
                                                    <div className="flex-1 grid gap-1" style={{ gridTemplateColumns: `repeat(${cols}, minmax(40px, 1fr))` }}>
                                                        {Array.from({length: cols}).map((_, idx) => {
                                                            // Пытаемся найти квартиру для этой ячейки
                                                            // ТУТ ТОНКИЙ МОМЕНТ: Если в фиде есть пропуски, они будут в конце.
                                                            // Чтобы было идеально, нужно знать номер квартиры на площадке.
                                                            // Пока просто выводим по порядку.
                                                            const unit = floorUnits[idx];

                                                            if (!unit) {
                                                                // Если квартиры нет в фиде - рисуем "Продано/Нет в продаже"
                                                                return <div key={`empty-${idx}`} className="h-10 w-12 bg-gray-200/30 rounded-md border border-transparent" />
                                                            }

                                                            return (
                                                                <div 
                                                                    key={unit.id}
                                                                    onClick={() => setBookingUnit(unit)}
                                                                    className={`
                                                                        h-10 w-12 rounded-md flex flex-col items-center justify-center border text-[9px] transition-all cursor-pointer
                                                                        ${unit.status === 'FREE' ? 'bg-white border-brand-light hover:border-brand-gold hover:bg-brand-cream shadow-sm' : ''}
                                                                        ${unit.status === 'BOOKED' ? 'bg-brand-cream border-brand-gold/30 text-brand-gold' : ''}
                                                                        ${unit.status === 'SOLD' ? 'bg-brand-light border-transparent text-white opacity-40 cursor-default' : ''}
                                                                    `}
                                                                >
                                                                    <span className="font-bold">{unit.rooms}к</span>
                                                                    {unit.status === 'FREE' && <span>{unit.area}</span>}
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                </div>
                             </>
                         )}
                    </div>
                )}
            </div>

            {bookingUnit && (
                <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in p-4">
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
                            <h3 className="text-2xl font-bold text-brand-black">Кв. №{bookingUnit.number}</h3>
                            <p className="text-gray-500 text-sm">Этаж {bookingUnit.floor}</p>
                        </div>
                        <div className="space-y-3 mb-6">
                            <div className="flex justify-between border-b border-gray-100 pb-2">
                                <span className="text-gray-500">Площадь</span>
                                <span className="font-bold">{bookingUnit.area} м²</span>
                            </div>
                            <div className="flex justify-between items-center pt-2">
                                <span className="text-gray-500">Цена</span>
                                <span className="text-xl font-bold text-brand-gold">{formatPrice(bookingUnit.price)}</span>
                            </div>
                        </div>
                        <div className="flex gap-3">
                            <button onClick={() => setBookingUnit(null)} className="flex-1 py-3 bg-gray-100 text-gray-700 rounded-xl font-bold">Отмена</button>
                            {bookingUnit.status === 'FREE' && (
                                <button onClick={() => { alert('Заявка отправлена!'); setBookingUnit(null); }} className="flex-1 py-3 bg-brand-black text-white rounded-xl font-bold shadow-lg">Забронировать</button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ChessboardModal;
