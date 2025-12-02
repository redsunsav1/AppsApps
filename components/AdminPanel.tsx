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
      setTitle('');
      setText('');
      setImage('');
      setIsOpen(false);
      onNewsAdded(); // Обновляем список новостей на главной
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
          position: 'fixed', bottom: '20px', right: '20px', 
          background: 'red', color: 'white', border: 'none', 
          borderRadius: '50%', width: '50px', height: '50px', 
          fontSize: '24px', zIndex: 1000, cursor: 'pointer',
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
      background: 'rgba(0,0,0,0.8)', zIndex: 1000,
      display: 'flex', justifyContent: 'center', alignItems: 'center'
    }}>
      <div style={{ background: '#fff', padding: '20px', borderRadius: '15px', width: '90%', maxWidth: '400px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <h3>Добавить новость</h3>
        
        <input 
          placeholder="Заголовок" 
          value={title} 
          onChange={e => setTitle(e.target.value)}
          style={{ padding: '10px', fontSize: '16px' }}
        />
        
        <textarea 
          placeholder="Текст новости" 
          value={text} 
          onChange={e => setText(e.target.value)}
          style={{ padding: '10px', fontSize: '16px', height: '100px' }}
        />
        
        <input 
          placeholder="Ссылка на картинку (https://...)" 
          value={image} 
          onChange={e => setImage(e.target.value)}
          style={{ padding: '10px', fontSize: '16px' }}
        />

        <button 
          onClick={handleSubmit} 
          disabled={loading}
          style={{ background: '#BA8F50', color: '#fff', padding: '12px', border: 'none', borderRadius: '8px', fontSize: '16px' }}
        >
          {loading ? 'Публикуем...' : 'Опубликовать'}
        </button>
        
        <button 
          onClick={() => setIsOpen(false)}
          style={{ background: 'transparent', color: '#333', border: 'none', marginTop: '10px' }}
        >
          Закрыть
        </button>
      </div>
    </div>
  );
};
