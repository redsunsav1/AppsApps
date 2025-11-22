
import React, { useState } from 'react';
import { LeaderboardEntry } from '../types';
import { Trophy, TrendingUp, Crown, Edit2, Check, X } from 'lucide-react';

interface LeaderboardProps {
  entries: LeaderboardEntry[];
  isAdmin: boolean;
  onUpdateEntry: (id: string, name: string, points: number, deals: number) => void;
}

const Leaderboard: React.FC<LeaderboardProps> = ({ entries, isAdmin, onUpdateEntry }) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: '', points: 0, deals: 0 });

  const startEdit = (entry: LeaderboardEntry) => {
    setEditingId(entry.id);
    setEditForm({ name: entry.name, points: entry.points, deals: entry.deals });
  };

  const saveEdit = (id: string) => {
    onUpdateEntry(id, editForm.name, editForm.points, editForm.deals);
    setEditingId(null);
  };

  return (
    <div className="pb-32 animate-slide-up">
      <div className="px-6 pt-6 mb-8">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-3xl font-extrabold text-slate-800 tracking-tight">Рейтинг</h2>
          <Crown className="text-yellow-500 fill-current animate-float" size={32} />
        </div>
        <p className="text-slate-500 text-sm font-medium">
          {isAdmin ? 'Режим администратора: нажмите, чтобы редактировать' : 'Топ 100 лучших партнеров месяца'}
        </p>
      </div>

      <div className="px-4 space-y-3">
        {entries.map((leader, index) => {
          const isTop3 = index < 3;
          const isEditing = editingId === leader.id;

          return (
            <div 
              key={leader.id} 
              className={`
                relative flex items-center p-4 rounded-3xl transition-all duration-300
                ${isEditing ? 'bg-orange-50 border-2 border-orange-200 z-10 scale-105' : 
                  index === 0 ? 'bg-gradient-to-r from-yellow-50 to-white shadow-[0_8px_20px_-5px_rgba(234,179,8,0.2)] border border-yellow-100' : 
                  'bg-white shadow-sm border border-slate-100'}
              `}
            >
              <div className={`
                w-10 font-black text-xl mr-2 text-center
                ${index === 0 ? 'text-yellow-500 text-3xl' : 
                  index === 1 ? 'text-slate-400' : 
                  index === 2 ? 'text-orange-700' : 'text-slate-300 text-base'}
              `}>
                {index === 0 ? '1' : `#${index + 1}`}
              </div>
              
              <div className="relative mr-4">
                <img 
                  src={leader.avatar} 
                  alt={leader.name} 
                  className={`w-12 h-12 rounded-2xl object-cover shadow-md ${isTop3 ? 'ring-2 ring-white' : ''}`} 
                />
                {index === 0 && <div className="absolute -top-2 -right-2 text-lg">👑</div>}
              </div>
              
              <div className="flex-1">
                {isEditing ? (
                  <div className="space-y-2">
                    <input 
                      value={editForm.name}
                      onChange={e => setEditForm(prev => ({...prev, name: e.target.value}))}
                      className="w-full p-1 bg-white border rounded text-sm font-bold text-slate-800"
                    />
                    <div className="flex gap-2">
                       <input 
                          type="number"
                          value={editForm.deals}
                          onChange={e => setEditForm(prev => ({...prev, deals: parseInt(e.target.value) || 0}))}
                          className="w-16 p-1 bg-white border rounded text-xs"
                          placeholder="Сделки"
                        />
                        <input 
                          type="number"
                          value={editForm.points}
                          onChange={e => setEditForm(prev => ({...prev, points: parseInt(e.target.value) || 0}))}
                          className="w-20 p-1 bg-white border rounded text-xs"
                          placeholder="XP"
                        />
                    </div>
                  </div>
                ) : (
                  <>
                    <h4 className={`font-bold ${isTop3 ? 'text-slate-900' : 'text-slate-600'}`}>
                      {leader.name}
                    </h4>
                    <div className="flex items-center gap-4 mt-1">
                      <span className="text-xs text-slate-500 font-medium flex items-center gap-1">
                        <TrendingUp size={10} /> {leader.deals} сд.
                      </span>
                      <span className="text-xs font-bold text-orange-500 bg-orange-50 px-2 py-0.5 rounded-md">
                        {leader.points} XP
                      </span>
                    </div>
                  </>
                )}
              </div>

              {isAdmin && (
                <div className="ml-2">
                  {isEditing ? (
                    <div className="flex flex-col gap-2">
                       <button onClick={() => saveEdit(leader.id)} className="text-green-500 bg-green-100 p-1 rounded-full"><Check size={16} /></button>
                       <button onClick={() => setEditingId(null)} className="text-red-400 bg-red-100 p-1 rounded-full"><X size={16} /></button>
                    </div>
                  ) : (
                    <button onClick={() => startEdit(leader)} className="text-slate-300 hover:text-slate-500">
                      <Edit2 size={16} />
                    </button>
                  )}
                </div>
              )}

              {!isAdmin && isTop3 && (
                <Trophy size={20} className={`
                  ${index === 0 ? 'text-yellow-400 fill-current' : index === 1 ? 'text-slate-300' : 'text-orange-400'}
                `} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default Leaderboard;
