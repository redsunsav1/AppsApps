import React, { useState, useEffect } from 'react';
import { CalendarEvent } from '../../types';
import { MapPin, Clock, Users, CheckCircle2, Loader2 } from 'lucide-react';
import { getAuthData } from '../../utils/auth';
import { showToast } from '../../utils/toast';

const EventCalendar: React.FC = () => {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchEvents = () => {
    const initData = getAuthData();
    fetch('/api/events/list', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData }),
    })
      .then(res => res.json())
      .then(data => {
        const mapped: CalendarEvent[] = data.map((e: any) => ({
          id: String(e.id),
          title: e.title,
          description: e.description || '',
          date: e.date || '',
          time: e.time || '',
          type: e.type || 'TOUR',
          spotsTotal: e.spots_total || 0,
          spotsTaken: e.spots_taken || 0,
          isRegistered: e.is_registered || false,
        }));
        setEvents(mapped);
      })
      .catch(e => console.error('Events fetch error:', e))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchEvents();
  }, []);

  const handleRegister = async (eventId: string) => {
    try {
      const res = await fetch(`/api/events/${eventId}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData: getAuthData() }),
      });
      const data = await res.json();
      if (data.success) {
        showToast('Вы записаны! Уведомление отправлено в Telegram.', 'success');
        // Update local state
        setEvents(prev => prev.map(e =>
          e.id === eventId
            ? { ...e, isRegistered: true, spotsTaken: e.spotsTaken + 1 }
            : e
        ));
      } else {
        showToast(data.error || 'Ошибка записи', 'error');
      }
    } catch (e) {
      showToast('Ошибка сети', 'error');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-brand-gold" size={32} />
      </div>
    );
  }

  const formatDate = (dateStr: string) => {
    if (!dateStr) return { day: '?', month: '' };
    try {
      const d = new Date(dateStr);
      const months = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];
      return { day: String(d.getDate()), month: months[d.getMonth()] || '' };
    } catch {
      return { day: '?', month: '' };
    }
  };

  return (
    <div className="pb-20 animate-fade-in">
      <header className="px-6 pt-4 pb-6">
        <h2 className="text-2xl font-bold text-brand-black">Календарь</h2>
        <p className="text-brand-grey text-sm mt-1">Брокер-туры и мероприятия</p>
      </header>

      <div className="px-4 space-y-4">
        {events.map(event => {
          const isFull = event.spotsTaken >= event.spotsTotal;
          const { day, month } = formatDate(event.date);

          return (
            <div key={event.id} className="bg-brand-white p-4 rounded-2xl border border-brand-light shadow-sm flex flex-col gap-3">
              <div className="flex justify-between items-start">
                <div className="flex gap-3">
                  <div className="flex flex-col items-center justify-center bg-brand-cream w-12 h-12 rounded-xl border border-brand-beige shrink-0">
                    <span className="text-[10px] text-brand-grey font-bold uppercase">{month}</span>
                    <span className="text-lg font-black text-brand-black">{day}</span>
                  </div>
                  <div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                      event.type === 'TOUR' ? 'bg-blue-100 text-blue-700' :
                      event.type === 'PARTY' ? 'bg-purple-100 text-purple-700' :
                      'bg-orange-100 text-orange-700'
                    }`}>
                      {event.type === 'TOUR' ? 'Экскурсия' : event.type === 'PARTY' ? 'Вечеринка' : 'Тренинг'}
                    </span>
                    <h3 className="font-bold text-brand-black mt-1 leading-tight">{event.title}</h3>
                    {event.description && (
                      <p className="text-xs text-brand-grey mt-1 line-clamp-2">{event.description}</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-4 text-xs text-brand-grey font-medium">
                <div className="flex items-center gap-1">
                  <Clock size={14} /> {event.time || '—'}
                </div>
                <div className="flex items-center gap-1">
                  <MapPin size={14} /> Офис продаж
                </div>
                <div className="flex items-center gap-1">
                  <Users size={14} /> {event.spotsTaken}/{event.spotsTotal}
                </div>
              </div>

              <button
                onClick={() => handleRegister(event.id)}
                disabled={event.isRegistered || (isFull && !event.isRegistered)}
                className={`
                  w-full py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all
                  ${event.isRegistered
                    ? 'bg-green-100 text-green-700 cursor-default'
                    : isFull
                      ? 'bg-brand-light text-brand-grey cursor-not-allowed'
                      : 'bg-brand-black text-brand-gold hover:bg-brand-black/80 active:scale-[0.98]'}
                `}
              >
                {event.isRegistered ? (
                  <><CheckCircle2 size={14} /> Вы записаны</>
                ) : isFull ? (
                  'Мест нет'
                ) : (
                  'Записаться'
                )}
              </button>
            </div>
          );
        })}
        {events.length === 0 && <div className="text-center py-10 text-brand-grey text-sm">Нет мероприятий</div>}
      </div>
    </div>
  );
};

export default EventCalendar;
