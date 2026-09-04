// api/stream.js - FIXED
export const config = { runtime: 'edge' };

export default async function handler(request) {
  const url = new URL(request.url);
  const subjectId = url.searchParams.get('id');
  const detailPath = url.searchParams.get('detailPath');  // ✅ ADD THIS
  const quality = url.searchParams.get('quality') || '1080p';
  const season = url.searchParams.get('season');
  const episode = url.searchParams.get('episode');
  
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

  // ✅ REQUIRED: detailPath is mandatory
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
    
    // ✅ BUILD URL WITH detailPath
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
    
    // Extract media variants
    const variants = data?.data?.downloads?.data || data?.data?.stream?.data || [];
    const variant = variants.find(v => v.quality === quality) || variants[0];
    
    if (!variant) {
      return new Response(JSON.stringify({ 
        success: false,
        error: `Quality "${quality}" not available. Available: ${variants.map(v => v.quality).join(', ')}`
      }), {
        status: 404,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    const title = data?.data?.title || 'Video';
    const filename = `${title}${season && episode ? ` S${season}E${episode}` : ''} - ${variant.quality || quality}.mp4`;
    const proxyUrl = `/api/proxy?url=${encodeURIComponent(variant.url)}&name=${encodeURIComponent(filename)}`;
    
    return new Response(JSON.stringify({
      success: true,
      data: {
        streamUrl: proxyUrl,
        quality: variant.quality || quality,
        filename: filename,
        size: variant.size || null,
        format: variant.format || 'MP4',
        directUrl: variant.url
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

