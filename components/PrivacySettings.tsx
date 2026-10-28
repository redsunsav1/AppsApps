import React, { useState } from 'react';
import { Bell } from 'lucide-react';
import { getAuthData } from '../utils/auth';

interface PrivacySettingsProps {
  marketing: boolean;
  onChange?: (marketing: boolean) => void;
}

// Согласие на рекламные сообщения: добровольное и снимается здесь же.
// Сообщения о своей брони и заявке приходят в любом случае.
const PrivacySettings: React.FC<PrivacySettingsProps> = ({ marketing, onChange }) => {
  const [enabled, setEnabled] = useState(marketing);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const toggle = async () => {
    const next = !enabled;
    setEnabled(next);
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/privacy/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData: getAuthData(), marketing: next }),
      });
      if (!res.ok) throw new Error();
      onChange?.(next);
    } catch {
      setEnabled(!next);
      setError('Не удалось сохранить. Попробуйте ещё раз.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-brand-white rounded-2xl border border-brand-beige p-4 shadow-sm">
      <h3 className="text-xs font-bold text-brand-grey uppercase tracking-wide mb-1">Сообщения</h3>
      <button
        type="button"
        onClick={toggle}
        disabled={saving}
        role="switch"
        aria-checked={enabled}
        className="w-full flex items-start gap-3 py-3 text-left disabled:opacity-60"
      >
        <span className="mt-0.5 text-brand-gold shrink-0"><Bell size={18} /></span>
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-bold text-brand-black">Новости и приглашения</span>
          <span className="block text-[11px] text-brand-grey leading-snug mt-0.5">
            {enabled
              ? 'Присылаем новости проектов и приглашения на мероприятия.'
              : 'Сейчас выключено: новости проектов и приглашения на туры не приходят. О ваших бронях пишем всегда.'}
          </span>
        </span>
        <span className={`mt-1 w-10 h-6 rounded-full p-0.5 transition-colors shrink-0 ${enabled ? 'bg-brand-black' : 'bg-brand-light'}`}>
          <span className={`block w-5 h-5 rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-4' : ''}`} />
        </span>
      </button>
      {error && <p className="text-[11px] text-red-600 mt-1">{error}</p>}
      <p className="text-[10px] text-brand-grey mt-1">
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
