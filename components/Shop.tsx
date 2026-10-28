import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Lock, Clock, CheckCircle2, XCircle, Gift, ShieldCheck, Sparkles } from 'lucide-react';
import { getAuthData } from '../utils/auth';
import { confirmDialog, alertDialog } from '../utils/dialog';

interface MarketplaceProps {
  userSilver?: number;
  userGold?: number;
  silver?: number;
  gold?: number;
  isAdmin?: boolean;
}

interface Product {
  id: number;
  title: string;
  price: number;
  currency: 'GOLD' | 'SILVER';
  image_url?: string | null;
  stock: number | null;
  is_teaser?: boolean;
}

interface Order {
  id: number;
  product_id: number;
  product_title?: string;
  price: number;
  currency: 'GOLD' | 'SILVER';
  status: 'PENDING' | 'NEW' | 'APPROVED' | 'REJECTED';
  review_note?: string | null;
  created_at: string;
}

interface GoldSummary {
  total: number;
  available: number;
  held: number;
  onReview: number;
  nextUnlockAt: string | null;
}

const GoldCoin = () => (
  <div className="w-3 h-3 rounded-full bg-brand-gold border border-brand-black flex items-center justify-center text-[6px] font-bold text-black">X</div>
);
const SilverCoin = () => <div className="w-3 h-3 rounded-full bg-slate-300 border border-slate-400" />;

const formatDate = (iso: string) => new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });

const ORDER_STATUS: Record<Order['status'], { label: string; className: string; Icon: typeof Clock }> = {
  PENDING: { label: 'На проверке', className: 'bg-amber-50 text-amber-700 border-amber-200', Icon: Clock },
  NEW: { label: 'На проверке', className: 'bg-amber-50 text-amber-700 border-amber-200', Icon: Clock },
  APPROVED: { label: 'Одобрено', className: 'bg-green-50 text-green-700 border-green-200', Icon: CheckCircle2 },
  REJECTED: { label: 'Отклонено', className: 'bg-red-50 text-red-600 border-red-200', Icon: XCircle },
};

