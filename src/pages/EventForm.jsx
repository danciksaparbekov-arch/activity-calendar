import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { supabase, BUCKET, imageUrl } from '../lib/supabase';
import { useAuth } from '../auth';
import { toISO, hhmm } from '../lib/dates';

const MAX_IMAGES = 8;
const MAX_SIZE = 5 * 1024 * 1024; // 5 МБ на картинку

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
    const bad = picked.find((f) => !f.type.startsWith('image/') || f.size > MAX_SIZE);
    if (bad) return setError(`«${bad.name}»: нужна картинка до 5 МБ`);
    setError('');
    setFiles(picked);
  }

  async function submit(e) {
    e.preventDefault();
    if (images.length + files.length > MAX_IMAGES) return setError(`Не больше ${MAX_IMAGES} картинок`);
    setBusy(true);
    setError('');
    try {
      // загружаем новые файлы под неугадываемыми именами
      const uploaded = [];
      for (const f of files) {
        const ext = (f.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
        const path = `${crypto.randomUUID()}.${ext}`;
        const { error } = await supabase.storage.from(BUCKET).upload(path, f, { contentType: f.type });
        if (error) throw error;
        uploaded.push(path);
      }
      const row = {
        date,
        start_time: time,
        title: title.trim(),
        description: description.trim(),
        images: [...images, ...uploaded],
      };
      const { error } = id
        ? await supabase.from('events').update(row).eq('id', id)
        : await supabase.from('events').insert({ ...row, created_by: session.user.id });
      if (error) throw error;
      navigate(`/day/${date}`);
    } catch (err) {
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
    if (!window.confirm('Удалить событие?')) return;
    if (images.length) await supabase.storage.from(BUCKET).remove(images);
    await supabase.from('events').delete().eq('id', id);
    navigate(`/day/${date}`);
  }

  return (
    <section className="narrow">
      <h2>{id ? 'Редактировать событие' : 'Новое событие'}</h2>
      <form onSubmit={submit} className="form">
        <div className="row">
          <label>Дата <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} /></label>
          <label>Время <input type="time" required value={time} onChange={(e) => setTime(e.target.value)} /></label>
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
