import { Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { useAuth } from './auth';
import Login from './pages/Login';
import Calendar from './pages/Calendar';
import Day from './pages/Day';
import Availability from './pages/Availability';
import EventForm from './pages/EventForm';
import NameForm from './components/NameForm';

export default function App() {
  const { session, profile, loading, isAdmin, signOut } = useAuth();

  if (loading) return <div className="center">Загрузка…</div>;
  if (!session) return <Login />;
  if (!profile) return <div className="center">Загрузка профиля…</div>;

  return (
    <>
      <header className="topbar">
        <NavLink to="/" className="brand">Что делаем вместе</NavLink>
        <nav>
          <NavLink to="/" end>Календарь</NavLink>
          <NavLink to="/availability">Я свободен</NavLink>
          {isAdmin && <NavLink to="/admin/new">+ Событие</NavLink>}
        </nav>
        <div className="who">
          <NameForm />
          <button className="link" onClick={signOut}>Выйти</button>
        </div>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<Calendar />} />
          <Route path="/day/:date" element={<Day />} />
          <Route path="/availability" element={<Availability />} />
          {isAdmin && <Route path="/admin/new" element={<EventForm />} />}
          {isAdmin && <Route path="/admin/edit/:id" element={<EventForm />} />}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </>
  );
}
