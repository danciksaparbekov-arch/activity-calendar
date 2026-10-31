import { imageUrl } from '../lib/supabase';

// Коллаж из картинок: раскладка зависит от их количества (до 4 плиток)
export default function Collage({ paths }) {
  const tiles = paths.slice(0, 4);
  if (!tiles.length) return <div className="collage empty-collage" />;
  return (
    <div className={`collage n${tiles.length}`}>
      {tiles.map((p) => (
        <img key={p} src={imageUrl(p)} alt="" loading="lazy" />
      ))}
    </div>
  );
}
