import React, { useState } from 'react';
import { SlidersHorizontal, X, LayoutGrid, List, ChevronDown } from 'lucide-react';
import { UnitFilter, EMPTY_FILTER, isFilterActive, roomShort } from '../utils/chessboard';

export type ChessView = 'grid' | 'list';

interface ChessboardFiltersProps {
  filter: UnitFilter;
  onChange: (next: UnitFilter) => void;
  roomOptions: number[];
  matched: number;
  total: number;
  view: ChessView;
  onViewChange: (view: ChessView) => void;
}

/** Ввод числа без спиннеров и без «0» в поле: пусто — значит ограничения нет. */
const NumberField: React.FC<{
  label: string;
  suffix?: string;
  value: number | null;
  onChange: (value: number | null) => void;
  step?: number;
}> = ({ label, suffix, value, onChange, step }) => (
  <label className="flex-1 min-w-0">
    <span className="block text-[10px] font-bold uppercase tracking-wide text-brand-grey mb-1">{label}</span>
    <div className="relative">
      <input
        type="number"
        inputMode="decimal"
        step={step}
        value={value === null ? '' : value}
        onChange={e => {
          const raw = e.target.value.trim();
          if (raw === '') return onChange(null);
          const parsed = Number(raw);
          onChange(Number.isFinite(parsed) && parsed > 0 ? parsed : null);
        }}
        placeholder="—"
        className="w-full bg-brand-cream border border-brand-light rounded-xl px-3 py-2.5 text-sm font-bold
                   text-brand-black placeholder:text-brand-grey/50 focus:outline-none focus:border-brand-gold
                   focus:bg-white transition-colors [appearance:textfield]
                   [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
      />
      {suffix && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-bold text-brand-grey pointer-events-none">
          {suffix}
        </span>
      )}
    </div>
  </label>
);

const ChessboardFilters: React.FC<ChessboardFiltersProps> = ({
  filter, onChange, roomOptions, matched, total, view, onViewChange,
}) => {
  const [open, setOpen] = useState(false);
  const active = isFilterActive(filter);

  const toggleRoom = (rooms: number) => {
    const next = filter.rooms.includes(rooms)
      ? filter.rooms.filter(r => r !== rooms)
      : [...filter.rooms, rooms];
    onChange({ ...filter, rooms: next });
  };

  // Короткая сводка в свёрнутом виде: риелтор видит свой запрос не разворачивая панель.
  const summary: string[] = [];
  if (filter.rooms.length) summary.push([...filter.rooms].sort((a, b) => a - b).map(r => (r >= 4 ? '4к+' : roomShort(r))).join('/'));
  if (filter.maxPrice) summary.push(`до ${(filter.maxPrice / 1_000_000).toFixed(1).replace('.0', '').replace('.', ',')} млн`);
  if (filter.minArea) summary.push(`от ${filter.minArea} м²`);
  if (filter.floorFrom || filter.floorTo) {
    summary.push(`эт. ${filter.floorFrom ?? 1}–${filter.floorTo ?? '∞'}`);
  }
  if (filter.freeOnly) summary.push('свободные');

  return (
    <div className="bg-brand-white border border-brand-light rounded-2xl shadow-sm mb-4 overflow-hidden">
      {/* Шапка: всегда видна */}
      <div className="flex items-stretch">
        <button
          onClick={() => setOpen(v => !v)}
          className="flex-1 min-w-0 flex items-center gap-3 px-4 py-3 text-left active:bg-brand-cream transition-colors"
        >
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
            active ? 'bg-brand-gold text-white' : 'bg-brand-cream text-brand-grey'
          }`}>
            <SlidersHorizontal size={17} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-extrabold text-brand-black leading-tight">Подбор</div>
            <div className="text-[11px] text-brand-grey truncate leading-tight mt-0.5">
              {active ? summary.join(' · ') : 'Комнаты, цена, площадь, этаж'}
            </div>
          </div>
          <ChevronDown size={16} className={`text-brand-grey shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>

        {/* Переключатель вида */}
        <div className="flex items-center gap-1 pr-3 pl-1 border-l border-brand-light">
          {([['grid', LayoutGrid], ['list', List]] as const).map(([key, Icon]) => (
            <button
              key={key}
              onClick={() => onViewChange(key)}
              aria-label={key === 'grid' ? 'Сетка' : 'Список'}
              className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors ${
                view === key ? 'bg-brand-black text-brand-gold' : 'text-brand-grey active:bg-brand-cream'
              }`}
            >
              <Icon size={17} />
            </button>
          ))}
        </div>
      </div>

      {/* Тело фильтра */}
      {open && (
        <div className="px-4 pb-4 pt-1 border-t border-brand-light space-y-4">
          {roomOptions.length > 1 && (
            <div>
              <span className="block text-[10px] font-bold uppercase tracking-wide text-brand-grey mb-2">Комнатность</span>
              <div className="flex flex-wrap gap-2">
                {roomOptions.map(rooms => {
                  const on = filter.rooms.includes(rooms);
                  return (
                    <button
                      key={rooms}
                      onClick={() => toggleRoom(rooms)}
                      className={`h-10 min-w-[52px] px-3 rounded-xl text-sm font-extrabold transition-all active:scale-95 ${
                        on
                          ? 'bg-brand-black text-brand-gold shadow-md'
                          : 'bg-brand-cream text-brand-grey border border-brand-light'
                      }`}
                    >
                      {rooms === 0 ? 'Студия' : rooms >= 4 ? '4к+' : `${rooms}к`}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <NumberField
              label="Цена до"
              suffix="млн"
              step={0.1}
              value={filter.maxPrice === null ? null : filter.maxPrice / 1_000_000}
              onChange={v => onChange({ ...filter, maxPrice: v === null ? null : Math.round(v * 1_000_000) })}
            />
            <NumberField
              label="Площадь от"
              suffix="м²"
              value={filter.minArea}
              onChange={v => onChange({ ...filter, minArea: v })}
            />
          </div>

          <div className="flex gap-3">
            <NumberField
              label="Этаж от"
              value={filter.floorFrom}
              onChange={v => onChange({ ...filter, floorFrom: v })}
            />
            <NumberField
              label="Этаж до"
              value={filter.floorTo}
              onChange={v => onChange({ ...filter, floorTo: v })}
            />
          </div>

          <button
            onClick={() => onChange({ ...filter, freeOnly: !filter.freeOnly })}
            className="flex items-center gap-3 w-full active:opacity-70 transition-opacity"
          >
            <span className={`w-11 h-6 rounded-full shrink-0 transition-colors relative ${
              filter.freeOnly ? 'bg-brand-gold' : 'bg-brand-light'
            }`}>
              <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${
                filter.freeOnly ? 'left-[22px]' : 'left-0.5'
              }`} />
            </span>
            <span className="text-sm font-bold text-brand-black">Только свободные</span>
          </button>
        </div>
      )}

      {/* Итог подбора */}
      {active && (
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-brand-cream border-t border-brand-light">
          <span className="text-xs font-bold text-brand-black">
            {matched > 0 ? (
              <>Подходит <span className="text-brand-gold">{matched}</span> из {total}</>
            ) : (
              <span className="text-brand-grey">Ничего не найдено</span>
            )}
          </span>
          <button
            onClick={() => onChange({ ...EMPTY_FILTER })}
            className="flex items-center gap-1 text-[11px] font-bold text-brand-grey active:text-brand-black transition-colors"
          >
            <X size={13} /> Сбросить
          </button>
        </div>
      )}
    </div>
  );
};

export default ChessboardFilters;
