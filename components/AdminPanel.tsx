import { useState, useEffect } from 'react';
import WebApp from '@twa-dev/sdk';
import { Newspaper, Building2, Link, ShoppingBag } from 'lucide-react';

interface AdminPanelProps {
  onNewsAdded: () => void;
  onClose: () => void;
  editData?: any;
}

export const AdminPanel = ({ onNewsAdded, onClose, editData }: AdminPanelProps) => {
  const [activeTab, setActiveTab] = useState<'news' | 'import' | 'shop'>('news');

  // News
  const [title, setTitle] = useState('');
  const [projectName, setProjectName] = useState('');
  const [progress, setProgress] = useState(0);
  const [text, setText] = useState('');
  const [image, setImage] = useState('');
  const [checklistRaw, setChecklistRaw] = useState(''); 
  
  // Import
  const [importProjectId, setImportProjectId] = useState('');
  const [importUrl, setImportUrl] = useState('');

  // Shop
  const [shopTitle, setShopTitle] = useState('');
  const [shopPrice, setShopPrice] = useState(0);
  const [shopCurrency, setShopCurrency] = useState('SILVER'); // SILVER / GOLD
  const [shopImage, setShopImage] = useState('');

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (editData) {
      setActiveTab('news');
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

  const handleSubmitNews = async () => {
    if (!title || !text) return alert('Заполни поля');
    setLoading(true);
    const body = {
      initData: WebApp.initData,
      title, text, image_url: image,
      project_name: projectName,
      progress: Number(progress),
      checklist: checklistRaw.split('\n').filter(l => l.trim())
    };
    try {
      const url = editData ? `/api/news/${editData.id}` : '/api/news';
      const method = editData ? 'PUT' : 'POST';
      await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      alert('Готово!'); onClose(); onNewsAdded(); 
    } catch (e) { alert('Ошибка'); } finally { setLoading(false); }
  };

  const handleImportXml = async () => {
    if (!importProjectId || !importUrl) return alert('Заполни поля');
    setLoading(true);
    try {
        const res = await fetch('/api/sync-xml-url', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ initData: WebApp.initData, projectId: importProjectId, url: importUrl })
        });
        const data = await res.json();
        if (data.success) {
            alert(`Успешно! Загружено: ${data.count}`);
            setImportUrl('');
        } else { alert('Ошибка: ' + JSON.stringify(data)); }
    } catch (e) { alert('Ошибка сети'); } finally { setLoading(false); }
  };

  const handleSubmitProduct = async () => {
    if (!shopTitle || !shopPrice) return alert('Заполни название и цену');
    setLoading(true);
    try {
        await fetch('/api/products', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                initData: WebApp.initData,
                title: shopTitle,
                price: Number(shopPrice),
                currency: shopCurrency,
                image_url: shopImage
            })
        });
        alert('Товар добавлен!');
        setShopTitle(''); setShopPrice(0); setShopImage('');
    } catch (e) { alert('Ошибка'); } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/80 z-[200] flex justify-center items-center p-4 animate-fade-in">
      <div className="bg-white rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-5 flex flex-col gap-3">
        
        <div className="flex justify-between items-center mb-2 border-b pb-3">
            <h3 className="text-xl font-bold text-black">Админка</h3>
            <div className="flex bg-gray-100 rounded-lg p-1">
                <button onClick={() => setActiveTab('news')} className={`px-3 py-1.5 rounded-md text-sm font-bold flex items-center gap-2 transition-all ${activeTab === 'news' ? 'bg-white shadow text-black' : 'text-gray-400'}`}><Newspaper size={16}/> Новости</button>
                <button onClick={() => setActiveTab('import')} className={`px-3 py-1.5 rounded-md text-sm font-bold flex items-center gap-2 transition-all ${activeTab === 'import' ? 'bg-white shadow text-black' : 'text-gray-400'}`}><Building2 size={16}/> Импорт</button>
                <button onClick={() => setActiveTab('shop')} className={`px-3 py-1.5 rounded-md text-sm font-bold flex items-center gap-2 transition-all ${activeTab === 'shop' ? 'bg-white shadow text-black' : 'text-gray-400'}`}><ShoppingBag size={16}/> Товары</button>
            </div>
        </div>
        
        {activeTab === 'news' && (
            <div className="flex flex-col gap-3 animate-fade-in">
                <input placeholder="Заголовок" value={title} onChange={e => setTitle(e.target.value)} className="p-3 border rounded-lg w-full text-black bg-gray-50" />
                <div className="flex gap-2">
                    <input placeholder="Проект (ЖК...)" value={projectName} onChange={e => setProjectName(e.target.value)} className="p-3 border rounded-lg flex-1 text-black bg-gray-50" />
                    <div className="w-1/3 flex items-center border rounded-lg px-2 bg-gray-50">
                        <span className="text-xs text-gray-500 mr-1">Готов:</span>
                        <input type="number" min="0" max="100" value={progress} onChange={e => setProgress(Number(e.target.value))} className="w-full bg-transparent outline-none text-black font-bold" /><span className="text-sm">%</span>
                    </div>
                </div>
                <textarea placeholder="Текст..." value={text} onChange={e => setText(e.target.value)} className="p-3 border rounded-lg w-full h-24 text-black bg-gray-50" />
                <input placeholder="Ссылка на картинку" value={image} onChange={e => setImage(e.target.value)} className="p-3 border rounded-lg w-full text-black bg-gray-50" />
                <div><label className="text-xs font-bold text-gray-500 uppercase">Чек-лист:</label><textarea value={checklistRaw} onChange={e => setChecklistRaw(e.target.value)} className="p-3 border rounded-lg w-full h-24 text-black bg-gray-50 mt-1" /></div>
                <div className="flex gap-2 mt-2 pt-2 border-t">
                    <button onClick={handleSubmitNews} disabled={loading} className="flex-1 bg-[#BA8F50] text-white p-3 rounded-lg font-bold shadow-md">{loading ? '...' : 'Сохранить'}</button>
                    <button onClick={onClose} className="bg-gray-200 text-black p-3 rounded-lg font-medium">Отмена</button>
                </div>
            </div>
        )}

        {activeTab === 'import' && (
            <div className="flex flex-col gap-4 animate-fade-in">
                <input placeholder="ID Проекта (brk)" value={importProjectId} onChange={e => setImportProjectId(e.target.value)} className="p-3 border rounded-lg w-full text-black bg-gray-50 font-mono" />
                <div className="relative">
                    <Link size={16} className="absolute top-4 left-3 text-gray-400" />
                    <input placeholder="https://profitbase.ru/feed/..." value={importUrl} onChange={e => setImportUrl(e.target.value)} className="p-3 pl-10 border rounded-lg w-full text-black bg-gray-50 font-mono text-sm" />
                </div>
                <div className="flex gap-2 mt-4 pt-4 border-t">
                    <button onClick={handleImportXml} disabled={loading} className="flex-1 bg-blue-600 text-white p-3 rounded-lg font-bold shadow-md flex justify-center items-center gap-2">{loading ? '...' : 'Загрузить'}</button>
                    <button onClick={onClose} className="bg-gray-200 text-black p-3 rounded-lg font-medium">Закрыть</button>
                </div>
            </div>
        )}

        {activeTab === 'shop' && (
            <div className="flex flex-col gap-3 animate-fade-in">
                <input placeholder="Название товара (Худи)" value={shopTitle} onChange={e => setShopTitle(e.target.value)} className="p-3 border rounded-lg w-full text-black bg-gray-50" />
                <div className="flex gap-2">
                    <input type="number" placeholder="Цена" value={shopPrice} onChange={e => setShopPrice(Number(e.target.value))} className="p-3 border rounded-lg w-1/2 text-black bg-gray-50" />
                    <select value={shopCurrency} onChange={e => setShopCurrency(e.target.value)} className="p-3 border rounded-lg w-1/2 text-black bg-gray-50">
                        <option value="SILVER">Серебро 🪙</option>
                        <option value="GOLD">Золото 🏆</option>
                    </select>
                </div>
                <input placeholder="Ссылка на фото" value={shopImage} onChange={e => setShopImage(e.target.value)} className="p-3 border rounded-lg w-full text-black bg-gray-50" />
                <div className="flex gap-2 mt-2 pt-2 border-t">
                    <button onClick={handleSubmitProduct} disabled={loading} className="flex-1 bg-green-600 text-white p-3 rounded-lg font-bold shadow-md">{loading ? '...' : 'Добавить товар'}</button>
                    <button onClick={onClose} className="bg-gray-200 text-black p-3 rounded-lg font-medium">Закрыть</button>
                </div>
            </div>
        )}
      </div>
    </div>
  );
};
