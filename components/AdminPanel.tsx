import { useState, useEffect } from 'react';
import WebApp from '@twa-dev/sdk';
import { Newspaper, Building2, Link, ShoppingBag, Zap, Trash2, UserCheck, Users, Calendar, Calculator, Edit3 } from 'lucide-react';
import { showToast } from '../utils/toast';

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

interface EventItem {
  id: number;
  title: string;
  description: string;
  date: string;
  time: string;
  type: string;
  spots_total: number;
}

interface MortgageProgramItem {
  id: number;
  name: string;
  rate: number;
  description: string;
  is_active: boolean;
}

export const AdminPanel = ({ onNewsAdded, onClose, editData }: AdminPanelProps) => {
  const [activeTab, setActiveTab] = useState<'news' | 'import' | 'shop' | 'quests' | 'applications' | 'users' | 'events' | 'mortgage' | 'projects'>('news');

  // News
  const [title, setTitle] = useState('');
  const [projectName, setProjectName] = useState('');
  const [progress, setProgress] = useState(0);
  const [text, setText] = useState('');
  const [image, setImage] = useState('');
  const [checklistRaw, setChecklistRaw] = useState('');

  // Import
  const [importProjectId, setImportProjectId] = useState('');
  const [importProjectName, setImportProjectName] = useState('');
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

  // Events
  const [eventsList, setEventsList] = useState<EventItem[]>([]);
  const [eventTitle, setEventTitle] = useState('');
  const [eventDescription, setEventDescription] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [eventTime, setEventTime] = useState('');
  const [eventType, setEventType] = useState('TOUR');
  const [eventSpots, setEventSpots] = useState(20);
  const [editingEventId, setEditingEventId] = useState<number | null>(null);

  // Mortgage Programs
  const [mortgageList, setMortgageList] = useState<MortgageProgramItem[]>([]);
  const [mpName, setMpName] = useState('');
  const [mpRate, setMpRate] = useState(6);
  const [mpDescription, setMpDescription] = useState('');
  const [editingMortgageId, setEditingMortgageId] = useState<number | null>(null);

  // Projects
  const [projectsList, setProjectsList] = useState<any[]>([]);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editProjectName, setEditProjectName] = useState('');
  const [editProjectFloors, setEditProjectFloors] = useState('');
  const [editProjectUPF, setEditProjectUPF] = useState('');

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
    if (activeTab === 'applications') fetchApplications();
    if (activeTab === 'users') fetchUsers();
    if (activeTab === 'events') fetchEvents();
    if (activeTab === 'mortgage') fetchMortgagePrograms();
    if (activeTab === 'projects') fetchProjects();
  }, [activeTab]);

  const fetchProjects = () => {
    fetch('/api/projects').then(r => r.json()).then(data => setProjectsList(data)).catch(e => console.error(e));
  };

  const handleDeleteProject = async (id: string) => {
    if (!confirm(`Удалить проект "${id}" и все его квартиры?`)) return;
    try {
      await fetch(`/api/projects/${id}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ initData: WebApp.initData }) });
      showToast('Проект удалён', 'success'); fetchProjects();
    } catch { showToast('Ошибка удаления', 'error'); }
  };

  const handleSaveProject = async (id: string) => {
    if (!editProjectName.trim()) return;
    const body: any = { initData: WebApp.initData, name: editProjectName };
    if (editProjectFloors) body.floors = editProjectFloors;
    if (editProjectUPF) body.unitsPerFloor = editProjectUPF;
    try {
      await fetch(`/api/projects/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      showToast('Сохранено', 'success'); setEditingProjectId(null); fetchProjects();
    } catch { showToast('Ошибка', 'error'); }
  };

  const handleResyncProject = async (id: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${id}/resync`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ initData: WebApp.initData }) });
      const data = await res.json();
      const d = data.diag || {};
      showToast(`Обновлено: ${data.count} кв. (${d.format}, этажей: ${d.floors}, без этажа: ${d.noFloorCount || 0})`, data.count > 0 ? 'success' : 'error');
      fetchProjects();
    } catch { showToast('Ошибка синхронизации', 'error'); }
    finally { setLoading(false); }
  };

  const fetchQuests = () => {
    fetch('/api/quests')
      .then(res => res.json())
      .then(data => setQuestsList(data))
      .catch(e => console.error('Quests fetch error:', e));
  };

  // PROTECTED: POST with initData
  const fetchApplications = () => {
    fetch('/api/applications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData: WebApp.initData }),
    })
      .then(res => res.json())
      .then(data => setApplications(Array.isArray(data) ? data : []))
      .catch(e => console.error('Applications fetch error:', e));
  };

  // PROTECTED: POST with initData
  const fetchUsers = () => {
    fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData: WebApp.initData }),
    })
      .then(res => res.json())
      .then(data => setUsersList(Array.isArray(data) ? data : []))
      .catch(e => console.error('Users fetch error:', e));
  };

  const fetchEvents = () => {
    const initData = WebApp.initData;
    fetch('/api/events/list', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData }),
    })
      .then(res => res.json())
      .then(data => setEventsList(Array.isArray(data) ? data : []))
      .catch(e => console.error('Events fetch error:', e));
  };

  const fetchMortgagePrograms = () => {
    fetch('/api/mortgage-programs')
      .then(res => res.json())
      .then(data => setMortgageList(Array.isArray(data) ? data : []))
      .catch(e => console.error('Mortgage fetch error:', e));
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
    } catch (e) { showToast('Ошибка удаления', 'error'); }
  };

  const handleSubmitNews = async () => {
    if (!title || !text) return showToast('Заполни поля', 'error');
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
      showToast('Готово!', 'success'); onClose(); onNewsAdded();
    } catch (e) { showToast('Ошибка', 'error'); } finally { setLoading(false); }
  };

  const handleImportXml = async () => {
    if (!importProjectId || !importUrl) return showToast('Заполни поля', 'error');
    setLoading(true);
    try {
        const res = await fetch('/api/sync-xml-url', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ initData: WebApp.initData, projectId: importProjectId, projectName: importProjectName || importProjectId, url: importUrl })
        });
        const data = await res.json();
        if (data.success) {
            const d = data.diag || {};
            const msg = `${data.count} кв. (формат: ${d.format || '?'}, фид: ${d.rawCount || '?'}, этажей: ${d.floors || '?'}, без этажа: ${d.noFloorCount || 0})`;
            showToast(msg, data.count > 0 ? 'success' : 'error');
            if (data.count > 0) { setImportUrl(''); setImportProjectName(''); }
        } else { showToast('Ошибка: ' + JSON.stringify(data), 'error'); }
    } catch (e) { showToast('Ошибка сети', 'error'); } finally { setLoading(false); }
  };

  const handleSubmitProduct = async () => {
    if (!shopTitle || !shopPrice) return showToast('Заполни название и цену', 'error');
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
        showToast('Товар добавлен!', 'success');
        setShopTitle(''); setShopPrice(0); setShopImage('');
    } catch (e) { showToast('Ошибка', 'error'); } finally { setLoading(false); }
  };

  const handleCreateQuest = async () => {
    if (!questTitle) return showToast('Заполни название квеста', 'error');
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
      if (data.success) { showToast('Квест создан!', 'success'); setQuestTitle(''); fetchQuests(); }
      else { showToast('Ошибка: ' + (data.error || 'Неизвестная'), 'error'); }
    } catch (e) { showToast('Ошибка сети', 'error'); } finally { setLoading(false); }
  };

  const handleDeleteQuest = async (questId: number) => {
    if (!confirm('Деактивировать квест?')) return;
    try {
      await fetch(`/api/quests/${questId}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ initData: WebApp.initData }) });
      fetchQuests();
    } catch (e) { showToast('Ошибка удаления', 'error'); }
  };

  const handleApproveUser = async (userId: number) => {
    try {
      await fetch(`/api/applications/${userId}/approve`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ initData: WebApp.initData }) });
      fetchApplications();
      showToast('Заявка одобрена', 'success');
    } catch (e) { showToast('Ошибка', 'error'); }
  };

  const handleRejectUser = async (userId: number) => {
    if (!confirm('Отклонить заявку?')) return;
    try {
      await fetch(`/api/applications/${userId}/reject`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ initData: WebApp.initData }) });
      fetchApplications();
      showToast('Заявка отклонена', 'info');
    } catch (e) { showToast('Ошибка', 'error'); }
  };

  // --- Events CRUD ---
  const handleSaveEvent = async () => {
    if (!eventTitle || !eventDate) return showToast('Заполни название и дату', 'error');
    setLoading(true);
    try {
      const body = {
        initData: WebApp.initData,
        title: eventTitle, description: eventDescription,
        date: eventDate, time: eventTime,
        type: eventType, spots_total: Number(eventSpots),
      };
      if (editingEventId) {
        await fetch(`/api/events/${editingEventId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        showToast('Событие обновлено', 'success');
      } else {
        await fetch('/api/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        showToast('Событие создано', 'success');
      }
      resetEventForm();
      fetchEvents();
    } catch (e) { showToast('Ошибка', 'error'); } finally { setLoading(false); }
  };

  const handleEditEvent = (ev: EventItem) => {
    setEditingEventId(ev.id);
    setEventTitle(ev.title);
    setEventDescription(ev.description || '');
    setEventDate(ev.date ? ev.date.split('T')[0] : '');
    setEventTime(ev.time || '');
    setEventType(ev.type);
    setEventSpots(ev.spots_total);
  };

  const handleDeleteEvent = async (eventId: number) => {
    if (!confirm('Удалить событие?')) return;
    try {
      await fetch(`/api/events/${eventId}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ initData: WebApp.initData }) });
      fetchEvents();
      showToast('Событие удалено', 'info');
    } catch (e) { showToast('Ошибка', 'error'); }
  };

  const resetEventForm = () => {
    setEditingEventId(null);
    setEventTitle(''); setEventDescription('');
    setEventDate(''); setEventTime('');
    setEventType('TOUR'); setEventSpots(20);
  };

  // --- Mortgage Programs CRUD ---
  const handleSaveMortgage = async () => {
    if (!mpName || !mpRate) return showToast('Заполни название и ставку', 'error');
    setLoading(true);
    try {
      const body = {
        initData: WebApp.initData,
        name: mpName, rate: Number(mpRate), description: mpDescription,
      };
      if (editingMortgageId) {
        await fetch(`/api/mortgage-programs/${editingMortgageId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        showToast('Программа обновлена', 'success');
      } else {
        await fetch('/api/mortgage-programs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        showToast('Программа создана', 'success');
      }
      resetMortgageForm();
      fetchMortgagePrograms();
    } catch (e) { showToast('Ошибка', 'error'); } finally { setLoading(false); }
  };

  const handleEditMortgage = (mp: MortgageProgramItem) => {
    setEditingMortgageId(mp.id);
    setMpName(mp.name);
    setMpRate(mp.rate);
    setMpDescription(mp.description || '');
  };

  const handleDeleteMortgage = async (mpId: number) => {
    if (!confirm('Удалить программу?')) return;
    try {
      await fetch(`/api/mortgage-programs/${mpId}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ initData: WebApp.initData }) });
      fetchMortgagePrograms();
      showToast('Программа удалена', 'info');
    } catch (e) { showToast('Ошибка', 'error'); }
  };

  const resetMortgageForm = () => {
    setEditingMortgageId(null);
    setMpName(''); setMpRate(6); setMpDescription('');
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
            <button onClick={() => setActiveTab('events')} className={`px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-1 transition-all whitespace-nowrap ${activeTab === 'events' ? 'bg-white shadow text-black' : 'text-gray-400'}`}><Calendar size={14}/> События</button>
            <button onClick={() => setActiveTab('mortgage')} className={`px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-1 transition-all whitespace-nowrap ${activeTab === 'mortgage' ? 'bg-white shadow text-black' : 'text-gray-400'}`}><Calculator size={14}/> Ипотека</button>
            <button onClick={() => setActiveTab('projects')} className={`px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-1 transition-all whitespace-nowrap ${activeTab === 'projects' ? 'bg-white shadow text-black' : 'text-gray-400'}`}><Building2 size={14}/> Проекты</button>
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
                <input placeholder="ID Проекта (mnh, hrz, bbk)" value={importProjectId} onChange={e => setImportProjectId(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))} className="p-3 border rounded-lg w-full text-black bg-gray-50 font-mono" />
                <input placeholder="Название ЖК (Манхэттен)" value={importProjectName} onChange={e => setImportProjectName(e.target.value)} className="p-3 border rounded-lg w-full text-black bg-gray-50" />
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

        {/* Events Tab */}
        {activeTab === 'events' && (
            <div className="flex flex-col gap-3 animate-fade-in">
                <h4 className="font-bold text-black text-sm">{editingEventId ? 'Редактировать событие' : 'Новое событие'}</h4>
                <input placeholder="Название" value={eventTitle} onChange={e => setEventTitle(e.target.value)} className="p-3 border rounded-lg w-full text-black bg-gray-50" />
                <textarea placeholder="Описание..." value={eventDescription} onChange={e => setEventDescription(e.target.value)} className="p-3 border rounded-lg w-full h-16 text-black bg-gray-50" />
                <div className="flex gap-2">
                    <input type="date" value={eventDate} onChange={e => setEventDate(e.target.value)} className="p-3 border rounded-lg flex-1 text-black bg-gray-50" />
                    <input type="time" value={eventTime} onChange={e => setEventTime(e.target.value)} className="p-3 border rounded-lg w-1/3 text-black bg-gray-50" />
                </div>
                <div className="flex gap-2">
                    <select value={eventType} onChange={e => setEventType(e.target.value)} className="p-3 border rounded-lg flex-1 text-black bg-gray-50">
                        <option value="TOUR">Экскурсия</option>
                        <option value="TRAINING">Тренинг</option>
                        <option value="PARTY">Вечеринка</option>
                    </select>
                    <div className="w-1/3 flex items-center border rounded-lg px-2 bg-gray-50">
                        <span className="text-xs text-gray-500 mr-1">Мест:</span>
                        <input type="number" value={eventSpots} onChange={e => setEventSpots(Number(e.target.value))} className="w-full bg-transparent outline-none text-black font-bold" />
                    </div>
                </div>
                <div className="flex gap-2">
                    <button onClick={handleSaveEvent} disabled={loading} className="flex-1 bg-blue-600 text-white p-3 rounded-lg font-bold shadow-md">
                        {loading ? '...' : editingEventId ? 'Сохранить' : 'Создать'}
                    </button>
                    {editingEventId && (
                        <button onClick={resetEventForm} className="bg-gray-200 text-black p-3 rounded-lg font-medium">Отмена</button>
                    )}
                </div>
                <div className="border-t pt-3 mt-2">
                    <h4 className="font-bold text-black text-sm mb-2">Все события ({eventsList.length})</h4>
                    {eventsList.length === 0 ? (
                        <p className="text-gray-400 text-sm text-center py-4">Событий пока нет</p>
                    ) : (
                        <div className="space-y-2">
                            {eventsList.map(ev => (
                                <div key={ev.id} className="flex items-center justify-between bg-gray-50 p-3 rounded-lg">
                                    <div className="flex-1 min-w-0">
                                        <div className="font-bold text-black text-sm truncate">{ev.title}</div>
                                        <div className="text-[10px] text-gray-400">
                                            {ev.date ? new Date(ev.date).toLocaleDateString('ru-RU') : '—'} · {ev.time || '—'} · {ev.type} · {ev.spots_total} мест
                                        </div>
                                    </div>
                                    <div className="flex gap-1 ml-2">
                                        <button onClick={() => handleEditEvent(ev)} className="p-2 text-blue-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"><Edit3 size={16} /></button>
                                        <button onClick={() => handleDeleteEvent(ev.id)} className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 size={16} /></button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        )}

        {/* Mortgage Programs Tab */}
        {activeTab === 'mortgage' && (
            <div className="flex flex-col gap-3 animate-fade-in">
                <h4 className="font-bold text-black text-sm">{editingMortgageId ? 'Редактировать программу' : 'Новая программа'}</h4>
                <input placeholder="Название (Семейная, IT и т.д.)" value={mpName} onChange={e => setMpName(e.target.value)} className="p-3 border rounded-lg w-full text-black bg-gray-50" />
                <div className="flex gap-2">
                    <div className="flex-1 flex items-center border rounded-lg px-3 bg-gray-50">
                        <span className="text-xs text-gray-500 mr-1">Ставка:</span>
                        <input type="number" step="0.1" value={mpRate} onChange={e => setMpRate(Number(e.target.value))} className="w-full bg-transparent outline-none text-black font-bold p-3" />
                        <span className="text-sm text-gray-500">%</span>
                    </div>
                </div>
                <textarea placeholder="Описание программы..." value={mpDescription} onChange={e => setMpDescription(e.target.value)} className="p-3 border rounded-lg w-full h-16 text-black bg-gray-50" />
                <div className="flex gap-2">
                    <button onClick={handleSaveMortgage} disabled={loading} className="flex-1 bg-emerald-600 text-white p-3 rounded-lg font-bold shadow-md">
                        {loading ? '...' : editingMortgageId ? 'Сохранить' : 'Создать'}
                    </button>
                    {editingMortgageId && (
                        <button onClick={resetMortgageForm} className="bg-gray-200 text-black p-3 rounded-lg font-medium">Отмена</button>
                    )}
                </div>
                <div className="border-t pt-3 mt-2">
                    <h4 className="font-bold text-black text-sm mb-2">Ипотечные программы ({mortgageList.length})</h4>
                    {mortgageList.length === 0 ? (
                        <p className="text-gray-400 text-sm text-center py-4">Программ пока нет</p>
                    ) : (
                        <div className="space-y-2">
                            {mortgageList.map(mp => (
                                <div key={mp.id} className="flex items-center justify-between bg-gray-50 p-3 rounded-lg">
                                    <div className="flex-1 min-w-0">
                                        <div className="font-bold text-black text-sm truncate">{mp.name} — {mp.rate}%</div>
                                        {mp.description && <div className="text-[10px] text-gray-400 truncate">{mp.description}</div>}
                                    </div>
                                    <div className="flex gap-1 ml-2">
                                        <button onClick={() => handleEditMortgage(mp)} className="p-2 text-blue-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"><Edit3 size={16} /></button>
                                        <button onClick={() => handleDeleteMortgage(mp.id)} className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 size={16} /></button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        )}

        {activeTab === 'projects' && (
            <div className="flex flex-col gap-3 animate-fade-in">
                <h4 className="font-bold text-black text-sm">Проекты ({projectsList.length})</h4>
                {projectsList.length === 0 ? (
                    <p className="text-gray-400 text-sm text-center py-4">Проектов нет. Добавьте через вкладку «Импорт»</p>
                ) : (
                    <div className="space-y-3">
                        {projectsList.map((p: any) => (
                            <div key={p.id} className="bg-gray-50 p-4 rounded-xl border">
                                {editingProjectId === p.id ? (
                                    <div className="space-y-2">
                                        <input value={editProjectName} onChange={e => setEditProjectName(e.target.value)}
                                            className="w-full p-2 border rounded-lg text-black bg-white text-sm" placeholder="Название ЖК" />
                                        <div className="flex gap-2">
                                            <div className="flex-1">
                                                <label className="text-[10px] text-gray-400 block mb-0.5">Этажей</label>
                                                <input type="number" value={editProjectFloors} onChange={e => setEditProjectFloors(e.target.value)}
                                                    className="w-full p-2 border rounded-lg text-black bg-white text-sm" placeholder={String(p.floors)} />
                                            </div>
                                            <div className="flex-1">
                                                <label className="text-[10px] text-gray-400 block mb-0.5">Кв. на этаже</label>
                                                <input type="number" value={editProjectUPF} onChange={e => setEditProjectUPF(e.target.value)}
                                                    className="w-full p-2 border rounded-lg text-black bg-white text-sm" placeholder={String(p.units_per_floor)} />
                                            </div>
                                        </div>
                                        <div className="flex gap-2">
                                            <button onClick={() => handleSaveProject(p.id)} className="flex-1 bg-blue-600 text-white px-3 py-2 rounded-lg text-xs font-bold">Сохранить</button>
                                            <button onClick={() => setEditingProjectId(null)} className="bg-gray-200 px-3 py-2 rounded-lg text-xs">Отмена</button>
                                        </div>
                                    </div>
                                ) : (
                                    <div>
                                        <div className="flex items-center justify-between mb-2">
                                            <div>
                                                <span className="font-bold text-black">{p.name}</span>
                                                <span className="text-xs text-gray-400 ml-2 font-mono">({p.id})</span>
                                            </div>
                                        </div>
                                        <div className="text-xs text-gray-500 mb-3 space-y-1">
                                            <div>Этажей: <b className="text-black">{p.floors}</b> • Кв/этаж: <b className="text-black">{p.units_per_floor}</b></div>
                                            {p.feed_url && <div className="truncate">Фид: {p.feed_url.slice(0, 50)}...</div>}
                                        </div>
                                        <div className="flex gap-2 flex-wrap">
                                            <button onClick={() => { setEditingProjectId(p.id); setEditProjectName(p.name); setEditProjectFloors(''); setEditProjectUPF(''); }}
                                                className="bg-blue-100 text-blue-700 px-3 py-1.5 rounded-lg text-xs font-bold">Настроить</button>
                                            {p.feed_url && (
                                                <button onClick={() => handleResyncProject(p.id)} disabled={loading}
                                                    className="bg-green-100 text-green-700 px-3 py-1.5 rounded-lg text-xs font-bold">{loading ? '...' : 'Обновить фид'}</button>
                                            )}
                                            <button onClick={() => handleDeleteProject(p.id)}
                                                className="bg-red-100 text-red-700 px-3 py-1.5 rounded-lg text-xs font-bold">Удалить</button>
                                        </div>
                                    </div>
                                )}
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
