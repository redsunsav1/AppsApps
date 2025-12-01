import { useEffect, useState } from 'react';
import WebApp from '@twa-dev/sdk';

// Тип данных, которые придут от нашего сервера
interface UserData {
  id: number;
  telegram_id: string;
  first_name: string;
  username: string;
  balance: number;
}

function App() {
  const [user, setUser] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Сообщаем Телеграму, что приложение готово
    WebApp.ready();

    const initData = WebApp.initData;

    if (initData) {
      // Отправляем запрос на регистрацию/вход
      fetch('/api/auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ initData }),
      })
        .then((res) => {
          if (!res.ok) throw new Error('Ошибка сети');
          return res.json();
        })
        .then((data) => {
          if (data.user) {
            setUser(data.user);
          } else {
            setError('Не удалось получить данные пользователя');
          }
        })
        .catch((err) => {
          console.error(err);
          setError('Ошибка соединения с сервером');
        })
        .finally(() => setLoading(false));
    } else {
      setError('Приложение запущено не в Telegram');
      setLoading(false);
    }
  }, []);

  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif' }}>
      <h1>Partner App</h1>

      {loading && <p>Загрузка...</p>}

      {error && <p style={{ color: 'red' }}>{error}</p>}

      {user && (
        <div style={{ 
          border: '1px solid #ccc', 
          borderRadius: '12px', 
          padding: '15px',
          background: '#242424',
          color: '#fff'
        }}>
          <h2>Профиль</h2>
          <p><strong>Имя:</strong> {user.first_name}</p>
          <p><strong>Username:</strong> @{user.username}</p>
          <p><strong>Баланс:</strong> {user.balance}</p>
          <p style={{ fontSize: '12px', color: '#888' }}>ID в базе: {user.id}</p>
        </div>
      )}
    </div>
  );
}

export default App;
