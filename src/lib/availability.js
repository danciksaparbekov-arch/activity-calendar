import { supabase } from './supabase';
import { hhmm } from './dates';

// Быстрые промежутки: можно отметить несколько сразу (утро + вечер)
export const PRESETS = [
  { id: 'all', label: 'Весь день', from: '00:00', to: '23:59' },
  { id: 'morning', label: 'Утро', from: '08:00', to: '12:00' },
  { id: 'day', label: 'День', from: '12:00', to: '18:00' },
  { id: 'evening', label: 'Вечер', from: '18:00', to: '23:00' },
];

// Подпись промежутка: «весь день» вместо 00:00–23:59
export function slotLabel(from, to) {
  const f = hhmm(from);
  const t = hhmm(to);
  return f === '00:00' && t === '23:59' ? 'весь день' : `${f}–${t}`;
}

// Отметить свободное время сразу на несколько дат; уже существующие такие же промежутки пропускаются
export async function addFree(userId, dates, slots) {
  const { data: have, error: readError } = await supabase
    .from('availability')
    .select('date, from_time, to_time')
    .eq('user_id', userId)
    .in('date', dates);
  if (readError) throw readError;

  const exists = new Set((have || []).map((a) => `${a.date}|${hhmm(a.from_time)}|${hhmm(a.to_time)}`));
  const rows = [];
  dates.forEach((date) => slots.forEach((s) => {
    if (!exists.has(`${date}|${s.from}|${s.to}`)) rows.push({ date, from_time: s.from, to_time: s.to });
  }));
  if (!rows.length) return 0;

  const { error } = await supabase.from('availability').insert(rows);
  if (error) throw error;
  return rows.length;
}

export async function removeFree(id) {
  const { error } = await supabase.from('availability').delete().eq('id', id);
  if (error) throw error;
}
