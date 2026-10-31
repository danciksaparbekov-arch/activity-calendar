import { supabase, BUCKET } from './supabase';

export const MAX_IMAGES = 8;
export const MAX_SIZE = 5 * 1024 * 1024; // 5 МБ на картинку

// Текст ошибки, если файлы не подходят (или null)
export function checkImages(files, existingCount = 0) {
  const bad = files.find((f) => !f.type.startsWith('image/') || f.size > MAX_SIZE);
  if (bad) return `«${bad.name}»: нужна картинка до 5 МБ`;
  if (existingCount + files.length > MAX_IMAGES) return `Не больше ${MAX_IMAGES} картинок на событие`;
  return null;
}

// Загружает файлы в хранилище под неугадываемыми именами, возвращает пути.
// При сбое на середине удаляет уже загруженные, чтобы не копить мусор.
export async function uploadImages(files) {
  const uploaded = [];
  try {
    for (const f of files) {
      const ext = (f.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
      const path = `${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, f, { contentType: f.type });
      if (error) throw error;
      uploaded.push(path);
    }
  } catch (err) {
    if (uploaded.length) await supabase.storage.from(BUCKET).remove(uploaded);
    throw err;
  }
  return uploaded;
}
