import { useState, useEffect } from 'react';
import WebApp from '@twa-dev/sdk';
import { Newspaper, Building2, Link, ShoppingBag, Zap, Trash2, UserCheck, Users } from 'lucide-react';

interface AdminPanelProps {
  onNewsAdded: () => void;
  onClose: () => void;
  editData?: any;
}

interface QuestItem {
  id: number;
  title: string;
  type: string;
  reward_xp: number;
  reward_amount: number;
  reward_currency: string;
  is_active: boolean;
}

interface ApplicationItem {
  id: number;
  telegram_id: number;
  first_name: string;
  last_name: string;
  company: string;
  company_type: string;
  phone: string;
  approval_status: string;
  created_at: string;
}

export const AdminPanel = ({ onNewsAdded, onClose, editData }: AdminPanelProps) => {
  const [activeTab, setActiveTab] = useState<'news' | 'import' | 'shop' | 'quests' | 'applications' | 'users'>('news');

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
  const [shopCurrency, setShopCurrency] = useState('SILVER');
  const [shopImage, setShopImage] = useState('');

  // Quests
  const [questsList, setQuestsList] = useState<QuestItem[]>([]);
  const [questTitle, setQuestTitle] = useState('');
  const [questType, setQuestType] = useState('SHARE');
  const [questRewardXp, setQuestRewardXp] = useState(50);
  const [questRewardAmount, setQuestRewardAmount] = useState(10);
  const [questRewardCurrency, setQuestRewardCurrency] = useState('SILVER');

  // Applications
  const [applications, setApplications] = useState<ApplicationItem[]>([]);

  // Users
  const [usersList, setUsersList] = useState<any[]>([]);

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

  useEffect(() => {
    if (activeTab === 'quests') fetchQuests();
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'applications') fetchApplications();
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'users') fetchUsers();
  }, [activeTab]);

  const fetchQuests = () => {
    fetch('/api/quests')
      .then(res => res.json())
      .then(data => setQuestsList(data))
      .catch(e => console.error('Quests fetch error:', e));
  };

  const fetchApplications = () => {
    fetch('/api/applications')
      .then(res => res.json())
      .then(data => setApplications(data))
      .catch(e => console.error('Applications fetch error:', e));
  };

  const fetchUsers = () => {
    fetch('/api/admin/users')
      .then(res => res.json())
      .then(data => setUsersList(data))
      .catch(e => console.error('Users fetch error:', e));
  };

  const handleDeleteUser = async (userId: number) => {
    if (!confirm('Удалить пользователя?')) return;
    try {
      await fetch(`/api/admin/users/${userId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData: WebApp.initData }),
      });
      fetchUsers();
    } catch (e) { alert('Ошибка удаления'); }
  };

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

  const handleCreateQuest = async () => {
    if (!questTitle) return alert('Заполни название квеста');
    setLoading(true);
    try {
      const res = await fetch('/api/quests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          initData: WebApp.initData,
          title: questTitle, type: questType,
          reward_xp: Number(questRewardXp),
          reward_amount: Number(questRewardAmount),
          reward_currency: questRewardCurrency,
        }),
      });
      const data = await res.json();
      if (data.success) { alert('Квест создан!'); setQuestTitle(''); fetchQuests(); }
      else { alert('Ошибка: ' + (data.error || 'Неизвестная')); }
    } catch (e) { alert('Ошибка сети'); } finally { setLoading(false); }
  };

  const handleDeleteQuest = async (questId: number) => {
    if (!confirm('Деактивировать квест?')) return;
    try {
      await fetch(`/api/quests/${questId}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ initData: WebApp.initData }) });
      fetchQuests();
    } catch (e) { alert('Ошибка удаления'); }
  };

  const handleApproveUser = async (userId: number) => {
    try {
      await fetch(`/api/applications/${userId}/approve`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ initData: WebApp.initData }) });
      fetchApplications();
    } catch (e) { alert('Ошибка'); }
  };

  const handleRejectUser = async (userId: number) => {
    if (!confirm('Отклонить заявку?')) return;
    try {
      await fetch(`/api/applications/${userId}/reject`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ initData: WebApp.initData }) });
      fetchApplications();
    } catch (e) { alert('Ошибка'); }
  };

  return (
    <div className="fixed inset-0 bg-black/80 z-[200] flex justify-center items-center p-4 animate-fade-in">
      <div className="bg-white rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-5 flex flex-col gap-3">

        <div className="flex justify-between items-center mb-2 border-b pb-3">
            <h3 className="text-xl font-bold text-black">Админка</h3>
            <button onClick={onClose} className="text-gray-400 hover:text-black text-sm font-bold">Закрыть</button>
        </div>

        {/* Tabs */}
        <div className="flex bg-gray-100 rounded-lg p-1 overflow-x-auto">
            <button onClick={() => setActiveTab('news')} className={`px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-1 transition-all whitespace-nowrap ${activeTab === 'news' ? 'bg-white shadow text-black' : 'text-gray-400'}`}><Newspaper size={14}/> Новости</button>
            <button onClick={() => setActiveTab('import')} className={`px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-1 transition-all whitespace-nowrap ${activeTab === 'import' ? 'bg-white shadow text-black' : 'text-gray-400'}`}><Building2 size={14}/> Импорт</button>
            <button onClick={() => setActiveTab('shop')} className={`px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-1 transition-all whitespace-nowrap ${activeTab === 'shop' ? 'bg-white shadow text-black' : 'text-gray-400'}`}><ShoppingBag size={14}/> Товары</button>
            <button onClick={() => setActiveTab('applications')} className={`px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-1 transition-all whitespace-nowrap ${activeTab === 'applications' ? 'bg-white shadow text-black' : 'text-gray-400'}`}><UserCheck size={14}/> Заявки</button>
            <button onClick={() => setActiveTab('quests')} className={`px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-1 transition-all whitespace-nowrap ${activeTab === 'quests' ? 'bg-white shadow text-black' : 'text-gray-400'}`}><Zap size={14}/> Квесты</button>
            <button onClick={() => setActiveTab('users')} className={`px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-1 transition-all whitespace-nowrap ${activeTab === 'users' ? 'bg-white shadow text-black' : 'text-gray-400'}`}><Users size={14}/> Юзеры</button>
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
                    <button onClick={handleImportXml} disabled={loading} className="flex-1 bg-blue-600 text-white p-3 rounded-lg font-bold shadow-md">{loading ? '...' : 'Загрузить'}</button>
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
                        <option value="SILVER">Серебро</option>
                        <option value="GOLD">Золото</option>
                    </select>
                </div>
                <input placeholder="Ссылка на фото" value={shopImage} onChange={e => setShopImage(e.target.value)} className="p-3 border rounded-lg w-full text-black bg-gray-50" />
                <div className="flex gap-2 mt-2 pt-2 border-t">
                    <button onClick={handleSubmitProduct} disabled={loading} className="flex-1 bg-green-600 text-white p-3 rounded-lg font-bold shadow-md">{loading ? '...' : 'Добавить товар'}</button>
                    <button onClick={onClose} className="bg-gray-200 text-black p-3 rounded-lg font-medium">Закрыть</button>
                </div>
            </div>
        )}

        {activeTab === 'quests' && (
            <div className="flex flex-col gap-3 animate-fade-in">
                <h4 className="font-bold text-black text-sm">Новый квест</h4>
                <input placeholder="Название квеста" value={questTitle} onChange={e => setQuestTitle(e.target.value)} className="p-3 border rounded-lg w-full text-black bg-gray-50" />
                <div className="flex gap-2">
                    <select value={questType} onChange={e => setQuestType(e.target.value)} className="p-3 border rounded-lg flex-1 text-black bg-gray-50">
                        <option value="SHARE">Поделиться</option><option value="TEST">Тест</option><option value="DEAL">Сделка</option><option value="REVIEW">Отзыв</option>
                    </select>
                    <select value={questRewardCurrency} onChange={e => setQuestRewardCurrency(e.target.value)} className="p-3 border rounded-lg flex-1 text-black bg-gray-50">
                        <option value="SILVER">Серебро</option><option value="GOLD">Золото</option>
                    </select>
                </div>
                <div className="flex gap-2">
                    <div className="flex-1"><label className="text-[10px] font-bold text-gray-500 uppercase">Награда XP</label><input type="number" value={questRewardXp} onChange={e => setQuestRewardXp(Number(e.target.value))} className="p-3 border rounded-lg w-full text-black bg-gray-50" /></div>
                    <div className="flex-1"><label className="text-[10px] font-bold text-gray-500 uppercase">Награда монеты</label><input type="number" value={questRewardAmount} onChange={e => setQuestRewardAmount(Number(e.target.value))} className="p-3 border rounded-lg w-full text-black bg-gray-50" /></div>
                </div>
                <button onClick={handleCreateQuest} disabled={loading} className="bg-purple-600 text-white p-3 rounded-lg font-bold shadow-md">{loading ? '...' : 'Создать квест'}</button>
                <div className="border-t pt-3 mt-2">
                    <h4 className="font-bold text-black text-sm mb-2">Активные квесты</h4>
                    {questsList.length === 0 ? (
                        <p className="text-gray-400 text-sm text-center py-4">Квестов пока нет</p>
                    ) : (
                        <div className="space-y-2">
                            {questsList.filter(q => q.is_active).map(q => (
                                <div key={q.id} className="flex items-center justify-between bg-gray-50 p-3 rounded-lg">
                                    <div className="flex-1 min-w-0">
                                        <div className="font-bold text-black text-sm truncate">{q.title}</div>
                                        <div className="text-[10px] text-gray-400">{q.type} · {q.reward_amount} {q.reward_currency === 'GOLD' ? 'золота' : 'серебра'} · {q.reward_xp} XP</div>
                                    </div>
                                    <button onClick={() => handleDeleteQuest(q.id)} className="ml-2 p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 size={16} /></button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        )}

        {activeTab === 'users' && (
            <div className="flex flex-col gap-3 animate-fade-in">
                <h4 className="font-bold text-black text-sm">Все пользователи ({usersList.length})</h4>
                {usersList.length === 0 ? (
                    <p className="text-gray-400 text-sm text-center py-8">Пользователей пока нет</p>
                ) : (
                    <div className="space-y-2">
                        {usersList.map(u => (
                            <div key={u.id} className="bg-gray-50 p-3 rounded-lg flex items-center justify-between">
                                <div className="flex-1 min-w-0">
                                    <div className="font-bold text-black text-sm truncate">
                                        {u.first_name || ''} {u.last_name || ''}
                                        {u.is_admin && <span className="ml-1 text-[10px] bg-yellow-200 text-yellow-800 px-1.5 py-0.5 rounded font-bold">ADMIN</span>}
                                    </div>
                                    <div className="text-[10px] text-gray-500 mt-0.5">
                                        {u.company_type === 'ip' ? 'ИП' : 'АН'}: {u.company || '—'} · {u.phone || '—'}
                                    </div>
                                    <div className="text-[10px] text-gray-400">
                                        TG: {u.telegram_id} · {u.approval_status || 'none'} · {u.is_registered ? 'Активен' : 'Не зарег.'}
                                    </div>
                                    <div className="text-[10px] text-gray-400">
                                        Серебро: {u.balance || 0} · Золото: {u.gold_balance || 0} · XP: {u.xp_points || 0} · Сделки: {u.deals_closed || 0}
                                    </div>
                                </div>
                                {!u.is_admin && (
                                    <button onClick={() => handleDeleteUser(u.id)} className="ml-2 p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0">
                                        <Trash2 size={16} />
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        )}

        {activeTab === 'applications' && (
            <div className="flex flex-col gap-3 animate-fade-in">
                <h4 className="font-bold text-black text-sm">Заявки на регистрацию</h4>
                {applications.length === 0 ? (
                    <p className="text-gray-400 text-sm text-center py-8">Нет новых заявок</p>
                ) : (
                    <div className="space-y-2">
                        {applications.map(app => (
                            <div key={app.id} className="bg-gray-50 p-4 rounded-lg">
                                <div className="flex justify-between items-start mb-2">
                                    <div>
                                        <div className="font-bold text-black text-sm">{app.first_name} {app.last_name}</div>
                                        <div className="text-xs text-gray-500 mt-0.5">{app.company_type === 'ip' ? 'ИП' : 'Агентство'}: {app.company}</div>
                                        <div className="text-xs text-gray-400 mt-0.5">{app.phone}</div>
                                    </div>
                                </div>
                                <div className="flex gap-2 mt-3">
                                    <button onClick={() => handleApproveUser(app.id)} className="flex-1 py-2 bg-green-600 text-white rounded-lg text-xs font-bold">Одобрить</button>
                                    <button onClick={() => handleRejectUser(app.id)} className="flex-1 py-2 bg-red-500 text-white rounded-lg text-xs font-bold">Отклонить</button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        )}
      </div>
    </div>
  );
};