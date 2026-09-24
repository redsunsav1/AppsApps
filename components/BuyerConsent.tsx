import React, { useEffect, useState } from 'react';
import { Building2, Check, Loader2, ShieldCheck, Upload, AlertCircle, Camera, RotateCcw, FileText } from 'lucide-react';

/**
 * Страница покупателя. Открывается по одноразовой ссылке, которую риелтор
 * пересылает сам, и работает без авторизации — покупатель не пользователь
 * приложения. Здесь он читает согласие, подтверждает его и загружает документ.
 *
 * Согласие оформлено отдельным шагом, а не галочкой под формой загрузки:
 * с 1 сентября 2025 его нельзя включать в состав других документов.
 */

interface ConsentData {
  project: string;
  developer: string;
  unitNumber: string;
  unitFloor: number | null;
  unitArea: number | null;
  unitRooms: number | null;
  buyerName: string;
  consentText: string;
  consentVersion: string;
  consentGiven: boolean;
  passportSent: boolean;
}

const Card: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="bg-brand-white border border-brand-light rounded-2xl p-5 shadow-sm">{children}</div>
);

const BuyerConsent: React.FC<{ token: string }> = ({ token }) => {
  const [data, setData] = useState<ConsentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [done, setDone] = useState(false);
  // Файл сначала показываем, а не отправляем: повторная отправка закрыта,
  // и размытое фото ушло бы застройщику безвозвратно.
  const [picked, setPicked] = useState<File | null>(null);
  const [pickedPreview, setPickedPreview] = useState<string | null>(null);

  useEffect(() => () => { if (pickedPreview) URL.revokeObjectURL(pickedPreview); }, [pickedPreview]);

  const pick = (file: File | null) => {
    if (!file) return;
    setError('');
    setPicked(file);
    setPickedPreview(file.type.startsWith('image/') ? URL.createObjectURL(file) : null);
  };

  const load = () => {
    fetch(`/api/consent/${token}`)
      .then(async r => {
        const body = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(body.error || 'Ссылка недействительна');
        return body as ConsentData;
      })
      .then(d => { setData(d); setDone(d.passportSent); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, [token]);

  const handleAccept = async () => {
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch(`/api/consent/${token}/accept`, { method: 'POST' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Не удалось сохранить согласие');
      setData(prev => (prev ? { ...prev, consentGiven: true } : prev));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpload = async (file: File | null) => {
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const form = new FormData();
      form.append('passport', file);
      const res = await fetch(`/api/consent/${token}/passport`, { method: 'POST', body: form });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Не удалось отправить документ');
      setDone(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-brand-cream">
        <Loader2 className="animate-spin text-brand-gold" size={28} />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-brand-cream px-6 text-center">
        <AlertCircle size={32} className="text-brand-grey opacity-50" />
        <h1 className="text-lg font-extrabold text-brand-black">Ссылка недействительна</h1>
        <p className="text-sm text-brand-grey max-w-xs">{error || 'Срок действия истёк. Попросите риелтора прислать новую ссылку.'}</p>
      </div>
    );
  }

  const unitLine = [
    data.unitRooms === 0 ? 'Студия' : data.unitRooms ? `${data.unitRooms}-комн` : null,
    data.unitArea ? `${data.unitArea} м²` : null,
    data.unitFloor ? `${data.unitFloor} этаж` : null,
  ].filter(Boolean).join(' · ');

  return (
    <div className="min-h-screen bg-brand-cream px-4 py-6" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1.5rem)' }}>
      <div className="max-w-md mx-auto space-y-4">
        <header className="text-center mb-2">
          <div className="w-12 h-12 rounded-2xl bg-brand-gold/15 text-brand-gold flex items-center justify-center mx-auto mb-3">
            <ShieldCheck size={24} />
          </div>
          <h1 className="text-xl font-extrabold text-brand-black">Согласие на обработку данных</h1>
          {data.buyerName && <p className="text-sm text-brand-grey mt-1">{data.buyerName}</p>}
        </header>

        {/* Что бронируется */}
        <Card>
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-brand-cream flex items-center justify-center shrink-0 text-brand-gold">
              <Building2 size={20} />
            </div>
            <div className="min-w-0">
              <div className="font-extrabold text-brand-black truncate">
                {data.project || 'Объект'}{data.unitNumber ? `, кв. ${data.unitNumber}` : ''}
              </div>
              {unitLine && <div className="text-xs text-brand-grey mt-0.5">{unitLine}</div>}
              {data.developer && <div className="text-[11px] text-brand-grey mt-1">Застройщик: {data.developer}</div>}
            </div>
          </div>
        </Card>

        {done ? (
          <Card>
            <div className="flex flex-col items-center text-center gap-2 py-4">
              <div className="w-12 h-12 rounded-full bg-green-100 text-green-600 flex items-center justify-center">
                <Check size={26} />
              </div>
              <h2 className="font-extrabold text-brand-black">Документ отправлен</h2>
              <p className="text-sm text-brand-grey">Застройщик получил ваши документы. Эту страницу можно закрыть.</p>
            </div>
          </Card>
        ) : !data.consentGiven ? (
          <>
            <Card>
              {data.consentText ? (
                <div className="text-xs text-brand-black leading-relaxed whitespace-pre-line max-h-72 overflow-y-auto">
                  {data.consentText}
                </div>
              ) : (
                <div className="flex items-start gap-2 text-xs text-amber-900 bg-amber-50 border border-amber-300 rounded-xl p-3">
                  <AlertCircle size={16} className="shrink-0 mt-0.5" />
                  <span>Текст согласия ещё не опубликован. Обратитесь к риелтору — принять согласие сейчас нельзя.</span>
                </div>
              )}
              {data.consentText && (
                <p className="text-[10px] text-brand-grey mt-3">Редакция {data.consentVersion}</p>
              )}
            </Card>

            {data.consentText && (
              <>
                <label className="flex items-start gap-3 cursor-pointer px-1">
                  <input
                    type="checkbox"
                    checked={agreed}
                    onChange={e => setAgreed(e.target.checked)}
                    className="mt-0.5 w-5 h-5 rounded accent-brand-gold shrink-0"
                  />
                  <span className="text-xs text-brand-black leading-relaxed">
                    Я прочитал текст выше и даю согласие на обработку моих персональных данных
                  </span>
                </label>

                <button
                  onClick={handleAccept}
                  disabled={!agreed || submitting}
                  className="w-full py-4 bg-brand-black text-white rounded-xl font-bold active:scale-[0.98] transition-transform disabled:opacity-50 disabled:scale-100"
                >
                  {submitting ? 'Сохраняем...' : 'Подтвердить согласие'}
                </button>
              </>
            )}
          </>
        ) : (
          <>
            <Card>
              <div className="flex items-center gap-2 text-sm font-bold text-green-700 mb-3">
                <Check size={18} /> Согласие получено
              </div>
              <p className="text-xs text-brand-grey leading-relaxed">
                Загрузите фотографию или скан разворота паспорта с фотографией. Документ уйдёт напрямую застройщику
                {data.developer ? ` (${data.developer})` : ''} и не сохраняется в приложении.
              </p>
            </Card>

            {/* Камера и выбор файла — отдельными полями: capture сразу открывает
                основную камеру, а без него остаётся галерея и PDF-скан. */}
            <input
              id="buyer-passport-camera"
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={e => { pick(e.target.files?.[0] || null); e.target.value = ''; }}
            />
            <input
              id="buyer-passport"
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={e => { pick(e.target.files?.[0] || null); e.target.value = ''; }}
            />

            {picked ? (
              <>
                <Card>
                  {pickedPreview ? (
                    <img src={pickedPreview} alt="Фото паспорта" className="w-full max-h-72 object-contain rounded-xl bg-brand-cream" />
                  ) : (
                    <div className="flex items-center gap-2 text-sm text-brand-black">
                      <FileText size={18} className="text-brand-gold" /> {picked.name}
                    </div>
                  )}
                  <p className="text-[11px] text-brand-grey mt-3">Проверьте, что фото чёткое и данные читаются.</p>
                </Card>
                <button
                  onClick={() => handleUpload(picked)}
                  disabled={uploading}
                  className="w-full py-4 bg-brand-black text-white rounded-xl font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-60"
                >
                  {uploading
                    ? <><Loader2 size={18} className="animate-spin" /> Отправляем...</>
                    : <><Upload size={18} /> Отправить застройщику</>}
                </button>
                <button
                  onClick={() => { setPicked(null); setPickedPreview(null); }}
                  disabled={uploading}
                  className="w-full py-3 bg-brand-white border border-brand-light text-brand-black rounded-xl font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  <RotateCcw size={16} /> Переснять
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => document.getElementById('buyer-passport-camera')?.click()}
                  className="w-full py-4 bg-brand-black text-white rounded-xl font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
                >
                  <Camera size={18} /> Сфотографировать паспорт
                </button>
                <button
                  onClick={() => document.getElementById('buyer-passport')?.click()}
                  className="w-full py-3 bg-brand-white border border-brand-light text-brand-black rounded-xl font-bold text-sm flex items-center justify-center gap-2"
                >
                  <Upload size={16} /> Выбрать файл или скан
                </button>
              </>
            )}
          </>
        )}

        {error && (
          <div className="flex items-start gap-2 text-xs text-red-800 bg-red-50 border border-red-200 rounded-xl p-3">
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default BuyerConsent;
