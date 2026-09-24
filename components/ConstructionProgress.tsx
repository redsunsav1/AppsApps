import React, { useEffect, useId, useMemo, useState } from 'react';
import { HardHat } from 'lucide-react';

interface Props {
    progress: number;
    floors: number;
    stage?: string;
    completionDate?: string;
    asOf?: string;
}

// Рисунок условный: этажи в нём — не «сколько этажей залито», а наглядная доля
// готовности. Готовность застройщика включает и сети, и отделку, поэтому
// «построено 16 из 22 этажей» мы нигде не пишем.
const MAX_ROWS = 24;
const MIN_ROWS = 6;

// Геометрия SVG (viewBox 140×170)
const GROUND = 160;
const B_X = 22;
const B_W = 64;
const B_TOP = 40;
const JIB_Y = 22;
const TROLLEY_X = B_X + B_W / 2;

const PLAN_MS = 400;
const FLOOR_MS = 450;

const formatAsOf = (iso?: string) => {
    if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
    const [y, m, d] = iso.split('-');
    return `${d}.${m}.${y}`;
};

const prefersReducedMotion = () =>
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Счётчик 0 → target, синхронный с тем, как растёт дом. */
const useCountUp = (target: number, delay: number, duration: number, run: number) => {
    const [value, setValue] = useState(() => (prefersReducedMotion() ? target : 0));
    useEffect(() => {
        if (prefersReducedMotion()) { setValue(target); return; }
        setValue(0);
        let raf = 0;
        const start = performance.now() + delay;
        const tick = (t: number) => {
            const k = Math.min(1, Math.max(0, (t - start) / duration));
            // easeOutCubic — в конце цифра «дотягивается», как и последний этаж
            setValue(Math.round(target * (1 - Math.pow(1 - k, 3))));
            if (k < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [target, delay, duration, run]);
    return value;
};

const ConstructionProgress: React.FC<Props> = ({ progress, floors, stage, completionDate, asOf }) => {
    const pct = Math.max(0, Math.min(100, Math.round(progress)));
    const done = pct >= 100;
    const [run, setRun] = useState(0);
    const clipId = `cp-cable-${useId().replace(/:/g, '')}`;

    const rows = Math.max(MIN_ROWS, Math.min(MAX_ROWS, floors || MIN_ROWS));
    // Хоть один этаж виден даже при 1–3%: пустой котлован читается как «ничего нет»
    const built = pct === 0 ? 0 : Math.max(1, Math.round((rows * pct) / 100));
    const fh = (GROUND - B_TOP) / rows;

    const stagger = built > 0 ? Math.min(90, 1300 / built) : 0;
    const buildEnd = PLAN_MS + stagger * built + FLOOR_MS;
    const shown = useCountUp(pct, PLAN_MS, Math.max(600, buildEnd - PLAN_MS), run);

    const floorY = (i: number) => GROUND - (i + 1) * fh;
    const topBuiltY = built > 0 ? floorY(built - 1) : GROUND;
    // Плита на крюке висит в паре этажей над стройкой, но не выше стрелы
    const slabY = Math.max(JIB_Y + 14, topBuiltY - fh * 2 - 6);

    const windows = useMemo(() => {
        const cols = 5;
        const ww = 6;
        const gap = (B_W - cols * ww) / (cols + 1);
        return Array.from({ length: cols }, (_, c) => B_X + gap + c * (ww + gap));
    }, []);

    const asOfText = formatAsOf(asOf);

    return (
        <div className="bg-brand-white rounded-3xl p-4 mb-4 shadow-sm flex gap-4 items-stretch">
            <button
                type="button"
                onClick={() => setRun(r => r + 1)}
                className="shrink-0 w-[112px] -my-1 active:scale-95 transition-transform"
                aria-label={`Дом готов на ${pct}%. Нажмите, чтобы повторить анимацию`}
            >
                <svg key={run} viewBox="0 0 140 170" className="cp-anim w-full h-auto" aria-hidden="true">
                    <defs>
                        <clipPath id={clipId}>
                            <rect x="0" y={JIB_Y + 6} width="140" height={GROUND} />
                        </clipPath>
                    </defs>

                    {/* Земля и фундамент */}
                    <line x1="4" x2="136" y1={GROUND + 3} y2={GROUND + 3} stroke="#D6C4A8" strokeWidth="1.5" strokeLinecap="round" />
                    <rect x={B_X - 4} y={GROUND} width={B_W + 8} height="3" rx="1" fill="#939392" />

                    {/* Проект: будущие этажи пунктиром, как на чертеже */}
                    <g className="cp-plan">
                        {Array.from({ length: rows - built }, (_, k) => {
                            const i = built + k;
                            return (
                                <rect key={i} x={B_X + 0.5} y={floorY(i) + 0.5} width={B_W - 1} height={fh - 1}
                                    fill="none" stroke="#D6C4A8" strokeWidth="0.8" strokeDasharray="2 1.6" />
                            );
                        })}
                    </g>

                    {/* Построенные этажи опускаются снизу вверх */}
                    {Array.from({ length: built }, (_, i) => {
                        const y = floorY(i);
                        const isTop = i === built - 1 && !done;
                        return (
                            <g key={i} className="cp-floor" style={{ animationDelay: `${PLAN_MS + i * stagger}ms` }}>
                                <rect x={B_X} y={y} width={B_W} height={fh - 0.6} fill={isTop ? '#5A4B40' : '#433830'} />
                                {fh >= 4 && windows.map((wx, c) => {
                                    const lit = (i * 3 + c * 7) % 5 === 0;
                                    return (
                                        <rect key={c} x={wx} y={y + fh * 0.28} width="6" height={Math.max(1.2, fh * 0.42)}
                                            rx="0.4" fill={lit ? '#BA8F50' : '#E0CCAF'} opacity={lit ? 1 : 0.55} />
                                    );
                                })}
                            </g>
                        );
                    })}

                    {done ? (
                        /* Дом достроен — крана нет, на крыше флаг */
                        <g className="cp-crane" style={{ animationDelay: `${buildEnd}ms` }}>
                            <line x1={TROLLEY_X} x2={TROLLEY_X} y1={B_TOP} y2={B_TOP - 16} stroke="#433830" strokeWidth="1.2" />
                            <path d={`M${TROLLEY_X} ${B_TOP - 16} l12 3.5 l-12 3.5 z`} fill="#BA8F50" className="cp-flag" />
                        </g>
                    ) : (
                        <>
                            {/* Башенный кран */}
                            <g className="cp-crane">
                                {/* Мачта-решётка */}
                                <rect x="100" y={JIB_Y + 4} width="6" height={GROUND - JIB_Y - 4} fill="none" stroke="#BA8F50" strokeWidth="1.3" />
                                <path
                                    d={Array.from({ length: Math.floor((GROUND - JIB_Y - 4) / 6) }, (_, k) =>
                                        `M100 ${JIB_Y + 4 + k * 6} L106 ${JIB_Y + 10 + k * 6}`).join(' ')}
                                    stroke="#BA8F50" strokeWidth="0.9" fill="none"
                                />
                                {/* Оголовок и ванты */}
                                <path d={`M100 ${JIB_Y} L103 8 L106 ${JIB_Y} z`} fill="none" stroke="#BA8F50" strokeWidth="1" />
                                <line x1="103" y1="8" x2="16" y2={JIB_Y} stroke="#BA8F50" strokeWidth="0.5" />
                                <line x1="103" y1="8" x2="128" y2={JIB_Y} stroke="#BA8F50" strokeWidth="0.5" />
                                {/* Стрела и противовесная консоль */}
                                <rect x="14" y={JIB_Y} width="116" height="4" fill="none" stroke="#BA8F50" strokeWidth="1.3" />
                                <path
                                    d={Array.from({ length: 19 }, (_, k) => `M${14 + k * 6} ${JIB_Y + 4} L${17 + k * 6} ${JIB_Y} L${20 + k * 6} ${JIB_Y + 4}`).join(' ')}
                                    stroke="#BA8F50" strokeWidth="0.8" fill="none"
                                />
                                <rect x="118" y={JIB_Y + 4} width="10" height="7" rx="0.8" fill="#433830" />
                                {/* Кабина */}
                                <rect x="96" y={JIB_Y + 4} width="5" height="6" rx="1" fill="#BA8F50" />
                                <rect x="97" y={JIB_Y + 5.5} width="3" height="2.5" fill="#FDFBF7" opacity="0.8" />
                                {/* Каретка */}
                                <rect x={TROLLEY_X - 3} y={JIB_Y + 4} width="6" height="2.5" rx="0.6" fill="#433830" />
                            </g>

                            {/* Трос с плитой: опускается к стройке и покачивается */}
                            <g clipPath={`url(#${clipId})`}>
                                <g
                                    className="cp-hook"
                                    style={{
                                        ['--cp-lift' as string]: `${-(slabY - JIB_Y - 12)}px`,
                                        animationDelay: `${buildEnd}ms, ${buildEnd + 900}ms`,
                                    } as React.CSSProperties}
                                >
                                    <line x1={TROLLEY_X} x2={TROLLEY_X} y1={JIB_Y - 140} y2={slabY - 5} stroke="#433830" strokeWidth="0.7" />
                                    <path d={`M${TROLLEY_X} ${slabY - 5} L${TROLLEY_X - 12} ${slabY} M${TROLLEY_X} ${slabY - 5} L${TROLLEY_X + 12} ${slabY}`}
                                        stroke="#433830" strokeWidth="0.5" />
                                    <rect x={TROLLEY_X - 14} y={slabY} width="28" height="3" rx="0.5" fill="#939392" />
                                </g>
                            </g>

                            {/* Искра сварки на верхнем этаже */}
                            {built > 0 && (
                                <g className="cp-spark" style={{ animationDelay: `${buildEnd}ms` }}>
                                    <circle cx={B_X + B_W - 6} cy={topBuiltY - 0.5} r="1.6" fill="#F5C66B" />
                                    <circle cx={B_X + B_W - 6} cy={topBuiltY - 0.5} r="3.6" fill="#F5C66B" opacity="0.35" />
                                </g>
                            )}
                        </>
                    )}
                </svg>
            </button>

            <div className="flex-1 min-w-0 flex flex-col justify-center">
                <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-brand-grey">
                    <HardHat size={12} className="text-brand-gold" />
                    {done ? 'Дом построен' : 'Ход строительства'}
                </div>
                <div className="flex items-baseline gap-1 mt-1">
                    <span className="text-4xl font-extrabold text-brand-black tabular-nums leading-none">{shown}</span>
                    <span className="text-lg font-extrabold text-brand-gold">%</span>
                    <span className="text-xs text-brand-grey ml-1">готовность</span>
                </div>

                {/* Полоса с «ограждением стройки», которая едет внутри */}
                <div className="mt-2.5 h-2 rounded-full bg-brand-light overflow-hidden">
                    <div
                        className="cp-bar h-full rounded-full"
                        style={{ width: `${shown}%` }}
                    />
                </div>

                <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {stage && (
                        <span className="text-[10px] font-bold bg-brand-gold/10 text-brand-gold px-2 py-1 rounded-lg">{stage}</span>
                    )}
                    {completionDate && (
                        <span className="text-[10px] font-bold bg-brand-cream text-brand-black px-2 py-1 rounded-lg">
                            {done ? 'Сдан' : 'Сдача'}: {completionDate}
                        </span>
                    )}
                </div>
                {asOfText && (
                    <p className="text-[10px] text-brand-grey mt-1.5">По данным застройщика на {asOfText}</p>
                )}
            </div>
        </div>
    );
};

export default ConstructionProgress;
