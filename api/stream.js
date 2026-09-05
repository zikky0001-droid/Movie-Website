// api/stream.js - EXACT same logic as frontend
export const config = { runtime: 'edge' };

// Copy all helper functions from download.js above
// (resolveField, unwrapMedia, unwrapMediaCollection, normalizeQuality, getMediaVariants, proxyUrl)

export default async function handler(request) {
  const url = new URL(request.url);
  const subjectId = url.searchParams.get('id');
  const detailPath = url.searchParams.get('detailPath');
  const quality = url.searchParams.get('quality');
  const season = url.searchParams.get('season');
  const episode = url.searchParams.get('episode');
  
  if (!subjectId || !detailPath) {
    return new Response(JSON.stringify({ 
// api/stream.js - Add these helper functions at the top

function resolveField(obj, candidates) {
  if (!obj || typeof obj !== 'object') return null;
  for (const key of candidates) {
    if (obj[key] !== undefined && obj[key] !== null && obj[key] !== '') {
      return obj[key];
    }
  }
  return null;
}

function unwrapMedia(mediaData) {
  return mediaData?.data || mediaData || {};
}

function unwrapMediaCollection(mediaData, kind) {
  const source = unwrapMedia(mediaData);
  const envelope = source[kind === 'stream' ? 'stream' : 'downloads'] || 
                   source[kind === 'stream' ? 'streams' : 'download'] || 
                   source;
  return envelope?.data?.data || envelope?.data || envelope;
}

function normalizeQuality(value, fallback = 'best') {
  if (value === null || value === undefined || value === '') return fallback;
  const text = String(value).trim();
  if (/^\d+$/.test(text)) return `${text}p`;
  if (/^\d+p$/i.test(text)) return text.toLowerCase();
  return text;
}

function getMediaVariants(mediaData, kind = 'stream') {
  const data = unwrapMediaCollection(mediaData, kind);
  const keys = kind === 'stream'
    ? ['streams', 'stream', 'streamUrl', 'stream_url', 'videoUrl', 'video_url', 'url']
    : ['downloads', 'download', 'downloadUrl', 'download_url'];
  const collection = resolveField(data, keys);
  if (!collection) return [];
  const entries = Array.isArray(collection) ? collection : [collection];
  const variants = entries.map((item, index) => {
    const rawUrl = typeof item === 'string' ? item : resolveField(item, kind === 'stream'
      ? ['url', 'href', 'src', 'streamUrl', 'stream_url', 'videoUrl', 'video_url']
      : ['downloadUrl', 'download_url', 'url', 'href', 'src', 'streamUrl']);
    if (!rawUrl) return null;
    const resolution = typeof item === 'object' ? resolveField(item, ['resolution', 'resolutions', 'quality', 'definition']) : null;
    const quality = normalizeQuality(resolution || (typeof item === 'object' ? resolveField(item, ['name', 'label']) : null), `source-${index + 1}`);
    
    let size = null;
    if (typeof item === 'object') {
      size = resolveField(item, ['size', 'fileSize', 'file_size', 'contentLength', 'content_length']);
      if (typeof size === 'string') {
        const match = size.match(/^(\d+(?:\.\d+)?)\s*(B|KB|MB|GB)$/i);
        if (match) {
          const num = parseFloat(match[1]);
          const unit = match[2].toUpperCase();
          const multipliers = { B: 1, KB: 1024, MB: 1048576, GB: 1073741824 };
          size = Math.round(num * (multipliers[unit] || 1));
        }
      }
    }
    
    return {
      rawUrl: rawUrl,
      quality: quality,
      resolution: resolution || quality,
      size: size,
      format: typeof item === 'object' ? resolveField(item, ['format', 'mimeType', 'mime_type']) : 'MP4'
    };
  }).filter(Boolean);
  
  return variants.sort((a, b) => {
    const av = parseInt(String(a.resolution).match(/\d+/)?.[0] || '0', 10);
    const bv = parseInt(String(b.resolution).match(/\d+/)?.[0] || '0', 10);
    return bv - av;
  });
}

function proxyUrl(url) {
  if (!url) return null;
  if (url.startsWith('/')) return url;
  return `/api/proxy?url=${encodeURIComponent(url)}&_cinemind_proxy_ts=${Date.now()}`;
}

  
