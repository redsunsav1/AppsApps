import React, { useState, useEffect, useRef } from 'react';
import WebApp from '@twa-dev/sdk';
import { CheckCircle2, Circle, Upload, Loader2, X, FileText, ChevronDown, ChevronUp } from 'lucide-react';
import { BookingRecord } from '../types';

const BookingChecklist: React.FC = () => {
  const [bookings, setBookings] = useState<BookingRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [uploadingId, setUploadingId] = useState<number | null>(null);
  const [uploadResult, setUploadResult] = useState<{ id: number; ok: boolean; msg: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeUploadBookingId, setActiveUploadBookingId] = useState<number | null>(null);

  useEffect(() => {
    fetchBookings();
  }, []);

  const fetchBookings = () => {
    fetch('/api/bookings/my', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData: WebApp.initData }),
    })
      .then(res => res.json())
      .then(data => setBookings(data))
      .catch(e => console.error('Bookings error:', e))
      .finally(() => setLoading(false));
  };

  const handleDocUpload = async (bookingId: number, files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploadingId(bookingId);
    setUploadResult(null);

    try {
      const formData = new FormData();
      formData.append('initData', WebApp.initData);
      Array.from(files).forEach(f => formData.append('documents', f));

      const res = await fetch(`/api/bookings/${bookingId}/documents`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();

      if (data.success) {
        setUploadResult({ id: bookingId, ok: true, msg: 'Документы отправлены!' });
        fetchBookings();
      } else {
        setUploadResult({ id: bookingId, ok: false, msg: data.error || 'Ошибка загрузки' });
      }
    } catch (e) {
      setUploadResult({ id: bookingId, ok: false, msg: 'Ошибка сети' });
    } finally {
      setUploadingId(null);
    }
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(price);
  };

  const getStageIndex = (stage: string) => {
    switch (stage) {
      case 'INIT': return 0;
      case 'PASSPORT_SENT': return 1;
      case 'DOCS_SENT': return 2;
      case 'COMPLETE': return 3;
      default: return 0;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 className="animate-spin text-brand-gold" size={24} />
      </div>
    );
  }

  if (bookings.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400">
        <FileText size={32} className="mx-auto mb-2 opacity-50" />
        <p className="text-sm">У вас пока нет бронирований</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {bookings.map(booking => {
        const stageIdx = getStageIndex(booking.stage);
        const isExpanded = expandedId === booking.id;

        const stages = [
          { label: 'Бронирование создано', done: stageIdx >= 0 },
          { label: 'Паспорт покупателя отправлен', done: stageIdx >= 1 },
          { label: 'Документы для ипотеки', done: stageIdx >= 2 },
          { label: 'Ожидание одобрения', done: stageIdx >= 3 },
        ];

        return (
          <div key={booking.id} className="bg-white rounded-2xl border border-brand-light overflow-hidden">
            {/* Header */}
            <div
              onClick={() => setExpandedId(isExpanded ? null : booking.id)}
              className="p-4 flex items-center justify-between cursor-pointer active:bg-gray-50"
            >
              <div>
                <h4 className="font-bold text-brand-black text-sm">
                  Кв. №{booking.unit_number}, этаж {booking.unit_floor - 1}
                </h4>
                <p className="text-xs text-gray-400 mt-0.5">{booking.project_name}</p>
                {booking.buyer_name && (
                  <p className="text-xs text-gray-500 mt-0.5">Покупатель: {booking.buyer_name}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-brand-gold">{formatPrice(booking.unit_price)}</span>
                {isExpanded ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
              </div>
            </div>

            {/* Expanded content */}
            {isExpanded && (
              <div className="px-4 pb-4 border-t border-gray-100 pt-3">
                {/* Checklist */}
                <div className="space-y-3 mb-4">
                  {stages.map((s, idx) => (
                    <div key={idx} className="flex items-start gap-3">
                      {s.done ? (
                        <CheckCircle2 size={18} className="text-green-500 mt-0.5 shrink-0" />
                      ) : (
                        <Circle size={18} className="text-gray-300 mt-0.5 shrink-0" />
                      )}
                      <div className="flex-1">
                        <span className={`text-sm ${s.done ? 'text-brand-black font-medium' : 'text-gray-400'}`}>
                          {s.label}
                        </span>

                        {/* Этап 2: загрузка документов для ипотеки */}
                        {idx === 2 && !s.done && stageIdx >= 1 && (
                          <div className="mt-2">
                            <p className="text-[10px] text-gray-400 mb-2">
                              Загрузите: СНИЛС, справка 2-НДФЛ, копия трудовой, анкета-заявление
                            </p>
                            <input
                              ref={activeUploadBookingId === booking.id ? fileInputRef : undefined}
                              type="file"
                              multiple
                              accept="image/*,.pdf,.doc,.docx"
                              onChange={e => handleDocUpload(booking.id, e.target.files)}
                              className="hidden"
                              id={`doc-upload-${booking.id}`}
                            />
                            <button
                              onClick={() => {
                                setActiveUploadBookingId(booking.id);
                                document.getElementById(`doc-upload-${booking.id}`)?.click();
                              }}
                              disabled={uploadingId === booking.id}
                              className="flex items-center gap-2 px-4 py-2 bg-brand-black text-white rounded-xl text-xs font-bold disabled:opacity-50"
                            >
                              {uploadingId === booking.id ? (
                                <><Loader2 size={14} className="animate-spin" /> Загрузка...</>
                              ) : (
                                <><Upload size={14} /> Загрузить документы</>
                              )}
                            </button>

                            {uploadResult && uploadResult.id === booking.id && (
                              <div className={`mt-2 p-2 rounded-lg text-xs font-medium ${uploadResult.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
                                {uploadResult.msg}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Unit details */}
                <div className="bg-gray-50 rounded-xl p-3 space-y-1 text-xs">
                  <div className="flex justify-between"><span className="text-gray-400">Площадь</span><span className="font-bold text-brand-black">{booking.unit_area} м²</span></div>
                  <div className="flex justify-between"><span className="text-gray-400">Комнат</span><span className="font-bold text-brand-black">{booking.unit_rooms}</span></div>
                  {booking.buyer_phone && (
                    <div className="flex justify-between"><span className="text-gray-400">Тел. покупателя</span><span className="font-bold text-brand-black">{booking.buyer_phone}</span></div>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default BookingChecklist;