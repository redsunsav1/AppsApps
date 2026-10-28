import React, { useState } from 'react';
import { Bell, Trophy } from 'lucide-react';
import { getAuthData } from '../utils/auth';

interface PrivacySettingsProps {
  marketing: boolean;
  leaderboard: boolean;
  onChange?: (next: { marketing: boolean; leaderboard: boolean }) => void;
}

// Отдельные согласия партнёра: рекламные сообщения и имя в рейтинге. Оба добровольные
// и снимаются здесь же; сообщения о своей брони и заявке приходят в любом случае.
const PrivacySettings: React.FC<PrivacySettingsProps> = ({ marketing, leaderboard, onChange }) => {
  const [state, setState] = useState({ marketing, leaderboard });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const toggle = async (key: 'marketing' | 'leaderboard') => {
    const next = { ...state, [key]: !state[key] };
    setState(next);
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/privacy/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData: getAuthData(), ...next }),
      });
      if (!res.ok) throw new Error();
      onChange?.(next);
    } catch {
      setState(state);
      setError('Не удалось сохранить. Попробуйте ещё раз.');
    } finally {
      setSaving(false);
    }
  };

  const Row = ({ k, icon, title, hint }: { k: 'marketing' | 'leaderboard'; icon: React.ReactNode; title: string; hint: string }) => (
    <button
      type="button"
      onClick={() => toggle(k)}
      disabled={saving}
      role="switch"
      aria-checked={state[k]}
      className="w-full flex items-start gap-3 py-3 text-left border-b border-brand-light last:border-0 disabled:opacity-60"
    >
      <span className="mt-0.5 text-brand-gold shrink-0">{icon}</span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-bold text-brand-black">{title}</span>
        <span className="block text-[11px] text-brand-grey leading-snug mt-0.5">{hint}</span>
      </span>
      <span className={`mt-1 w-10 h-6 rounded-full p-0.5 transition-colors shrink-0 ${state[k] ? 'bg-brand-black' : 'bg-brand-light'}`}>
        <span className={`block w-5 h-5 rounded-full bg-white shadow transition-transform ${state[k] ? 'translate-x-4' : ''}`} />
      </span>
    </button>
  );

  return (
    <div className="bg-brand-white rounded-2xl border border-brand-beige p-4 shadow-sm">
      <h3 className="text-xs font-bold text-brand-grey uppercase tracking-wide mb-1">Сообщения и рейтинг</h3>
      <Row
        k="marketing"
        icon={<Bell size={18} />}
        title="Новости и приглашения"
        hint={state.marketing
          ? 'Присылаем новости проектов и приглашения на мероприятия.'
          : 'Сейчас выключено: новости проектов и приглашения на туры не приходят. О ваших бронях пишем всегда.'}
      />
      <Row
        k="leaderboard"
        icon={<Trophy size={18} />}
        title="Имя в рейтинге"
        hint={state.leaderboard
          ? 'Другие партнёры видят ваше имя и компанию.'
          : 'В рейтинге вы показаны как «Партнёр #номер».'}
      />
      {error && <p className="text-[11px] text-red-600 mt-2">{error}</p>}
      <p className="text-[10px] text-brand-grey mt-2">
        <a href="/legal/marketing-consent.html" target="_blank" rel="noreferrer" className="underline">Условия рассылки</a>
        {' · '}
        <a href="/legal/privacy-policy.html" target="_blank" rel="noreferrer" className="underline">Политика ПДн</a>
        {' · '}
        <a href="/legal/terms.html" target="_blank" rel="noreferrer" className="underline">Условия клуба</a>
      </p>
    </div>
  );
};

export default PrivacySettings;
