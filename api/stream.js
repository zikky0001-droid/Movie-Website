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
      success: false, 
      error: 'Missing subjectId or detailPath' 
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }

  try {
    const apiKey = process.env.ZSTLAB_API_KEY || 'zst_A301yYAojr9gqZKmshjA9NmLVua0ghfYu5leVNxf';
    
    let mediaUrl = `https://zstlab.cyou/api/media?subjectId=${subjectId}&detailPath=${encodeURIComponent(detailPath)}&apikey=${apiKey}`;
    if (season && episode) {
      mediaUrl += `&season=${season}&episode=${episode}`;
    }
    
    const response = await fetch(mediaUrl);
    if (!response.ok) {
      throw new Error(`Upstream API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    // ✅ Get stream variants - same as frontend
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
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
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
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
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
        'Cache-Control': 'public, max-age=60',
        'Access-Control-Allow-Origin': '*'
      }
    });
    
  } catch (error) {
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}

