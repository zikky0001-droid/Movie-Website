// api/download.js - Using frontend logic
export const config = { runtime: 'edge' };

// Copy the same helper functions from stream.js
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
    
    // ✅ Get download variants using frontend logic
    let variants = getMediaVariants(data, 'download');
    
    // If no download variants, try stream variants
    if (variants.length === 0) {
      variants = getMediaVariants(data, 'stream');
    }
    
    if (variants.length === 0) {
      return new Response(JSON.stringify({
        success: false,
        error: 'No download sources available for this content.',
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
        error: 'No valid URL for this quality.',
        availableQualities: availableQualities
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }
    
    const title = data?.data?.title || 'Video';
    const filename = `${title}${season && episode ? ` S${season}E${episode}` : ''} - ${selectedVariant.quality}.mp4`;
    const downloadUrl = proxyUrl(rawUrl);
    
    return new Response(JSON.stringify({
      success: true,
      data: {
        downloadUrl: downloadUrl,
        quality: selectedVariant.quality,
        filename: filename,
        size: selectedVariant.size,
        format: selectedVariant.format || 'MP4',
        availableQualities: availableQualities
      },
      metadata: {
        subjectId: subjectId,
        detailPath: detailPath,
        title: title
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
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}


