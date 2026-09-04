// api/download.js - Complete Fixed Version
export const config = { runtime: 'edge' };

/**
 * Helper: Safely extract variants from API response
 * Handles both arrays and objects
 */
function extractVariants(data) {
  let variants = [];
  
  // Try downloads.data first (prefer downloads for download endpoint)
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
      for (const key of ['downloads', 'streams', 'videos', 'sources', 'files']) {
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
 * Helper: Safely get URL from variant
 */
function getVariantUrl(variant) {
  return variant?.url || 
         variant?.downloadUrl || 
         variant?.streamUrl || 
         variant?.href || 
         variant?.src || 
         variant?.link || 
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
         'unknown';
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
      usage: '/api/download?id=123&detailPath=matrix&quality=1080p'
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
      usage: '/api/download?id=123&detailPath=matrix&quality=1080p'
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
        error: 'No download sources found for this content. Try another title.',
        availableQualities: []
      }), {
        status: 404,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }
    
    // Find the requested quality
    const normalizedQuality = quality.toLowerCase().replace(/p$/, '');
    const variant = variants.find(v => {
      const vQuality = getVariantQuality(v).toLowerCase().replace(/p$/, '');
      return vQuality === normalizedQuality;
    }) || variants[0];
    
    // Get the URL from the variant
    const variantUrl = getVariantUrl(variant);
    if (!variantUrl) {
      return new Response(JSON.stringify({ 
        success: false,
        error: 'Selected quality has no valid download URL.',
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
    
    return new Response(JSON.stringify({
      success: true,
      data: {
        downloadUrl: proxyUrl,
        quality: selectedQuality,
        filename: filename,
        size: variant?.size || null,
        format: variant?.format || 'MP4',
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
    console.error('Download error:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message || 'Failed to fetch download',
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

