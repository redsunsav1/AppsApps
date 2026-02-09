import React, { useState, useEffect, useRef } from 'react';
import WebApp from '@twa-dev/sdk';
import { X, ArrowLeft, Loader2, Camera, Building2, Download, Calculator, Lock, Unlock } from 'lucide-react';
import { ProjectData, ChessUnit, MortgageProgram } from '../types';
import MortgageCalc from './tools/MortgageCalc';
import { showToast } from '../utils/toast';

interface ChessboardProps {
  onClose: () => void;
  projects: ProjectData[];
  isAdmin?: boolean;
  mortgagePrograms?: MortgageProgram[];
}

const ChessboardModal: React.FC<ChessboardProps> = ({ onClose, projects, isAdmin = false, mortgagePrograms = [] }) => {
    const [loading, setLoading] = useState(false);
    const [units, setUnits] = useState<ChessUnit[]>([]);
    const [selectedProject, setSelectedProject] = useState<ProjectData | null>(null);
    const [bookingUnit, setBookingUnit] = useState<ChessUnit | null>(null);
    const [bookingLoading, setBookingLoading] = useState(false);
    const [bookingResult, setBookingResult] = useState<{ ok: boolean; msg: string } | null>(null);

    // Booking form fields
    const [buyerName, setBuyerName] = useState('');
    const [buyerPhone, setBuyerPhone] = useState('');
    const [passportFile, setPassportFile] = useState<File | null>(null);
    const [passportPreview, setPassportPreview] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Section selector
    const [sections, setSections] = useState<string[]>([]);
    const [activeSection, setActiveSection] = useState<string | null>(null);

    // Show mortgage calc modal
    const [showMortgage, setShowMortgage] = useState(false);

    // Show booking form (only when user clicks "Забронировать")
    const [showBookingForm, setShowBookingForm] = useState(false);

    // Cancel booking loading
    const [cancelLoading, setCancelLoading] = useState(false);

    // Unit IDs that current user has booked (for showing cancel button)
    const [myBookedUnitIds, setMyBookedUnitIds] = useState<Set<string>>(new Set());

    // Consent for personal data transfer to developer (152-ФЗ)
    const [consentTransfer, setConsentTransfer] = useState(false);

    // Load units when a project is selected
    useEffect(() => {
        if (selectedProject) {
            setLoading(true);
            setUnits([]);
            setMyBookedUnitIds(new Set());

            // Load units
            const unitsPromise = fetch(`/api/units/${selectedProject.id}`)
                .then(res => res.json());

            // Load my bookings to know which units I booked
            const myBookingsPromise = fetch('/api/bookings/my', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ initData: WebApp.initData })
            }).then(res => res.json()).catch(() => []);

            Promise.all([unitsPromise, myBookingsPromise])
                .then(([data, myBookings]) => {
                    const mapped = data.map((u: any) => ({
                        id: u.id,
                        number: u.number,
                        rooms: u.rooms,
                        area: u.area,
                        price: u.price,
                        status: u.status,
                        floor: u.floor,
                        layoutImage: u.plan_image_url,
                        section: u.section || null
                    }));
                    setUnits(mapped);
                    // Extract unique sections
                    const secs = [...new Set(mapped.map((u: ChessUnit) => u.section).filter(Boolean))] as string[];
                    setSections(secs);
                    setActiveSection(secs.length > 0 ? secs[0] : null);

                    // Собираем unit_id моих активных бронирований
                    const myIds = new Set<string>(
                        (Array.isArray(myBookings) ? myBookings : [])
                            .filter((b: any) => b.stage !== 'CANCELLED')
                            .map((b: any) => b.unit_id)
                    );
                    setMyBookedUnitIds(myIds);
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
            // Step 1: Create booking (stage = INIT)
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

            // Step 2: Upload passport → unit becomes BOOKED
            const formData = new FormData();
            formData.append('initData', WebApp.initData);
            formData.append('buyerName', buyerName);
            formData.append('buyerPhone', buyerPhone);
            formData.append('passport', passportFile);
            formData.append('consentTransfer', 'true');

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
                setShowBookingForm(false);
                // Добавляем в список моих бронирований
                setMyBookedUnitIds(prev => new Set(prev).add(bookingUnit.id));
            } else {
                setBookingResult({ ok: false, msg: data2.error || 'Ошибка загрузки паспорта' });
            }
        } catch (e) {
            setBookingResult({ ok: false, msg: 'Ошибка сети. Попробуйте позже.' });
        } finally {
            setBookingLoading(false);
        }
    };

    const handleCancelBooking = async () => {
        if (!bookingUnit) return;
        setCancelLoading(true);
        try {
            const res = await fetch('/api/bookings/cancel', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    initData: WebApp.initData,
                    unitId: bookingUnit.id,
                }),
            });
            const data = await res.json();
            if (data.success) {
                showToast('Бронирование отменено', 'success');
                setUnits(prev => prev.map(u =>
                    u.id === bookingUnit.id ? { ...u, status: 'FREE' } : u
                ));
                setBookingUnit({ ...bookingUnit, status: 'FREE' });
                setBookingResult(null);
                // Убираем из списка моих бронирований
                setMyBookedUnitIds(prev => {
                    const next = new Set(prev);
                    next.delete(bookingUnit.id);
                    return next;
                });
            } else {
                showToast(data.error || 'Ошибка отмены', 'error');
            }
        } catch (e) {
            showToast('Ошибка сети', 'error');
        } finally {
            setCancelLoading(false);
        }
    };

    const resetBookingForm = () => {
        setBookingUnit(null);
        setBuyerName('');
        setBuyerPhone('');
        setPassportFile(null);
        setPassportPreview(null);
        setBookingResult(null);
        setShowBookingForm(false);
        setShowMortgage(false);
        setConsentTransfer(false);
    };

    const formatPrice = (price: number) => {
        return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(price);
    };

    const getRoomLabel = (rooms: number) => {
        if (rooms === 0) return 'Студия';
        return `${rooms}-комн`;
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
                                    <div className="flex-1 min-w-0">
                                        <h3 className="text-lg font-extrabold text-brand-black">{p.name}</h3>
                                        <p className="text-xs text-brand-grey mt-1">{p.floors} этажей • {p.description || "Описание проекта..."}</p>
                                        {p.developerName && (
                                            <p className="text-[10px] text-gray-400 mt-1">Реклама. Застройщик: {p.developerName}</p>
                                        )}
                                        <div className="mt-2 flex items-center gap-2 text-brand-gold text-[10px] font-bold uppercase tracking-wide bg-brand-gold/10 px-2 py-1 rounded-lg w-fit">
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
                                {/* Section tabs */}
                                {sections.length > 1 && (
                                    <div className="flex gap-2 mb-4 overflow-x-auto pb-1 sticky top-0 bg-brand-cream/95 z-20 pt-1 backdrop-blur-sm">
                                        {sections.map(sec => (
                                            <button
                                                key={sec}
                                                onClick={() => setActiveSection(sec)}
                                                className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                                                    activeSection === sec
                                                        ? 'bg-brand-black text-brand-gold shadow-lg'
                                                        : 'bg-white border border-brand-light text-brand-grey hover:border-brand-gold'
                                                }`}
                                            >
                                                {sec}
                                            </button>
                                        ))}
                                    </div>
                                )}

                                <div className="flex items-center gap-4 mb-4 justify-center text-xs font-medium text-brand-grey sticky top-8 bg-brand-cream/95 py-2 backdrop-blur-sm z-10" style={{ top: sections.length > 1 ? '2.5rem' : '0' }}>
                                    <div className="flex items-center gap-1.5"><div className="w-3 h-3 bg-white border border-brand-light rounded-sm"></div> Свободно</div>
                                    <div className="flex items-center gap-1.5"><div className="w-3 h-3 bg-brand-cream border border-brand-gold rounded-sm"></div> Бронь</div>
                                    <div className="flex items-center gap-1.5"><div className="w-3 h-3 bg-brand-light rounded-sm opacity-50"></div> Продано</div>
                                </div>

                                <div className="overflow-x-auto pb-4">
                                    <div className="space-y-1 min-w-max px-2">
                                        {(() => {
                                            // Filter by section if sections exist
                                            const filteredUnits = sections.length > 0 && activeSection
                                                ? units.filter(u => u.section === activeSection)
                                                : units;

                                            // Calculate max floor and units per floor dynamically
                                            const maxFloor = Math.max(selectedProject.floors, ...filteredUnits.map(u => u.floor));
                                            const floorUnitCounts: Record<number, number> = {};
                                            filteredUnits.forEach(u => {
                                                floorUnitCounts[u.floor] = (floorUnitCounts[u.floor] || 0) + 1;
                                            });
                                            const cols = sections.length > 0
                                                ? Math.max(...Object.values(floorUnitCounts), 1)
                                                : (selectedProject.unitsPerFloor || 8);

                                            return Array.from({length: maxFloor}).map((_, i) => {
                                                const floorNum = maxFloor - i;
                                                if (floorNum < 1) return null;

                                                const floorUnits = filteredUnits.filter(u => u.floor === floorNum);
                                                floorUnits.sort((a, b) => parseInt(a.number) - parseInt(b.number));

                                                return (
                                                    <div key={floorNum} className="flex gap-2 items-center">
                                                        <div className="w-7 text-xs font-bold text-brand-grey text-center sticky left-0 bg-brand-cream z-10">
                                                            {floorNum}
                                                        </div>

                                                        <div className="flex-1 grid gap-1" style={{ gridTemplateColumns: `repeat(${cols}, minmax(40px, 1fr))` }}>
                                                            {Array.from({length: cols}).map((_, idx) => {
                                                                const unit = floorUnits[idx];

                                                                if (!unit) {
                                                                    return <div key={`empty-${floorNum}-${idx}`} className="h-10 w-12 bg-gray-200/30 rounded-md border border-transparent" />
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
                                            });
                                        })()}
                                    </div>
                                </div>
                             </>
                         )}
                    </div>
                )}
            </div>

            {/* Unit Detail Modal */}
            {bookingUnit && !showMortgage && (
                <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in p-4">
                    <div className="absolute inset-0" onClick={resetBookingForm} />
                    <div className="bg-white w-full max-w-sm rounded-2xl p-6 shadow-2xl animate-slide-up relative z-10 max-h-[90vh] overflow-y-auto">
                        <button onClick={resetBookingForm} className="absolute top-4 right-4 text-gray-400 hover:text-black">
                            <X size={20} />
                        </button>

                        {/* Status Badge + Unit Info */}
                        <div className="mb-4">
                            <div className={`inline-block px-3 py-1 rounded-full text-xs font-bold mb-2
                                ${bookingUnit.status === 'FREE' ? 'bg-green-100 text-green-700' : ''}
                                ${bookingUnit.status === 'BOOKED' ? 'bg-yellow-100 text-yellow-700' : ''}
                                ${bookingUnit.status === 'SOLD' ? 'bg-gray-100 text-gray-500' : ''}
                            `}>
                                {bookingUnit.status === 'FREE' ? 'Свободна' : bookingUnit.status === 'BOOKED' ? 'Забронирована' : 'Продана'}
                            </div>

                            <h3 className="text-xl font-extrabold text-brand-black">
                                Кв. №{bookingUnit.number}
                            </h3>
                            <p className="text-sm text-brand-grey mt-1">
                                {getRoomLabel(bookingUnit.rooms)} · {bookingUnit.area} м² · {bookingUnit.floor} эт.{bookingUnit.section ? ` · ${bookingUnit.section}` : ''}
                            </p>

                            {/* Price - large */}
                            {bookingUnit.price > 0 && (
                                <div className="text-2xl font-black text-brand-black mt-3">
                                    {formatPrice(bookingUnit.price)}
                                </div>
                            )}
                        </div>

                        {/* Layout Image */}
                        <div className="bg-brand-cream rounded-2xl border border-brand-light mb-4 p-3 flex items-center justify-center min-h-[180px]">
                            {bookingUnit.layoutImage ? (
                                <img src={bookingUnit.layoutImage} alt="Планировка" className="max-w-full max-h-[25vh] object-contain mix-blend-multiply" />
                            ) : (
                                <div className="text-brand-grey flex flex-col items-center gap-2">
                                    <Building2 size={32} className="opacity-30" />
                                    <span className="text-xs">Нет планировки</span>
                                </div>
                            )}
                        </div>

                        {/* Action Buttons */}
                        <div className="space-y-2 mb-4">
                            {/* Download Layout */}
                            {bookingUnit.layoutImage && (
                                <a
                                    href={bookingUnit.layoutImage}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="w-full py-3 bg-brand-cream border border-brand-light rounded-xl font-bold text-sm flex items-center justify-center gap-2 text-brand-black active:scale-[0.98] transition-transform"
                                >
                                    <Download size={16} /> Скачать планировку
                                </a>
                            )}

                            {/* Mortgage Calculator */}
                            <button
                                onClick={() => setShowMortgage(true)}
                                className="w-full py-3 bg-brand-cream border border-brand-light rounded-xl font-bold text-sm flex items-center justify-center gap-2 text-brand-black active:scale-[0.98] transition-transform"
                            >
                                <Calculator size={16} /> Рассчитать стоимость
                            </button>

                            {/* Book - only for FREE */}
                            {bookingUnit.status === 'FREE' && !bookingResult?.ok && !showBookingForm && (
                                <button
                                    onClick={() => setShowBookingForm(true)}
                                    className="w-full py-3 bg-brand-black text-brand-gold rounded-xl font-bold text-sm flex items-center justify-center gap-2 shadow-lg active:scale-[0.98] transition-transform"
                                >
                                    <Lock size={16} /> Забронировать
                                </button>
                            )}

                            {/* Cancel Booking - admin OR booking owner */}
                            {bookingUnit.status === 'BOOKED' && (isAdmin || myBookedUnitIds.has(bookingUnit.id)) && (
                                <button
                                    onClick={handleCancelBooking}
                                    disabled={cancelLoading}
                                    className="w-full py-3 bg-red-50 border border-red-200 text-red-600 rounded-xl font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-50"
                                >
                                    {cancelLoading ? <Loader2 size={16} className="animate-spin" /> : <Unlock size={16} />}
                                    Снять бронь
                                </button>
                            )}
                        </div>

                        {/* Booking Form (expanded) */}
                        {showBookingForm && bookingUnit.status === 'FREE' && !bookingResult?.ok && (
                            <div className="space-y-3 mb-4 pt-4 border-t border-gray-100 animate-fade-in">
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

                                {/* Passport Upload */}
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

                                {/* 152-ФЗ: согласие на передачу ПДн застройщику */}
                                <label className="flex items-start gap-2 cursor-pointer select-none mt-2">
                                    <input
                                        type="checkbox"
                                        checked={consentTransfer}
                                        onChange={e => setConsentTransfer(e.target.checked)}
                                        className="mt-0.5 w-4 h-4 accent-brand-gold shrink-0"
                                    />
                                    <span className="text-[11px] text-gray-500 leading-tight">
                                        Я даю согласие на передачу моих персональных данных и документов покупателя
                                        застройщику{selectedProject?.developerName ? ` ${selectedProject.developerName}` : ''} для
                                        оформления бронирования квартиры
                                    </span>
                                </label>

                                <button
                                    onClick={handleBooking}
                                    disabled={bookingLoading || !buyerName || !buyerPhone || !passportFile || !consentTransfer}
                                    className="w-full py-3 bg-brand-black text-white rounded-xl font-bold shadow-lg disabled:opacity-50 flex items-center justify-center gap-2"
                                >
                                    {bookingLoading ? <><Loader2 size={16} className="animate-spin" /> Отправка...</> : 'Подтвердить бронирование'}
                                </button>
                            </div>
                        )}

                        {/* Booking Result */}
                        {bookingResult && (
                            <div className={`mb-4 p-3 rounded-xl text-sm font-medium text-center ${bookingResult.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
                                {bookingResult.msg}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Mortgage Calculator Modal (from unit) */}
            {showMortgage && bookingUnit && (
                <MortgageCalc
                    initialPrice={bookingUnit.price}
                    programs={mortgagePrograms}
                    onClose={() => setShowMortgage(false)}
                />
            )}
        </div>
    );
};

export default ChessboardModal;
