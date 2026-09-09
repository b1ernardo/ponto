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

  const opts = () => new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 });

  /** Retorna { descriptor:[128], detection } ou null se nenhum rosto nítido. */
  async function detectOnce(videoEl) {
    const res = await faceapi
      .detectSingleFace(videoEl, opts())
      .withFaceLandmarks()
      .withFaceDescriptor();
    if (!res) return null;
    return { descriptor: Array.from(res.descriptor), detection: res.detection };
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

  return { loadModels, startCamera, detectOnce, snapshot };
})();
