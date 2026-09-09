/* Registro do service worker + botão "Instalar app" */
(function () {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    });
  }

  const btn = document.getElementById('pwa-install');
  if (!btn) return;

  const mm = (q) => { try { return window.matchMedia(q).matches; } catch (e) { return false; } };
  const isStandalone = mm('(display-mode: standalone)') || mm('(display-mode: fullscreen)')
    || mm('(display-mode: minimal-ui)') || window.navigator.standalone === true;
  if (isStandalone) { btn.hidden = true; return; }   // já está rodando instalado

  const ua = navigator.userAgent || '';
  const isIOS = /iphone|ipad|ipod/i.test(ua)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); // iPadOS se diz "Mac"
  const isSafari = isIOS && /^((?!crios|fxios|edgios|opt\/).)*safari/i.test(ua);
  const isAndroid = /android/i.test(ua);

  let deferred = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e;
  });
  window.addEventListener('appinstalled', () => { btn.hidden = true; });

  // botão sempre visível (a não ser que já esteja instalado)
  btn.hidden = false;

  btn.addEventListener('click', async () => {
    if (deferred) {
      deferred.prompt();
      const r = await deferred.userChoice;
      deferred = null;
      if (r && r.outcome === 'accepted') btn.hidden = true;
      return;
    }
    if (isIOS && !isSafari) {
      alert('No iPhone/iPad a instalação só funciona pelo navegador Safari.\n\nAbra este endereço no Safari e toque em Compartilhar → "Adicionar à Tela de Início".');
      return;
    }
    if (isIOS) {
      alert('Para instalar no iPhone/iPad:\n\n1. Toque no botão Compartilhar (o quadrado com a seta para cima)\n2. Role e escolha "Adicionar à Tela de Início"\n3. Toque em "Adicionar"');
      return;
    }
    if (isAndroid) {
      alert('Para instalar no Android:\n\n1. Toque no menu do navegador (os 3 pontos, canto superior direito)\n2. Escolha "Instalar aplicativo" ou "Adicionar à tela inicial"\n3. Confirme');
      return;
    }
    alert('Abra o menu do navegador e escolha "Instalar aplicativo" / "Adicionar à tela inicial".');
  });
})();
