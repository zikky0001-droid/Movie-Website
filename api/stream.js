// api/stream.js - Complete with helper functions
export const config = { runtime: 'edge' };

// ============================================
// HELPER FUNCTIONS (must be defined in this file)
// ============================================

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

// ============================================
// MAIN HANDLER
// ============================================

export default async function handler(request) {
  const url = new URL(request.url);
  const subjectId = url.searchParams.get('id');
  const detailPath = url.searchParams.get('detailPath');
  const quality = url.searchParams.get('quality');
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
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }

  try {
    const apiKey = process.env.ZSTLAB_API_KEY || 'zst_A301yYAojr9gqZKmshjA9NmLVua0ghfYu5leVNxf';
    
    // ✅ Force fresh request
    let mediaUrl = `https://zstlab.cyou/api/media?subjectId=${subjectId}&detailPath=${encodeURIComponent(detailPath)}&apikey=${apiKey}&_fresh=${Date.now()}`;
    if (season && episode) {
      mediaUrl += `&season=${season}&episode=${episode}`;
    }
    
    const response = await fetch(mediaUrl, {
      headers: { 
        'User-Agent': 'CineMind-API/1.0',
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Upstream API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    // ✅ Get stream variants - using the defined function
    let variants = getMediaVariants(data, 'stream');
    
    if (variants.length === 0) {
      variants = getMediaVariants(data, 'download');
    }
    
    if (variants.length === 0) {
      return new Response(JSON.stringify({
        success: false,
        error: 'No video sources available.',
        availableQualities: []
      }), {
        status: 404,
        headers: { 
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }
    
    const availableQualities = variants.map(v => v.quality);
    
    let selectedVariant = null;
    if (quality) {
      const normalizedQuality = quality.toLowerCase().replace(/p$/, '');
      selectedVariant = variants.find(v => 
        v.quality.toLowerCase().replace(/p$/, '') === normalizedQuality
      );
    }
    
    if (!selectedVariant) {
      selectedVariant = variants[0];
    }
    
    const rawUrl = selectedVariant.rawUrl || selectedVariant.url;
    if (!rawUrl) {
      return new Response(JSON.stringify({
        success: false,
        error: 'No valid URL.',
        availableQualities: availableQualities
      }), {
        status: 404,
        headers: { 
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }
    
    const title = data?.data?.title || 'Video';
    const filename = `${title}${season && episode ? ` S${season}E${episode}` : ''} - ${selectedVariant.quality}.mp4`;
    const streamUrl = proxyUrl(rawUrl);
    
    let sizeFormatted = null;
    if (selectedVariant.size) {
      const bytes = parseInt(selectedVariant.size);
      if (!isNaN(bytes) && bytes > 0) {
        sizeFormatted = `${(bytes / 1048576).toFixed(1)} MB`;
      }
    }
    
    return new Response(JSON.stringify({
      success: true,
      data: {
        streamUrl: streamUrl,
        quality: selectedVariant.quality,
        filename: filename,
        size: selectedVariant.size,
        sizeFormatted: sizeFormatted,
        format: selectedVariant.format || 'MP4',
        availableQualities: availableQualities
      }
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'Access-Control-Allow-Origin': '*'
      }
    });
    
  } catch (error) {
    console.error('Stream error:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message 
    }), {
      status: 500,
      headers: { 
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
}

