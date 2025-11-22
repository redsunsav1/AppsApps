import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Play, RotateCcw } from 'lucide-react';

interface TowerGameProps {
  onReward: (amount: number) => void;
}

const TowerGame: React.FC<TowerGameProps> = ({ onReward }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [score, setScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [stack, setStack] = useState<{ width: number, x: number }[]>([]);
  const [tick, setTick] = useState(0); // Used to trigger re-renders
  
  // Game constants
  const INITIAL_WIDTH = 200;
  const BOX_HEIGHT = 30;
  const SPEED_BASE = 3;
  
  const requestRef = useRef<number | null>(null);
  const gameStateRef = useRef({
    currentWidth: INITIAL_WIDTH,
    currentX: 0,
    direction: 1, // 1 or -1
    speed: SPEED_BASE,
    baseX: 100 // Center point reference (visual logic simplified)
  });

  const startGame = () => {
    setStack([{ width: INITIAL_WIDTH, x: 0 }]); // Base block
    gameStateRef.current = {
      currentWidth: INITIAL_WIDTH,
      currentX: -150,
      direction: 1,
      speed: SPEED_BASE,
      baseX: 0
    };
    setScore(0);
    setGameOver(false);
    setIsPlaying(true);
  };

  const gameLoop = useCallback(() => {
    if (!isPlaying || gameOver) return;

    const state = gameStateRef.current;
    
    // Move current block
    state.currentX += state.speed * state.direction;
    
    // Bounds checking to reverse direction
    if (state.currentX > 200 || state.currentX < -200) {
      state.direction *= -1;
    }

    // Force re-render for smooth animation is expensive in React, 
    // but for this simple game we update a ref for logic and only render on drop?
    // To make it smooth, we need to trigger render. 
    // Let's update a 'tick' state for animation frames.
    setTick(prev => prev + 1);

    requestRef.current = requestAnimationFrame(gameLoop);
  }, [isPlaying, gameOver]);

  useEffect(() => {
    if (isPlaying && !gameOver) {
      requestRef.current = requestAnimationFrame(gameLoop);
    }
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [isPlaying, gameOver, gameLoop]);

  const handlePlaceBlock = () => {
    if (!isPlaying || gameOver) return;

    const state = gameStateRef.current;
    const prevBlock = stack[stack.length - 1];
    
    // Calculate overlap
    const diff = state.currentX - prevBlock.x;
    const absDiff = Math.abs(diff);
    
    // New width is previous width minus the error distance
    const newWidth = prevBlock.width - absDiff;

    if (newWidth <= 0) {
      // Game Over
      setGameOver(true);
      setIsPlaying(false);
      const reward = Math.floor(score / 2);
      if (reward > 0) onReward(reward);
    } else {
      // Success
      const newX = prevBlock.x + diff / 2;
      setStack([...stack, { width: newWidth, x: newX }]);
      setScore(s => s + 1);
      
      // Reset for next block
      state.currentWidth = newWidth;
      state.currentX = -200; // Reset position
      state.direction = 1;
      state.speed += 0.2; // Increase difficulty
      
      // Center the visual camera (not implemented, just stacking up)
    }
  };

  return (
    <div className="flex flex-col items-center justify-center h-full bg-slate-800 rounded-lg overflow-hidden relative">
      <div className="absolute top-4 left-4 text-white font-bold text-xl z-10">
        Этажи: {score}
      </div>

      {/* Game Canvas Area */}
      <div 
        className="w-full h-full relative bg-slate-900 cursor-pointer"
        onClick={handlePlaceBlock}
      >
        {/* Static Stack - Render only last 10 for performance/view */}
        <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 w-full flex flex-col-reverse items-center pb-10 transition-all duration-300" style={{ transform: `translate(-50%, ${Math.min(score * BOX_HEIGHT, 300)}px)` }}>
           {/* Render active moving block if playing */}
           {isPlaying && !gameOver && (
            <div 
              className="bg-orange-500 shadow-[0_0_15px_rgba(249,115,22,0.6)]"
              style={{
                width: gameStateRef.current.currentWidth,
                height: BOX_HEIGHT,
                transform: `translateX(${gameStateRef.current.currentX}px)`,
                marginBottom: 100 // Gap from the stack
              }}
            />
          )}
          
          {stack.slice().reverse().map((block, i) => (
            <div 
              key={i}
              className={`transition-all duration-200 border-b border-slate-900/20 ${i === 0 ? 'bg-orange-400' : 'bg-orange-600'}`}
              style={{
                width: block.width,
                height: BOX_HEIGHT,
                transform: `translateX(${block.x}px)`
              }}
            />
          ))}
        </div>
        
        <div className="absolute bottom-2 w-full text-center text-slate-500 text-xs pointer-events-none">
          {isPlaying ? 'Нажмите, чтобы поставить блок' : ''}
        </div>
      </div>

      {/* Overlays */}
      {(!isPlaying || gameOver) && (
        <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center p-6 text-center">
          {gameOver ? (
            <div className="mb-6">
              <h3 className="text-3xl font-bold text-white mb-2">Стройка встала!</h3>
              <p className="text-orange-300">Построено этажей: {score}</p>
              <p className="text-slate-300 text-sm mt-1">Получено кирпичей: +{Math.floor(score / 2)}</p>
            </div>
          ) : (
            <h3 className="text-3xl font-bold text-white mb-6">Небоскреб</h3>
          )}
          
          <button 
            onClick={startGame}
            className="flex items-center gap-2 bg-orange-600 hover:bg-orange-700 text-white px-6 py-3 rounded-full font-bold transition-transform active:scale-95"
          >
            {gameOver ? <RotateCcw size={20} /> : <Play size={20} />}
            {gameOver ? "Перестроить" : "Начать стройку"}
          </button>
        </div>
      )}
    </div>
  );
};

export default TowerGame;