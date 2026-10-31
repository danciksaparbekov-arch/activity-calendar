import { Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { useAuth } from './auth';
import { useCircles } from './circles';
import Login from './pages/Login';
import Calendar from './pages/Calendar';
import Day from './pages/Day';
import Availability from './pages/Availability';
import Ideas from './pages/Ideas';
import EventForm from './pages/EventForm';
import Circles, { JoinForm } from './pages/Circles';
import NameForm from './components/NameForm';
import ChangePassword from './components/ChangePassword';
import InstallButton from './components/InstallButton';
import TelegramLink from './components/TelegramLink';

export default function App() {
  const { session, profile, loading, isAdmin, signOut } = useAuth();
  const { circles, ready, selectedId, setSelected } = useCircles();

  if (loading) return <div className="center">Загрузка…</div>;
  if (!session) return <Login />;
  if (!profile || !ready) return <div className="center">Загрузка профиля…</div>;

  // не админ и ни в одном круге — показывать нечего, предлагаем вступить по коду
  const noCircle = circles.length === 0 && !isAdmin;

  return (
    <>
      <header className="topbar">
        <NavLink to="/" className="brand">Что делаем?</NavLink>
        <nav>
          <NavLink to="/" end>Календарь</NavLink>
          <NavLink to="/ideas">Идеи</NavLink>
          <NavLink to="/availability">Я свободен</NavLink>
          <NavLink to="/circles">Круги</NavLink>
          {isAdmin && <NavLink to="/admin/new">+ Событие</NavLink>}
        </nav>
        {circles.length > 1 && (
          <select
            className="circle-select"
            value={selectedId}
            title="Круг"
            onChange={(e) => setSelected(e.target.value)}
          >
            <option value="all">{isAdmin ? 'Все круги' : 'Все мои'}</option>
            {circles.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
        <div className="who">
          <InstallButton />
          <TelegramLink />
          <NameForm />
          <ChangePassword />
          <button className="link" onClick={signOut}>Выйти</button>
        </div>
      </header>
      <main>
        {noCircle ? (
          <section className="narrow">
            <h2>Вы пока не в круге</h2>
            <p className="muted">Введите код круга, который вам дал организатор.</p>
            <JoinForm />
          </section>
        ) : (
          <Routes>
            <Route path="/" element={<Calendar />} />
            <Route path="/day/:date" element={<Day />} />
            <Route path="/ideas" element={<Ideas />} />
            <Route path="/availability" element={<Availability />} />
            <Route path="/circles" element={<Circles />} />
            {isAdmin && <Route path="/admin/new" element={<EventForm />} />}
            {isAdmin && <Route path="/admin/edit/:id" element={<EventForm />} />}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        )}
      </main>
    </>
  );
}