// Покупка — это заявка: монеты списываются сразу, а приз выдаёт отдел продаж после
// проверки сделок. Поэтому в интерфейсе везде «заявка», а не «покупка».
const Marketplace: React.FC<MarketplaceProps> = ({ userSilver, userGold, silver: silverProp, gold: goldProp }) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [gold, setGold] = useState<GoldSummary | null>(null);
  const [silver, setSilver] = useState<number>(userSilver ?? silverProp ?? 0);
  const [holdDays, setHoldDays] = useState(30);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(() => {
    const initData = getAuthData();
    fetch('/api/products', { headers: { 'x-init-data': initData } })
      .then(r => r.json())
      .then(d => setProducts(Array.isArray(d) ? d : []))
      .catch(() => {});
    if (!initData) return;
    fetch('/api/gold/me', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData }),
    })
      .then(r => r.json())
      .then(d => {
        if (d.gold) setGold(d.gold);
        if (typeof d.silver === 'number') setSilver(d.silver);
        if (typeof d.holdDays === 'number') setHoldDays(d.holdDays);
        setOrders(Array.isArray(d.orders) ? d.orders : []);
      })
      .catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load]);

  const availableGold = gold ? Math.max(gold.available, 0) : (userGold ?? goldProp ?? 0);
  const lockedGold = gold ? gold.held + gold.onReview : 0;

  const activeOrderFor = useMemo(() => {
    const map = new Map<number, Order>();
    for (const o of orders) if (o.status !== 'REJECTED' && !map.has(o.product_id)) map.set(o.product_id, o);
    return map;
  }, [orders]);

  const sorted = useMemo(
    () => [...products].sort((a, b) =>
      a.is_teaser !== b.is_teaser ? (a.is_teaser ? -1 : 1)
        : a.currency !== b.currency ? (a.currency === 'GOLD' ? -1 : 1)
        : b.price - a.price),
    [products],
  );

  const handleOrder = async (p: Product) => {
    const unit = p.currency === 'GOLD' ? 'золотых' : 'серебра';
    const ok = await confirmDialog(
      `Оформить заявку на «${p.title}» за ${p.price} ${unit}?\n\nМонеты спишутся сразу. Если заявку отклонят, они вернутся.`,
    );
    if (!ok) return;
    setBusyId(p.id);
    try {
      const res = await fetch('/api/buy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData: getAuthData(), productId: p.id }),
      });
      const data = await res.json();
      if (data.success) alertDialog('Заявка отправлена! Мы проверим её и свяжемся с вами.');
      else alertDialog(data.error || 'Не удалось оформить заявку');
    } catch {
      alertDialog('Ошибка сети');
    } finally {
      setBusyId(null);
      load();
    }
  };

  return (
    <div className="pb-36 animate-fade-in">
      <header className="px-6 pt-8 pb-6 sticky top-0 bg-brand-cream/95 z-20 backdrop-blur-md border-b border-brand-gold/10">
        <div className="flex justify-between items-end">
          <div>
            <h2 className="text-2xl font-bold text-brand-black">Маркет</h2>
            <p className="text-brand-grey text-sm mt-1">Призы за сделки</p>
          </div>
          <div className="flex gap-2">
            <div className="bg-brand-white px-3 py-1.5 rounded-full border border-brand-light flex items-center gap-1.5 shadow-sm">
              <SilverCoin />
              <span className="font-bold text-brand-black text-xs">{silver.toLocaleString()}</span>
            </div>
            <div className="bg-brand-black px-3 py-1.5 rounded-full border border-brand-black flex items-center gap-1.5 shadow-sm">
              <GoldCoin />
              <span className="font-bold text-brand-gold text-xs">{availableGold.toLocaleString()}</span>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-4 mt-4 bg-brand-white rounded-2xl border border-brand-beige p-4 shadow-sm flex gap-3">
        <ShieldCheck size={20} className="text-brand-gold shrink-0 mt-0.5" />
        <div className="text-xs text-brand-grey leading-relaxed">
          Золото начисляется только за сделки, подтверждённые отделом продаж.
          {holdDays > 0 && <> Монета становится доступной через {holdDays} дней после подтверждения.</>}
          {' '}<a href="/legal/prize-rules.html" target="_blank" rel="noreferrer" className="underline font-semibold text-brand-black">Правила акции</a>
          {lockedGold > 0 && (
            <div className="mt-2 font-bold text-brand-black">
              Ещё {lockedGold} {lockedGold === 1 ? 'монета' : 'монет'} на проверке
              {gold?.nextUnlockAt && <> — ближайшая откроется {formatDate(gold.nextUnlockAt)}</>}
            </div>
          )}
        </div>
      </div>

      <div className="px-4 py-4 grid grid-cols-2 gap-3">
        {sorted.length === 0 && (
          <div className="col-span-2 text-center py-10 text-brand-grey text-sm">Призов пока нет</div>
        )}
        {sorted.map((p) => {
          if (p.is_teaser) return (
            <div key={p.id} className="col-span-2 relative h-40 rounded-2xl overflow-hidden shadow-sm border border-[#C5B191]">
              {p.image_url && <img src={p.image_url} alt="" className="absolute inset-0 w-full h-full object-cover scale-110 blur-md" />}
              <div className="absolute inset-0 bg-gradient-to-t from-brand-black/80 via-brand-black/30 to-transparent" />
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4">
                <div className="w-11 h-11 rounded-full bg-brand-black/60 border border-brand-gold/50 flex items-center justify-center mb-2">
                  <Lock size={18} className="text-brand-gold" />
                </div>
                <div className="flex items-center gap-1.5 text-brand-gold font-bold text-lg">
                  <Sparkles size={16} /> {p.title}
                </div>
                <div className="text-white/80 text-xs mt-1">Скоро откроем. Копите золото</div>
              </div>
            </div>
          );
          const isGold = p.currency === 'GOLD';
          const balance = isGold ? availableGold : silver;
          const soldOut = p.stock !== null && p.stock <= 0;
          const myOrder = activeOrderFor.get(p.id);
          const canAfford = balance >= p.price;
          const disabled = soldOut || !canAfford || busyId === p.id || (isGold && !!myOrder);

          let label: React.ReactNode;
          if (isGold && myOrder) label = myOrder.status === 'APPROVED' ? 'Ваш приз' : 'Заявка подана';
          else if (soldOut) label = 'Приз забрали';
          else label = (
            <>
              {!canAfford && <Lock size={12} />}
              {p.price.toLocaleString()} {isGold ? <GoldCoin /> : <SilverCoin />}
            </>
          );

          return (
            <div
              key={p.id}
              className={`p-4 rounded-2xl shadow-sm border flex flex-col relative overflow-hidden ${
                isGold ? 'bg-gradient-to-br from-[#D6C4A8] to-[#C5B191] border-[#C5B191]' : 'bg-brand-white border-brand-light'
              } ${soldOut && !myOrder ? 'opacity-60' : ''}`}
            >
              {p.stock !== null && !soldOut && (
                <span className="absolute top-2 left-2 z-10 text-[10px] font-bold px-2 py-0.5 rounded-full bg-brand-black text-brand-gold">
                  {p.stock === 1 ? 'Остался 1' : `Осталось ${p.stock}`}
                </span>
              )}
              <div className={`h-24 rounded-xl mb-3 flex items-center justify-center overflow-hidden ${isGold ? 'bg-white/20' : 'bg-brand-cream'}`}>
                {p.image_url && /^(https?:\/\/|\/)/.test(p.image_url) ? (
                  <img src={p.image_url} alt={p.title} className="w-full h-full object-cover rounded-xl" />
                ) : (
                  <Gift size={36} className="text-brand-black/40" />
                )}
              </div>
              <h3 className="font-bold text-sm leading-tight mb-1 line-clamp-2 text-brand-black">{p.title}</h3>
              <div className="mt-auto pt-3">
                <button
                  onClick={() => handleOrder(p)}
                  disabled={disabled}
                  className={`w-full py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                    !disabled ? 'bg-brand-black text-brand-gold active:scale-[0.98]' : isGold ? 'bg-black/10 text-black/40' : 'bg-brand-light text-white'
                  }`}
                >
                  {busyId === p.id ? '...' : label}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {orders.length > 0 && (
        <div className="mx-4 bg-brand-white rounded-2xl border border-brand-beige p-4 shadow-sm">
          <h3 className="text-xs font-bold text-brand-grey uppercase tracking-wide mb-3">Мои заявки</h3>
          <div className="space-y-2">
            {orders.map((o) => {
              const st = ORDER_STATUS[o.status] || ORDER_STATUS.PENDING;
              return (
                <div key={o.id} className="flex items-start justify-between gap-3 py-2 border-b border-brand-light last:border-0">
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-brand-black truncate">{o.product_title || 'Приз'}</div>
                    <div className="text-[11px] text-brand-grey">
                      {formatDate(o.created_at)} · {o.price} {o.currency === 'GOLD' ? 'зол.' : 'сер.'}
                    </div>
                    {o.status === 'REJECTED' && o.review_note && (
                      <div className="text-[11px] text-red-600 mt-0.5">Причина: {o.review_note}. Монеты возвращены.</div>
                    )}
                  </div>
                  <span className={`shrink-0 text-[10px] font-bold px-2 py-1 rounded-full border flex items-center gap-1 ${st.className}`}>
                    <st.Icon size={11} /> {st.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default Marketplace;
