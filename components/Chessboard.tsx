import React, { useState } from 'react';
import { ProjectData, ChessUnit } from '../types';
import { X, Building2, ArrowLeft } from 'lucide-react';

interface ChessboardProps {
  onClose: () => void;
}

// Mock Projects
const PROJECTS: ProjectData[] = [
    { id: 'brk', name: 'ЖК Бруклин', floors: 12, unitsPerFloor: 6, image: 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=500&q=80' },
    { id: 'mnht', name: 'ЖК Манхэттен', floors: 24, unitsPerFloor: 8, image: 'https://images.unsplash.com/photo-1464938050520-ef2270bb8ce8?w=500&q=80' },
    { id: 'bbyk', name: 'ЖК Бабайка', floors: 9, unitsPerFloor: 4, image: 'https://images.unsplash.com/photo-1460317442991-0ec209397118?w=500&q=80' },
    { id: 'chr', name: 'ЖК Харизма', floors: 16, unitsPerFloor: 5, image: 'https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=500&q=80' },
];

// Generate fake units for demo
const generateUnits = (project: ProjectData): ChessUnit[] => {
    const units: ChessUnit[] = [];
    for(let f = 1; f <= project.floors; f++) {
        for(let u = 1; u <= project.unitsPerFloor; u++) {
            const statusRandom = Math.random();
            let status: ChessUnit['status'] = 'FREE';
            if (statusRandom > 0.7) status = 'SOLD';
            else if (statusRandom > 0.5) status = 'BOOKED';

            units.push({
                id: `${project.id}-${f}-${u}`,
                floor: f,
                number: `${f}0${u}`,
                rooms: Math.floor(Math.random() * 3) + 1,
                area: Math.floor(Math.random() * 40) + 30,
                price: Math.floor(Math.random() * 5000000) + 5000000,
                status
            });
        }
    }
    return units.reverse(); // Top floors first
};

const ChessboardModal: React.FC<ChessboardProps> = ({ onClose }) => {
    const [selectedProject, setSelectedProject] = useState<ProjectData | null>(null);
    const [units, setUnits] = useState<ChessUnit[]>([]);

    const handleProjectSelect = (p: ProjectData) => {
        setSelectedProject(p);
        setUnits(generateUnits(p));
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
                    // Project Selection List
                    <div className="grid grid-cols-1 gap-4">
                        {PROJECTS.map(p => (
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
                    </div>
                ) : (
                    // Chessboard Grid
                    <div className="animate-slide-up">
                         <div className="flex items-center gap-4 mb-6 justify-center text-xs font-medium text-brand-grey">
                            <div className="flex items-center gap-1"><div className="w-3 h-3 bg-white border border-brand-light rounded-sm"></div> Свободно</div>
                            <div className="flex items-center gap-1"><div className="w-3 h-3 bg-brand-cream border border-brand-gold rounded-sm"></div> Бронь</div>
                            <div className="flex items-center gap-1"><div className="w-3 h-3 bg-brand-light rounded-sm"></div> Продано</div>
                         </div>

                         <div className="space-y-1">
                            {Array.from({length: selectedProject.floors}).map((_, i) => {
                                const floorNum = selectedProject.floors - i;
                                const floorUnits = units.filter(u => u.floor === floorNum);
                                return (
                                    <div key={floorNum} className="flex gap-2 items-center">
                                        <div className="w-6 text-xs font-bold text-brand-grey text-center">{floorNum}</div>
                                        <div className="flex-1 grid gap-1" style={{ gridTemplateColumns: `repeat(${selectedProject.unitsPerFloor}, 1fr)` }}>
                                            {floorUnits.map(unit => (
                                                <div 
                                                    key={unit.id}
                                                    className={`
                                                        h-10 rounded-md flex flex-col items-center justify-center border text-[9px]
                                                        ${unit.status === 'FREE' ? 'bg-white border-brand-light hover:border-brand-gold cursor-pointer' : ''}
                                                        ${unit.status === 'BOOKED' ? 'bg-brand-cream border-brand-gold/30 text-brand-gold' : ''}
                                                        ${unit.status === 'SOLD' ? 'bg-brand-light border-transparent text-white' : ''}
                                                    `}
                                                >
                                                    <span className="font-bold">{unit.rooms}к</span>
                                                    {unit.status === 'FREE' && <span>{unit.area}м</span>}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )
                            })}
                         </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ChessboardModal;