import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Cropper from 'react-easy-crop';
import { cropToFile } from '../lib/cropImage';

const ASPECTS = [
  { id: 'square', label: 'Квадрат', value: 1 },
  { id: '4:3', label: '4:3', value: 4 / 3 },
  { id: '16:9', label: '16:9', value: 16 / 9 },
  { id: 'free', label: 'Как есть', value: null }, // пропорция самой картинки
];

// Окно редактирования одной картинки: обрезка, масштаб, поворот
function EditorModal({ file, index, total, onApply, onSkip, onCancel }) {
  const url = useMemo(() => URL.createObjectURL(file), [file]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);

  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [aspectId, setAspectId] = useState('square');
  const [natural, setNatural] = useState(null); // { w, h } исходной картинки
  const [area, setArea] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // «Как есть» — пропорция картинки; при повороте на 90/270° стороны меняются местами
  const aspect = useMemo(() => {
    const preset = ASPECTS.find((a) => a.id === aspectId);
    if (preset.value) return preset.value;
    if (!natural) return 1;
    return rotation % 180 === 0 ? natural.w / natural.h : natural.h / natural.w;
  }, [aspectId, natural, rotation]);

  async function apply() {
    if (!area) return;
    setBusy(true);
    setError('');
    try {
      onApply(await cropToFile(url, area, rotation, file.name));
    } catch (e) {
      setError(e.message || String(e));
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Редактирование фото">
      <div className="modal">
        <div className="modal-head">
          <b>Редактирование фото</b>
          {total > 1 && <span className="muted">{index} из {total}</span>}
        </div>

        <div className="crop-area">
          <Cropper
            image={url}
            crop={crop}
            zoom={zoom}
            rotation={rotation}
            aspect={aspect}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={(_, pixels) => setArea(pixels)}
            onMediaLoaded={(m) => setNatural({ w: m.naturalWidth, h: m.naturalHeight })}
          />
        </div>

        <div className="crop-controls">
          <div className="tabs method">
            {ASPECTS.map((a) => (
              <button key={a.id} type="button" className={aspectId === a.id ? 'on' : ''} onClick={() => setAspectId(a.id)}>
                {a.label}
              </button>
            ))}
          </div>
          <label className="zoom">Масштаб
            <input type="range" min={1} max={4} step={0.05} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} />
          </label>
          <button type="button" className="btn ghost small" onClick={() => setRotation((r) => (r + 90) % 360)}>
            ↻ Повернуть
          </button>
        </div>

        {error && <p className="err">{error}</p>}
        <div className="actions">
          <button type="button" className="btn" disabled={busy || !area} onClick={apply}>
            {busy ? 'Обработка…' : 'Применить'}
          </button>
          <button type="button" className="btn ghost" disabled={busy} onClick={onSkip}>Оставить как есть</button>
          <button type="button" className="link" disabled={busy} onClick={onCancel}>Отмена</button>
        </div>
      </div>
    </div>
  );
}

// Хук: edit(files) по очереди показывает редактор для каждого файла и возвращает итоговые файлы.
// «Отмена» отбрасывает весь выбор. Модальное окно нужно вывести в разметке: {modal}.
export function useImageEditor() {
  const [queue, setQueue] = useState([]);
  const resolver = useRef(null);
  const done = useRef([]);
  const total = useRef(0);

  const edit = useCallback(
    (files) =>
      new Promise((resolve) => {
        if (!files.length) return resolve([]);
        done.current = [];
        total.current = files.length;
        resolver.current = resolve;
        setQueue(files);
      }),
    [],
  );

  function finish(result) {
    resolver.current?.(result);
    resolver.current = null;
    setQueue([]);
  }

  function next(file) {
    done.current.push(file);
    const rest = queue.slice(1);
    if (rest.length) setQueue(rest);
    else finish(done.current);
  }

  const modal = queue.length ? (
    <EditorModal
      key={total.current - queue.length}
      file={queue[0]}
      index={total.current - queue.length + 1}
      total={total.current}
      onApply={next}
      onSkip={() => next(queue[0])}
      onCancel={() => finish([])}
    />
  ) : null;

  return { edit, modal };
}
