
import React, { useState } from 'react';
import { ConstructionUpdate, ProjectData, CalendarEvent, MortgageProgram, ShopItem, CurrencyType } from '../types';
import { Trash2, Save, X, Edit2, Link as LinkIcon, ShoppingBag } from 'lucide-react';

interface AdminPanelProps {
  onClose: () => void;
  // State Setters
  updates: ConstructionUpdate[];
  setUpdates: React.Dispatch<React.SetStateAction<ConstructionUpdate[]>>;
  projects: ProjectData[];
  setProjects: React.Dispatch<React.SetStateAction<ProjectData[]>>;
  events: CalendarEvent[];
  setEvents: React.Dispatch<React.SetStateAction<CalendarEvent[]>>;
  programs: MortgageProgram[];
  setPrograms: React.Dispatch<React.SetStateAction<MortgageProgram[]>>;
  shopItems: ShopItem[];
  setShopItems: React.Dispatch<React.SetStateAction<ShopItem[]>>;
}

const AdminPanel: React.FC<AdminPanelProps> = ({ 
    onClose, updates, setUpdates, projects, setProjects, events, setEvents, programs, setPrograms, shopItems, setShopItems 
}) => {
    const [activeTab, setActiveTab] = useState<'NEWS' | 'PROJECTS' | 'CALENDAR' | 'MORTGAGE' | 'SHOP'>('NEWS');

    return (
        <div className="fixed inset-0 z-[100] bg-brand-cream flex flex-col animate-fade-in">
            {/* Header */}
            <div className="px-6 pt-12 pb-4 bg-brand-black text-brand-gold flex justify-between items-center shadow-md">
                <h2 className="text-xl font-extrabold">Админ-панель</h2>
                <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white">
                    <X size={18} />
                </button>
            </div>

            {/* Tabs */}
            <div className="flex bg-brand-white border-b border-brand-light overflow-x-auto">
                <AdminTab label="Медиа" active={activeTab === 'NEWS'} onClick={() => setActiveTab('NEWS')} />
                <AdminTab label="Объекты" active={activeTab === 'PROJECTS'} onClick={() => setActiveTab('PROJECTS')} />
                <AdminTab label="Календарь" active={activeTab === 'CALENDAR'} onClick={() => setActiveTab('CALENDAR')} />
                <AdminTab label="Ипотека" active={activeTab === 'MORTGAGE'} onClick={() => setActiveTab('MORTGAGE')} />
                <AdminTab label="Маркет" active={activeTab === 'SHOP'} onClick={() => setActiveTab('SHOP')} />
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                {activeTab === 'NEWS' && <NewsEditor updates={updates} setUpdates={setUpdates} />}
                {activeTab === 'PROJECTS' && <ProjectsEditor projects={projects} setProjects={setProjects} />}
                {activeTab === 'CALENDAR' && <EventsEditor events={events} setEvents={setEvents} />}
                {activeTab === 'MORTGAGE' && <MortgageEditor programs={programs} setPrograms={setPrograms} />}
                {activeTab === 'SHOP' && <ShopEditor items={shopItems} setItems={setShopItems} />}
            </div>
        </div>
    );
};

const AdminTab: React.FC<{ label: string, active: boolean, onClick: () => void }> = ({ label, active, onClick }) => (
    <button 
        onClick={onClick} 
        className={`px-4 py-3 text-xs font-bold uppercase tracking-wider whitespace-nowrap border-b-2 transition-colors ${active ? 'border-brand-gold text-brand-black' : 'border-transparent text-brand-grey'}`}
    >
        {label}
    </button>
);

// --- EDITORS ---

