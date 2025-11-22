import React, { useState, useEffect } from 'react';
import { RefreshCw } from 'lucide-react';

interface MahjongProps {
  onReward: (amount: number) => void;
}

interface Card {
  id: number;
  emoji: string;
  isFlipped: boolean;
  isMatched: boolean;
}

const ICONS = ['🏗️', '🧱', '🏠', '💰', '🔨', '👷', '🚜', '🏢'];

const ConstructionMahjong: React.FC<MahjongProps> = ({ onReward }) => {
  const [cards, setCards] = useState<Card[]>([]);
  const [flippedCards, setFlippedCards] = useState<number[]>([]);
  const [moves, setMoves] = useState(0);
  const [gameWon, setGameWon] = useState(false);

  const shuffleCards = () => {
    const doubled = [...ICONS, ...ICONS];
    const shuffled = doubled
      .sort(() => Math.random() - 0.5)
      .map((emoji, index) => ({
        id: index,
        emoji,
        isFlipped: false,
        isMatched: false,
      }));
    setCards(shuffled);
    setFlippedCards([]);
    setMoves(0);
    setGameWon(false);
  };

  useEffect(() => {
    shuffleCards();
  }, []);

  useEffect(() => {
    if (flippedCards.length === 2) {
      const [first, second] = flippedCards;
      if (cards[first].emoji === cards[second].emoji) {
        setCards(prev => prev.map((card, index) => 
          index === first || index === second ? { ...card, isMatched: true } : card
        ));
      } else {
        setTimeout(() => {
          setCards(prev => prev.map((card, index) => 
            index === first || index === second ? { ...card, isFlipped: false } : card
          ));
        }, 1000);
      }
      setFlippedCards([]);
      setMoves(m => m + 1);
    }
  }, [flippedCards, cards]);

  useEffect(() => {
    if (cards.length > 0 && cards.every(c => c.isMatched)) {
      setGameWon(true);
      // Reward calculation: fewer moves = more bricks
      const reward = Math.max(5, 20 - moves);
      onReward(reward);
    }
  }, [cards, moves, onReward]);

  const handleCardClick = (index: number) => {
    if (flippedCards.length === 2 || cards[index].isFlipped || cards[index].isMatched) return;
    
    setCards(prev => prev.map((c, i) => i === index ? { ...c, isFlipped: true } : c));
    setFlippedCards(prev => [...prev, index]);
  };

  return (
    <div className="flex flex-col items-center justify-center h-full bg-slate-100 p-4 rounded-lg">
      <div className="flex justify-between w-full max-w-md mb-4">
        <h3 className="text-xl font-bold text-slate-700">Строй-Пара</h3>
        <div className="text-slate-500">Ходы: {moves}</div>
      </div>

      <div className="grid grid-cols-4 gap-3 w-full max-w-md aspect-square">
        {cards.map((card, index) => (
          <button
            key={card.id}
            onClick={() => handleCardClick(index)}
            className={`
              relative w-full h-full text-4xl rounded-lg shadow-sm transition-all duration-300 transform
              ${card.isFlipped || card.isMatched ? 'bg-white rotate-y-180' : 'bg-orange-500 hover:bg-orange-600'}
            `}
            disabled={card.isMatched}
          >
            <div className="absolute inset-0 flex items-center justify-center">
              {(card.isFlipped || card.isMatched) ? card.emoji : '🏗️'}
            </div>
          </button>
        ))}
      </div>

      {gameWon && (
        <div className="absolute inset-0 bg-white/90 z-10 flex flex-col items-center justify-center rounded-lg">
          <h2 className="text-3xl font-bold text-green-600 mb-2">Объект сдан!</h2>
          <p className="text-slate-600 mb-6">Награда: {Math.max(5, 20 - moves)} кирпичей</p>
          <button 
            onClick={shuffleCards}
            className="flex items-center gap-2 bg-orange-500 text-white px-6 py-3 rounded-full font-bold shadow-lg hover:bg-orange-600"
          >
            <RefreshCw size={20} />
            Новый объект
          </button>
        </div>
      )}
    </div>
  );
};

export default ConstructionMahjong;