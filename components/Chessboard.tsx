import React, { useState, useEffect, useRef } from 'react';
import WebApp from '@twa-dev/sdk';
import { X, ArrowLeft, Loader2, Camera } from 'lucide-react';
import { ProjectData, ChessUnit } from '../types';

interface ChessboardProps {
  onClose: () => void;
  projects: ProjectData[];
}

const ChessboardModal: React.FC<ChessboardProps> = ({ onClose, projects }) => {
    const [loading, setLoading] = useState(false);
    const [units, setUnits] = useState<ChessUnit[]>([]);
    const [selectedProject, setSelectedProject] = useState<ProjectData | null>(null);
    const [bookingUnit, setBookingUnit] = useState<ChessUnit | null>(null);
    const [bookingLoading, setBookingLoading] = useState(false);
    const [bookingResult, setBookingResult] = useState<{ ok: boolean; msg: string } | null>(null);

    // Новые поля для двухэтапного бронирования
    const [buyerName, setBuyerName] = useState('');
    const [buyerPhone, setBuyerPhone] = useState('');
    const [passportFile, setPassportFile] = useState<File | null>(null);
    const [passportPreview, setPassportPreview] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Booking Form State
    const [clientName, setClientName] = useState('');
    const [clientPhone, setClientPhone] = useState('');
    const [bookingSuccess, setBookingSuccess] = useState(false);

    // Load units when a project is selected
    useEffect(() => {
        if (selectedProject) {
            setLoading(true);
            setUnits([]);
            fetch(`/api/units/${selectedProject.id}`)
                .then(res => res.json())
                .then(data => {
                    const mapped = data.map((u: any) => ({
                        id: u.id,
                        number: u.number,
                        rooms: u.rooms,
                        area: u.area,
                        price: u.price,
                        status: u.status,
                        floor: u.floor,
                        layoutImage: u.plan_image_url
                    }));
                    setUnits(mapped);
                })
                .catch(e => console.error('Error loading units:', e))
                .finally(() => setLoading(false));
        }
    }, [selectedProject]);

    const handleProjectSelect = (p: ProjectData) => {
        setSelectedProject(p);
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setPassportFile(file);
            const reader = new FileReader();
            reader.onload = (ev) => setPassportPreview(ev.target?.result as string);
            reader.readAsDataURL(file);
        }
    };

    const handleBooking = async () => {
        if (!bookingUnit || !selectedProject || !buyerName || !buyerPhone || !passportFile) return;
        setBookingLoading(true);
        setBookingResult(null);
        try {
            // Шаг 1: Создаём бронирование (stage = INIT)
            const res1 = await fetch('/api/bookings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    initData: WebApp.initData,
                    unitId: bookingUnit.id,
                    projectId: selectedProject.id,
                }),
            });
            const data1 = await res1.json();
            if (!data1.success || !data1.bookingId) {
                setBookingResult({ ok: false, msg: data1.error || 'Ошибка создания бронирования' });
                return;
            }

            // Шаг 2: Загружаем паспорт → квартира станет BOOKED
            const formData = new FormData();
            formData.append('initData', WebApp.initData);
            formData.append('buyerName', buyerName);
            formData.append('buyerPhone', buyerPhone);
            formData.append('passport', passportFile);

            const res2 = await fetch(`/api/bookings/${data1.bookingId}/passport`, {
                method: 'POST',
                body: formData,
            });
            const data2 = await res2.json();

            if (data2.success) {
                setBookingResult({ ok: true, msg: 'Паспорт отправлен! Квартира забронирована.' });
                setUnits(prev => prev.map(u =>
                    u.id === bookingUnit.id ? { ...u, status: 'BOOKED' } : u
                ));
                setBookingUnit({ ...bookingUnit, status: 'BOOKED' });
            } else {
                setBookingResult({ ok: false, msg: data2.error || 'Ошибка загрузки паспорта' });
            }
        } catch (e) {
            setBookingResult({ ok: false, msg: 'Ошибка сети. Попробуйте позже.' });
        } finally {
            setBookingLoading(false);
        }
    };

    const resetBookingForm = () => {
        setBookingUnit(null);
        setBuyerName('');
        setBuyerPhone('');
        setPassportFile(null);
        setPassportPreview(null);
        setBookingResult(null);
    };

    const formatPrice = (price: number) => {
        return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(price);
    };

    return (
        <div className="fixed inset-0 z-50 flex flex-col bg-brand-cream animate-fade-in text-brand-black">

            <div className="px-6 pt-8 pb-4 flex justify-between items-center bg-brand-white border-b border-brand-light">
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

                                <div className="overflow-x-auto pb-4">
                                    <div className="space-y-1 min-w-max px-2">
                                        {Array.from({length: selectedProject.floors}).map((_, i) => {
                                            const floorNum = selectedProject.floors - i;

                                            if (floorNum < 2) return null;
                                            const displayFloor = floorNum - 1;

                                            const floorUnits = units.filter(u => u.floor === floorNum);
                                            floorUnits.sort((a, b) => parseInt(a.number) - parseInt(b.number));

                                            const cols = selectedProject.unitsPerFloor || 8;

                                            return (
                                                <div key={floorNum} className="flex gap-2 items-center">
                                                    <div className="w-6 text-xs font-bold text-brand-grey text-center sticky left-0 bg-brand-cream z-10">
                                                        {displayFloor}
                                                    </div>

                                                    <div className="flex-1 grid gap-1" style={{ gridTemplateColumns: `repeat(${cols}, minmax(40px, 1fr))` }}>
                                                        {Array.from({length: cols}).map((_, idx) => {
                                                            const unit = floorUnits[idx];

                                                            if (!unit) {
                                                                return <div key={`empty-${idx}`} className="h-10 w-12 bg-gray-200/30 rounded-md border border-transparent" />
                                                            }

                                                            return (
                                                                <div
                                                                    key={unit.id}
                                                                    onClick={() => { resetBookingForm(); setBookingUnit(unit); }}
                                                                    className={`
                                                                        h-10 w-12 rounded-md flex flex-col items-center justify-center border text-[9px] transition-all cursor-pointer
                                                                        ${unit.status === 'FREE' ? 'bg-white border-brand-light hover:border-brand-gold hover:bg-brand-cream shadow-sm' : ''}
                                                                        ${unit.status === 'BOOKED' ? 'bg-brand-cream border-brand-gold/30 text-brand-gold' : ''}
                                                                        ${unit.status === 'SOLD' ? 'bg-brand-light border-transparent text-white opacity-40 cursor-default' : ''}
                                                                    `}
                                                                >
                                                                    <span className="font-bold">{unit.number}</span>
                                                                    {unit.status === 'FREE' && <span>{unit.area}</span>}
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            );
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
                    <div className="absolute inset-0" onClick={resetBookingForm} />
                    <div className="bg-white w-full max-w-sm rounded-2xl p-6 shadow-2xl animate-slide-up relative z-10 max-h-[90vh] overflow-y-auto">
                        <button onClick={resetBookingForm} className="absolute top-4 right-4 text-gray-400 hover:text-black">
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

                            <div className="shrink-0 bg-brand-white rounded-2xl border border-brand-light mb-6 p-4 flex items-center justify-center relative group min-h-[200px]">
                                {bookingUnit.layoutImage ? (
                                    <img src={bookingUnit.layoutImage} alt="Layout" className="max-w-full max-h-[30vh] object-contain mix-blend-multiply" />
                                ) : (
                                    <div className="text-brand-grey flex flex-col items-center gap-2">
                                        <span className="text-xs">Нет планировки</span>
                                    </div>
                                )}
                            </div>

                        {/* Форма бронирования (только для свободных) */}
                        {bookingUnit.status === 'FREE' && !bookingResult?.ok && (
                            <div className="space-y-3 mb-4 pt-4 border-t border-gray-100">
                                <h4 className="text-sm font-bold text-brand-black">Данные покупателя</h4>
                                <input
                                    type="text"
                                    value={buyerName}
                                    onChange={e => setBuyerName(e.target.value)}
                                    placeholder="ФИО покупателя"
                                    className="w-full p-3 bg-gray-50 rounded-xl border border-gray-200 focus:ring-2 focus:ring-brand-gold outline-none text-sm"
                                />
                                <input
                                    type="tel"
                                    value={buyerPhone}
                                    onChange={e => setBuyerPhone(e.target.value)}
                                    placeholder="Телефон покупателя"
                                    className="w-full p-3 bg-gray-50 rounded-xl border border-gray-200 focus:ring-2 focus:ring-brand-gold outline-none text-sm"
                                />

                                {/* Загрузка паспорта */}
                                <div>
                                    <label className="block text-xs font-bold uppercase text-gray-500 mb-2">Фото паспорта</label>
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept="image/*"
                                        capture="environment"
                                        onChange={handleFileChange}
                                        className="hidden"
                                    />
                                    {passportPreview ? (
                                        <div className="relative">
                                            <img src={passportPreview} alt="Паспорт" className="w-full h-40 object-cover rounded-xl border border-gray-200" />
                                            <button
                                                onClick={() => { setPassportFile(null); setPassportPreview(null); }}
                                                className="absolute top-2 right-2 bg-white rounded-full p-1 shadow"
                                            >
                                                <X size={16} />
                                            </button>
                                        </div>
                                    ) : (
                                        <button
                                            onClick={() => fileInputRef.current?.click()}
                                            className="w-full py-6 border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center gap-2 text-gray-400 hover:border-brand-gold hover:text-brand-gold transition-colors"
                                        >
                                            <Camera size={24} />
                                            <span className="text-xs font-bold">Сделать фото или загрузить</span>
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Результат бронирования */}
                        {bookingResult && (
                            <div className={`mb-4 p-3 rounded-xl text-sm font-medium text-center ${bookingResult.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
                                {bookingResult.msg}
                            </div>
                        )}

                        <div className="flex gap-3">
                            <button onClick={resetBookingForm} className="flex-1 py-3 bg-gray-100 text-gray-700 rounded-xl font-bold">
                                {bookingResult?.ok ? 'Закрыть' : 'Отмена'}
                            </button>
                            {bookingUnit.status === 'FREE' && !bookingResult?.ok && (
                                <button
                                    onClick={handleBooking}
                                    disabled={bookingLoading || !buyerName || !buyerPhone || !passportFile}
                                    className="flex-1 py-3 bg-brand-black text-white rounded-xl font-bold shadow-lg disabled:opacity-50 flex items-center justify-center gap-2"
                                >
                                    {bookingLoading ? <><Loader2 size={16} className="animate-spin" /> Отправка...</> : 'Забронировать'}
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