// 1. NEWS EDITOR
const NewsEditor: React.FC<{ updates: ConstructionUpdate[], setUpdates: React.Dispatch<React.SetStateAction<ConstructionUpdate[]>> }> = ({ updates, setUpdates }) => {
    const [editingId, setEditingId] = useState<string | null>(null);
    const [form, setForm] = useState<Partial<ConstructionUpdate>>({});

    const handleEdit = (item: ConstructionUpdate) => {
        setEditingId(item.id);
        setForm(item);
    };

    const handleDelete = (id: string) => {
        if(window.confirm('Удалить новость?')) {
            setUpdates((prev: ConstructionUpdate[]) => prev.filter(i => i.id !== id));
        }
    };

    const handleSave = () => {
        if (!form.title || !form.projectName) return alert('Заполните название и проект');
        
        if (editingId) {
            setUpdates((prev: ConstructionUpdate[]) => prev.map(i => i.id === editingId ? { ...i, ...form } as ConstructionUpdate : i));
        } else {
            const newItem: ConstructionUpdate = {
                id: Date.now().toString(),
                title: form.title || '',
                projectName: form.projectName || '',
                description: form.description || '',
                checklist: form.checklist || [],
                materialsLink: form.materialsLink || '',
                images: form.images || ['https://via.placeholder.com/400'],
                date: new Date().toLocaleDateString('ru-RU'),
                progress: form.progress || 0
            };
            setUpdates((prev: ConstructionUpdate[]) => [newItem, ...prev]);
        }
        setEditingId(null);
        setForm({});
    };

    return (
        <div className="space-y-6">
            <div className="bg-white p-4 rounded-xl border border-brand-light shadow-sm">
                <h3 className="font-bold text-brand-black mb-3">{editingId ? 'Редактировать' : 'Добавить новость'}</h3>
                <input className="w-full mb-2 p-2 border rounded-lg text-sm" placeholder="Заголовок" value={form.title || ''} onChange={e => setForm({...form, title: e.target.value})} />
                <input className="w-full mb-2 p-2 border rounded-lg text-sm" placeholder="Название ЖК" value={form.projectName || ''} onChange={e => setForm({...form, projectName: e.target.value})} />
                <textarea className="w-full mb-2 p-2 border rounded-lg text-sm" placeholder="Текст новости..." rows={3} value={form.description || ''} onChange={e => setForm({...form, description: e.target.value})} />
                <input className="w-full mb-2 p-2 border rounded-lg text-sm" placeholder="Ссылка на Яндекс.Диск" value={form.materialsLink || ''} onChange={e => setForm({...form, materialsLink: e.target.value})} />
                <input className="w-full mb-2 p-2 border rounded-lg text-sm" placeholder="Ссылка на картинку" value={form.images?.[0] || ''} onChange={e => setForm({...form, images: [e.target.value]})} />
                
                <div className="flex gap-2 mt-2">
                    <button onClick={handleSave} className="flex-1 bg-brand-black text-brand-gold py-2 rounded-lg font-bold text-xs flex items-center justify-center gap-2"><Save size={14}/> Сохранить</button>
                    {editingId && <button onClick={() => {setEditingId(null); setForm({})}} className="px-4 bg-brand-light text-brand-black rounded-lg text-xs font-bold">Отмена</button>}
                </div>
            </div>

            <div className="space-y-2">
                {updates.map(item => (
                    <div key={item.id} className="flex justify-between items-center bg-white p-3 rounded-lg border border-brand-light">
                        <div className="overflow-hidden">
                            <div className="font-bold text-sm truncate">{item.title}</div>
                            <div className="text-xs text-brand-grey">{item.projectName}</div>
                        </div>
                        <div className="flex gap-2">
                            <button onClick={() => handleEdit(item)} className="p-2 bg-blue-50 text-blue-600 rounded-lg"><Edit2 size={14}/></button>
                            <button onClick={() => handleDelete(item.id)} className="p-2 bg-red-50 text-red-600 rounded-lg"><Trash2 size={14}/></button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

// 2. PROJECTS EDITOR
const ProjectsEditor: React.FC<{ projects: ProjectData[], setProjects: React.Dispatch<React.SetStateAction<ProjectData[]>> }> = ({ projects, setProjects }) => {
    const [editingId, setEditingId] = useState<string | null>(null);
    const [form, setForm] = useState<Partial<ProjectData>>({});

    const handleEdit = (item: ProjectData) => {
        setEditingId(item.id);
        setForm(item);
    };

    const handleDelete = (id: string) => {
        if(window.confirm('Удалить проект?')) setProjects((prev: ProjectData[]) => prev.filter(i => i.id !== id));
    };

    const handleSave = () => {
        if (!form.name) return alert('Заполните название');
        
        if (editingId) {
            setProjects((prev: ProjectData[]) => prev.map(i => i.id === editingId ? { ...i, ...form } as ProjectData : i));
        } else {
            const newItem: ProjectData = {
                id: Date.now().toString(),
                name: form.name || '',
                description: form.description || '',
                profitbaseUrl: form.profitbaseUrl || '',
                floors: Number(form.floors) || 10,
                unitsPerFloor: Number(form.unitsPerFloor) || 5,
                image: form.image || ''
            };
            setProjects((prev: ProjectData[]) => [...prev, newItem]);
        }
        setEditingId(null);
        setForm({});
    };

    return (
        <div className="space-y-6">
            <div className="bg-white p-4 rounded-xl border border-brand-light shadow-sm">
                <h3 className="font-bold text-brand-black mb-3">{editingId ? 'Редактировать проект' : 'Добавить проект'}</h3>
                <input className="w-full mb-2 p-2 border rounded-lg text-sm" placeholder="Название ЖК" value={form.name || ''} onChange={e => setForm({...form, name: e.target.value})} />
                <input className="w-full mb-2 p-2 border rounded-lg text-sm" placeholder="Описание" value={form.description || ''} onChange={e => setForm({...form, description: e.target.value})} />
                <input className="w-full mb-2 p-2 border rounded-lg text-sm" placeholder="Ссылка на XML Profitbase" value={form.profitbaseUrl || ''} onChange={e => setForm({...form, profitbaseUrl: e.target.value})} />
                <div className="flex gap-2">
                    <input className="w-1/2 mb-2 p-2 border rounded-lg text-sm" type="number" placeholder="Этажей" value={form.floors || ''} onChange={e => setForm({...form, floors: Number(e.target.value)})} />
                    <input className="w-1/2 mb-2 p-2 border rounded-lg text-sm" type="number" placeholder="Кв. на этаж" value={form.unitsPerFloor || ''} onChange={e => setForm({...form, unitsPerFloor: Number(e.target.value)})} />
                </div>
                <input className="w-full mb-2 p-2 border rounded-lg text-sm" placeholder="Ссылка на картинку" value={form.image || ''} onChange={e => setForm({...form, image: e.target.value})} />
                
                <div className="flex gap-2 mt-2">
                    <button onClick={handleSave} className="flex-1 bg-brand-black text-brand-gold py-2 rounded-lg font-bold text-xs flex items-center justify-center gap-2"><Save size={14}/> Сохранить</button>
                    {editingId && <button onClick={() => {setEditingId(null); setForm({})}} className="px-4 bg-brand-light text-brand-black rounded-lg text-xs font-bold">Отмена</button>}
                </div>
            </div>

            <div className="space-y-2">
                {projects.map(item => (
                    <div key={item.id} className="flex justify-between items-center bg-white p-3 rounded-lg border border-brand-light">
                        <div>
                            <div className="font-bold text-sm">{item.name}</div>
                            {item.profitbaseUrl && <div className="text-[10px] text-green-600 flex items-center gap-1"><LinkIcon size={10}/> XML подключен</div>}
                        </div>
                        <div className="flex gap-2">
                            <button onClick={() => handleEdit(item)} className="p-2 bg-blue-50 text-blue-600 rounded-lg"><Edit2 size={14}/></button>
                            <button onClick={() => handleDelete(item.id)} className="p-2 bg-red-50 text-red-600 rounded-lg"><Trash2 size={14}/></button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

// 3. EVENTS EDITOR
const EventsEditor: React.FC<{ events: CalendarEvent[], setEvents: React.Dispatch<React.SetStateAction<CalendarEvent[]>> }> = ({ events, setEvents }) => {
    const [form, setForm] = useState<Partial<CalendarEvent>>({});
    
    const handleSave = () => {
        if (!form.title) return;
        const newItem: CalendarEvent = {
            id: Date.now().toString(),
            title: form.title || '',
            date: form.date || '01 Янв',
            time: form.time || '10:00',
            type: form.type || 'TOUR',
            spotsTotal: Number(form.spotsTotal) || 20,
            spotsTaken: 0,
            isRegistered: false
        };
        setEvents((prev: CalendarEvent[]) => [...prev, newItem]);
        setForm({});
    };

    const handleDelete = (id: string) => {
        if(window.confirm('Удалить событие?')) setEvents((prev: CalendarEvent[]) => prev.filter(e => e.id !== id));
    };

    return (
        <div className="space-y-6">
             <div className="bg-white p-4 rounded-xl border border-brand-light shadow-sm">
                <h3 className="font-bold text-brand-black mb-3">Добавить событие</h3>
                <input className="w-full mb-2 p-2 border rounded-lg text-sm" placeholder="Название" value={form.title || ''} onChange={e => setForm({...form, title: e.target.value})} />
                <div className="flex gap-2 mb-2">
                    <input className="w-1/2 p-2 border rounded-lg text-sm" placeholder="Дата (25 Окт)" value={form.date || ''} onChange={e => setForm({...form, date: e.target.value})} />
                    <input className="w-1/2 p-2 border rounded-lg text-sm" placeholder="Время" value={form.time || ''} onChange={e => setForm({...form, time: e.target.value})} />
                </div>
                <select className="w-full mb-2 p-2 border rounded-lg text-sm bg-white" value={form.type || 'TOUR'} onChange={e => setForm({...form, type: e.target.value as any})}>
                    <option value="TOUR">Экскурсия</option>
                    <option value="TRAINING">Обучение</option>
                    <option value="PARTY">Вечеринка</option>
                </select>
                <input className="w-full mb-2 p-2 border rounded-lg text-sm" type="number" placeholder="Всего мест" value={form.spotsTotal || ''} onChange={e => setForm({...form, spotsTotal: Number(e.target.value)})} />
                
                <button onClick={handleSave} className="w-full bg-brand-black text-brand-gold py-2 rounded-lg font-bold text-xs"><Save size={14} className="inline mr-2"/> Добавить</button>
            </div>

            <div className="space-y-2">
                {events.map(item => (
                    <div key={item.id} className="flex justify-between items-center bg-white p-3 rounded-lg border border-brand-light">
                        <div>
                            <div className="font-bold text-sm">{item.title}</div>
                            <div className="text-xs text-brand-grey">{item.date} в {item.time}</div>
                        </div>
                        <button onClick={() => handleDelete(item.id)} className="p-2 bg-red-50 text-red-600 rounded-lg"><Trash2 size={14}/></button>
                    </div>
                ))}
            </div>
        </div>
    );
};

// 4. MORTGAGE EDITOR
const MortgageEditor: React.FC<{ programs: MortgageProgram[], setPrograms: React.Dispatch<React.SetStateAction<MortgageProgram[]>> }> = ({ programs, setPrograms }) => {
    const [form, setForm] = useState<Partial<MortgageProgram>>({});

    const handleSave = () => {
        if (!form.name) return;
        const newItem: MortgageProgram = {
            id: Date.now().toString(),
            name: form.name || '',
            rate: Number(form.rate) || 0
        };
        setPrograms((prev: MortgageProgram[]) => [...prev, newItem]);
        setForm({});
    };
    
    const handleDelete = (id: string) => {
         setPrograms((prev: MortgageProgram[]) => prev.filter(e => e.id !== id));
    };

    return (
        <div className="space-y-6">
             <div className="bg-white p-4 rounded-xl border border-brand-light shadow-sm">
                <h3 className="font-bold text-brand-black mb-3">Добавить программу</h3>
                <input className="w-full mb-2 p-2 border rounded-lg text-sm" placeholder="Название (IT Ипотека)" value={form.name || ''} onChange={e => setForm({...form, name: e.target.value})} />
                <input className="w-full mb-2 p-2 border rounded-lg text-sm" type="number" step="0.1" placeholder="Ставка %" value={form.rate || ''} onChange={e => setForm({...form, rate: Number(e.target.value)})} />
                <button onClick={handleSave} className="w-full bg-brand-black text-brand-gold py-2 rounded-lg font-bold text-xs"><Save size={14} className="inline mr-2"/> Добавить</button>
            </div>

            <div className="space-y-2">
                {programs.map(item => (
                    <div key={item.id} className="flex justify-between items-center bg-white p-3 rounded-lg border border-brand-light">
                        <div>
                            <div className="font-bold text-sm">{item.name}</div>
                            <div className="text-xs text-brand-grey">{item.rate}%</div>
                        </div>
                        <button onClick={() => handleDelete(item.id)} className="p-2 bg-red-50 text-red-600 rounded-lg"><Trash2 size={14}/></button>
                    </div>
                ))}
            </div>
        </div>
    );
};

// 5. SHOP EDITOR
const ShopEditor: React.FC<{ items: ShopItem[], setItems: React.Dispatch<React.SetStateAction<ShopItem[]>> }> = ({ items, setItems }) => {
    const [editingId, setEditingId] = useState<string | null>(null);
    const [form, setForm] = useState<Partial<ShopItem>>({ currency: CurrencyType.SILVER, category: 'MERCH', inStock: true });

    const handleEdit = (item: ShopItem) => {
        setEditingId(item.id);
        setForm(item);
    };

    const handleDelete = (id: string) => {
        if(window.confirm('Удалить товар?')) setItems((prev: ShopItem[]) => prev.filter(i => i.id !== id));
    };

    const handleSave = () => {
        if (!form.name || !form.price) return alert('Заполните название и цену');
        
        if (editingId) {
            setItems((prev: ShopItem[]) => prev.map(i => i.id === editingId ? { ...i, ...form } as ShopItem : i));
        } else {
            const newItem: ShopItem = {
                id: Date.now().toString(),
                name: form.name || '',
                price: Number(form.price) || 0,
                currency: form.currency || CurrencyType.SILVER,
                category: form.category || 'MERCH',
                image: form.image || '🛍️',
                inStock: form.inStock ?? true
            };
            setItems((prev: ShopItem[]) => [newItem, ...prev]);
        }
        setEditingId(null);
        setForm({ currency: CurrencyType.SILVER, category: 'MERCH', inStock: true });
    };

    return (
        <div className="space-y-6">
            <div className="bg-white p-4 rounded-xl border border-brand-light shadow-sm">
                <h3 className="font-bold text-brand-black mb-3">{editingId ? 'Редактировать товар' : 'Добавить товар'}</h3>
                
                <input className="w-full mb-2 p-2 border rounded-lg text-sm" placeholder="Название" value={form.name || ''} onChange={e => setForm({...form, name: e.target.value})} />
                
                <div className="flex gap-2 mb-2">
                    <input className="w-1/2 p-2 border rounded-lg text-sm" type="number" placeholder="Цена" value={form.price || ''} onChange={e => setForm({...form, price: Number(e.target.value)})} />
                    <select className="w-1/2 p-2 border rounded-lg text-sm bg-white" value={form.currency} onChange={e => setForm({...form, currency: e.target.value as CurrencyType})}>
                        <option value={CurrencyType.SILVER}>Silver</option>
                        <option value={CurrencyType.GOLD}>Gold</option>
                    </select>
                </div>

                <div className="flex gap-2 mb-2">
                    <select className="w-1/2 p-2 border rounded-lg text-sm bg-white" value={form.category} onChange={e => setForm({...form, category: e.target.value as any})}>
                        <option value="MERCH">Мерч</option>
                        <option value="TECH">Техника</option>
                        <option value="LUXURY">Luxury</option>
                        <option value="EXPERIENCE">Впечатления</option>
                    </select>
                    <div className="w-1/2 flex items-center px-2">
                        <label className="flex items-center gap-2 text-sm text-brand-black cursor-pointer">
                            <input type="checkbox" checked={form.inStock} onChange={e => setForm({...form, inStock: e.target.checked})} className="accent-brand-gold w-4 h-4"/>
                            В наличии
                        </label>
                    </div>
                </div>

                <input className="w-full mb-2 p-2 border rounded-lg text-sm" placeholder="URL картинки или Эмодзи (🧥)" value={form.image || ''} onChange={e => setForm({...form, image: e.target.value})} />
                
                <div className="flex gap-2 mt-2">
                    <button onClick={handleSave} className="flex-1 bg-brand-black text-brand-gold py-2 rounded-lg font-bold text-xs flex items-center justify-center gap-2"><Save size={14}/> Сохранить</button>
                    {editingId && <button onClick={() => {setEditingId(null); setForm({ currency: CurrencyType.SILVER, category: 'MERCH', inStock: true })}} className="px-4 bg-brand-light text-brand-black rounded-lg text-xs font-bold">Отмена</button>}
                </div>
            </div>

            <div className="space-y-2">
                {items.map(item => (
                    <div key={item.id} className="flex justify-between items-center bg-white p-3 rounded-lg border border-brand-light">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-brand-cream rounded-lg flex items-center justify-center text-xl overflow-hidden">
                                {item.image.startsWith('http') ? <img src={item.image} alt="" className="w-full h-full object-cover"/> : item.image}
                            </div>
                            <div>
                                <div className="font-bold text-sm">{item.name}</div>
                                <div className="text-xs text-brand-grey font-medium flex gap-2">
                                    <span>{item.price} {item.currency === CurrencyType.GOLD ? 'Gold' : 'Silver'}</span>
                                    {!item.inStock && <span className="text-red-500">Нет в наличии</span>}
                                </div>
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <button onClick={() => handleEdit(item)} className="p-2 bg-blue-50 text-blue-600 rounded-lg"><Edit2 size={14}/></button>
                            <button onClick={() => handleDelete(item.id)} className="p-2 bg-red-50 text-red-600 rounded-lg"><Trash2 size={14}/></button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default AdminPanel;
