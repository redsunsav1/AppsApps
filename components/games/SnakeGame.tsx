
import React, { useState, useEffect, useRef } from 'react';
import { Play, RotateCcw, ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';

interface SnakeGameProps {
  onReward: (amount: number) => void;
}

const GRID_SIZE = 20;
const CELL_SIZE = 15; // Visual scaling handled by CSS grid
const INITIAL_SNAKE = [{ x: 10, y: 10 }];
const INITIAL_DIRECTION = { x: 0, y: -1 };

const SnakeGame: React.FC<SnakeGameProps> = ({ onReward }) => {
  const [snake, setSnake] = useState(INITIAL_SNAKE);
  const [food, setFood] = useState({ x: 5, y: 5 });
  const [direction, setDirection] = useState(INITIAL_DIRECTION);
  const [isPlaying, setIsPlaying] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [score, setScore] = useState(0);
  
  // To prevent rapid double key presses causing self-collision
  const directionRef = useRef(INITIAL_DIRECTION);
  const gameLoopRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const spawnFood = () => {
    return {
      x: Math.floor(Math.random() * GRID_SIZE),
      y: Math.floor(Math.random() * GRID_SIZE)
    };
  };

  const startGame = () => {
    setSnake(INITIAL_SNAKE);
    setDirection(INITIAL_DIRECTION);
    directionRef.current = INITIAL_DIRECTION;
    setFood(spawnFood());
    setScore(0);
    setGameOver(false);
    setIsPlaying(true);
  };

  const endGame = () => {
    setIsPlaying(false);
    setGameOver(true);
    if (gameLoopRef.current) clearInterval(gameLoopRef.current);
    
    // Reward: 1 brick per 2 food eaten
    const reward = Math.floor(score / 2);
    if (reward > 0) onReward(reward);
  };

  useEffect(() => {
    if (isPlaying) {
      gameLoopRef.current = setInterval(moveSnake, 150);
    }
    return () => {
      if (gameLoopRef.current) clearInterval(gameLoopRef.current);
    };
  }, [isPlaying, snake, direction]);

  const moveSnake = () => {
    const head = { ...snake[0] };
    head.x += directionRef.current.x;
    head.y += directionRef.current.y;

    // Check Wall Collision
    if (head.x < 0 || head.x >= GRID_SIZE || head.y < 0 || head.y >= GRID_SIZE) {
      endGame();
      return;
    }

    // Check Self Collision
    if (snake.some(segment => segment.x === head.x && segment.y === head.y)) {
      endGame();
      return;
    }

    const newSnake = [head, ...snake];

    // Check Food Collision
    if (head.x === food.x && head.y === food.y) {
      setScore(s => s + 1);
      setFood(spawnFood());
      // Don't pop the tail, so it grows
    } else {
      newSnake.pop();
    }

    setSnake(newSnake);
  };

  const handleDirection = (x: number, y: number) => {
    // Prevent 180 degree turns
    if (directionRef.current.x + x === 0 && directionRef.current.y + y === 0) return;
    
    // Update ref immediately for logic, state for UI if needed (though we use ref in loop)
    directionRef.current = { x, y };
    setDirection({ x, y });
  };

  return (
    <div className="flex flex-col items-center justify-center h-full bg-slate-800 rounded-lg relative overflow-hidden">
      <div className="absolute top-4 left-4 text-white font-bold text-xl z-10">
        Кирпичи: {score}
      </div>

      <div 
        className="bg-slate-900 border-4 border-slate-700 relative"
        style={{
            width: '300px',
            height: '300px',
            display: 'grid',
            gridTemplateColumns: `repeat(${GRID_SIZE}, 1fr)`,
            gridTemplateRows: `repeat(${GRID_SIZE}, 1fr)`
        }}
      >
        {/* Render Snake */}
        {snake.map((segment, i) => (
            <div 
                key={`${segment.x}-${segment.y}-${i}`}
                className="bg-orange-500 border-[1px] border-orange-700 rounded-sm"
                style={{
                    gridColumnStart: segment.x + 1,
                    gridRowStart: segment.y + 1,
                }}
            />
        ))}

        {/* Render Food */}
        <div 
            className="text-[10px] flex items-center justify-center animate-pulse"
            style={{
                gridColumnStart: food.x + 1,
                gridRowStart: food.y + 1,
            }}
        >
            🧱
        </div>
      </div>

      {/* Controls */}
      <div className="mt-4 grid grid-cols-3 gap-2">
         <div></div>
         <button onClick={() => handleDirection(0, -1)} className="p-3 bg-slate-700 rounded-lg text-white active:bg-orange-600"><ChevronUp /></button>
         <div></div>
         <button onClick={() => handleDirection(-1, 0)} className="p-3 bg-slate-700 rounded-lg text-white active:bg-orange-600"><ChevronLeft /></button>
         <button onClick={() => handleDirection(0, 1)} className="p-3 bg-slate-700 rounded-lg text-white active:bg-orange-600"><ChevronDown /></button>
         <button onClick={() => handleDirection(1, 0)} className="p-3 bg-slate-700 rounded-lg text-white active:bg-orange-600"><ChevronRight /></button>
      </div>

      {(!isPlaying || gameOver) && (
        <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center p-6 text-center z-20">
          {gameOver ? (
            <div className="mb-6">
              <h3 className="text-3xl font-bold text-white mb-2">Тупик!</h3>
              <p className="text-orange-300">Собрано: {score}</p>
              <p className="text-slate-300 text-sm mt-1">Награда: +{Math.floor(score / 2)}</p>
            </div>
          ) : (
            <h3 className="text-3xl font-bold text-white mb-6">Змейка-Строитель</h3>
          )}
          
          <button 
            onClick={startGame}
            className="flex items-center gap-2 bg-orange-600 hover:bg-orange-700 text-white px-6 py-3 rounded-full font-bold transition-transform active:scale-95"
          >
            {gameOver ? <RotateCcw size={20} /> : <Play size={20} />}
            {gameOver ? "Заново" : "Играть"}
          </button>
        </div>
      )}
    </div>
  );
};

export default SnakeGame;
