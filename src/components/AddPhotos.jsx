import { useRef, useState } from 'react';
import { supabase, BUCKET } from '../lib/supabase';
import { checkImages, checkPicked, uploadImages, MAX_IMAGES } from '../lib/upload';
import { useImageEditor } from './ImageEditor';

// Кнопка «Добавить фото» на карточке события (для админа): выбрал файлы — сразу загрузились
export default function AddPhotos({ event, onChange }) {
  const input = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const { edit, modal } = useImageEditor();

  async function pick(e) {
    const picked = [...e.target.files];
    e.target.value = ''; // чтобы можно было выбрать те же файлы повторно
    if (!picked.length) return;
    setError('');
    const early = checkPicked(picked, event.images.length);
    if (early) return setError(early);

    // редактор: обрезка, поворот, сжатие; отмена — пустой список
    const files = await edit(picked);
    if (!files.length) return;
    const problem = checkImages(files, event.images.length);
    if (problem) return setError(problem);

    setBusy(true);
    let uploaded = [];
    try {
      uploaded = await uploadImages(files);
      const { data, error } = await supabase
        .from('events')
        .update({ images: [...event.images, ...uploaded] })
        .eq('id', event.id)
        .select('id');
      if (error) throw error;
      if (!data?.length) throw new Error('Не удалось сохранить: нет прав или событие удалено');
      onChange();
    } catch (err) {
      // запись не обновилась — убираем загруженные файлы, чтобы не осталось «сирот»
      if (uploaded.length) await supabase.storage.from(BUCKET).remove(uploaded);
      setError(err.message || String(err));
    }
    setBusy(false);
  }

  if (event.images.length >= MAX_IMAGES) return null;
  return (
    <>
      {modal}
      <input ref={input} type="file" accept="image/*" multiple hidden onChange={pick} />
      <button type="button" className="btn ghost" disabled={busy} onClick={() => input.current.click()}>
        {busy ? 'Загружаем…' : '📷 Добавить фото'}
      </button>
      {error && <span className="err"> {error}</span>}
    </>
  );
}
