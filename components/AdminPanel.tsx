import { useState, useEffect } from 'react';
import WebApp from '@twa-dev/sdk';

// Тип данных для редактирования
interface AdminPanelProps {
  onNewsAdded: () => void;
  onClose: () => void;
  editData?: any; // Если есть, значит мы редактируем
}

export const AdminPanel = ({ onNewsAdded, onClose, editData }: AdminPanelProps) => {
  // Поля формы
  const [title, setTitle] = useState('');
  const [projectName, setProjectName] = useState('');
  const [progress, setProgress] = useState(0);
  const [text, setText] = useState('');
  const [image, setImage] = useState('');
  const [checklistRaw, setChecklistRaw] = useState(''); 
  
  const [loading, setLoading] = useState(false);

  // Если открыли для редактирования - заполняем поля
  useEffect(() => {
    if (editData) {
      setTitle(editData.title);
      setProjectName(editData.project_name || '');
      setProgress(editData.progress || 0);
      setText(editData.text);
      setImage(editData.image_url || '');
      // Превращаем массив обратно в текст для редактирования
      if (Array.isArray(editData.checklist)) {
        setChecklistRaw(editData.checklist.join('\n'));
      }
    }
  }, [editData]);

  const handleSubmit = async () => {
    if (!title || !text) return alert('Заполни заголовок и текст');
    setLoading(true);

    const checklistArray = checklistRaw.split('\n').filter(line => line.trim() !== '');
    const body = {
      initData: WebApp.initData,
      title, text, image_url: image,
      project_name: projectName,
      progress: Number(progress),
      checklist: checklistArray
    };

    try {
      if (editData) {
        // РЕЖИМ РЕДАКТИРОВАНИЯ (PUT)
        await fetch(`/api/news/${editData.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        alert('Новость обновлена!');
      } else {
        // РЕЖИМ СОЗДАНИЯ (POST)
        await fetch('/api/news', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        alert('Новость создана!');
      }
      
      onClose(); // Закрываем окно
      onNewsAdded(); // Обновляем список
    } catch (e) {
      alert('Ошибка');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 z-[200] flex justify-center items-center p-4">
      <div className="bg-white rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-5 flex flex-col gap-3">
        <h3 className="text-xl font-bold text-black mb-2">
          {editData ? 'Редактировать новость' : 'Создать новость'}
        </h3>
        
        <input placeholder="Заголовок" value={title} onChange={e => setTitle(e.target.value)} className="p-3 border rounded-lg w-full text-black bg-gray-50" />

        <div className="flex gap-2">
          <input placeholder="Проект (ЖК...)" value={projectName} onChange={e => setProjectName(e.target.value)} className="p-3 border rounded-lg flex-1 text-black bg-gray-50" />
          <div className="w-1/3 flex items-center border rounded-lg px-2 bg-gray-50">
            <span className="text-xs text-gray-500 mr-1">Готов:</span>
            <input type="number" min="0" max="100" value={progress} onChange={e => setProgress(Number(e.target.value))} className="w-full bg-transparent outline-none text-black font-bold" />
            <span className="text-sm">%</span>
          </div>
        </div>

        <textarea placeholder="Текст..." value={text} onChange={e => setText(e.target.value)} className="p-3 border rounded-lg w-full h-24 text-black bg-gray-50" />
        <input placeholder="Ссылка на картинку" value={image} onChange={e => setImage(e.target.value)} className="p-3 border rounded-lg w-full text-black bg-gray-50" />

        <div>
          <label className="text-xs font-bold text-gray-500 uppercase">Чек-лист (с новой строки):</label>
          <textarea value={checklistRaw} onChange={e => setChecklistRaw(e.target.value)} className="p-3 border rounded-lg w-full h-24 text-black bg-gray-50 mt-1" />
        </div>
        
        <div className="flex gap-2 mt-4 pt-4 border-t">
            <button onClick={handleSubmit} disabled={loading} className="flex-1 bg-[#BA8F50] text-white p-3 rounded-lg font-bold shadow-md">
              {loading ? '...' : (editData ? 'Сохранить' : 'Создать')}
            </button>
            <button onClick={onClose} className="bg-gray-200 text-black p-3 rounded-lg font-medium">
              Отмена
            </button>
        </div>
      </div>
    </div>
  );
};
