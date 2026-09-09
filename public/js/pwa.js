/* Registro do service worker + botão "Instalar app" */
(function () {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    });
  }

  const btn = document.getElementById('pwa-install');
  if (!btn) return;

  const isStandalone = window.matchMedia('(display-mode: standalone)').matches
    || window.matchMedia('(display-mode: fullscreen)').matches
    || window.navigator.standalone === true;
  if (isStandalone) return; // já instalado

  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  let deferred = null;

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e;
    btn.hidden = false;
  });

  if (isIOS) btn.hidden = false; // iOS não dispara beforeinstallprompt

  btn.addEventListener('click', async () => {
    if (deferred) {
      deferred.prompt();
      await deferred.userChoice;
      deferred = null;
      btn.hidden = true;
    } else if (isIOS) {
      alert('Para instalar no iPhone/iPad:\n\n1. Toque no botão Compartilhar (quadrado com seta)\n2. Escolha "Adicionar à Tela de Início"');
    } else {
      alert('Abra o menu do navegador e escolha "Instalar app" / "Adicionar à tela inicial".');
    }
  });

  window.addEventListener('appinstalled', () => { btn.hidden = true; });
})();
