// api/stream.js - Complete Fixed Version
export const config = { runtime: 'edge' };

/**
 * Helper: Safely extract variants from API response
 * Handles both arrays and objects
 */
function extractVariants(data) {
  let variants = [];
  
  // Try downloads.data first
  const downloadsData = data?.data?.downloads?.data;
  const streamData = data?.data?.stream?.data;
  
  // If it's an array, use it directly
  if (Array.isArray(downloadsData)) {
    variants = downloadsData;
  } else if (downloadsData && typeof downloadsData === 'object') {
    // If it's an object, convert to array
    variants = Object.values(downloadsData);
  } else if (Array.isArray(streamData)) {
    variants = streamData;
  } else if (streamData && typeof streamData === 'object') {
    variants = Object.values(streamData);
  }
  
  // If still empty, try the top-level data
  if (variants.length === 0) {
    const topLevel = data?.data;
    if (topLevel && typeof topLevel === 'object') {
      for (const key of ['streams', 'downloads', 'videos', 'sources', 'files']) {
        if (topLevel[key]) {
          if (Array.isArray(topLevel[key])) {
            variants = topLevel[key];
          } else if (typeof topLevel[key] === 'object') {
            variants = Object.values(topLevel[key]);
          }
          if (variants.length > 0) break;
        }
      }
    }
  }
  
  return variants;
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

export default async function handler(request) {
  const url = new URL(request.url);
  const subjectId = url.searchParams.get('id');
  const detailPath = url.searchParams.get('detailPath');
  const quality = url.searchParams.get('quality') || '1080p';
  const season = url.searchParams.get('season');
  const episode = url.searchParams.get('episode');
  
  // Validate required parameters
  if (!subjectId) {
    return new Response(JSON.stringify({ 
      success: false,
      error: 'Missing subjectId parameter',
      usage: '/api/stream?id=123&detailPath=matrix&quality=1080p'
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
      usage: '/api/stream?id=123&detailPath=matrix&quality=1080p'
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
    let variants = extractVariants(data);
    
    // If no variants found, return helpful error
    if (variants.length === 0) {
      return new Response(JSON.stringify({ 
        success: false,
        error: 'No video sources found for this content. Try another title or quality.',
        availableQualities: []
      }), {
        status: 404,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }
    
    // Find the requested quality (case-insensitive, handle "p" suffix)
    const normalizedQuality = quality.toLowerCase().replace(/p$/, '');
    let variant = variants.find(v => {
      const vQuality = getVariantQuality(v).toLowerCase().replace(/p$/, '');
      return vQuality === normalizedQuality;
    });
    
    // If not found, try to find by index (if quality is a number like "1080")
    if (!variant) {
      const numQuality = parseInt(quality);
      if (!isNaN(numQuality)) {
        variant = variants.find(v => {
          const vNum = parseInt(getVariantQuality(v));
          return vNum === numQuality;
        });
      }
    }
    
    // If still not found, use the first one
    if (!variant) {
      variant = variants[0];
    }
    
    // ✅ Get the URL from the variant (handles link function)
    let variantUrl = getVariantUrl(variant);
    
    // If no URL found, try to find any variant with a URL
    if (!variantUrl) {
      for (const v of variants) {
        const url = getVariantUrl(v);
        if (url) {
          variantUrl = url;
          variant = v;
          break;
        }
      }
    }
    
    if (!variantUrl) {
      return new Response(JSON.stringify({ 
        success: false,
        error: 'No valid video URL found in the response. The upstream API may have changed.',
        availableQualities: variants.map(v => getVariantQuality(v))
      }), {
        status: 404,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    // Build response
    const title = data?.data?.title || 'Video';
    const selectedQuality = getVariantQuality(variant);
    const filename = `${title}${season && episode ? ` S${season}E${episode}` : ''} - ${selectedQuality}.mp4`;
    const proxyUrl = `/api/proxy?url=${encodeURIComponent(variantUrl)}&name=${encodeURIComponent(filename)}`;
    const size = getVariantSize(variant);
    const format = getVariantFormat(variant);
    
    return new Response(JSON.stringify({
      success: true,
      data: {
        streamUrl: proxyUrl,
        quality: selectedQuality,
        filename: filename,
        size: size,
        format: format,
        directUrl: variantUrl,
        availableQualities: variants.map(v => getVariantQuality(v))
      },
      metadata: {
        subjectId: subjectId,
        detailPath: detailPath,
        title: title,
        season: season || null,
        episode: episode || null
      }
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300',
        'Access-Control-Allow-Origin': '*'
      }
    });
    
  } catch (error) {
    console.error('Stream error:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message || 'Failed to fetch stream',
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


