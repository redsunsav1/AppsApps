// Компоненты
import Dashboard from './components/Dashboard';
import ContentHub from './components/NewsFeed';
import Marketplace from './components/Shop';
import Leaderboard from './components/Leaderboard';
import ChessboardModal from './components/Chessboard';
import EventCalendar from './components/tools/EventCalendar';
import MortgageCalc from './components/tools/MortgageCalc';
import SectionsHub, { SectionView } from './components/SectionsHub';
import { AdminPanel } from './components/AdminPanel';
import { UserProfile, DailyQuest, ConstructionUpdate, ShopItem, ProjectStat, CurrencyType, ProjectData, MortgageProgram, Mission } from './types';
import React, { useState, useEffect } from 'react';
import { User, Newspaper, ShoppingBag, Grid3X3, LayoutGrid, ArrowLeft, Settings } from 'lucide-react';
import WebApp from '@twa-dev/sdk';
import { getAuthData, savePwaToken, getPwaToken, isTelegramEnv } from './utils/auth';
import { showToast } from './utils/toast';
import PullToRefresh from './components/PullToRefresh';

enum Tab {
  PROFILE = 'PROFILE',
  CONTENT = 'CONTENT',
  MARKET = 'MARKET',
  SECTIONS = 'SECTIONS',
}

// --- ЗАГЛУШКИ (Для полей, которые не приходят с сервера) ---
const MOCK_DEFAULTS = {
  avatar: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?ixlib=rb-4.0.3&auto=format&fit=crop&w=256&q=80',
  level: 1, currentXP: 0, nextLevelXP: 1000, telegram: '', whatsapp: ''
};

// Цвета для статистики проектов
const PROJECT_COLORS = ['bg-brand-black', 'bg-brand-gold', 'bg-brand-grey', 'bg-stone-400', 'bg-blue-500', 'bg-green-500'];

