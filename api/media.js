// api/media.js - Complete Fixed Version
export const config = { runtime: 'edge' };
const CACHE_TTL = 300;

/**
 * Helper: Safely extract variants from API response
 * Handles both arrays and objects
 */
function extractVariants(data) {
  let downloadVariants = [];
  let streamVariants = [];
  
  // Try downloads.data
  const downloadsData = data?.data?.downloads?.data;
  const streamData = data?.data?.stream?.data;
  
  // Extract downloads
  if (Array.isArray(downloadsData)) {
    downloadVariants = downloadsData;
  } else if (downloadsData && typeof downloadsData === 'object') {
    downloadVariants = Object.values(downloadsData);
  }
  
  // Extract streams
  if (Array.isArray(streamData)) {
    streamVariants = streamData;
  } else if (streamData && typeof streamData === 'object') {
    streamVariants = Object.values(streamData);
  }
  
  // If still empty, try the top-level data
  if (downloadVariants.length === 0 && streamVariants.length === 0) {
    const topLevel = data?.data;
    if (topLevel && typeof topLevel === 'object') {
      for (const key of ['downloads', 'streams', 'videos', 'sources', 'files']) {
        if (topLevel[key]) {
          const value = topLevel[key];
          if (Array.isArray(value)) {
            if (key === 'downloads' || key === 'files') {
              downloadVariants = value;
            } else {
              streamVariants = value;
            }
          } else if (typeof value === 'object') {
            const arr = Object.values(value);
            if (key === 'downloads' || key === 'files') {
              downloadVariants = arr;
            } else {
              streamVariants = arr;
            }
          }
          if (downloadVariants.length > 0 || streamVariants.length > 0) break;
        }
      }
    }
  }
  
  return { downloadVariants, streamVariants };
}

/**
 * ✅ FIXED: Safely get URL from variant
 * Handles link as a function (ZSTLab returns link() sometimes)
 */
function getVariantUrl(variant) {
  if (!variant) return null;
  
  // Check if link is a function and call it
  if (variant.link && typeof variant.link === 'function') {
    try {
      const result = variant.link();
      if (typeof result === 'string' && result.startsWith('http')) {
        return result;
      }
    } catch (e) {
      console.error('Failed to call link function:', e);
    }
  }
  
  // Check if link is a string
  if (typeof variant.link === 'string') return variant.link;
  
  // Check if linkData exists (some responses have linkData)
  if (variant.linkData && typeof variant.linkData === 'string') return variant.linkData;
  
  // Fallback to other fields
  return variant?.url || 
         variant?.downloadUrl || 
         variant?.streamUrl || 
         variant?.href || 
         variant?.src || 
         variant?.linkUrl ||
         null;
}

/**
 * Helper: Safely get quality from variant
 */
function getVariantQuality(variant) {
  return variant?.quality || 
         variant?.resolution || 
         variant?.label || 
         variant?.name || 
         variant?.title ||
         'unknown';
}

/**
 * Helper: Safely get size from variant
 */
function getVariantSize(variant) {
  return variant?.size || 
         variant?.fileSize || 
         variant?.length || 
         null;
}

/**
 * Helper: Safely get format from variant
 */
function getVariantFormat(variant) {
  return variant?.format || 
         variant?.mimeType || 
         variant?.mime_type || 
         'MP4';
}

/**
 * Helper: Format variant for response
 */
function formatVariant(variant, title, season, episode, type = 'stream') {
  const variantUrl = getVariantUrl(variant);
  const quality = getVariantQuality(variant);
  const filename = `${title}${season && episode ? ` S${season}E${episode}` : ''} - ${quality}.${type === 'stream' ? 'mp4' : 'mp4'}`;
  
  return {
    quality: quality,
    url: variantUrl ? `/api/proxy?url=${encodeURIComponent(variantUrl)}&name=${encodeURIComponent(filename)}` : null,
    size: getVariantSize(variant),
    format: getVariantFormat(variant),
    rawUrl: variantUrl
  };
}

export default async function handler(request) {
  const url = new URL(request.url);
  const subjectId = url.searchParams.get('id');
  const detailPath = url.searchParams.get('detailPath');
  const season = url.searchParams.get('season');
  const episode = url.searchParams.get('episode');
  
  // Validate required parameters
  if (!subjectId) {
    return new Response(JSON.stringify({ 
      success: false,
      error: 'Missing subjectId parameter',
      usage: '/api/media?id=123&detailPath=matrix&season=1&episode=1'
    }), {
      status: 400,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }

  if (!detailPath) {
    return new Response(JSON.stringify({ 
      success: false,
      error: 'Missing detailPath parameter. Get it from /api/details first.',
      usage: '/api/media?id=123&detailPath=matrix&season=1&episode=1'
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
    
    // Build upstream URL
    let mediaUrl = `https://zstlab.cyou/api/media?subjectId=${subjectId}&detailPath=${encodeURIComponent(detailPath)}&apikey=${apiKey}`;
    
    if (season && episode) {
      mediaUrl += `&season=${season}&episode=${episode}`;
    }
    
    // Fetch from upstream
    const response = await fetch(mediaUrl, {
      headers: { 
        'User-Agent': 'CineMind-API/1.0',
        'Accept': 'application/json'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Upstream API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    // ✅ Extract variants safely
    const { downloadVariants, streamVariants } = extractVariants(data);
    
    // Get title
    const title = data?.data?.title || 'Video';
    
    // Extract subtitles (handle both array and object)
    let subtitles = [];
    const subtitlesData = data?.data?.subtitles?.data || data?.data?.subtitles;
    if (Array.isArray(subtitlesData)) {
      subtitles = subtitlesData;
    } else if (subtitlesData && typeof subtitlesData === 'object') {
      subtitles = Object.values(subtitlesData);
    }
    
    // Format responses
    const streams = streamVariants.map(v => formatVariant(v, title, season, episode, 'stream'));
    const downloads = downloadVariants.map(v => formatVariant(v, title, season, episode, 'download'));
    
    // If no stream variants but download variants exist, use downloads as streams
    const finalStreams = streams.length > 0 ? streams : downloads.map(v => ({
      ...v,
      quality: v.quality,
      url: v.url,
      size: v.size,
      format: v.format,
      rawUrl: v.rawUrl
    }));
    
    // Format subtitles
    const subtitleTracks = subtitles.map(s => {
      const subUrl = s?.url || s?.downloadUrl || s?.src || s?.link;
      return {
        language: s?.language || s?.lan || s?.srclang || 'unknown',
        label: s?.label || s?.lanName || s?.name || s?.language || 'Subtitle',
        url: subUrl ? 
          `/api/proxy?url=${encodeURIComponent(subUrl)}&name=${encodeURIComponent(`${title}${season && episode ? ` S${season}E${episode}` : ''} - ${s?.language || 'subtitle'}.srt`)}` : 
          null
      };
    }).filter(t => t.url);
    
    return new Response(JSON.stringify({
      success: true,
      data: {
        title: title,
        subjectId: subjectId,
        detailPath: detailPath,
        season: season || null,
        episode: episode || null,
        stream: {
          available: finalStreams.length > 0,
          variants: finalStreams
        },
        download: {
          available: downloads.length > 0,
          variants: downloads
        },
        subtitles: {
          available: subtitleTracks.length > 0,
          tracks: subtitleTracks
        }
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
    console.error('Media error:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message || 'Failed to fetch media info',
      timestamp: new Date().toISOString()
    }), {
      status: 500,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
}


