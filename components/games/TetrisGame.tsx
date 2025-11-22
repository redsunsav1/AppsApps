
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Play, RotateCcw, ArrowDown, ArrowLeft, ArrowRight, RotateCw } from 'lucide-react';

interface TetrisGameProps {
  onReward: (amount: number) => void;
}

// Board Dimensions
const COLS = 10;
const ROWS = 20;

// Tetrominoes
const SHAPES = [
  [[1, 1, 1, 1]], // I
  [[1, 1], [1, 1]], // O
  [[0, 1, 0], [1, 1, 1]], // T
  [[1, 0, 0], [1, 1, 1]], // L
  [[0, 0, 1], [1, 1, 1]], // J
  [[0, 1, 1], [1, 1, 0]], // S
  [[1, 1, 0], [0, 1, 1]], // Z
];

const COLORS = [
  'bg-orange-500', // I
  'bg-yellow-500', // O
  'bg-red-500',    // T
  'bg-blue-500',   // L
  'bg-indigo-500', // J
  'bg-green-500',  // S
  'bg-pink-500',   // Z
];

const createBoard = () => Array.from({ length: ROWS }, () => Array(COLS).fill(0));

const TetrisGame: React.FC<TetrisGameProps> = ({ onReward }) => {
  const [board, setBoard] = useState(createBoard());
  const [isPlaying, setIsPlaying] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [score, setScore] = useState(0);
  
  // Current Piece State
  const [currentPiece, setCurrentPiece] = useState<number[][]>([]);
  const [currentPos, setCurrentPos] = useState({ x: 0, y: 0 });
  const [currentColor, setCurrentColor] = useState('');

  const gameLoopRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const spawnPiece = () => {
    const typeIdx = Math.floor(Math.random() * SHAPES.length);
    const piece = SHAPES[typeIdx];
    const color = COLORS[typeIdx];
    
    // Center logic
    const startX = Math.floor((COLS - piece[0].length) / 2);
    
    setCurrentPiece(piece);
    setCurrentColor(color);
    setCurrentPos({ x: startX, y: 0 });

    if (checkCollision(piece, { x: startX, y: 0 }, board)) {
        endGame();
    }
  };

  const checkCollision = (piece: number[][], pos: {x: number, y: number}, grid: any[][]) => {
    for (let y = 0; y < piece.length; y++) {
      for (let x = 0; x < piece[y].length; x++) {
        if (piece[y][x] !== 0) {
          const boardX = pos.x + x;
          const boardY = pos.y + y;

          if (
            boardX < 0 || 
            boardX >= COLS || 
            boardY >= ROWS ||
            (boardY >= 0 && grid[boardY][boardX] !== 0)
          ) {
            return true;
          }
        }
      }
    }
    return false;
  };

  const mergePiece = () => {
    const newBoard = board.map(row => [...row]);
    
    for (let y = 0; y < currentPiece.length; y++) {
      for (let x = 0; x < currentPiece[y].length; x++) {
        if (currentPiece[y][x] !== 0) {
            if (currentPos.y + y >= 0) {
                newBoard[currentPos.y + y][currentPos.x + x] = currentColor;
            }
        }
      }
    }
    
    // Check Lines
    let linesCleared = 0;
    const cleanBoard = newBoard.filter(row => {
        const isFull = row.every(cell => cell !== 0);
        if (isFull) linesCleared++;
        return !isFull;
    });

    while (cleanBoard.length < ROWS) {
        cleanBoard.unshift(Array(COLS).fill(0));
    }

    setBoard(cleanBoard);
    
    if (linesCleared > 0) {
        const points = linesCleared === 1 ? 1 : linesCleared === 2 ? 3 : linesCleared === 3 ? 5 : 8;
        setScore(s => s + points);
    }

    spawnPiece();
  };

  const move = (dx: number, dy: number) => {
    if (!isPlaying || gameOver) return;
    
    const newPos = { x: currentPos.x + dx, y: currentPos.y + dy };
    
    if (!checkCollision(currentPiece, newPos, board)) {
      setCurrentPos(newPos);
    } else if (dy > 0) {
      // Hit bottom or piece
      mergePiece();
    }
  };

  const rotate = () => {
    if (!isPlaying || gameOver) return;

    const rotated = currentPiece[0].map((_, index) =>
        currentPiece.map(row => row[index]).reverse()
    );

    if (!checkCollision(rotated, currentPos, board)) {
        setCurrentPiece(rotated);
    }
  };

  const startGame = () => {
    setBoard(createBoard());
    setScore(0);
    setGameOver(false);
    setIsPlaying(true);
    spawnPiece();
  };

  const endGame = () => {
    setIsPlaying(false);
    setGameOver(true);
    if (gameLoopRef.current) clearInterval(gameLoopRef.current);
    
    // Reward
    const reward = Math.floor(score * 2);
    if (reward > 0) onReward(reward);
  };

  useEffect(() => {
    if (isPlaying) {
      gameLoopRef.current = setInterval(() => {
          move(0, 1);
      }, 800);
    }
    return () => {
        if (gameLoopRef.current) clearInterval(gameLoopRef.current);
    };
  }, [isPlaying, currentPos, currentPiece, board]);

  return (
    <div className="flex flex-col items-center justify-center h-full bg-slate-800 rounded-lg relative overflow-hidden">
      <div className="absolute top-4 right-4 text-white font-bold text-sm z-10">
        Счет: {score}
      </div>

      <div className="bg-slate-900 border-4 border-slate-700 p-1">
          {board.map((row, y) => (
              <div key={y} className="flex">
                  {row.map((cell, x) => {
                      // Check if current piece is here
                      let isCurrent = false;
                      let cellColor = cell;
                      
                      if (isPlaying && !gameOver) {
                          const pieceY = y - currentPos.y;
                          const pieceX = x - currentPos.x;
                          if (
                              pieceY >= 0 && pieceY < currentPiece.length &&
                              pieceX >= 0 && pieceX < currentPiece[0].length &&
                              currentPiece[pieceY][pieceX] !== 0
                          ) {
                              isCurrent = true;
                              cellColor = currentColor;
                          }
                      }

                      return (
                        <div 
                            key={`${x}-${y}`} 
                            className={`w-6 h-6 border-[1px] border-slate-800 ${cellColor !== 0 ? cellColor : 'bg-slate-900'}`}
                        />
                      );
                  })}
              </div>
          ))}
      </div>

      {/* Controls */}
      <div className="mt-4 flex gap-4">
         <button onClick={() => move(-1, 0)} className="p-4 bg-slate-700 rounded-full text-white active:bg-orange-600"><ArrowLeft size={20} /></button>
         <button onClick={rotate} className="p-4 bg-slate-700 rounded-full text-white active:bg-orange-600"><RotateCw size={20} /></button>
         <button onClick={() => move(0, 1)} className="p-4 bg-slate-700 rounded-full text-white active:bg-orange-600"><ArrowDown size={20} /></button>
         <button onClick={() => move(1, 0)} className="p-4 bg-slate-700 rounded-full text-white active:bg-orange-600"><ArrowRight size={20} /></button>
      </div>

      {(!isPlaying || gameOver) && (
        <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center p-6 text-center z-20">
          {gameOver ? (
            <div className="mb-6">
              <h3 className="text-3xl font-bold text-white mb-2">Стройка завершена</h3>
              <p className="text-orange-300">Линий: {score}</p>
              <p className="text-slate-300 text-sm mt-1">Награда: +{score * 2}</p>
            </div>
          ) : (
            <h3 className="text-3xl font-bold text-white mb-6">Тетрис-Блок</h3>
          )}
          
          <button 
            onClick={startGame}
            className="flex items-center gap-2 bg-orange-600 hover:bg-orange-700 text-white px-6 py-3 rounded-full font-bold transition-transform active:scale-95"
          >
            {gameOver ? <RotateCcw size={20} /> : <Play size={20} />}
            {gameOver ? "Новая смена" : "Начать"}
          </button>
        </div>
      )}
    </div>
  );
};

export default TetrisGame;
