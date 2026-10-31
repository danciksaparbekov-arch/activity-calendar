import { useState } from 'react';
import { supabase, BUCKET, imageUrl } from '../lib/supabase';
import { uploadImages } from '../lib/upload';
import { useImageEditor } from './ImageEditor';

// Фото события. У админа на каждом фото кнопки: ✂ обрезать/повернуть и 🗑 удалить.
export default function EventGallery({ event, isAdmin, onChange }) {
  const { edit, modal } = useImageEditor();
  const [busy, setBusy] = useState('');   // путь фото, с которым идёт операция
  const [error, setError] = useState('');

  if (!event.images.length) return null;

  // записать новый список картинок; .select() — чтобы заметить «0 строк изменено» (нет прав)
  async function saveImages(images) {
    const { data, error } = await supabase.from('events').update({ images }).eq('id', event.id).select('id');
    if (error) throw error;
    if (!data?.length) throw new Error('Не удалось сохранить: нет прав или событие удалено');
  }

  async function remove(path) {
    if (!window.confirm('Удалить это фото?')) return;
    setBusy(path);
    setError('');
    try {
      // сначала запись, потом файл: при сбое не останется «битой» ссылки
      await saveImages(event.images.filter((p) => p !== path));
      await supabase.storage.from(BUCKET).remove([path]);
      onChange();
    } catch (e) {
      setError(e.message || String(e));
    }
    setBusy('');
  }

  async function crop(path) {
    setBusy(path);
    setError('');
    let uploaded = [];
    try {
      const res = await fetch(imageUrl(path));
      if (!res.ok) throw new Error('Не удалось загрузить фото для редактирования');
      const blob = await res.blob();
      const original = new File([blob], path.split('/').pop(), { type: blob.type || 'image/jpeg' });

      const [edited] = await edit([original]);         // отмена → пусто
      if (!edited || edited === original) { setBusy(''); return; } // «как есть» — менять нечего

      uploaded = await uploadImages([edited]);
      // новое фото встаёт на место старого; старый файл удаляем только после успешной записи
      await saveImages(event.images.map((p) => (p === path ? uploaded[0] : p)));
      await supabase.storage.from(BUCKET).remove([path]);
      onChange();
    } catch (e) {
      if (uploaded.length) await supabase.storage.from(BUCKET).remove(uploaded);
      setError(e.message || String(e));
    }
    setBusy('');
  }

  return (
    <>
      <div className="gallery">
        {event.images.map((p) => (
          <div key={p} className={`photo${busy === p ? ' busy' : ''}`}>
            <a href={imageUrl(p)} target="_blank" rel="noreferrer">
              <img src={imageUrl(p)} alt="" loading="lazy" />
            </a>
            {isAdmin && (
              <span className="tools">
                <button type="button" title="Обрезать / повернуть" disabled={!!busy} onClick={() => crop(p)}>✂</button>
                <button type="button" title="Удалить фото" disabled={!!busy} onClick={() => remove(p)}>🗑</button>
              </span>
            )}
          </div>
        ))}
      </div>
      {error && <p className="err">{error}</p>}
      {modal}
    </>
  );
}
