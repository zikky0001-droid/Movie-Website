// api/watch.js - HTML Video Player for streaming
export const config = { runtime: 'edge' };

export default async function handler(request) {
  const url = new URL(request.url);
  const proxyUrl = url.searchParams.get('url');
  const title = url.searchParams.get('title') || 'Video';
  const quality = url.searchParams.get('quality') || '720p';
  const downloadUrl = url.searchParams.get('download') || '';
  
  // If no proxy URL provided, return error
  if (!proxyUrl) {
    return new Response(JSON.stringify({ 
      success: false, 
      error: 'Missing url parameter' 
    }), {
      status: 400,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }

  return new Response(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Watch ${title}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: #0a0a0a;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      color: #ffffff;
    }
    .container { width: 100%; max-width: 1100px; padding: 20px; }
    .player-wrapper {
      position: relative;
      width: 100%;
      background: #000;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 20px 60px rgba(0,0,0,0.8);
    }
    video {
      width: 100%;
      height: auto;
      display: block;
      aspect-ratio: 16/9;
      background: #000;
      cursor: pointer;
    }
    .info {
      padding: 16px 4px 8px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 12px;
    }
    .info h1 {
      font-size: 20px;
      font-weight: 600;
      color: #ffffff;
    }
    .info .quality-badge {
      background: rgba(229, 9, 20, 0.2);
      color: #e50914;
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 13px;
      font-weight: 600;
      border: 1px solid rgba(229, 9, 20, 0.3);
    }
    .controls-bar {
      display: flex;
      gap: 10px;
      padding: 8px 0 12px;
      flex-wrap: wrap;
    }
    .controls-bar a, .controls-bar button {
      background: rgba(255,255,255,0.08);
      color: #ffffff;
      border: 1px solid rgba(255,255,255,0.12);
      padding: 8px 18px;
      border-radius: 8px;
      font-size: 14px;
      cursor: pointer;
      text-decoration: none;
      transition: all 0.2s ease;
      font-family: inherit;
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }
    .controls-bar a:hover, .controls-bar button:hover {
      background: rgba(229, 9, 20, 0.3);
      border-color: #e50914;
    }
    .controls-bar .primary {
      background: #e50914;
      border-color: #e50914;
    }
    .controls-bar .primary:hover {
      background: #f40612;
    }
    .loading {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      color: rgba(255,255,255,0.6);
      font-size: 14px;
      pointer-events: none;
    }
    @media (max-width: 640px) {
      .info h1 { font-size: 17px; }
      .controls-bar a, .controls-bar button { font-size: 13px; padding: 6px 14px; }
    }
  </style>
</head>
<body>
<div class="container">
  <div class="player-wrapper" id="playerWrapper">
    <video id="videoPlayer" playsinline controls preload="metadata">
      <source src="${proxyUrl}" type="video/mp4">
      <p>Your browser does not support HTML5 video.</p>
    </video>
    <div class="loading" id="loadingIndicator">Loading...</div>
  </div>

  <div class="info">
    <h1>${title}</h1>
    <span class="quality-badge">${quality}</span>
  </div>

  <div class="controls-bar">
    <a href="${downloadUrl || proxyUrl}" download="${title}.mp4" class="primary">
      ⬇️ Download ${quality}
    </a>
    <button onclick="reloadVideo()">🔄 Reload</button>
    <button onclick="toggleFullscreen()">⛶ Fullscreen</button>
  </div>
</div>

<script>
  const video = document.getElementById('videoPlayer');
  const loading = document.getElementById('loadingIndicator');
  let retryCount = 0;
  const MAX_RETRIES = 3;

  video.addEventListener('loadstart', () => { loading.style.display = 'block'; });
  video.addEventListener('loadedmetadata', () => { 
    loading.style.display = 'none';
    console.log('Video loaded:', video.duration, 'seconds');
  });
  video.addEventListener('canplay', () => { loading.style.display = 'none'; });
  video.addEventListener('waiting', () => { loading.style.display = 'block'; });
  video.addEventListener('playing', () => { loading.style.display = 'none'; });
  
  video.addEventListener('error', (e) => {
    loading.style.display = 'none';
    console.error('Video error:', e);
    if (retryCount < MAX_RETRIES && video.error && video.error.code === 2) {
      retryCount++;
      console.log(\`Retry \${retryCount}/\${MAX_RETRIES}...\`);
      setTimeout(() => reloadVideo(), 1500);
    }
  });

  let loadTimeout = setTimeout(() => {
    if (video.readyState === 0) {
      loading.innerHTML = '⚠️ Video taking too long. Try reloading or download.';
      loading.style.display = 'block';
      loading.style.color = '#ff6b6b';
    }
  }, 15000);

  function reloadVideo() {
    retryCount = 0;
    loading.style.display = 'block';
    loading.innerHTML = 'Loading...';
    loading.style.color = 'rgba(255,255,255,0.6)';
    video.load();
    clearTimeout(loadTimeout);
    loadTimeout = setTimeout(() => {
      if (video.readyState === 0) {
        loading.innerHTML = '⚠️ Video taking too long. Try reloading or download.';
        loading.style.display = 'block';
        loading.style.color = '#ff6b6b';
      }
    }, 15000);
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }

  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    if (e.key === ' ' || e.key === 'Space') {
      e.preventDefault();
      video.paused ? video.play() : video.pause();
    }
    if (e.key === 'f' || e.key === 'F') toggleFullscreen();
    if (e.key === 'ArrowRight') {
      video.currentTime = Math.min(video.currentTime + 10, video.duration || 0);
    }
    if (e.key === 'ArrowLeft') {
      video.currentTime = Math.max(video.currentTime - 10, 0);
    }
  });
</script>
</body>
</html>`, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Access-Control-Allow-Origin': '*'
    }
  });
}


