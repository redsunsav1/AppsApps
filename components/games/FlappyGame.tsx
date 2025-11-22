import React, { useState, useEffect, useRef } from 'react';
import { Play, RotateCcw } from 'lucide-react';

interface FlappyGameProps {
  onReward: (amount: number) => void;
}

const FlappyGame: React.FC<FlappyGameProps> = ({ onReward }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [score, setScore] = useState(0);
  const [birdY, setBirdY] = useState(200);
  const [obstacles, setObstacles] = useState<{ x: number; topHeight: number }[]>([]);

  const GRAVITY = 0.6;
  const JUMP = -8;
  const SPEED = 3;
  const GAP = 150;
  const OBSTACLE_WIDTH = 60;
  const GAME_HEIGHT = 500;
  const GAME_WIDTH = 400; // Assuming container size

  const velocityRef = useRef(0);
  const requestRef = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const jump = () => {
    if (!isPlaying) return;
    velocityRef.current = JUMP;
  };

  const startGame = () => {
    setIsPlaying(true);
    setGameOver(false);
    setScore(0);
    setBirdY(200);
    setObstacles([{ x: 400, topHeight: 150 }]);
    velocityRef.current = 0;
  };

  const updateGame = () => {
    if (!isPlaying || gameOver) return;

    // Update bird
    velocityRef.current += GRAVITY;
    const newY = birdY + velocityRef.current;
    setBirdY(newY);

    // Check boundaries
    if (newY < 0 || newY > GAME_HEIGHT - 30) {
      endGame();
      return;
    }

    // Update obstacles
    setObstacles(prev => {
      const newObstacles = prev
        .map(obs => ({ ...obs, x: obs.x - SPEED }))
        .filter(obs => obs.x > -OBSTACLE_WIDTH);

      // Add new obstacle
      const lastObs = newObstacles[newObstacles.length - 1];
      if (lastObs && GAME_WIDTH - lastObs.x > 220) {
        newObstacles.push({
          x: GAME_WIDTH,
          topHeight: Math.random() * (GAME_HEIGHT - GAP - 100) + 50
        });
      }

      return newObstacles;
    });

    // Collision detection
    const birdRect = { left: 50, right: 80, top: newY, bottom: newY + 30 }; // approximate
    
    // Check for scoring (passing an obstacle)
    obstacles.forEach(obs => {
       // Collision
       if (
        birdRect.right > obs.x && 
        birdRect.left < obs.x + OBSTACLE_WIDTH &&
        (birdRect.top < obs.topHeight || birdRect.bottom > obs.topHeight + GAP)
       ) {
         endGame();
       }
       
       // Score update trigger (simplified, ideally we track if passed)
       if (obs.x + OBSTACLE_WIDTH === 50) {
         setScore(s => s + 1);
       }
    });

    requestRef.current = requestAnimationFrame(updateGame);
  };

  const endGame = () => {
    setGameOver(true);
    setIsPlaying(false);
    const reward = Math.floor(score); // 1 brick per pipe
    if (reward > 0) onReward(reward);
  };

  useEffect(() => {
    if (isPlaying && !gameOver) {
      requestRef.current = requestAnimationFrame(updateGame);
    }
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [isPlaying, gameOver, birdY]);

  return (
    <div 
      ref={containerRef}
      className="relative w-full h-full bg-sky-200 overflow-hidden rounded-lg select-none"
      onClick={jump}
    >
      {/* Background Elements */}
      <div className="absolute bottom-0 w-full h-20 bg-green-500 border-t-4 border-green-700"></div>
      <div className="absolute bottom-20 left-10 text-8xl text-sky-300 opacity-50">🏗️</div>
      <div className="absolute top-10 right-20 text-8xl text-sky-300 opacity-50">☁️</div>

      {/* Bird (Crane Hook/Helmet) */}
      <div 
        className="absolute left-[50px] w-[30px] h-[30px] flex items-center justify-center text-2xl z-20 transition-transform"
        style={{ top: birdY, transform: `rotate(${Math.min(Math.max(velocityRef.current * 5, -45), 45)}deg)` }}
      >
        🚁
      </div>

      {/* Obstacles */}
      {obstacles.map((obs, i) => (
        <React.Fragment key={`obs-${i}`}>
          {/* Top Pipe */}
          <div 
            className="absolute bg-slate-700 border-4 border-slate-800"
            style={{ left: obs.x, top: 0, width: OBSTACLE_WIDTH, height: obs.topHeight }}
          />
          {/* Bottom Pipe */}
          <div 
            className="absolute bg-slate-700 border-4 border-slate-800"
            style={{ left: obs.x, top: obs.topHeight + GAP, width: OBSTACLE_WIDTH, height: GAME_HEIGHT - (obs.topHeight + GAP) }}
          />
        </React.Fragment>
      ))}

      {/* UI Layer */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 text-4xl font-black text-white drop-shadow-md z-30">
        {score}
      </div>

       {(!isPlaying || gameOver) && (
        <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center p-6 text-center z-40">
           {gameOver ? (
            <div className="mb-6">
              <h3 className="text-3xl font-bold text-white mb-2">Авария!</h3>
              <p className="text-orange-300">Счет: {score}</p>
              <p className="text-slate-300 text-sm mt-1">Кирпичей: +{score}</p>
            </div>
          ) : (
            <h3 className="text-3xl font-bold text-white mb-6">Авиа-Доставка</h3>
          )}
          <button 
            onClick={(e) => { e.stopPropagation(); startGame(); }}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-full font-bold"
          >
             {gameOver ? <RotateCcw size={20} /> : <Play size={20} />}
             {gameOver ? "Лететь снова" : "На взлет!"}
          </button>
        </div>
      )}
    </div>
  );
};

export default FlappyGame;