import React, { useState, useEffect } from 'react';
import { X, Building2, ArrowLeft, Loader2 } from 'lucide-react';
// Импортируй свои типы, или добавь их сюда если они в types.ts
import { ProjectData, ChessUnit } from '../types';

interface ChessboardProps {
  onClose: () => void;
}

const ChessboardModal: React.FC<ChessboardProps> = ({ onClose }) => {
    const [selectedProject, setSelectedProject] = useState<ProjectData | null>(null);
    const [projects, setProjects] = useState<ProjectData[]>([]);
    const [units, setUnits] = useState<ChessUnit[]>([]);
    const [loading, setLoading] = useState(false);

    // 1. Загружаем список проектов при открытии
    useEffect(() => {
        fetch('/api/projects')
            .then(res => res.json())
            .then(data => {
                // Мапим данные из базы (snake_case) в наш формат (camelCase)
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

    // 2. Загружаем квартиры при выборе проекта
    const handleProjectSelect = (p: ProjectData) => {
        setSelectedProject(p);
        setLoading(true);
        
        // Если база пустая, давай сгенерируем демо-данные (для первого раза)
        // В реале этот блок можно убрать
        fetch(`/api/units/${p.id}`)
            .then(res => res.json())
            .then(data => {
                if (data.length === 0) {
                    // Квартир нет? Попросим сервер создать демо
                    fetch(`/api/generate-demo/${p.id}`, {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({ floors: p.floors, unitsPerFloor: p.unitsPerFloor })
                    }).then(() => handleProjectSelect(p)); // Рекурсия один раз
                } else {
                    setUnits(data);
                }
            })
            .finally(() => setLoading(false));
    };

    return (
        <div className="fixed inset-0 z-50 flex flex-col bg-brand-cream animate-fade-in text-brand-black">
            {/* Header */}
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
                    // СПИСОК ПРОЕКТОВ (С СЕРВЕРА)
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
                                    <p className="text-sm text-brand-grey">{p.floors} этажей • {p.floors * p.unitsPerFloor} квартир</p>
                                    <div className="mt-2 flex items-center gap-2 text-brand-gold text-xs font-bold">
                                        <Building2 size={14} />
                                        Показать шахматку
                                    </div>
                                </div>
                            </div>
                        ))}
                        {projects.length === 0 && <p className="text-center text-gray-400 mt-10">Нет проектов</p>}
                    </div>
                ) : (
                    // ШАХМАТКА (С СЕРВЕРА)
                    <div className="animate-slide-up">
                         {loading ? (
                             <div className="flex justify-center mt-20"><Loader2 className="animate-spin text-brand-gold" /></div>
                         ) : (
                             <>
                                <div className="flex items-center gap-4 mb-6 justify-center text-xs font-medium text-brand-grey">
                                    <div className="flex items-center gap-1"><div className="w-3 h-3 bg-white border border-brand-light rounded-sm"></div> Свободно</div>
                                    <div className="flex items-center gap-1"><div className="w-3 h-3 bg-brand-cream border border-brand-gold rounded-sm"></div> Бронь</div>
                                    <div className="flex items-center gap-1"><div className="w-3 h-3 bg-brand-light rounded-sm"></div> Продано</div>
                                </div>

                                <div className="space-y-1">
                                    {Array.from({length: selectedProject.floors}).map((_, i) => {
                                        const floorNum = selectedProject.floors - i;
                                        const floorUnits = units.filter(u => u.floor === floorNum);
                                        // Сортируем квартиры по номеру, чтобы шли слева направо
                                        floorUnits.sort((a, b) => String(a.number).localeCompare(String(b.number)));

                                        return (
                                            <div key={floorNum} className="flex gap-2 items-center">
                                                <div className="w-6 text-xs font-bold text-brand-grey text-center">{floorNum}</div>
                                                <div className="flex-1 grid gap-1" style={{ gridTemplateColumns: `repeat(${selectedProject.unitsPerFloor}, 1fr)` }}>
                                                    {floorUnits.map(unit => (
                                                        <div 
                                                            key={unit.id}
                                                            className={`
                                                                h-10 rounded-md flex flex-col items-center justify-center border text-[9px] transition-colors
                                                                ${unit.status === 'FREE' ? 'bg-white border-brand-light hover:border-brand-gold cursor-pointer hover:bg-brand-cream' : ''}
                                                                ${unit.status === 'BOOKED' ? 'bg-brand-cream border-brand-gold/30 text-brand-gold' : ''}
                                                                ${unit.status === 'SOLD' ? 'bg-brand-light border-transparent text-white' : ''}
                                                            `}
                                                            onClick={() => {
                                                                if(unit.status === 'FREE') alert(`Квартира ${unit.number}\nЦена: ${unit.price} ₽\nЗабронировать?`);
                                                            }}
                                                        >
                                                            <span className="font-bold">{unit.rooms}к</span>
                                                            {unit.status === 'FREE' && <span>{unit.area}м</span>}
                                                        </div>
                                                    ))}
                                                    {/* Заполнители, если на этаже меньше квартир */}
                                                    {Array.from({length: selectedProject.unitsPerFloor - floorUnits.length}).map((_, idx) => (
                                                        <div key={`empty-${idx}`} className="h-10 bg-transparent" />
                                                    ))}
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
        </div>
    );
};

export default ChessboardModal;
