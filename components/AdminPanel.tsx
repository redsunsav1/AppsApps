import { useState, useEffect } from 'react';
import WebApp from '@twa-dev/sdk';
import { Newspaper, Building2, Link } from 'lucide-react';

interface AdminPanelProps {
  onNewsAdded: () => void;
  onClose: () => void;
  editData?: any;
}

export const AdminPanel = ({ onNewsAdded, onClose, editData }: AdminPanelProps) => {
  // Вкладки: 'news' (Новости) или 'import' (Квартиры)
  const [activeTab, setActiveTab] = useState<'news' | 'import'>('news');

  // --- Данные для Новостей ---
  const [title, setTitle] = useState('');
  const [projectName, setProjectName] = useState('');
  const [progress, setProgress] = useState(0);
  const [text, setText] = useState('');
  const [image, setImage] = useState('');
  const [checklistRaw, setChecklistRaw] = useState(''); 
  
  // --- Данные для Импорта (XML) ---
  const [importProjectId, setImportProjectId] = useState('');
  const [importUrl, setImportUrl] = useState('');

  const [loading, setLoading] = useState(false);

  // Если мы открыли окно "Редактировать новость", сразу заполняем поля
  useEffect(() => {
    if (editData) {
      setActiveTab('news'); // Принудительно открываем вкладку новостей
      setTitle(editData.title);
      setProjectName(editData.project_name || '');
      setProgress(editData.progress || 0);
      setText(editData.text);
      setImage(editData.image_url || '');
      if (Array.isArray(editData.checklist)) {
        setChecklistRaw(editData.checklist.join('\n'));
      }
    }
  }, [editData]);

  // 1. Сохранить Новость
  const handleSubmitNews = async () => {
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
      const url = editData ? `/api/news/${editData.id}` : '/api/news';
      const method = editData ? 'PUT' : 'POST';
      
      await fetch(url, { 
        method, 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body) 
      });
      
      alert(editData ? 'Новость обновлена!' : 'Новость создана!');
      onClose(); 
      onNewsAdded(); 
    } catch (e) {
      alert('Ошибка при сохранении');
    } finally {
      setLoading(false);
    }
  };

  // 2. Импорт XML по ссылке (НОВОЕ)
  const handleImportXml = async () => {
    if (!importProjectId || !importUrl) return alert('Введите ID проекта (например brk) и Ссылку');
    setLoading(true);

    try {
        const res = await fetch('/api/sync-xml-url', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                initData: WebApp.initData,
                projectId: importProjectId,
                url: importUrl
            })
        });
        
        const data = await res.json();
        if (data.success) {
            alert(`Успешно! Обновлено/Добавлено квартир: ${data.count}`);
            setImportUrl(''); // Очистить поле ссылки
        } else {
            alert('Ошибка сервера: ' + JSON.stringify(data));
        }
    } catch (e) {
        alert('Ошибка сети или неверная ссылка');
        console.error(e);
    } finally {
        setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 z-[200] flex justify-center items-center p-4 animate-fade-in">
      <div className="bg-white rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-5 flex flex-col gap-3">
        
        {/* ЗАГОЛОВОК И ПЕРЕКЛЮЧАТЕЛЬ */}
        <div className="flex justify-between items-center mb-2 border-b pb-3">
            <h3 className="text-xl font-bold text-black">Админка</h3>
            
            <div className="flex bg-gray-100 rounded-lg p-1">
                <button 
                    onClick={() => setActiveTab('news')}
                    className={`px-3 py-1.5 rounded-md text-sm font-bold flex items-center gap-2 transition-all ${activeTab === 'news' ? 'bg-white shadow text-black' : 'text-gray-400'}`}
                >
                    <Newspaper size={16}/> Новости
                </button>
                <button 
                    onClick={() => setActiveTab('import')}
                    className={`px-3 py-1.5 rounded-md text-sm font-bold flex items-center gap-2 transition-all ${activeTab === 'import' ? 'bg-white shadow text-black' : 'text-gray-400'}`}
                >
                    <Building2 size={16}/> Импорт
                </button>
            </div>
        </div>
        
        {/* --- ФОРМА НОВОСТЕЙ --- */}
        {activeTab === 'news' && (
            <div className="flex flex-col gap-3 animate-fade-in">
                <input placeholder="Заголовок новости" value={title} onChange={e => setTitle(e.target.value)} className="p-3 border rounded-lg w-full text-black bg-gray-50" />

                <div className="flex gap-2">
                    <input placeholder="Проект (ЖК...)" value={projectName} onChange={e => setProjectName(e.target.value)} className="p-3 border rounded-lg flex-1 text-black bg-gray-50" />
                    <div className="w-1/3 flex items-center border rounded-lg px-2 bg-gray-50">
                        <span className="text-xs text-gray-500 mr-1">Готов:</span>
                        <input type="number" min="0" max="100" value={progress} onChange={e => setProgress(Number(e.target.value))} className="w-full bg-transparent outline-none text-black font-bold" />
                        <span className="text-sm">%</span>
                    </div>
                </div>

                <textarea placeholder="Текст новости..." value={text} onChange={e => setText(e.target.value)} className="p-3 border rounded-lg w-full h-24 text-black bg-gray-50" />
                <input placeholder="Ссылка на картинку" value={image} onChange={e => setImage(e.target.value)} className="p-3 border rounded-lg w-full text-black bg-gray-50" />

                <div>
                    <label className="text-xs font-bold text-gray-500 uppercase">Чек-лист (каждый пункт с новой строки):</label>
                    <textarea value={checklistRaw} onChange={e => setChecklistRaw(e.target.value)} className="p-3 border rounded-lg w-full h-24 text-black bg-gray-50 mt-1" />
                </div>
                
                <div className="flex gap-2 mt-2 pt-2 border-t">
                    <button onClick={handleSubmitNews} disabled={loading} className="flex-1 bg-[#BA8F50] text-white p-3 rounded-lg font-bold shadow-md active:scale-95 transition-transform">
                        {loading ? 'Сохранение...' : (editData ? 'Сохранить' : 'Опубликовать')}
                    </button>
                    <button onClick={onClose} className="bg-gray-200 text-black p-3 rounded-lg font-medium active:scale-95 transition-transform">
                        Отмена
                    </button>
                </div>
            </div>
        )}

        {/* --- ФОРМА ИМПОРТА (XML) --- */}
        {activeTab === 'import' && (
            <div className="flex flex-col gap-4 animate-fade-in">
                <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 text-xs text-blue-800 leading-relaxed">
                    <p className="font-bold mb-1">🤖 Инструкция:</p>
                    1. Укажите <b>ID Проекта</b> (например: <code>brk</code> для Бруклина).<br/>
                    2. Вставьте прямую ссылку на XML-фид (YRL/Profitbase).<br/>
                    3. Нажмите кнопку, сервер скачает файл и обновит квартиры.
                </div>

                <div>
                    <label className="text-xs font-bold text-gray-500 uppercase block mb-1">ID Проекта (куда грузим)</label>
                    <input 
                        placeholder="brk" 
                        value={importProjectId} 
                        onChange={e => setImportProjectId(e.target.value)} 
                        className="p-3 border rounded-lg w-full text-black bg-gray-50 font-mono" 
                    />
                    <div className="text-[10px] text-gray-400 mt-1">
                        Доступные ID: brk, mnht, bbyk, chr (или создайте новый)
                    </div>
                </div>

                <div>
                    <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Ссылка на XML файл</label>
                    <div className="relative">
                        <Link size={16} className="absolute top-4 left-3 text-gray-400" />
                        <input 
                            placeholder="https://profitbase.ru/feed/..." 
                            value={importUrl} 
                            onChange={e => setImportUrl(e.target.value)} 
                            className="p-3 pl-10 border rounded-lg w-full text-black bg-gray-50 font-mono text-sm" 
                        />
                    </div>
                </div>

                <div className="flex gap-2 mt-4 pt-4 border-t">
                    <button onClick={handleImportXml} disabled={loading} className="flex-1 bg-blue-600 text-white p-3 rounded-lg font-bold shadow-md active:scale-95 transition-transform flex justify-center items-center gap-2">
                        {loading ? 'Загрузка...' : (
                            <>
                                <Building2 size={18} />
                                Загрузить по ссылке
                            </>
                        )}
                    </button>
                    <button onClick={onClose} className="bg-gray-200 text-black p-3 rounded-lg font-medium active:scale-95 transition-transform">
                        Закрыть
                    </button>
                </div>
            </div>
        )}

      </div>
    </div>
  );
};
