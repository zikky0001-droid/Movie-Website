// api/mediainfo.js - Get all available qualities and subtitles
export const config = { runtime: 'edge' };
const CACHE_TTL = 300;

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
    return {
      ...(item && typeof item === 'object' ? item : {}),
      rawUrl: rawUrl,
      quality,
      resolution: resolution || quality,
      size: typeof item === 'object' ? resolveField(item, ['size', 'fileSize', 'file_size']) : null,
      format: typeof item === 'object' ? resolveField(item, ['format', 'mimeType', 'mime_type']) : null
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
    
    // Build available qualities
    const allQualities = [...new Set([
      ...streamVariants.map(v => v.quality),
      ...downloadVariants.map(v => v.quality)
    ])];
    
    // Build download URLs for each quality
    const downloadUrls = downloadVariants.map(v => ({
      quality: v.quality,
      url: proxyUrl(v.rawUrl || v.url),
      size: v.size,
      format: v.format || 'MP4',
      filename: `${title}${season && episode ? ` S${season}E${episode}` : ''} - ${v.quality}.mp4`
    }));
    
    // Build stream URLs for each quality
    const streamUrls = streamVariants.map(v => ({
      quality: v.quality,
      url: proxyUrl(v.rawUrl || v.url),
      size: v.size,
      format: v.format || 'MP4'
    }));
    
    return new Response(JSON.stringify({
      success: true,
      data: {
        title: title,
        subjectId: subjectId,
        detailPath: detailPath,
        season: season || null,
        episode: episode || null,
        availableQualities: allQualities,
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
        // Direct download URLs for each quality (for WhatsApp bot)
        downloadLinks: downloadUrls.map(v => ({
          quality: v.quality,
          url: v.url,
          size: v.size,
          filename: v.filename
        }))
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

