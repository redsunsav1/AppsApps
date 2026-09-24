import React, { useEffect, useMemo, useState } from 'react';
import qrcode from 'qrcode-generator';
import { Check, Copy, Loader2, QrCode, Send, ShieldCheck, Camera, Lock } from 'lucide-react';
import { getAuthData } from '../utils/auth';
import { showToast } from '../utils/toast';

/**
 * Ссылка для покупателя: он сам даёт согласие и сам загружает паспорт.
 *
 * Два сценария из одной ссылки:
 *  - покупатель рядом — показываем QR, он сканирует своей камерой и проходит
 *    всё на своём телефоне, пока риелтор смотрит, как отмечаются шаги;
 *  - покупатель далеко — риелтор пересылает ту же ссылку в мессенджер.
 *
 * Приложение само ничего покупателю не отправляет: контакты покупателя
 * остаются только у риелтора.
 */

interface Props {
    bookingId: number;
    unitNumber?: string | number;
    projectName?: string;
    onPassportReceived?: (expiresAt?: string) => void;
}

type Mode = 'qr' | 'link';

const POLL_MS = 4000;

const absoluteUrl = (url: string) =>
    /^https?:\/\//.test(url) ? url : `${window.location.origin}${url.startsWith('/') ? '' : '/'}${url}`;

const formatUntil = (iso?: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return '';
    return d.toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
};

