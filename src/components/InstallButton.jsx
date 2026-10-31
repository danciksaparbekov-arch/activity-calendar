import { useEffect, useState } from 'react';

const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
const isIos = () => /iphone|ipad|ipod/i.test(window.navigator.userAgent);

// «Установить»: на Android — системный запрос, на iPhone — подсказка (там установка только вручную)
export default function InstallButton() {
  const [prompt, setPrompt] = useState(null);
  const [tip, setTip] = useState(false);
  const [installed, setInstalled] = useState(isStandalone());

  useEffect(() => {
    const onPrompt = (e) => { e.preventDefault(); setPrompt(e); };
    const onInstalled = () => { setInstalled(true); setPrompt(null); };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (installed) return null;
  if (!prompt && !isIos()) return null;

  async function install() {
    if (prompt) {
      prompt.prompt();
      await prompt.userChoice;
      setPrompt(null);
    } else {
      setTip((t) => !t);
    }
  }

  return (
    <span className="install">
      <button className="link" onClick={install}>📲 Установить</button>
      {tip && (
        <span className="tip">
          Нажмите «Поделиться» <b>⎋</b> в Safari → «На экран «Домой»».
          <button className="link" onClick={() => setTip(false)}>закрыть</button>
        </span>
      )}
    </span>
  );
}
