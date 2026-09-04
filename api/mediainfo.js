// api/mediainfo.js - Complete Fixed Version
export const config = { runtime: 'edge' };
const CACHE_TTL = 60; // 1 minute cache for fresh URLs

/**
 * EXACT COPY of frontend's resolveField function
 */
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
    
    // ✅ Get file size - try multiple fields
    let size = null;
    if (typeof item === 'object') {
      size = resolveField(item, ['size', 'fileSize', 'file_size', 'contentLength', 'content_length']);
      // If size is a string with units, parse it
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
      ...(item && typeof item === 'object' ? item : {}),
      rawUrl: rawUrl,
      quality,
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

function formatBytes(bytes) {
  if (!bytes) return null;
  const n = parseInt(bytes, 10);
  if (isNaN(n) || n <= 0) return null;
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let size = n;
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024;
    i++;
  }
  return {
    bytes: n,
    formatted: `${size.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
  };
}

function proxyUrl(url) {
  if (!url) return null;
  if (url.startsWith('/')) return url;
  return `/api/proxy?url=${encodeURIComponent(url)}&_cinemind_proxy_ts=${Date.now()}`;
}

export default async function handler(request) {
  const url = new URL(request.url);
  const subjectId = url.searchParams.get('id');
  const detailPath = url.searchParams.get('detailPath');
  const season = url.searchParams.get('season');
  const episode = url.searchParams.get('episode');
  
  if (!subjectId || !detailPath) {
    return new Response(JSON.stringify({ 
      success: false, 
      error: 'Missing subjectId or detailPath' 
    }), {
      status: 400,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }

  try {
    const apiKey = process.env.ZSTLAB_API_KEY || 'zst_A301yYAojr9gqZKmshjA9NmLVua0ghfYu5leVNxf';
    
    let mediaUrl = `https://zstlab.cyou/api/media?subjectId=${subjectId}&detailPath=${encodeURIComponent(detailPath)}&apikey=${apiKey}`;
    if (season && episode) {
      mediaUrl += `&season=${season}&episode=${episode}`;
    }
    
    const response = await fetch(mediaUrl, {
      headers: { 'User-Agent': 'CineMind-API/1.0' }
    });
    
    if (!response.ok) {
      throw new Error(`Upstream API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    // Get variants using frontend logic
    const streamVariants = getMediaVariants(data, 'stream');
    const downloadVariants = getMediaVariants(data, 'download');
    
    const title = data?.data?.title || 'Video';
    
    // Extract subtitles
    let subtitles = [];
    const subtitlesData = data?.data?.subtitles?.data || data?.data?.subtitles;
    if (Array.isArray(subtitlesData)) {
      subtitles = subtitlesData;
    } else if (subtitlesData && typeof subtitlesData === 'object') {
      subtitles = Object.values(subtitlesData);
    }
    
    const subtitleTracks = subtitles.map(s => {
      const subUrl = s?.url || s?.downloadUrl || s?.src;
      return {
        language: s?.language || s?.lan || s?.srclang || 'unknown',
        label: s?.label || s?.lanName || s?.name || s?.language || 'Subtitle',
        url: subUrl ? proxyUrl(subUrl) : null
      };
    }).filter(t => t.url);
    
    // ✅ Build available qualities with correct sizes
    const allQualities = [];
    const qualityMap = {};
    
    // Add stream qualities
    streamVariants.forEach(v => {
      const q = v.quality;
      if (!qualityMap[q]) {
        qualityMap[q] = { stream: v, download: null };
      } else {
        qualityMap[q].stream = v;
      }
    });
    
    // Add download qualities
    downloadVariants.forEach(v => {
      const q = v.quality;
      if (!qualityMap[q]) {
        qualityMap[q] = { stream: null, download: v };
      } else {
        qualityMap[q].download = v;
      }
    });
    
    const qualities = Object.keys(qualityMap).sort((a, b) => {
      const aNum = parseInt(a.replace(/p$/, ''));
      const bNum = parseInt(b.replace(/p$/, ''));
      return bNum - aNum;
    });
    
    // Build stream URLs
    const streamUrls = qualities.map(q => {
      const v = qualityMap[q].stream || qualityMap[q].download;
      const rawUrl = v?.rawUrl || v?.url;
      const sizeInfo = formatBytes(v?.size);
      return {
        quality: q,
        url: rawUrl ? proxyUrl(rawUrl) : null,
        size: sizeInfo,
        format: v?.format || 'MP4'
      };
    }).filter(v => v.url);
    
    // Build download URLs (using stream URLs for better reliability)
    const downloadUrls = qualities.map(q => {
      const v = qualityMap[q].stream || qualityMap[q].download;
      const rawUrl = v?.rawUrl || v?.url;
      const sizeInfo = formatBytes(v?.size);
      const filename = `${title}${season && episode ? ` S${season}E${episode}` : ''} - ${q}.mp4`;
      return {
        quality: q,
        url: rawUrl ? proxyUrl(rawUrl) : null,
        size: sizeInfo,
        filename: filename,
        format: v?.format || 'MP4'
      };
    }).filter(v => v.url);
    
    // Build download links (same as download URLs)
    const downloadLinks = downloadUrls.map(v => ({
      quality: v.quality,
      url: v.url,
      size: v.size,
      filename: v.filename
    }));
    
    return new Response(JSON.stringify({
      success: true,
      data: {
        title: title,
        subjectId: subjectId,
        detailPath: detailPath,
        season: season || null,
        episode: episode || null,
        availableQualities: qualities,
        stream: {
          available: streamUrls.length > 0,
          variants: streamUrls
        },
        download: {
          available: downloadUrls.length > 0,
          variants: downloadUrls
        },
        subtitles: {
          available: subtitleTracks.length > 0,
          tracks: subtitleTracks
        },
        downloadLinks: downloadLinks
      }
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': `public, max-age=${CACHE_TTL}`,
        'Access-Control-Allow-Origin': '*'
      }
    });
    
  } catch (error) {
    console.error('MediaInfo error:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message 
    }), {
      status: 500,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
}


