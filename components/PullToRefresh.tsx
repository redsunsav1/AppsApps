import React, { useRef, useState, useCallback } from 'react';
import { RefreshCw } from 'lucide-react';

interface PullToRefreshProps {
  onRefresh: () => Promise<void> | void;
  children: React.ReactNode;
  className?: string;
}

const THRESHOLD = 80; // пиксели — нужно протянуть 80px чтобы сработало
const MAX_PULL = 120;

const PullToRefresh: React.FC<PullToRefreshProps> = ({ onRefresh, children, className }) => {
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef(0);
  const pulling = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (containerRef.current && containerRef.current.scrollTop <= 0 && !refreshing) {
      startY.current = e.touches[0].clientY;
      pulling.current = true;
    }
  }, [refreshing]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!pulling.current || refreshing) return;
    const currentY = e.touches[0].clientY;
    const diff = currentY - startY.current;
    if (diff > 0 && containerRef.current && containerRef.current.scrollTop <= 0) {
      // Замедление — чем дальше тянешь, тем сложнее
      const dampened = Math.min(diff * 0.4, MAX_PULL);
      setPullDistance(dampened);
    } else {
      pulling.current = false;
      setPullDistance(0);
    }
  }, [refreshing]);

  const handleTouchEnd = useCallback(async () => {
    if (!pulling.current) return;
    pulling.current = false;
    if (pullDistance >= THRESHOLD) {
      setRefreshing(true);
      setPullDistance(THRESHOLD);
      try {
        await onRefresh();
      } finally {
        setRefreshing(false);
        setPullDistance(0);
      }
    } else {
      setPullDistance(0);
    }
  }, [pullDistance, onRefresh]);

  const progress = Math.min(pullDistance / THRESHOLD, 1);

  return (
    <div
      ref={containerRef}
      className={className}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Индикатор обновления */}
      <div
        style={{
          height: pullDistance > 0 ? `${pullDistance}px` : 0,
          transition: pulling.current ? 'none' : 'height 0.3s ease',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            opacity: progress,
            transform: `rotate(${progress * 360}deg)`,
            transition: refreshing ? 'none' : 'transform 0.1s',
          }}
        >
          <RefreshCw
            size={22}
            className={`text-brand-gold ${refreshing ? 'animate-spin' : ''}`}
          />
        </div>
      </div>
      {children}
    </div>
  );
};

export default PullToRefresh;
