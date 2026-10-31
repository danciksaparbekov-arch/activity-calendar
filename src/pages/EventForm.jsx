import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { supabase, BUCKET, imageUrl } from '../lib/supabase';
import { useAuth } from '../auth';
import { toISO, hhmm } from '../lib/dates';
import TimeInput from '../components/TimeInput';
import { checkImages, uploadImages } from '../lib/upload';

export default function EventForm() {
  const { id } = useParams(); // есть → редактирование
  const [params] = useSearchParams();
  const { session } = useAuth();
  const navigate = useNavigate();

  const [date, setDate] = useState(params.get('date') || toISO(new Date()));
  const [time, setTime] = useState('18:00');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [images, setImages] = useState([]); // уже загруженные пути
  const [files, setFiles] = useState([]);   // новые файлы
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    supabase.from('events').select('*').eq('id', id).single().then(({ data }) => {
      if (!data) return;
      setDate(data.date);
      setTime(hhmm(data.start_time));
      setTitle(data.title);
      setDescription(data.description);
      setImages(data.images);
    });
  }, [id]);

  function pickFiles(e) {
    const picked = [...e.target.files];
    const problem = checkImages(picked, images.length);
    if (problem) return setError(problem);
    setError('');
    setFiles(picked);
  }

  async function submit(e) {
    e.preventDefault();
    const problem = checkImages(files, images.length);
    if (problem) return setError(problem);
    setBusy(true);
    setError('');
    let uploaded = [];
    try {
      uploaded = await uploadImages(files);
      const row = {
        date,
        start_time: time,
        title: title.trim(),
        description: description.trim(),
        images: [...images, ...uploaded],
      };
      // .select() нужен, чтобы заметить «0 строк изменено» (нет прав) — иначе Supabase молчит
      const { data, error } = id
        ? await supabase.from('events').update(row).eq('id', id).select('id')
        : await supabase.from('events').insert({ ...row, created_by: session.user.id }).select('id');
      if (error) throw error;
      if (!data?.length) throw new Error('Не удалось сохранить: нет прав или событие уже удалено');
      navigate(`/day/${date}`);
    } catch (err) {
      // запись не сохранилась — убираем только что загруженные файлы
      if (uploaded.length) await supabase.storage.from(BUCKET).remove(uploaded);
      setError(err.message || String(err));
      setBusy(false);
    }
  }

  async function removeImage(path) {
    setImages((list) => list.filter((p) => p !== path));
    await supabase.storage.from(BUCKET).remove([path]);
    // сразу фиксируем в БД, чтобы не осталось «битой» ссылки
    if (id) await supabase.from('events').update({ images: images.filter((p) => p !== path) }).eq('id', id);
  }

  async function removeEvent() {
    if (!window.confirm('Удалить событие вместе с картинками?')) return;
    setError('');
    // сначала запись: если нет прав, картинки останутся на месте
    const { data, error } = await supabase.from('events').delete().eq('id', id).select('id');
    if (error) return setError(error.message);
    if (!data?.length) return setError('Не удалось удалить: нет прав или событие уже удалено');
    if (images.length) await supabase.storage.from(BUCKET).remove(images);
    navigate(`/day/${date}`);
  }

  return (
    <section className="narrow">
      <h2>{id ? 'Редактировать событие' : 'Новое событие'}</h2>
      <form onSubmit={submit} className="form">
        <div className="row">
          <label>Дата <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} /></label>
          <TimeInput label="Время (24 ч)" value={time} onChange={setTime} />
        </div>
        <label>Заголовок
          <input required maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label>Описание
          <textarea rows={5} value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>

        {images.length > 0 && (
          <div className="gallery">
            {images.map((p) => (
              <div key={p} className="thumb">
                <img src={imageUrl(p)} alt="" />
                <button type="button" className="x" onClick={() => removeImage(p)}>×</button>
              </div>
            ))}
          </div>
        )}
        <label>Картинки (скриншоты)
          <input type="file" accept="image/*" multiple onChange={pickFiles} />
          {files.length > 0 && <small>Выбрано файлов: {files.length} — загрузятся после «Сохранить»</small>}
        </label>

        {error && <p className="err">{error}</p>}
        <div className="actions">
          <button className="btn" disabled={busy}>{busy ? 'Сохраняем…' : 'Сохранить'}</button>
          {id && <button type="button" className="btn danger" onClick={removeEvent}>Удалить</button>}
        </div>
      </form>
    </section>
  );
}