const BuyerLinkPanel: React.FC<Props> = ({ bookingId, unitNumber, projectName, onPassportReceived }) => {
    const [url, setUrl] = useState('');
    const [linkExpiresAt, setLinkExpiresAt] = useState<string | undefined>();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [mode, setMode] = useState<Mode>('qr');
    const [consentGiven, setConsentGiven] = useState(false);
    const [passportSent, setPassportSent] = useState(false);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError('');
        fetch(`/api/bookings/${bookingId}/consent-link`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ initData: getAuthData() }),
        })
            .then(async r => {
                const data = await r.json().catch(() => ({}));
                if (cancelled) return;
                if (r.ok && data.url) {
                    setUrl(absoluteUrl(data.url));
                    setLinkExpiresAt(data.expiresAt);
                } else if (data.error === 'Паспорт уже отправлен') {
                    setPassportSent(true);
                    setConsentGiven(true);
                } else {
                    setError(data.error || 'Не удалось получить ссылку');
                }
            })
            .catch(() => { if (!cancelled) setError('Ошибка сети'); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [bookingId]);

    // Пока ссылка на экране — следим, как покупатель проходит шаги.
    // Останавливаемся, как только паспорт пришёл, и при уходе вкладки в фон.
    useEffect(() => {
        if (!url || passportSent) return;
        let timer = 0;
        let stopped = false;
        const tick = async () => {
            if (document.visibilityState === 'visible') {
                try {
                    const r = await fetch(`/api/bookings/${bookingId}/consent-status`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ initData: getAuthData() }),
                    });
                    if (r.ok) {
                        const s = await r.json();
                        if (stopped) return;
                        setConsentGiven(!!s.consentGiven);
                        if (s.passportSent) {
                            setPassportSent(true);
                            onPassportReceived?.(s.expiresAt);
                            return;
                        }
                    }
                } catch { /* сеть моргнула — попробуем на следующем круге */ }
            }
            if (!stopped) timer = window.setTimeout(tick, POLL_MS);
        };
        timer = window.setTimeout(tick, POLL_MS);
        return () => { stopped = true; window.clearTimeout(timer); };
    }, [url, passportSent, bookingId, onPassportReceived]);

    const qrSvg = useMemo(() => {
        if (!url) return '';
        const qr = qrcode(0, 'M');
        qr.addData(url);
        qr.make();
        return qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
    }, [url]);

    const message = useMemo(() => {
        const what = [unitNumber ? `квартиры №${unitNumber}` : 'квартиры', projectName ? `в ${projectName}` : '']
            .filter(Boolean).join(' ');
        return `Здравствуйте! Чтобы закрепить бронь ${what}, подтвердите согласие на обработку данных ` +
            `и загрузите фото паспорта по ссылке — это займёт минуту.`;
    }, [unitNumber, projectName]);

    const copyLink = () => {
        navigator.clipboard?.writeText(`${message}\n${url}`)
            .then(() => showToast('Ссылка скопирована', 'success'))
            .catch(() => showToast('Скопируйте вручную', 'error'));
    };

    const shareLink = async () => {
        const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
        if (nav.share) {
            try { await nav.share({ text: message, url }); return; }
            catch (e: any) { if (e?.name === 'AbortError') return; }
        }
        // Внутри Telegram системного «Поделиться» нет — открываем выбор чата
        const tg = (window as any).Telegram?.WebApp;
        const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(message)}`;
        if (tg?.openTelegramLink) { tg.openTelegramLink(shareUrl); return; }
        copyLink();
    };

    const steps = [
        { icon: Lock, label: 'Квартира закреплена', done: true },
        { icon: ShieldCheck, label: 'Покупатель дал согласие', done: consentGiven || passportSent },
        { icon: Camera, label: 'Паспорт получен', done: passportSent },
    ];
    const activeStep = steps.findIndex(s => !s.done);

    return (
        <div className="mb-4 rounded-2xl border border-brand-gold/40 bg-brand-cream p-4 animate-fade-in">
            <div className="flex items-center gap-2 text-sm font-extrabold text-brand-black">
                <ShieldCheck size={16} className="text-brand-gold" /> Паспорт покупателя
            </div>

            {/* Шаги: риелтор видит, где сейчас покупатель */}
            <ol className="mt-3 space-y-1.5">
                {steps.map((s, i) => {
                    const Icon = s.icon;
                    const active = i === activeStep;
                    return (
                        <li key={s.label} className={`flex items-center gap-2.5 text-xs ${s.done ? 'text-brand-black font-bold' : active ? 'text-brand-black' : 'text-brand-grey'}`}>
                            <span className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                                s.done ? 'bg-green-600 text-white' : active ? 'bg-brand-gold/20 text-brand-gold' : 'bg-brand-light text-brand-grey'
                            }`}>
                                {s.done ? <Check size={13} strokeWidth={3} /> : active ? <Loader2 size={13} className="animate-spin" /> : <Icon size={12} />}
                            </span>
                            {s.label}
                            {active && !loading && <span className="text-[10px] text-brand-grey font-normal">— ждём</span>}
                        </li>
                    );
                })}
            </ol>

            {passportSent ? (
                <div className="mt-3 p-3 rounded-xl bg-green-50 text-green-700 text-xs font-bold text-center">
                    Готово: согласие и паспорт получены, бронь продлена.
                </div>
            ) : loading ? (
                <div className="mt-4 flex items-center justify-center gap-2 text-xs text-brand-grey py-6">
                    <Loader2 size={14} className="animate-spin" /> Готовим ссылку для покупателя...
                </div>
            ) : error ? (
                <div className="mt-3 p-3 rounded-xl bg-red-50 text-red-600 text-xs text-center">{error}</div>
            ) : (
                <>
                    {/* Переключатель сценария */}
                    <div className="mt-4 grid grid-cols-2 gap-1 p-1 bg-brand-light/60 rounded-xl">
                        {([['qr', 'Покупатель рядом', QrCode], ['link', 'Отправить ссылку', Send]] as const).map(([m, label, Icon]) => (
                            <button
                                key={m}
                                onClick={() => setMode(m)}
                                className={`py-2 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all ${
                                    mode === m ? 'bg-brand-white text-brand-black shadow-sm' : 'text-brand-grey'
                                }`}
                            >
                                <Icon size={13} /> {label}
                            </button>
                        ))}
                    </div>

                    {mode === 'qr' ? (
                        <div className="mt-3 flex flex-col items-center">
                            <div
                                className="w-56 h-56 max-w-full bg-white rounded-2xl p-2 shadow-sm [&>svg]:w-full [&>svg]:h-full"
                                aria-label="QR-код ссылки для покупателя"
                                dangerouslySetInnerHTML={{ __html: qrSvg }}
                            />
                            <p className="mt-3 text-[11px] text-brand-grey text-center leading-relaxed max-w-[260px]">
                                Покупатель наводит камеру своего телефона, подтверждает согласие и фотографирует паспорт.
                                Шаги выше отметятся сами.
                            </p>
                        </div>
                    ) : (
                        <div className="mt-3 space-y-2">
                            <p className="text-[11px] text-brand-grey leading-relaxed">
                                Перешлите ссылку покупателю — он откроет её, подтвердит согласие и загрузит фото паспорта сам.
                            </p>
                            <button
                                onClick={shareLink}
                                className="w-full py-3 bg-brand-black text-brand-gold rounded-xl font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
                            >
                                <Send size={15} /> Отправить покупателю
                            </button>
                            <button
                                onClick={copyLink}
                                className="w-full py-2.5 bg-brand-white border border-brand-light text-brand-black rounded-xl font-bold text-xs flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
                            >
                                <Copy size={14} /> Скопировать ссылку
                            </button>
                        </div>
                    )}

                    {linkExpiresAt && (
                        <p className="mt-3 text-[10px] text-brand-grey text-center">
                            Ссылка действует до {formatUntil(linkExpiresAt)}
                        </p>
                    )}
                </>
            )}
        </div>
    );
};

export default BuyerLinkPanel;
