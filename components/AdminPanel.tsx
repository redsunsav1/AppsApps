import { useState } from 'react';
import WebApp from '@twa-dev/sdk';

export const AdminPanel = ({ onNewsAdded }: { onNewsAdded: () => void }) => {
  const [isOpen, setIsOpen] = useState(false);
  
  // Поля формы
  const [title, setTitle] = useState('');
  const [projectName, setProjectName] = useState('');
  const [progress, setProgress] = useState(0);
  const [text, setText] = useState('');
  const [image, setImage] = useState('');
  const [checklistRaw, setChecklistRaw] = useState(''); // Чек-лист текстом
  
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!title || !text) return alert('Заполни заголовок и текст');
    setLoading(true);

    // Превращаем текст чек-листа в массив
    // (Разделяем по нажатию Enter и убираем пустые строки)
    const checklistArray = checklistRaw.split('\n').filter(line => line.trim() !== '');

    try {
      await fetch('/api/news', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          initData: WebApp.initData,
          title,
          text,
          image_url: image,
          project_name: projectName,
          progress: Number(progress),
          checklist: checklistArray
        })
      });
      
      alert('Новость опубликована!');
      // Сброс формы
      setTitle(''); setText(''); setImage(''); setProjectName(''); setProgress(0); setChecklistRaw('');
      setIsOpen(false);
      onNewsAdded(); 
    } catch (e) {
      alert('Ошибка при отправке');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) {
    return (
      <button 
        onClick={() => setIsOpen(true)}
        style={{
          position: 'fixed', bottom: '90px', right: '20px', 
          background: '#e74c3c', color: 'white', border: 'none', 
          borderRadius: '50%', width: '50px', height: '50px', 
          fontSize: '24px', zIndex: 100, cursor: 'pointer',
          boxShadow: '0 4px 10px rgba(0,0,0,0.3)'
        }}
      >
        ⚙️
      </button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/80 z-[200] flex justify-center items-center p-4">
      <div className="bg-white rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-5 flex flex-col gap-3">
        <h3 className="text-xl font-bold text-black mb-2">Конструктор новости</h3>
        
        {/* Заголовок */}
        <input 
          placeholder="Заголовок (Напр: Ход строительства Корпус 5)" 
          value={title} onChange={e => setTitle(e.target.value)} 
          className="p-3 border rounded-lg w-full text-black bg-gray-50" 
        />

        <div className="flex gap-2">
          {/* Название ЖК */}
          <input 
            placeholder="Название проекта (ЖК Бруклин)" 
            value={projectName} onChange={e => setProjectName(e.target.value)} 
            className="p-3 border rounded-lg flex-1 text-black bg-gray-50" 
          />
          {/* Прогресс */}
          <div className="w-1/3 flex items-center border rounded-lg px-2 bg-gray-50">
            <span className="text-xs text-gray-500 mr-1">Готовность:</span>
            <input 
              type="number" min="0" max="100"
              value={progress} onChange={e => setProgress(Number(e.target.value))} 
              className="w-full bg-transparent outline-none text-black font-bold" 
            />
            <span className="text-sm">%</span>
          </div>
        </div>

        {/* Текст */}
        <textarea 
          placeholder="Основной текст новости..." 
          value={text} onChange={e => setText(e.target.value)} 
          className="p-3 border rounded-lg w-full h-24 text-black bg-gray-50" 
        />

        {/* Картинка */}
        <input 
          placeholder="Ссылка на картинку (https://...)" 
          value={image} onChange={e => setImage(e.target.value)} 
          className="p-3 border rounded-lg w-full text-black bg-gray-50" 
        />

        {/* Чек-лист */}
        <div>
          <label className="text-xs font-bold text-gray-500 uppercase">Чек-лист этапов (каждый с новой строки):</label>
          <textarea 
            placeholder="Заливка бетона 20 этаж&#10;Монтаж лифтов&#10;Установка окон" 
            value={checklistRaw} onChange={e => setChecklistRaw(e.target.value)} 
            className="p-3 border rounded-lg w-full h-24 text-black bg-gray-50 mt-1" 
          />
        </div>
        
        <div className="flex gap-2 mt-4 pt-4 border-t">
            <button onClick={handleSubmit} disabled={loading} className="flex-1 bg-[#BA8F50] text-white p-3 rounded-lg font-bold text-lg shadow-md active:scale-95 transition-transform">
              {loading ? 'Публикуем...' : 'Опубликовать'}
            </button>
            <button onClick={() => setIsOpen(false)} className="bg-gray-200 text-black p-3 rounded-lg font-medium active:scale-95">
              Отмена
            </button>
        </div>
      </div>
    </div>
  );
};
