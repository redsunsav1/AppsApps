import { useState } from 'react';
import WebApp from '@twa-dev/sdk';

export const AdminPanel = ({ onNewsAdded }: { onNewsAdded: () => void }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [image, setImage] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!title || !text) return alert('Заполни заголовок и текст');
    setLoading(true);

    try {
      await fetch('/api/news', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          initData: WebApp.initData,
          title,
          text,
          image_url: image
        })
      });
      
      alert('Новость опубликована!');
      setTitle(''); setText(''); setImage('');
      setIsOpen(false);
      onNewsAdded(); // Обновляем ленту
    } catch (e) {
      alert('Ошибка');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) {
    return (
      <button 
        onClick={() => setIsOpen(true)}
        style={{
          position: 'fixed', bottom: '90px', right: '20px', // Чуть выше таббара
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
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.8)', zIndex: 200,
      display: 'flex', justifyContent: 'center', alignItems: 'center'
    }}>
      <div style={{ background: '#fff', padding: '20px', borderRadius: '15px', width: '90%', maxWidth: '400px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <h3 className="text-xl font-bold text-black">Добавить новость</h3>
        <input placeholder="Заголовок" value={title} onChange={e => setTitle(e.target.value)} className="p-2 border rounded text-black" />
        <textarea placeholder="Текст" value={text} onChange={e => setText(e.target.value)} className="p-2 border rounded h-24 text-black" />
        <input placeholder="Ссылка на картинку (https://...)" value={image} onChange={e => setImage(e.target.value)} className="p-2 border rounded text-black" />
        
        <div className="flex gap-2 mt-2">
            <button onClick={handleSubmit} disabled={loading} className="flex-1 bg-brand-gold text-white p-3 rounded font-bold">
            {loading ? '...' : 'Опубликовать'}
            </button>
            <button onClick={() => setIsOpen(false)} className="bg-gray-200 text-black p-3 rounded">
            Отмена
            </button>
        </div>
      </div>
    </div>
  );
};
