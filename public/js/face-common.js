/* Utilitários compartilhados de reconhecimento facial (browser).
   Requer que window.faceapi já esteja carregado. */
window.FaceKit = (function () {
  let ready = false;

  async function loadModels(modelUrl) {
    if (ready) return;
    // tenta modelos locais primeiro (/public/models), cai para o CDN
    const candidates = ['/public/models', modelUrl];
    let lastErr;
    for (const url of candidates) {
      try {
        await faceapi.nets.tinyFaceDetector.loadFromUri(url);
        await faceapi.nets.faceLandmark68Net.loadFromUri(url);
        await faceapi.nets.faceRecognitionNet.loadFromUri(url);
        ready = true;
        return;
      } catch (e) { lastErr = e; }
    }
    throw lastErr || new Error('Não foi possível carregar os modelos faciais');
  }

  async function startCamera(videoEl) {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false,
    });
    videoEl.srcObject = stream;
    await videoEl.play();
    return stream;
  }

  const opts = () => new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.5 });

  /**
   * Retorna { descriptor:[128], detection, score, box, faceRatio } ou null se nenhum rosto.
   * faceRatio = largura do rosto / largura do quadro (rosto pequeno gera descritor ruim).
   */
  async function detectOnce(videoEl) {
    const res = await faceapi
      .detectSingleFace(videoEl, opts())
      .withFaceLandmarks()
      .withFaceDescriptor();
    if (!res) return null;
    const box = res.detection.box;
    return {
      descriptor: Array.from(res.descriptor),
      detection: res.detection,
      score: res.detection.score || 0,
      box: { x: box.x, y: box.y, width: box.width, height: box.height },
      faceRatio: videoEl.videoWidth ? box.width / videoEl.videoWidth : 0,
    };
  }

  /** Distância euclidiana entre dois descritores. */
  function distance(a, b) {
    let sum = 0;
    for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; sum += d * d; }
    return Math.sqrt(sum);
  }

  /** Média de vários descritores (reduz o ruído de um frame isolado). */
  function average(list) {
    const out = new Array(list[0].length).fill(0);
    for (const d of list) for (let i = 0; i < out.length; i++) out[i] += d[i];
    return out.map((v) => v / list.length);
  }

  /** Recorte quadrado do rosto (com margem) como dataURL JPEG. */
  function snapshotFace(videoEl, box, size = 320) {
    const side = Math.min(Math.max(box.width, box.height) * 1.7, videoEl.videoWidth, videoEl.videoHeight);
    const sx = Math.min(Math.max(0, box.x + box.width / 2 - side / 2), videoEl.videoWidth - side);
    const sy = Math.min(Math.max(0, box.y + box.height / 2 - side / 2), videoEl.videoHeight - side);
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    c.getContext('2d').drawImage(videoEl, sx, sy, side, side, 0, 0, size, size);
    return c.toDataURL('image/jpeg', 0.85);
  }

  /** Captura JPEG do frame atual como dataURL (orientação real, sem espelho). */
  function snapshot(videoEl, maxW = 480) {
    const scale = Math.min(1, maxW / videoEl.videoWidth);
    const c = document.createElement('canvas');
    c.width = videoEl.videoWidth * scale;
    c.height = videoEl.videoHeight * scale;
    c.getContext('2d').drawImage(videoEl, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.8);
  }

  return { loadModels, startCamera, detectOnce, snapshot, snapshotFace, distance, average };
})();
