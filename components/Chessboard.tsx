
import React, { useState, useEffect } from 'react';
import { ProjectData, ChessUnit, MortgageProgram } from '../types';
import { fetchProjectUnits } from '../services/profitbaseService';
import { X, Building2, ArrowLeft, Download, Maximize2, Calculator, Check, Lock, User } from 'lucide-react';
import MortgageCalc from './tools/MortgageCalc';

interface ChessboardProps {
  onClose: () => void;
  projects: ProjectData[];
  mortgagePrograms: MortgageProgram[];
}

const ChessboardModal: React.FC<ChessboardProps> = ({ onClose, projects, mortgagePrograms }) => {
    const [loading, setLoading] = useState(false);
    // Remove allUnits state, we now load on demand for selected project
    const [currentProjectUnits, setCurrentProjectUnits] = useState<ChessUnit[]>([]);
    
    const [selectedProject, setSelectedProject] = useState<ProjectData | null>(null);
    const [selectedUnit, setSelectedUnit] = useState<ChessUnit | null>(null);
    
    // Feature States
    const [showMortgageCalc, setShowMortgageCalc] = useState(false);
    const [showBookingForm, setShowBookingForm] = useState(false);

    // Booking Form State
    const [clientName, setClientName] = useState('');
    const [clientPhone, setClientPhone] = useState('');
    const [bookingSuccess, setBookingSuccess] = useState(false);

    // Load units when a project is selected
    useEffect(() => {
        const loadProjectData = async () => {
            if (selectedProject) {
                setLoading(true);
                setCurrentProjectUnits([]);
                try {
                    const units = await fetchProjectUnits(selectedProject);
                    setCurrentProjectUnits(units);
                } catch (e) {
                    console.error("Failed to load project units", e);
                } finally {
                    setLoading(false);
                }
            }
        };
        loadProjectData();
    }, [selectedProject]);

    const handleProjectSelect = (p: ProjectData) => {
        setSelectedProject(p);
    };

    const handleUnitClick = (unit: ChessUnit) => {
        if (unit.status === 'FREE') {
            setSelectedUnit(unit);
            setBookingSuccess(false);
            setShowBookingForm(false);
        }
    };

    const handleDownloadPdf = () => {
        alert(`Генерация PDF для клиента...\n\nВ файл добавлены ваши контакты:\nАлексей Смирнов\n+7 (999) 123-45-67\n\nФайл отправлен в загрузки.`);
    };

    const handleBookingSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setTimeout(() => {
            setBookingSuccess(true);
        }, 1000);
    };

    return (
        <div className="fixed inset-0 z-50 flex flex-col bg-brand-cream animate-fade-in text-brand-black">
            {/* Header */}
            <div className="px-6 pt-12 pb-4 flex justify-between items-center bg-brand-white border-b border-brand-light shadow-sm shrink-0">
                {selectedProject ? (
                    <button onClick={() => setSelectedProject(null)} className="flex items-center gap-2 text-brand-black font-bold hover:text-brand-gold transition-colors active:opacity-60">
                        <ArrowLeft size={20} /> К проектам
                    </button>
                ) : (
                    <h2 className="text-xl font-extrabold text-brand-black">Выбор проекта</h2>
                )}
                <button onClick={onClose} className="w-10 h-10 rounded-full bg-brand-cream flex items-center justify-center text-brand-black hover:bg-brand-light transition-colors">
                    <X size={20} />
                </button>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-4 relative pb-20">
                {!selectedProject ? (
                    // Project List
                    <div className="grid grid-cols-1 gap-4 animate-slide-up pb-10">
                        {projects.length > 0 ? (
                            projects.map(p => (
                                <div 
                                    key={p.id}
                                    onClick={() => handleProjectSelect(p)}
                                    className="bg-brand-white rounded-3xl p-3 flex gap-4 items-center border border-transparent shadow-sm hover:border-brand-gold transition-all cursor-pointer active:scale-[0.98]"
                                >
                                    <div className="w-24 h-24 shrink-0 rounded-2xl overflow-hidden bg-brand-light relative">
                                        {p.image ? (
                                            <img src={p.image} alt={p.name} className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-brand-gold/50"><Building2 /></div>
                                        )}
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-extrabold text-brand-black">{p.name}</h3>
                                        <p className="text-xs text-brand-grey mt-1">{p.floors} этажей • {p.description || "Описание проекта..."}</p>
                                        <div className="mt-3 flex items-center gap-2 text-brand-gold text-[10px] font-bold uppercase tracking-wide bg-brand-gold/10 px-2 py-1 rounded-lg w-fit">
                                            <Building2 size={12} />
                                            Открыть шахматку
                                        </div>
                                    </div>
                                </div>
                            ))
                        ) : (
                           <div className="text-center text-brand-grey mt-10">
                               <p>Нет доступных проектов.</p>
                               <p className="text-xs mt-2">Добавьте их через админ-панель.</p>
                           </div>
                        )}
                    </div>
                ) : (
                    // Chessboard Grid for Selected Project
                    <div className="animate-slide-up pb-20">
                         {loading ? (
                             <div className="py-20 flex flex-col items-center justify-center text-brand-grey gap-3">
                                <div className="w-8 h-8 border-2 border-brand-gold border-t-transparent rounded-full animate-spin"></div>
                                <span className="text-xs font-medium">Загрузка квартир {selectedProject.name}...</span>
                            </div>
                         ) : (
                             <>
                                <div className="flex items-center gap-4 mb-6 justify-center text-xs font-medium text-brand-grey sticky top-0 bg-brand-cream/95 py-2 backdrop-blur-sm z-10">
                                    <div className="flex items-center gap-1.5"><div className="w-3 h-3 bg-white border border-brand-light rounded-sm"></div> Свободно</div>
                                    <div className="flex items-center gap-1.5"><div className="w-3 h-3 bg-brand-cream border border-brand-gold rounded-sm"></div> Бронь</div>
                                    <div className="flex items-center gap-1.5"><div className="w-3 h-3 bg-brand-light rounded-sm opacity-50"></div> Продано</div>
                                </div>

                                <div className="space-y-1">
                                    {Array.from({length: selectedProject.floors}).map((_, i) => {
                                        const floorNum = selectedProject.floors - i;
                                        const floorUnits = currentProjectUnits.filter(u => u.floor === floorNum).sort((a,b) => a.number.localeCompare(b.number));
                                        
                                        return (
                                            <div key={floorNum} className="flex gap-2 items-center">
                                                <div className="w-6 text-[10px] font-bold text-brand-grey text-center opacity-50">{floorNum}</div>
                                                <div className="flex-1 grid gap-1" style={{ gridTemplateColumns: `repeat(${selectedProject.unitsPerFloor}, 1fr)` }}>
                                                    {floorUnits.map(unit => (
                                                        <div 
                                                            key={unit.id}
                                                            onClick={() => handleUnitClick(unit)}
                                                            className={`
                                                                h-10 rounded-[4px] flex flex-col items-center justify-center border text-[9px] transition-all
                                                                ${unit.status === 'FREE' ? 'bg-white border-brand-light hover:border-brand-gold cursor-pointer hover:shadow-md hover:z-10 hover:scale-105' : ''}
                                                                ${unit.status === 'BOOKED' ? 'bg-brand-cream border-brand-gold/30 text-brand-gold cursor-not-allowed' : ''}
                                                                ${unit.status === 'SOLD' ? 'bg-brand-light/50 border-transparent text-brand-grey/30 cursor-not-allowed' : ''}
                                                            `}
                                                        >
                                                            <span className="font-bold">{unit.rooms}к</span>
                                                            {unit.status === 'FREE' && <span className="opacity-70">{unit.area}м</span>}
                                                        </div>
                                                    ))}
                                                    {/* Fill gaps if units < unitsPerFloor */}
                                                    {Array.from({length: Math.max(0, selectedProject.unitsPerFloor - floorUnits.length)}).map((_, idx) => (
                                                        <div key={`gap-${idx}`} className="h-10 bg-transparent"></div>
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

            {/* Unit Detail Pop-up / Modal */}
            {selectedUnit && selectedProject && (
                <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-brand-black/20 backdrop-blur-sm animate-fade-in p-0 sm:p-4">
                    <div className="bg-brand-white w-full h-[90vh] sm:h-auto sm:max-w-md rounded-t-[2rem] sm:rounded-[2rem] overflow-hidden flex flex-col shadow-2xl animate-slide-up relative">
                         <button 
                            onClick={() => setSelectedUnit(null)}
                            className="absolute top-4 right-4 w-10 h-10 bg-black/5 hover:bg-black/10 rounded-full flex items-center justify-center text-brand-black z-20 transition-colors"
                        >
                            <X size={20} />
                        </button>

                        <div className="p-6 flex flex-col h-full overflow-y-auto custom-scrollbar">
                            <div className="text-center mb-6 mt-2">
                                <span className="text-xs font-bold text-brand-grey uppercase tracking-widest mb-1 block">{selectedProject.name}</span>
                                <h3 className="text-2xl font-black text-brand-black">Квартира №{selectedUnit.number}</h3>
                                <p className="text-brand-gold font-bold text-sm mt-1">{selectedUnit.rooms}-комнатная • Этаж {selectedUnit.floor}</p>
                            </div>

                            <div className="shrink-0 bg-brand-white rounded-2xl border border-brand-light mb-6 p-4 flex items-center justify-center relative group min-h-[200px]">
                                {selectedUnit.layoutImage ? (
                                    <img src={selectedUnit.layoutImage} alt="Layout" className="max-w-full max-h-[30vh] object-contain mix-blend-multiply" />
                                ) : (
                                    <div className="text-brand-grey flex flex-col items-center gap-2">
                                        <Maximize2 size={32} className="opacity-20" />
                                        <span className="text-xs">Нет планировки</span>
                                    </div>
                                )}
                            </div>

                            <div className="grid grid-cols-2 gap-3 mb-6">
                                <div className="bg-brand-cream/50 p-3 rounded-xl">
                                    <span className="text-[10px] text-brand-grey font-bold uppercase block mb-1">Площадь</span>
                                    <div className="flex items-baseline gap-1">
                                        <span className="text-xl font-black text-brand-black">{selectedUnit.area}</span>
                                        <span className="text-xs font-bold text-brand-black/50">м²</span>
                                    </div>
                                </div>
                                <div className="bg-brand-cream/50 p-3 rounded-xl">
                                    <span className="text-[10px] text-brand-grey font-bold uppercase block mb-1">Цена за м²</span>
                                    <div className="flex items-baseline gap-1">
                                        <span className="text-xl font-black text-brand-black">{(selectedUnit.price / selectedUnit.area / 1000).toFixed(0)}</span>
                                        <span className="text-xs font-bold text-brand-black/50">тыс. ₽</span>
                                    </div>
                                </div>
                            </div>

                            <div className="flex justify-between items-center mb-6 px-2">
                                <div>
                                    <span className="text-xs text-brand-grey font-medium">Полная стоимость</span>
                                    <div className="text-3xl font-black text-brand-black tracking-tight">
                                        {(selectedUnit.price / 1000000).toFixed(2)} <span className="text-lg text-brand-black/60">млн ₽</span>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-3 mb-8">
                                <button 
                                    onClick={() => setShowMortgageCalc(true)}
                                    className="w-full py-3 bg-brand-cream text-brand-black border border-brand-beige rounded-xl flex items-center justify-center gap-2 text-sm font-bold"
                                >
                                    <Calculator size={16} />
                                    Рассчитать ипотеку
                                </button>
                                
                                <button 
                                    onClick={handleDownloadPdf}
                                    className="w-full py-3 bg-brand-white border border-brand-black/10 text-brand-black rounded-xl flex items-center justify-center gap-2 text-sm font-bold active:bg-brand-light"
                                >
                                    <Download size={16} />
                                    Скачать PDF (С вашими контактами)
                                </button>
                            </div>

                            {!showBookingForm ? (
                                <button 
                                    onClick={() => setShowBookingForm(true)}
                                    className="w-full py-4 bg-brand-black text-brand-gold font-bold rounded-xl flex items-center justify-center gap-2 shadow-lg active:scale-[0.98] transition-transform"
                                >
                                    <Lock size={18} />
                                    Зафиксировать клиента (Бронь)
                                </button>
                            ) : !bookingSuccess ? (
                                <form onSubmit={handleBookingSubmit} className="bg-brand-light/30 rounded-xl p-4 border border-brand-gold/30 animate-fade-in">
                                    <h4 className="font-bold text-brand-black mb-3 text-sm">Фиксация клиента в CRM</h4>
                                    <div className="space-y-3">
                                        <div>
                                            <label className="text-[10px] font-bold text-brand-grey uppercase">Имя клиента</label>
                                            <div className="relative">
                                                <User size={14} className="absolute left-3 top-3 text-brand-grey" />
                                                <input 
                                                    required
                                                    type="text" 
                                                    value={clientName}
                                                    onChange={(e) => setClientName(e.target.value)}
                                                    placeholder="Иванов Иван"
                                                    className="w-full rounded-lg py-2 pl-9 pr-3 text-sm bg-white border border-brand-light focus:border-brand-gold outline-none"
                                                />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-bold text-brand-grey uppercase">Телефон</label>
                                            <input 
                                                required
                                                type="tel" 
                                                value={clientPhone}
                                                onChange={(e) => setClientPhone(e.target.value)}
                                                placeholder="+7 (999) 000-00-00"
                                                className="w-full rounded-lg py-2 px-3 text-sm bg-white border border-brand-light focus:border-brand-gold outline-none"
                                            />
                                        </div>
                                        <div className="flex gap-2 pt-2">
                                            <button 
                                                type="button" 
                                                onClick={() => setShowBookingForm(false)}
                                                className="flex-1 py-2 text-xs font-bold text-brand-grey bg-brand-white rounded-lg"
                                            >
                                                Отмена
                                            </button>
                                            <button 
                                                type="submit"
                                                className="flex-[2] py-2 text-xs font-bold text-white bg-green-600 rounded-lg shadow-sm"
                                            >
                                                Отправить заявку
                                            </button>
                                        </div>
                                    </div>
                                </form>
                            ) : (
                                <div className="bg-green-100 border border-green-200 rounded-xl p-4 text-center animate-fade-in">
                                    <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center text-white mx-auto mb-2">
                                        <Check size={20} />
                                    </div>
                                    <h4 className="font-bold text-green-800 text-sm">Заявка отправлена!</h4>
                                    <p className="text-xs text-green-700 mt-1">Клиент зафиксирован за вами на 24 часа. Менеджер свяжется с вами.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {showMortgageCalc && selectedUnit && (
                <MortgageCalc 
                    initialPrice={selectedUnit.price} 
                    programs={mortgagePrograms}
                    onClose={() => setShowMortgageCalc(false)} 
                />
            )}
        </div>
    );
};

export default ChessboardModal;
