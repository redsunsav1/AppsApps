
import React, { useState, useEffect } from 'react';
import { Calculator, X, Percent, Banknote, Calendar } from 'lucide-react';
import { MortgageProgram } from '../../types';

interface MortgageCalcProps {
  initialPrice?: number;
  programs?: MortgageProgram[];
  onClose?: () => void;
  embedded?: boolean; // If true, renders inline (no modal overlay)
}

// Default fallbacks if no programs passed
const DEFAULT_PROGRAMS: MortgageProgram[] = [
    { id: 'def1', name: 'Семейная', rate: 6 },
    { id: 'def2', name: 'IT ипотека', rate: 5 },
    { id: 'def3', name: 'Базовая', rate: 21 }
];

const MortgageCalc: React.FC<MortgageCalcProps> = ({ initialPrice = 5000000, programs, onClose, embedded = false }) => {
  const [loadedPrograms, setLoadedPrograms] = useState<MortgageProgram[]>(programs || DEFAULT_PROGRAMS);
  const [price, setPrice] = useState(initialPrice);
  const [initialPaymentPercent, setInitialPaymentPercent] = useState(20);
  const [termYears, setTermYears] = useState(30);
  const [rate, setRate] = useState((programs && programs[0]?.rate) || loadedPrograms[0]?.rate || 21);

  // Fetch from API if no programs were passed as props
  useEffect(() => {
    if (!programs || programs.length === 0) {
      fetch('/api/mortgage-programs')
        .then(res => res.json())
        .then(data => {
          if (Array.isArray(data) && data.length > 0) {
            const mapped: MortgageProgram[] = data.map((p: any) => ({
              id: String(p.id), name: p.name, rate: Number(p.rate), description: p.description || '',
            }));
            setLoadedPrograms(mapped);
            setRate(mapped[0].rate);
          }
        })
        .catch(() => {});
    }
  }, []);

  // Update when programs prop changes
  useEffect(() => {
    if (programs && programs.length > 0) {
      setLoadedPrograms(programs);
      setRate(programs[0].rate);
    }
  }, [programs]);

  const initialPayment = (price * initialPaymentPercent) / 100;
  const loanAmount = price - initialPayment;

  // Monthly Payment Calculation: M = P * (r * (1+r)^n) / ((1+r)^n - 1)
  const calculateMonthlyPayment = () => {
    const monthlyRate = rate / 12 / 100;
    const totalMonths = termYears * 12;

    if (rate === 0) return loanAmount / totalMonths;

    const x = Math.pow(1 + monthlyRate, totalMonths);
    const monthly = (loanAmount * x * monthlyRate) / (x - 1);
    return Math.round(monthly);
  };

  const monthlyPayment = calculateMonthlyPayment();
  const minIncome = Math.round(monthlyPayment * 1.6);

  const content = (
    <>
      {/* Header */}
      <div className={`px-6 ${embedded ? 'pt-4' : 'pt-6'} pb-4 border-b border-brand-light flex justify-between items-center`}>
        <h2 className="text-xl font-extrabold text-brand-black flex items-center gap-2">
          <Calculator className="text-brand-gold" />
          Ипотека
        </h2>
        {!embedded && onClose && (
          <button onClick={onClose} className="w-8 h-8 bg-brand-cream rounded-full flex items-center justify-center text-brand-black">
            <X size={18} />
          </button>
        )}
      </div>

      <div className="p-6 overflow-y-auto custom-scrollbar space-y-6">

        {/* Price Input */}
        <div>
          <label className="text-xs font-bold text-brand-grey uppercase mb-1 block">Стоимость недвижимости</label>
          <div className="relative">
            <input
              type="number"
              value={price}
              onChange={(e) => setPrice(Number(e.target.value))}
              className="w-full bg-brand-cream/50 border border-brand-light rounded-xl py-3 px-4 text-lg font-bold text-brand-black focus:outline-none focus:border-brand-gold"
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-brand-grey text-sm font-medium">₽</span>
          </div>
        </div>

        {/* Initial Payment */}
        <div>
          <label className="text-xs font-bold text-brand-grey uppercase mb-2 block">Первоначальный взнос</label>
          {/* Input fields: percentage + absolute amount */}
          <div className="flex gap-3 mb-3">
            <div className="relative flex-1">
              <input
                type="number"
                min={0} max={90} step={1}
                value={initialPaymentPercent}
                onChange={(e) => {
                  const v = Math.min(90, Math.max(0, Number(e.target.value)));
                  setInitialPaymentPercent(v);
                }}
                className="w-full bg-brand-cream/50 border border-brand-light rounded-xl py-2.5 px-4 pr-10 text-base font-bold text-brand-black focus:outline-none focus:border-brand-gold"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-grey text-sm font-medium">%</span>
            </div>
            <div className="relative flex-[1.5]">
              <input
                type="number"
                min={0}
                step={100000}
                value={initialPayment}
                onChange={(e) => {
                  const amount = Math.max(0, Number(e.target.value));
                  const pct = price > 0 ? Math.min(90, Math.max(0, Math.round((amount / price) * 100))) : 0;
                  setInitialPaymentPercent(pct);
                }}
                className="w-full bg-brand-cream/50 border border-brand-light rounded-xl py-2.5 px-4 pr-8 text-base font-bold text-brand-black focus:outline-none focus:border-brand-gold"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-grey text-sm font-medium">₽</span>
            </div>
          </div>
          {/* Range slider as secondary control */}
          <input
            type="range"
            min="0" max="90" step="1"
            value={initialPaymentPercent}
            onChange={(e) => setInitialPaymentPercent(Number(e.target.value))}
            className="w-full h-2 bg-brand-light rounded-lg appearance-none cursor-pointer accent-brand-gold"
          />
        </div>

        {/* Term & Rate Grid */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-bold text-brand-grey uppercase mb-1 block">Срок (лет)</label>
            <div className="relative">
              <Calendar size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-grey" />
              <input
                type="number"
                value={termYears}
                onChange={(e) => setTermYears(Number(e.target.value))}
                className="w-full bg-brand-cream/50 border border-brand-light rounded-xl py-2 pl-10 pr-2 text-base font-bold text-brand-black focus:outline-none focus:border-brand-gold"
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-bold text-brand-grey uppercase mb-1 block">Ставка %</label>
            <div className="relative">
              <Percent size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-grey" />
              <input
                type="number"
                step="0.1"
                value={rate}
                onChange={(e) => setRate(Number(e.target.value))}
                className="w-full bg-brand-cream/50 border border-brand-light rounded-xl py-2 pl-10 pr-2 text-base font-bold text-brand-black focus:outline-none focus:border-brand-gold"
              />
            </div>
          </div>
        </div>

        {/* Presets - Dynamic */}
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
          {loadedPrograms.map(prog => (
            <button
              key={prog.id}
              onClick={() => setRate(prog.rate)}
              className={`whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${rate === prog.rate ? 'bg-brand-black text-brand-gold shadow-md' : 'bg-brand-light text-brand-black/70'}`}
            >
              {prog.name} {prog.rate}%
            </button>
          ))}
        </div>

        {/* Result Card */}
        <div className="bg-brand-black rounded-2xl p-6 text-brand-cream shadow-lg mt-4">
          <div className="mb-4">
            <span className="text-xs text-white/50 uppercase font-medium">Ежемесячный платеж</span>
            <div className="text-3xl font-black text-brand-gold mt-1">
              {monthlyPayment.toLocaleString()} ₽
            </div>
          </div>
          <div className="pt-4 border-t border-white/10 flex justify-between items-center">
            <div>
              <span className="text-[10px] text-white/50 uppercase block">Необходимый доход</span>
              <span className="font-bold text-sm">{minIncome.toLocaleString()} ₽</span>
            </div>
            <Banknote className="text-brand-gold opacity-50" size={24} />
          </div>
        </div>
      </div>
    </>
  );

  if (embedded) {
    return (
      <div className="pb-20 animate-fade-in">
        <div className="bg-brand-white rounded-2xl overflow-hidden border border-brand-light shadow-sm mx-4">
          {content}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-brand-black/20 backdrop-blur-sm animate-fade-in">
      <div className="bg-brand-white w-full h-[85vh] sm:h-auto sm:max-w-md rounded-t-[2rem] sm:rounded-[2rem] overflow-hidden flex flex-col shadow-2xl animate-slide-up">
        {content}
      </div>
    </div>
  );
};

export default MortgageCalc;
