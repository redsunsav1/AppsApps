import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { getAuthData } from '../utils/auth';
import { X, ArrowLeft, Loader2, Camera, Building2, Download, Calculator, Lock, Unlock, Clock, SearchX, Send } from 'lucide-react';
import { ProjectData, ChessUnit, MortgageProgram } from '../types';
import MortgageCalc from './tools/MortgageCalc';
import { showToast } from '../utils/toast';
import ChessboardFilters, { ChessView } from './ChessboardFilters';
import {
    UnitFilter, EMPTY_FILTER, isFilterActive, matchesFilter,
    buildGridLayout, availableRoomOptions, roomLabel, roomShort, formatPriceShort,
} from '../utils/chessboard';
import {
    CardAgent, renderUnitCard, shareUnitCard, buildUnitText,
    cardFileName, calcMonthlyPayment, bestRate,
} from '../utils/unitCard';
import { calcCommission, formatCommission, parseCommissionPercent } from '../utils/commission';

interface ChessboardProps {
  onClose: () => void;
  projects: ProjectData[];
  isAdmin?: boolean;
  mortgagePrograms?: MortgageProgram[];
  /** Контакты риелтора — попадают в карточку, которую он отправляет клиенту. */
  agent?: CardAgent;
}

const ChessboardModal: React.FC<ChessboardProps> = ({ onClose, projects, isAdmin = false, mortgagePrograms = [], agent }) => {
    const [loading, setLoading] = useState(false);
    const [units, setUnits] = useState<ChessUnit[]>([]);
    const [selectedProject, setSelectedProject] = useState<ProjectData | null>(null);
    const [bookingUnit, setBookingUnit] = useState<ChessUnit | null>(null);
    const [bookingLoading, setBookingLoading] = useState(false);
    const [bookingResult, setBookingResult] = useState<{ ok: boolean; msg: string } | null>(null);
    const [now, setNow] = useState(Date.now());

    // Booking form fields
    const [buyerName, setBuyerName] = useState('');
    const [buyerPhone, setBuyerPhone] = useState('');
    const [passportFile, setPassportFile] = useState<File | null>(null);
    const [passportPreview, setPassportPreview] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Section selector
    const [sections, setSections] = useState<string[]>([]);
    const [activeSection, setActiveSection] = useState<string | null>(null);

    // Подбор под запрос клиента. Фильтр ничего не выбрасывает из сетки:
    // неподходящие квартиры гаснут, дом остаётся целым.
    const [filter, setFilter] = useState<UnitFilter>({ ...EMPTY_FILTER });
    const [view, setView] = useState<ChessView>('grid');

    // Подготовка карточки для отправки клиенту
    const [cardLoading, setCardLoading] = useState(false);

    // Ставка агентского вознаграждения. Отдаётся только подтверждённому партнёру,
    // поэтому запрашивается отдельно, а не приходит с публичными настройками.
    const [commissionPercent, setCommissionPercent] = useState(0);

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

    // Бронь создана, но паспорт не ушёл — можно повторить отправку
    const [pendingPassportBookingId, setPendingPassportBookingId] = useState<number | null>(null);

    // Ссылка на выбранный проект, чтобы таймер обновления не пересоздавался на каждый рендер
    const selectedProjectRef = useRef<ProjectData | null>(null);

    // Загрузка шахматки. silent — обновление в фоне, без скелетона и без сброса
    // уже показанных данных: используется для периодического обновления.
    const loadUnits = useCallback((opts?: { silent?: boolean }) => {
        const project = selectedProjectRef.current;
        if (!project) return;
        if (!opts?.silent) {
            setLoading(true);
            setUnits([]);
            setMyBookedUnitIds(new Set());
        }

        // Load units
        const unitsPromise = fetch(`/api/units/${project.id}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ initData: getAuthData() })
        })
            .then(res => res.json());

        // Load my bookings to know which units I booked
        const myBookingsPromise = fetch('/api/bookings/my', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ initData: getAuthData() })
        }).then(res => res.json()).catch(() => []);

        Promise.all([unitsPromise, myBookingsPromise])
            .then(([data, myBookings]) => {
                const myBookingByUnit = new Map<string, any>(
                    (Array.isArray(myBookings) ? myBookings : [])
                        .filter((b: any) => b.stage !== 'CANCELLED')
                        .map((b: any) => [b.unit_id, b])
                );
                const mapped = data.map((u: any) => ({
                    id: u.id,
                    number: u.number,
                    rooms: u.rooms,
                    area: u.area,
                    price: u.price,
                    status: u.status,
                    floor: u.floor,
                    layoutImage: u.plan_image_url,
                    section: u.section || null,
                    bookingAgentName: u.booking_agent_name ? `${u.booking_agent_name}${u.booking_agent_last_name ? ' ' + u.booking_agent_last_name : ''}` : undefined,
                    bookingAgentPhone: u.booking_agent_phone || undefined,
                    bookingAgentCompany: u.booking_agent_company || undefined,
                    bookingAgentCompanyType: u.booking_agent_company_type || undefined,
                    bookingBuyerName: u.booking_buyer_name || undefined,
                    bookingBuyerPhone: u.booking_buyer_phone || undefined,
                    bookingCreatedAt: u.booking_created_at || myBookingByUnit.get(u.id)?.created_at || undefined,
                    bookingExpiresAt: u.booking_expires_at || myBookingByUnit.get(u.id)?.expires_at || undefined,
                    bookingStage: u.booking_stage || myBookingByUnit.get(u.id)?.stage || undefined,
                }));
                setUnits(mapped);
                // Extract unique sections
                const secs = [...new Set(mapped.map((u: ChessUnit) => u.section).filter(Boolean))] as string[];
                setSections(secs);
                // При фоновом обновлении не сбрасываем выбранную риелтором секцию
                setActiveSection(prev => {
                    if (opts?.silent && prev && secs.includes(prev)) return prev;
                    return secs.length > 0 ? secs[0] : null;
                });

                // Собираем unit_id моих активных бронирований
                const myIds = new Set<string>(
                    (Array.isArray(myBookings) ? myBookings : [])
                        .filter((b: any) => b.stage !== 'CANCELLED')
                        .map((b: any) => b.unit_id)
                );
                setMyBookedUnitIds(myIds);
            })
            .catch(e => console.error('Error loading units:', e))
            .finally(() => { if (!opts?.silent) setLoading(false); });
    }, []);

    useEffect(() => {
        fetch('/api/commission', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ initData: getAuthData() }),
        })
            .then(r => (r.ok ? r.json() : null))
            .then(data => setCommissionPercent(parseCommissionPercent(data?.percent)))
            .catch(() => setCommissionPercent(0));
    }, []);

    useEffect(() => { selectedProjectRef.current = selectedProject; }, [selectedProject]);

    useEffect(() => {
        if (selectedProject) loadUnits();
    }, [selectedProject, loadUnits]);

    useEffect(() => {
        const timer = window.setInterval(() => setNow(Date.now()), 60000);
        return () => window.clearInterval(timer);
    }, []);

    // Шахматка устаревает: пока риелтор её разглядывает, квартиру может забрать
    // другой. Раз в минуту тихо подтягиваем статусы — но не поверх открытой формы
    // бронирования, чтобы не дёргать данные под руками у пользователя.
    useEffect(() => {
        if (!selectedProject) return;
        const timer = window.setInterval(() => {
            if (!showBookingForm && !bookingLoading) loadUnits({ silent: true });
        }, 60000);
        return () => window.clearInterval(timer);
    }, [selectedProject, showBookingForm, bookingLoading, loadUnits]);

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

    // Отправка паспорта по уже созданной брони. Вынесена отдельно, чтобы при
    // обрыве связи можно было повторить именно этот шаг: бронь к тому моменту
    // уже существует и квартира держится за риелтором.
    const sendPassport = async (bookingId: number, expiresAt?: string) => {
        const formData = new FormData();
        formData.append('initData', getAuthData());
        formData.append('buyerName', buyerName);
        formData.append('buyerPhone', buyerPhone);
        formData.append('passport', passportFile as File);
        formData.append('consentTransfer', 'true');

        const res = await fetch(`/api/bookings/${bookingId}/passport`, { method: 'POST', body: formData });
        const data = await res.json().catch(() => ({}));

        if (data.success) {
            // Отправка паспорта продлевает срок брони — берём новый из ответа сервера,
            // иначе на экране остался бы отсчёт от момента создания.
            const effectiveExpiresAt = data.expiresAt || expiresAt;
            setPendingPassportBookingId(null);
            setBookingResult({ ok: true, msg: 'Паспорт отправлен! Квартира забронирована.' });
            setUnits(prev => prev.map(u =>
                u.id === bookingUnit!.id ? { ...u, status: 'BOOKED', bookingExpiresAt: effectiveExpiresAt } : u
            ));
            setBookingUnit(prev => prev ? { ...prev, status: 'BOOKED', bookingExpiresAt: effectiveExpiresAt } : prev);
            setShowBookingForm(false);
            setMyBookedUnitIds(prev => new Set(prev).add(bookingUnit!.id));
        } else {
            // Бронь создана, паспорт не ушёл. Квартира уже держится за риелтором —
            // важно сказать это прямо, иначе он решит, что бронирование не состоялось.
            setPendingPassportBookingId(bookingId);
            setBookingResult({
                ok: false,
                msg: `${data.error || 'Не удалось отправить паспорт'}. Квартира уже забронирована за вами — повторите отправку.`,
            });
        }
    };

    const handleRetryPassport = async () => {
        if (!pendingPassportBookingId || !passportFile) return;
        setBookingLoading(true);
        try {
            await sendPassport(pendingPassportBookingId, bookingUnit?.bookingExpiresAt);
        } catch (e) {
            setBookingResult({ ok: false, msg: 'Ошибка сети. Квартира за вами — попробуйте ещё раз.' });
        } finally {
            setBookingLoading(false);
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
                    initData: getAuthData(),
                    unitId: bookingUnit.id,
                    projectId: selectedProject.id,
                }),
            });
            const data1 = await res1.json();
            if (!data1.success || !data1.bookingId) {
                setBookingResult({ ok: false, msg: data1.error || 'Ошибка создания бронирования' });
                // Скорее всего квартиру забрали, пока заполнялась форма — подтянем шахматку,
                // чтобы риелтор увидел актуальные статусы, а не то, что было при открытии.
                loadUnits({ silent: true });
                return;
            }

            // Step 2: паспорт по созданной броне
            await sendPassport(data1.bookingId, data1.expiresAt);
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
                    initData: getAuthData(),
                    unitId: bookingUnit.id,
                }),
            });
            const data = await res.json();
            if (data.success) {
                showToast('Бронирование отменено', 'success');
                setPendingPassportBookingId(null);
                setUnits(prev => prev.map(u =>
                    u.id === bookingUnit.id ? { ...u, status: 'FREE', bookingExpiresAt: undefined } : u
                ));
                setBookingUnit({ ...bookingUnit, status: 'FREE', bookingExpiresAt: undefined });
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

    // Собираем картинку с планировкой, ценой и контактами и отдаём системному
    // «Поделиться» — оттуда она уходит клиенту в мессенджер одним касанием.
    const handleShareCard = async () => {
        if (!bookingUnit || cardLoading) return;
        setCardLoading(true);
        try {
            const rate = bestRate(mortgagePrograms);
            const monthly = rate ? calcMonthlyPayment(bookingUnit.price, rate) : 0;
            const text = buildUnitText(bookingUnit, selectedProject, agent, monthly);
            const blob = await renderUnitCard(bookingUnit, selectedProject, agent, monthly);
            if (!blob) {
                showToast('Не удалось собрать карточку', 'error');
                return;
            }
            const outcome = await shareUnitCard(blob, cardFileName(bookingUnit, selectedProject), text);
            if (outcome === 'downloaded') showToast('Карточка сохранена в загрузки', 'success');
            if (outcome === 'failed') showToast('Не удалось отправить карточку', 'error');
        } catch (e) {
            showToast('Не удалось собрать карточку', 'error');
        } finally {
            setCardLoading(false);
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

    const getRoomLabel = roomLabel;

    const formatTimeLeft = (expiresAt?: string) => {
        if (!expiresAt) return null;
        const diff = new Date(expiresAt).getTime() - now;
        if (!Number.isFinite(diff)) return null;
        if (diff <= 0) return 'истекло';
        const hours = Math.floor(diff / 3600000);
        const minutes = Math.max(0, Math.floor((diff % 3600000) / 60000));
        const days = Math.floor(hours / 24);
        const remHours = hours % 24;
        if (days > 0) return `${days} д ${remHours} ч`;
        if (hours > 0) return `${hours} ч ${minutes} мин`;
        return `${minutes} мин`;
    };

    // Квартиры выбранной секции — единая основа и для сетки, и для списка.
    const sectionUnits = useMemo(
        () => (sections.length > 0 && activeSection ? units.filter(u => u.section === activeSection) : units),
        [units, sections, activeSection]
    );

    // Раскладка считается по ВСЕМ квартирам секции, а не по отфильтрованным:
    // именно это не даёт дому «поехать», когда риелтор сужает подбор.
    const layout = useMemo(
        () => buildGridLayout(sectionUnits, selectedProject?.floors || 0),
        [sectionUnits, selectedProject]
    );

    const filterActive = isFilterActive(filter);

    // null — фильтр выключен, подсветка не нужна вовсе.
    const matchedIds = useMemo(() => {
        if (!filterActive) return null;
        const set = new Set<string>();
        for (const unit of sectionUnits) if (matchesFilter(unit, filter)) set.add(unit.id);
        return set;
    }, [sectionUnits, filter, filterActive]);

    const roomOptions = useMemo(() => availableRoomOptions(sectionUnits), [sectionUnits]);

    // В списке — только подходящее, дешёвое сверху: так собирается подборка клиенту.
    // Квартиры без цены уходят в конец, чтобы не возглавлять список нулями.
    const listUnits = useMemo(() => {
        const base = matchedIds ? sectionUnits.filter(u => matchedIds.has(u.id)) : sectionUnits;
        return [...base].sort((a, b) => {
            if (a.price > 0 && b.price > 0) return a.price - b.price;
            return b.price - a.price;
        });
    }, [sectionUnits, matchedIds]);

    return (
        <div className="fixed inset-0 z-50 flex flex-col bg-brand-cream animate-fade-in text-brand-black" style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>

            <div className="px-6 pt-4 pb-4 flex justify-between items-center bg-brand-white border-b border-brand-light">
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

                                <ChessboardFilters
                                    filter={filter}
                                    onChange={setFilter}
                                    roomOptions={roomOptions}
                                    matched={matchedIds ? matchedIds.size : sectionUnits.length}
                                    total={sectionUnits.length}
                                    view={view}
                                    onViewChange={setView}
                                />

                                {view === 'grid' ? (
                                    <>
                                        <div className="flex items-center gap-4 mb-4 justify-center text-xs font-medium text-brand-grey py-1">
                                            <div className="flex items-center gap-1.5"><div className="w-3 h-3 bg-white border border-brand-light rounded-sm"></div> Свободно</div>
                                            <div className="flex items-center gap-1.5"><div className="w-3 h-3 bg-brand-cream border border-brand-gold rounded-sm"></div> Бронь</div>
                                            <div className="flex items-center gap-1.5"><div className="w-3 h-3 bg-brand-light rounded-sm opacity-50"></div> Продано</div>
                                        </div>

                                        <div className="overflow-x-auto pb-4">
                                            <div className="space-y-1.5 min-w-max px-2">
                                                {layout.rows.map(row => (
                                                    <div key={row.floor} className="flex gap-2 items-center">
                                                        <div className="w-7 text-xs font-bold text-brand-grey text-center sticky left-0 bg-brand-cream z-10">
                                                            {row.floor}
                                                        </div>

                                                        <div className="flex-1 grid gap-1.5" style={{ gridTemplateColumns: `repeat(${layout.cols}, minmax(52px, 1fr))` }}>
                                                            {row.cells.map((unit, idx) => {
                                                                if (!unit) {
                                                                    return <div key={`empty-${row.floor}-${idx}`} className="h-12 rounded-lg bg-black/[0.03]" />;
                                                                }
                                                                // Фильтр не выбрасывает квартиру из сетки — только гасит.
                                                                const matched = matchedIds !== null && matchedIds.has(unit.id);
                                                                const dimmed = matchedIds !== null && !matched;
                                                                return (
                                                                    <button
                                                                        key={unit.id}
                                                                        onClick={() => { resetBookingForm(); setBookingUnit(unit); }}
                                                                        className={`
                                                                            h-12 rounded-lg flex flex-col items-center justify-center border transition-all
                                                                            ${unit.status === 'FREE' ? 'bg-white border-brand-light active:border-brand-gold' : ''}
                                                                            ${unit.status === 'BOOKED' ? 'bg-brand-cream border-brand-gold/40 text-brand-gold' : ''}
                                                                            ${unit.status === 'SOLD' ? 'bg-brand-light border-transparent text-brand-grey' : ''}
                                                                            ${matched ? 'ring-2 ring-brand-gold shadow-md' : ''}
                                                                            ${dimmed ? 'opacity-20 grayscale' : unit.status === 'SOLD' ? 'opacity-60' : 'shadow-sm'}
                                                                        `}
                                                                    >
                                                                        <span className="text-[11px] font-extrabold leading-none">{unit.number}</span>
                                                                        <span className="text-[9px] leading-none mt-1 font-bold opacity-70">
                                                                            {roomShort(unit.rooms)}{unit.area > 0 ? ` · ${Math.round(unit.area)}` : ''}
                                                                        </span>
                                                                    </button>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </>
                                ) : (
                                    <div className="space-y-2 pb-4">
                                        {listUnits.length === 0 ? (
                                            <div className="py-16 flex flex-col items-center justify-center text-brand-grey gap-2">
                                                <SearchX size={30} className="opacity-40" />
                                                <span className="text-sm font-bold text-brand-black">Ничего не подошло</span>
                                                <span className="text-xs">Ослабьте условия подбора</span>
                                            </div>
                                        ) : listUnits.map(unit => (
                                            <button
                                                key={unit.id}
                                                onClick={() => { resetBookingForm(); setBookingUnit(unit); }}
                                                className="w-full bg-brand-white border border-brand-light rounded-2xl p-3.5 flex items-center gap-3.5 text-left shadow-sm transition-all active:scale-[0.99] active:border-brand-gold"
                                            >
                                                <div className={`w-12 h-12 rounded-xl flex flex-col items-center justify-center shrink-0 ${
                                                    unit.status === 'FREE' ? 'bg-brand-cream text-brand-black'
                                                        : unit.status === 'BOOKED' ? 'bg-brand-gold/15 text-brand-gold'
                                                        : 'bg-brand-light text-brand-grey'
                                                }`}>
                                                    <span className="text-[15px] font-extrabold leading-none">{unit.number}</span>
                                                </div>

                                                <div className="flex-1 min-w-0">
                                                    <div className="text-sm font-extrabold text-brand-black truncate">
                                                        {roomLabel(unit.rooms)}{unit.area > 0 ? ` · ${unit.area} м²` : ''}
                                                    </div>
                                                    <div className="text-[11px] text-brand-grey mt-0.5 truncate">
                                                        {unit.section ? `${unit.section} · ` : ''}{unit.floor} этаж
                                                    </div>
                                                </div>

                                                <div className="text-right shrink-0">
                                                    <div className="text-sm font-black text-brand-black">{formatPriceShort(unit.price)}</div>
                                                    <div className={`text-[10px] font-bold mt-0.5 ${
                                                        unit.status === 'FREE' ? 'text-green-600'
                                                            : unit.status === 'BOOKED' ? 'text-brand-gold' : 'text-brand-grey'
                                                    }`}>
                                                        {unit.status === 'FREE' ? 'Свободна' : unit.status === 'BOOKED' ? 'Бронь' : 'Продана'}
                                                    </div>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                )}
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

                            {/* Вознаграждение риелтора. Только для него: в карточку,
                                которая уходит клиенту, эта сумма не попадает. */}
                            {bookingUnit.price > 0 && commissionPercent > 0 && (
                                <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-brand-gold/30 bg-brand-gold/10 px-3 py-2.5">
                                    <div className="min-w-0">
                                        <div className="text-[10px] font-bold uppercase tracking-wide text-brand-gold">Ваше вознаграждение</div>
                                        <div className="text-[10px] text-brand-grey mt-0.5">Расчёт по ставке {commissionPercent}%</div>
                                    </div>
                                    <div className="text-lg font-black text-brand-black shrink-0">
                                        {formatCommission(calcCommission(bookingUnit.price, commissionPercent))}
                                    </div>
                                </div>
                            )}

                            {/* Booking agent info (admin only) */}
                            {isAdmin && bookingUnit.status === 'BOOKED' && bookingUnit.bookingAgentName && (
                                <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-xl text-xs space-y-1">
                                    <div className="font-bold text-yellow-700 text-[11px] uppercase tracking-wide mb-1.5">Забронировал</div>
                                    <div className="text-brand-black font-medium">{bookingUnit.bookingAgentName}</div>
                                    {bookingUnit.bookingAgentCompany && (
                                        <div className="text-brand-grey">
                                            {bookingUnit.bookingAgentCompanyType === 'ip' ? 'ИП' : 'Агентство'}: {bookingUnit.bookingAgentCompany}
                                        </div>
                                    )}
                                    {bookingUnit.bookingAgentPhone && (
                                        <div className="text-brand-grey">{bookingUnit.bookingAgentPhone}</div>
                                    )}
                                    {bookingUnit.bookingBuyerName && (
                                        <div className="mt-1.5 pt-1.5 border-t border-yellow-200">
                                            <span className="text-yellow-600 font-medium">Покупатель:</span> {bookingUnit.bookingBuyerName}
                                            {bookingUnit.bookingBuyerPhone ? ` · ${bookingUnit.bookingBuyerPhone}` : ''}
                                        </div>
                                    )}
                                </div>
                            )}

                            {bookingUnit.status === 'BOOKED' && bookingUnit.bookingExpiresAt && (isAdmin || myBookedUnitIds.has(bookingUnit.id)) && (
                                <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs flex items-center justify-between gap-3">
                                    <span className="flex items-center gap-1.5 font-bold text-amber-700"><Clock size={14} /> Срок брони</span>
                                    <span className={`font-black ${formatTimeLeft(bookingUnit.bookingExpiresAt) === 'истекло' ? 'text-red-600' : 'text-amber-700'}`}>
                                        {formatTimeLeft(bookingUnit.bookingExpiresAt)}
                                    </span>
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

                            {/* Отправить клиенту */}
                            <button
                                onClick={handleShareCard}
                                disabled={cardLoading}
                                className="w-full py-3 bg-brand-black text-brand-gold rounded-xl font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-60"
                            >
                                {cardLoading
                                    ? <><Loader2 size={16} className="animate-spin" /> Готовим карточку...</>
                                    : <><Send size={16} /> Отправить клиенту</>}
                            </button>

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

                            {/* Повтор отправки паспорта: бронь есть, документы не ушли */}
                            {pendingPassportBookingId && bookingUnit.status === 'BOOKED' && myBookedUnitIds.has(bookingUnit.id) && (
                                <button
                                    onClick={handleRetryPassport}
                                    disabled={bookingLoading || !passportFile}
                                    className="w-full py-3 bg-brand-black text-brand-gold rounded-xl font-bold text-sm flex items-center justify-center gap-2 shadow-lg active:scale-[0.98] transition-transform disabled:opacity-50"
                                >
                                    {bookingLoading ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />}
                                    Повторить отправку паспорта
                                </button>
                            )}

                            {/* Снять бронь: админ — любую, риелтор — свою, пока паспорт не ушёл */}
                            {bookingUnit.status === 'BOOKED' && (isAdmin || (myBookedUnitIds.has(bookingUnit.id) && !!pendingPassportBookingId)) && (
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