const App: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [debugError, setDebugError] = useState<string>('');

  const [activeTab, setActiveTab] = useState<Tab>(Tab.PROFILE);
  const [quests, setQuests] = useState<DailyQuest[]>([]);
  const [stats, setStats] = useState<ProjectStat[]>([]);
  const [isChessboardOpen, setIsChessboardOpen] = useState(false);
  const [news, setNews] = useState<any[]>([]);
  const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [regName, setRegName] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regCompany, setRegCompany] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [regLastName, setRegLastName] = useState('');
  const [regCompanyType, setRegCompanyType] = useState<'agency' | 'ip'>('agency');
  const [consentPd, setConsentPd] = useState(false);
  const [showPrivacyPolicy, setShowPrivacyPolicy] = useState(false);
  const [approvalStatus, setApprovalStatus] = useState<string>('none');
  const [user, setUser] = useState<any>(null);
  const [pwaToken, setPwaToken] = useState<string>('');
  const [projects, setProjects] = useState<ProjectData[]>([]);
  const [unreadNewsCount, setUnreadNewsCount] = useState(0);

  // Sections sub-navigation
  const [sectionView, setSectionView] = useState<SectionView>('hub');

  // Missions
  const [missions, setMissions] = useState<Mission[]>([]);

  // Mortgage programs (shared between sections and chessboard)
  const [mortgagePrograms, setMortgagePrograms] = useState<MortgageProgram[]>([]);

  const fetchMortgagePrograms = () => {
    fetch('/api/mortgage-programs')
      .then(res => res.json())
      .then(data => {
        const mapped: MortgageProgram[] = data.map((p: any) => ({
          id: String(p.id), name: p.name, rate: Number(p.rate), description: p.description || '',
        }));
        setMortgagePrograms(mapped);
      })
      .catch(() => {});
  };

  const fetchNews = () => {
    fetch('/api/news')
      .then(res => res.json())
      .then(data => {
        const mapped = data.map((item: any) => ({
          id: String(item.id),
          title: item.title || '',
          projectName: item.project_name || '',
          description: item.text || '',
          images: item.image_url ? [item.image_url] : [],
          progress: item.progress || 0,
          checklist: Array.isArray(item.checklist) ? item.checklist : [],
          date: item.created_at ? new Date(item.created_at).toLocaleDateString('ru-RU') : '',
          materialsLink: item.materials_link || '',
          video_url: item.video_url || '',
        }));
        setNews(mapped);
      })
      .catch(e => console.log('News error (не критично)'));
  };

  const fetchQuests = (dbUserId?: number) => {
    const url = dbUserId ? `/api/quests?userId=${dbUserId}` : '/api/quests';
    fetch(url)
      .then(res => res.json())
      .then(data => {
        const mapped: DailyQuest[] = data.map((q: any) => ({
          id: String(q.id),
          title: q.title,
          rewardXP: q.reward_xp,
          rewardAmount: q.reward_amount,
          rewardCurrency: q.reward_currency === 'GOLD' ? CurrencyType.GOLD : CurrencyType.SILVER,
          isCompleted: q.isCompleted || false,
          type: q.type,
        }));
        setQuests(mapped);
      })
      .catch(e => console.log('Quests error (не критично)'));
  };

  const fetchMissions = () => {
    fetch('/api/missions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData: getAuthData() }),
    })
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setMissions(data.map((m: any) => ({
            id: m.id,
            code: m.code,
            title: m.title,
            description: m.description || '',
            reward_amount: m.reward_amount,
            reward_currency: m.reward_currency,
            target_count: m.target_count,
            category: m.category,
            icon: m.icon,
            progress: m.progress || 0,
            completed: m.completed || false,
            completed_at: m.completed_at,
          })));
        }
      })
      .catch(e => console.log('Missions error (не критично)'));
  };

  const fetchStats = () => {
    fetch('/api/statistics')
      .then(res => res.json())
      .then(data => {
        const mapped: ProjectStat[] = data.map((s: any, i: number) => ({
          id: s.id,
          name: s.name,
          sales: s.sales || 0,
          totalUnits: s.total_units || 0,
          color: PROJECT_COLORS[i % PROJECT_COLORS.length],
        }));
        setStats(mapped);
      })
      .catch(e => console.log('Stats error (не критично)'));
  };

  const fetchUnreadCount = () => {
    const initData = getAuthData();
    if (!initData) return;
    fetch('/api/news/unread-count', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData }),
    })
      .then(res => res.json())
      .then(data => setUnreadNewsCount(data.count || 0))
      .catch(() => {});
  };

  const markNewsSeen = () => {
    const initData = getAuthData();
    if (!initData) return;
    fetch('/api/news/mark-seen', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData }),
    })
      .then(() => setUnreadNewsCount(0))
      .catch(() => {});
  };

  const fetchProjects = () => {
    fetch('/api/projects')
      .then(res => res.json())
      .then(data => {
        const mapped: ProjectData[] = data.map((p: any) => ({
          id: String(p.id),
          name: p.name,
          description: p.description || '',
          floors: p.floors || 0,
          unitsPerFloor: p.units_per_floor || 8,
          image: p.image_url || '',
          profitbaseUrl: p.feed_url || '',
          developerName: p.developer_name || '',
        }));
        setProjects(mapped);
      })
      .catch(e => console.log('Projects error (не критично)'));
  };

  // Общий обработчик авторизованного пользователя
  const applyAuthUser = (sUser: any) => {
    if (sUser.pwa_token) {
      savePwaToken(sUser.pwa_token);
      setPwaToken(sUser.pwa_token);
    }
    setUser({
      ...MOCK_DEFAULTS,
      id: String(sUser.telegram_id),
      name: sUser.first_name,
      avatar: sUser.avatar_url || MOCK_DEFAULTS.avatar,
      silverCoins: sUser.balance,
      goldCoins: sUser.gold_balance || 0,
      dealsClosed: sUser.deals_closed || 0,
      is_registered: sUser.is_registered,
      phone: sUser.phone,
      company: sUser.company,
      is_admin: sUser.is_admin,
      approval_status: sUser.approval_status || 'none',
      last_name: sUser.last_name || '',
      company_type: sUser.company_type || 'agency',
    });
    if (sUser.first_name) setRegName(sUser.first_name);
    setApprovalStatus(sUser.approval_status || 'none');
    fetchQuests(sUser.id);
    fetchMissions();
    fetchUnreadCount();
  };

  useEffect(() => {
    try {
      WebApp.ready();
      WebApp.expand();
    } catch (e) {
      console.log("Not in telegram");
    }

    fetchNews();
    fetchStats();
    fetchProjects();
    fetchMortgagePrograms();

    // Путь 0: ?token=xxx в URL → сохранить и авторизоваться через PWA-токен
    const urlParams = new URLSearchParams(window.location.search);
    const urlToken = urlParams.get('token');
    if (urlToken) {
      savePwaToken(urlToken);
      setPwaToken(urlToken);
      // НЕ убираем токен из URL — iOS сохраняет URL при «На экран Домой»
      fetch('/api/auth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: urlToken }),
      })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Token auth error ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (data.user) applyAuthUser(data.user);
        else throw new Error("Token auth: no user");
      })
      .catch(err => {
        console.error(err);
        setDebugError(err.message || "Ошибка авторизации по токену");
      })
      .finally(() => setLoading(false));
      return;
    }

    // Путь 1: Telegram initData
    const initData = isTelegramEnv() ? getAuthData() : '';
    if (initData) {
      fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData }),
      })
      .then(async (res) => {
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`Server Error ${res.status}: ${text.slice(0, 100)}`);
        }
        return res.json();
      })
      .then((data) => {
        if (data.user) applyAuthUser(data.user);
        else throw new Error("Сервер не вернул пользователя");
      })
      .catch(err => {
        console.error(err);
        setDebugError(err.message || "Неизвестная ошибка соединения");
      })
      .finally(() => setLoading(false));
      return;
    }

    // Путь 2: Сохранённый PWA-токен
    const savedToken = getPwaToken();
    if (savedToken) {
      setPwaToken(savedToken);
      fetch('/api/auth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: savedToken }),
      })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Token auth error ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (data.user) applyAuthUser(data.user);
        else throw new Error("Token auth: no user");
      })
      .catch(err => {
        console.error('PWA token auth failed:', err);
        // Токен невалиден — показываем экран приветствия
      })
      .finally(() => setLoading(false));
      return;
    }

    // Путь 3: Нет данных → экран приветствия
    setLoading(false);
  }, []);

  const handleRegistration = () => {
    if(!regPhone || !regCompany || !regName || !consentPd) return;
    setIsSubmitting(true);
    fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        initData: getAuthData(),
        firstName: regName,
        lastName: regLastName,
        companyType: regCompanyType,
        company: regCompany,
        phone: regPhone,
        consentPd: true,
      }),
    })
    .then(res => res.json())
    .then(data => {
      if (data.success) {
        setApprovalStatus('pending');
        if (user) {
          setUser({ ...user, approval_status: 'pending' });
        }
      }
    })
    .catch(err => showToast('Ошибка сохранения', 'error'))
    .finally(() => setIsSubmitting(false));
  };

  const handleOpenCreate = () => { setEditingItem(null); setIsAdminModalOpen(true); };
  const handleOpenEdit = (item: any) => { setEditingItem(item); setIsAdminModalOpen(true); };

  const handlePullRefresh = async () => {
    fetchNews();
    fetchStats();
    fetchProjects();
    fetchMortgagePrograms();
    // Перезагрузить профиль
    const authData = getAuthData();
    if (authData) {
      try {
        const res = await fetch('/api/auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ initData: authData }),
        });
        const data = await res.json();
        if (data.user) applyAuthUser(data.user);
      } catch {}
    }
  };

  const onClaimQuest = (questId: string) => {
    fetch('/api/quests/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData: getAuthData(), questId: parseInt(questId) }),
    })
    .then(res => res.json())
    .then(data => {
      if (data.success && data.user) {
        setUser((prev: any) => ({
          ...prev,
          silverCoins: data.user.balance,
          goldCoins: data.user.gold_balance || 0,
        }));
        setQuests(prev => prev.map(q => q.id === questId ? { ...q, isCompleted: true } : q));
      }
    })
    .catch(err => console.error('Quest claim error:', err));
  };

  // Handle sections sub-navigation
  const handleSectionNavigate = (view: SectionView) => {
    setSectionView(view);
  };

  const handleBackToSections = () => {
    setSectionView('hub');
  };

  // When switching to SECTIONS tab, reset to hub view
  const handleSectionsTabClick = () => {
    setActiveTab(Tab.SECTIONS);
    setSectionView('hub');
  };

  // --- ЭКРАН С ОШИБКОЙ ---
  if (debugError) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-white p-6 text-center">
        <div className="text-red-500 font-bold text-xl mb-4">ОШИБКА ЗАПУСКА</div>
        <div className="bg-gray-100 p-4 rounded text-xs font-mono text-left w-full mb-4 break-all text-black">
          {debugError}
        </div>
        <p className="text-gray-500 mb-4">Сделайте скриншот и отправьте разработчику.</p>
        <button onClick={() => window.location.reload()} className="bg-blue-500 text-white py-3 px-6 rounded-xl">Попробовать снова</button>
      </div>
    );
  }

  if (loading) return <div className="flex items-center justify-center h-screen bg-brand-cream w-full text-black">Загрузка...</div>;

  if (!user) return (
    <div className="flex flex-col items-center justify-center h-screen bg-brand-cream p-6 text-brand-black text-center max-w-md mx-auto">
      <div className="w-24 h-24 bg-brand-gold/20 rounded-full mb-6 flex items-center justify-center">
        <span className="text-4xl">🏠</span>
      </div>
      <h1 className="text-2xl font-bold mb-3">Клуб Партнёров</h1>
      <p className="text-gray-500 text-sm mb-6 leading-relaxed">
        Для входа откройте приложение через <b>Telegram-бота</b>. После первого входа вы сможете установить приложение на домашний экран и пользоваться без Telegram.
      </p>
      <div className="bg-white p-5 rounded-2xl border border-brand-beige w-full text-left space-y-3">
        <div className="flex items-start gap-3">
          <span className="text-brand-gold font-bold text-lg">1</span>
          <p className="text-sm text-gray-600">Откройте бота в Telegram</p>
        </div>
        <div className="flex items-start gap-3">
          <span className="text-brand-gold font-bold text-lg">2</span>
          <p className="text-sm text-gray-600">Нажмите кнопку запуска приложения</p>
        </div>
        <div className="flex items-start gap-3">
          <span className="text-brand-gold font-bold text-lg">3</span>
          <p className="text-sm text-gray-600">В профиле скопируйте ссылку для установки PWA</p>
        </div>
      </div>
    </div>
  );

  // --- WAIT-LIST: Ожидание одобрения ---
  if (approvalStatus === 'pending' || user.approval_status === 'pending') {
    return (
      <div className="flex flex-col h-screen w-full bg-brand-cream text-brand-black p-6 justify-center items-center max-w-md mx-auto text-center">
        <div className="w-24 h-24 bg-brand-gold/20 rounded-full mx-auto mb-6 flex items-center justify-center">
          <span className="text-4xl">🤝</span>
        </div>
        <h1 className="text-2xl font-bold mb-3">Мы скоро запартнёримся!</h1>
        <p className="text-gray-500 text-sm mb-6">Ваша заявка на рассмотрении. Мы уведомим вас в Telegram, как только она будет одобрена.</p>
        <div className="bg-white p-4 rounded-2xl border border-brand-beige w-full">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 bg-brand-gold rounded-full animate-pulse"></div>
            <span className="text-sm font-medium text-gray-600">Заявка обрабатывается...</span>
          </div>
        </div>
      </div>
    );
  }

  // --- REJECTED: Заявка отклонена ---
  if (approvalStatus === 'rejected' || user.approval_status === 'rejected') {
    return (
      <div className="flex flex-col h-screen w-full bg-brand-cream text-brand-black p-6 justify-center items-center max-w-md mx-auto text-center">
        <div className="w-24 h-24 bg-red-100 rounded-full mx-auto mb-6 flex items-center justify-center">
          <span className="text-4xl">😔</span>
        </div>
        <h1 className="text-2xl font-bold mb-3">Заявка отклонена</h1>
        <p className="text-gray-500 text-sm mb-6">К сожалению, ваша заявка была отклонена. Вы можете подать заявку повторно с уточнёнными данными.</p>
        <button
          onClick={() => {
            setApprovalStatus('none');
            if (user) setUser({ ...user, approval_status: 'none', is_registered: false });
          }}
          className="w-full py-4 bg-brand-black text-white rounded-xl font-bold text-lg active:scale-95 transition-transform"
        >
          Подать заявку повторно
        </button>
      </div>
    );
  }

  // --- REGISTRATION FORM ---
  if (!user.is_registered) {
    return (
      <div className="flex flex-col h-screen w-full bg-brand-cream text-brand-black p-6 justify-center max-w-md mx-auto">
        <div className="mb-8 text-center">
          <div className="w-20 h-20 bg-brand-gold rounded-full mx-auto mb-4 flex items-center justify-center shadow-lg"><User size={40} className="text-white" /></div>
          <h1 className="text-2xl font-bold mb-2">Добро пожаловать!</h1>
          <p className="text-gray-600">Заполните анкету для входа в клуб партнеров.</p>
        </div>
        <div className="space-y-4 bg-white p-6 rounded-2xl shadow-sm border border-brand-beige">
          <div><label className="block text-xs font-bold uppercase text-gray-500 mb-1">Имя</label><input type="text" value={regName} onChange={e => setRegName(e.target.value)} placeholder="Иван" className="w-full p-3 bg-brand-light rounded-xl border-none focus:ring-2 focus:ring-brand-gold outline-none"/></div>
          <div><label className="block text-xs font-bold uppercase text-gray-500 mb-1">Фамилия</label><input type="text" value={regLastName} onChange={e => setRegLastName(e.target.value)} placeholder="Иванов" className="w-full p-3 bg-brand-light rounded-xl border-none focus:ring-2 focus:ring-brand-gold outline-none"/></div>
          <div>
            <label className="block text-xs font-bold uppercase text-gray-500 mb-1">Тип</label>
            <div className="flex gap-2">
              <button onClick={() => setRegCompanyType('agency')} className={`flex-1 py-3 rounded-xl font-bold text-sm transition-all ${regCompanyType === 'agency' ? 'bg-brand-black text-white' : 'bg-brand-light text-gray-500'}`}>Агентство</button>
              <button onClick={() => setRegCompanyType('ip')} className={`flex-1 py-3 rounded-xl font-bold text-sm transition-all ${regCompanyType === 'ip' ? 'bg-brand-black text-white' : 'bg-brand-light text-gray-500'}`}>ИП</button>
            </div>
          </div>
          <div><label className="block text-xs font-bold uppercase text-gray-500 mb-1">Название компании</label><input type="text" value={regCompany} onChange={e => setRegCompany(e.target.value)} placeholder="АН Этажи" className="w-full p-3 bg-brand-light rounded-xl border-none focus:ring-2 focus:ring-brand-gold outline-none"/></div>
          <div><label className="block text-xs font-bold uppercase text-gray-500 mb-1">Ваш телефон</label><input type="tel" value={regPhone} onChange={e => setRegPhone(e.target.value)} placeholder="+7 (999) 000-00-00" className="w-full p-3 bg-brand-light rounded-xl border-none focus:ring-2 focus:ring-brand-gold outline-none"/></div>
          <label className="flex items-start gap-3 mt-2 cursor-pointer">
            <input type="checkbox" checked={consentPd} onChange={e => setConsentPd(e.target.checked)} className="mt-1 w-5 h-5 rounded accent-yellow-600 shrink-0" />
            <span className="text-xs text-gray-600 leading-relaxed">
              Я даю согласие на <button type="button" onClick={(e) => { e.preventDefault(); setShowPrivacyPolicy(true); }} className="text-yellow-700 underline font-semibold">обработку персональных данных</button> в соответствии с Федеральным законом №152-ФЗ
            </span>
          </label>
          <button onClick={handleRegistration} disabled={isSubmitting || !regPhone || !regCompany || !regName || !consentPd} className="w-full py-4 bg-brand-black text-white rounded-xl font-bold text-lg mt-4 active:scale-95 transition-transform disabled:opacity-50 disabled:scale-100">{isSubmitting ? 'Отправка...' : 'Подать заявку'}</button>
        </div>
        {/* Модалка политики конфиденциальности */}
        {showPrivacyPolicy && (
          <div className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowPrivacyPolicy(false)}>
            <div className="bg-white rounded-2xl max-w-md w-full max-h-[80vh] overflow-y-auto p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
              <h2 className="text-lg font-extrabold mb-4">Политика обработки персональных данных</h2>
              <div className="text-xs text-gray-700 space-y-3 leading-relaxed">
                <p><b>1. Оператор персональных данных</b><br/>Приложение «Клуб Партнёров» осуществляет обработку персональных данных пользователей в рамках партнёрской программы застройщиков.</p>
                <p><b>2. Цели обработки</b><br/>Персональные данные обрабатываются для: регистрации в приложении и идентификации пользователя; оформления бронирования объектов недвижимости; передачи документов застройщику; информирования о статусе бронирования и новостях проектов; начисления бонусов по партнёрской программе.</p>
                <p><b>3. Состав персональных данных</b><br/>Обрабатываются: фамилия, имя; номер телефона; наименование компании; данные Telegram-аккаунта; при бронировании — ФИО и телефон покупателя, фотография паспорта.</p>
                <p><b>4. Правовое основание</b><br/>Обработка осуществляется на основании согласия субъекта персональных данных (пп. 1 п. 1 ст. 6 Федерального закона №152-ФЗ «О персональных данных»).</p>
                <p><b>5. Передача третьим лицам</b><br/>Персональные данные покупателя (ФИО, телефон, фото паспорта) передаются застройщику для оформления бронирования. Передача осуществляется с отдельного согласия пользователя.</p>
                <p><b>6. Хранение и защита</b><br/>Данные хранятся на защищённых серверах. Применяются технические и организационные меры защиты.</p>
                <p><b>7. Права субъекта</b><br/>Вы вправе: запросить информацию об обработке ваших данных; потребовать уточнения, блокирования или уничтожения данных; отозвать согласие на обработку. Для реализации прав обратитесь к администратору приложения.</p>
                <p><b>8. Срок действия согласия</b><br/>Согласие действует с момента предоставления и до момента его отзыва субъектом персональных данных.</p>
              </div>
              <button onClick={() => setShowPrivacyPolicy(false)} className="w-full py-3 bg-brand-black text-white rounded-xl font-bold text-sm mt-4">Закрыть</button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Рендер содержимого вкладки «Разделы»
  const renderSectionsContent = () => {
    if (sectionView === 'leaderboard') {
      return (
        <div>
          <div className="px-4 pt-4">
            <button onClick={handleBackToSections} className="flex items-center gap-2 text-brand-grey font-bold text-sm mb-2 active:opacity-60">
              <ArrowLeft size={18} /> Назад
            </button>
          </div>
          <Leaderboard />
        </div>
      );
    }
    if (sectionView === 'calendar') {
      return (
        <div>
          <div className="px-4 pt-4">
            <button onClick={handleBackToSections} className="flex items-center gap-2 text-brand-grey font-bold text-sm mb-2 active:opacity-60">
              <ArrowLeft size={18} /> Назад
            </button>
          </div>
          <EventCalendar />
        </div>
      );
    }
    if (sectionView === 'mortgage') {
      return (
        <div>
          <div className="px-4 pt-4">
            <button onClick={handleBackToSections} className="flex items-center gap-2 text-brand-grey font-bold text-sm mb-2 active:opacity-60">
              <ArrowLeft size={18} /> Назад
            </button>
          </div>
          <MortgageCalc programs={mortgagePrograms} embedded />
        </div>
      );
    }
    return <SectionsHub onNavigate={handleSectionNavigate} />;
  };

  return (
    <div className="flex flex-col h-[100dvh] w-full max-w-md mx-auto bg-brand-cream relative shadow-2xl overflow-hidden text-brand-black">
      <PullToRefresh onRefresh={handlePullRefresh} className="flex-1 overflow-y-auto custom-scrollbar pb-24">
        {activeTab === Tab.PROFILE && <Dashboard user={user} quests={quests} stats={stats} missions={missions} onClaimQuest={onClaimQuest} pwaToken={pwaToken} />}
        {activeTab === Tab.CONTENT && <ContentHub news={news} isAdmin={user.is_admin} onEdit={handleOpenEdit} onRefresh={fetchNews} />}
        {activeTab === Tab.MARKET && <Marketplace userSilver={user.silverCoins} userGold={user.goldCoins} isAdmin={user.is_admin} />}
        {activeTab === Tab.SECTIONS && renderSectionsContent()}
      </PullToRefresh>

      {/* Admin FAB - only for is_admin users */}
      {user.is_admin && !isAdminModalOpen && (
        <button onClick={handleOpenCreate} className="fixed z-[100] w-[50px] h-[50px] rounded-full bg-brand-black text-brand-gold flex items-center justify-center shadow-lg cursor-pointer" style={{ bottom: 'calc(90px + env(safe-area-inset-bottom, 0px))', right: '20px' }}>
          <Settings size={20} style={{ margin: 'auto' }} />
        </button>
      )}

      {isAdminModalOpen && <AdminPanel onNewsAdded={fetchNews} onClose={() => setIsAdminModalOpen(false)} editData={editingItem} />}

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 pb-safe pt-2">
        <div className="flex justify-around items-center h-[60px] px-2 max-w-md mx-auto">
          <NavBtn icon={User} label="Профиль" active={activeTab === Tab.PROFILE} onClick={() => setActiveTab(Tab.PROFILE)} />
          <NavBtn icon={Newspaper} label="Новости" active={activeTab === Tab.CONTENT} onClick={() => { setActiveTab(Tab.CONTENT); markNewsSeen(); }} badge={unreadNewsCount} />
          <button onClick={() => setIsChessboardOpen(true)} className="flex flex-col items-center justify-center w-14 h-full -mt-8 group relative z-10">
            <div className="w-12 h-12 bg-brand-black text-brand-gold rounded-full flex items-center justify-center shadow-lg border-4 border-white group-active:scale-95 transition-transform"><Grid3X3 size={22} /></div>
            <span className="text-[9px] font-bold text-brand-black mt-1">Проекты</span>
          </button>
          <NavBtn icon={ShoppingBag} label="Маркет" active={activeTab === Tab.MARKET} onClick={() => setActiveTab(Tab.MARKET)} />
          <NavBtn icon={LayoutGrid} label="Разделы" active={activeTab === Tab.SECTIONS} onClick={handleSectionsTabClick} />
        </div>
      </div>

      {isChessboardOpen && (
        <ChessboardModal
          projects={projects}
          onClose={() => setIsChessboardOpen(false)}
          isAdmin={user.is_admin}
          mortgagePrograms={mortgagePrograms}
        />
      )}
    </div>
  );
};

const NavBtn: React.FC<{ icon: React.ElementType, label: string, active: boolean, onClick: () => void, highlight?: boolean, badge?: number }> = ({ icon: Icon, label, active, onClick, highlight, badge }) => (
  <button
    onClick={onClick}
    className={`
      flex flex-col items-center justify-center w-full py-2 transition-all duration-300 rounded-xl relative
      ${active ? 'text-brand-black' : 'text-brand-grey hover:text-brand-black/70'}
    `}
  >
    <div className={`
      p-1.5 rounded-xl transition-all duration-300 mb-0.5 relative
      ${highlight ? 'bg-brand-black text-brand-gold shadow-lg shadow-brand-black/20 -translate-y-2' : active ? 'bg-brand-cream' : 'bg-transparent'}
    `}>
      <Icon size={24} strokeWidth={active || highlight ? 2.5 : 1.5} />
      {badge && badge > 0 ? (
        <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1 shadow-sm">
          {badge > 99 ? '99+' : badge}
        </span>
      ) : null}
    </div>
    <span className={`text-[10px] font-medium ${active ? 'font-bold' : ''}`}>{label}</span>
  </button>
);

export default App;
