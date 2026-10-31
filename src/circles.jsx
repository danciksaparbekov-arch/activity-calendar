import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from './lib/supabase';
import { useAuth } from './auth';

const CirclesContext = createContext(null);
export const useCircles = () => useContext(CirclesContext);

const STORAGE_KEY = 'circle';

export function CirclesProvider({ children }) {
  const { session } = useAuth();
  const [circles, setCircles] = useState([]);   // [{ id, name, color }] — только доступные
  const [members, setMembers] = useState([]);   // [{ circle_id, user_id }]
  const [ready, setReady] = useState(false);
  const [selected, setSelectedState] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) || 'all'; } catch { return 'all'; }
  });

  const reload = useCallback(async () => {
    const [c, m] = await Promise.all([
      // колонки перечислены явно: invite_code клиенту недоступен, select('*') дал бы ошибку
      supabase.from('circles').select('id, name, color').order('name'),
      supabase.from('circle_members').select('circle_id, user_id'),
    ]);
    setCircles(c.data || []);
    setMembers(m.data || []);
    setReady(true);
  }, []);

  useEffect(() => {
    if (session) reload();
    else { setCircles([]); setMembers([]); setReady(false); }
  }, [session, reload]);

  // сохранённый выбор мог устареть (круг удалён / человека убрали) — тогда «все»
  const selectedId = selected !== 'all' && circles.some((c) => c.id === selected) ? selected : 'all';

  const setSelected = useCallback((id) => {
    setSelectedState(id);
    try { localStorage.setItem(STORAGE_KEY, id); } catch { /* приватный режим — не страшно */ }
  }, []);

  const circleById = useMemo(() => Object.fromEntries(circles.map((c) => [c.id, c])), [circles]);

  // id людей выбранного круга; null — «все круги», фильтровать не нужно
  const visibleUserIds = useMemo(() => {
    if (selectedId === 'all') return null;
    return new Set(members.filter((m) => m.circle_id === selectedId).map((m) => m.user_id));
  }, [members, selectedId]);

  const membersOf = useCallback(
    (circleId) => new Set(members.filter((m) => m.circle_id === circleId).map((m) => m.user_id)),
    [members],
  );

  const value = { circles, members, ready, selectedId, setSelected, circleById, visibleUserIds, membersOf, reload };
  return <CirclesContext.Provider value={value}>{children}</CirclesContext.Provider>;
}
