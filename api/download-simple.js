// api/download-simple.js - Simple download using stream URL
export const config = { runtime: 'edge' };

export default async function handler(request) {
  const url = new URL(request.url);
  const subjectId = url.searchParams.get('id');
  const detailPath = url.searchParams.get('detailPath');
  const quality = url.searchParams.get('quality') || '720p';
  
  if (!subjectId || !detailPath) {
    return new Response(JSON.stringify({ 
      success: false, 
      error: 'Missing id or detailPath' 
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }

  try {
    const apiKey = process.env.ZSTLAB_API_KEY || 'zst_A301yYAojr9gqZKmshjA9NmLVua0ghfYu5leVNxf';
    const mediaUrl = `https://zstlab.cyou/api/media?subjectId=${subjectId}&detailPath=${encodeURIComponent(detailPath)}&apikey=${apiKey}`;
    
    const response = await fetch(mediaUrl);
    if (!response.ok) {
      throw new Error(`Upstream API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    // Get stream variants (these work better than download variants)
    const variants = data?.data?.stream?.data || data?.data?.downloads?.data || [];
    
    // Find the requested quality
    const normalizedQuality = quality.toLowerCase().replace(/p$/, '');
    let variant = variants.find(v => {
      const vQuality = (v.quality || v.resolution || '').toLowerCase().replace(/p$/, '');
      return vQuality === normalizedQuality;
    }) || variants[0];
    
    if (!variant) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'No video found for this quality' 
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }
    
    const variantUrl = variant.url || variant.streamUrl || variant.downloadUrl;
    const title = data?.data?.title || 'Video';
    const filename = `${title} - ${variant.quality || quality}.mp4`;
    
    // ✅ Use the proxy directly with filename for download
    const proxyUrl = `/api/proxy?url=${encodeURIComponent(variantUrl)}&name=${encodeURIComponent(filename)}`;
    
    // Get size info
    let size = variant.size || null;
    if (size && typeof size === 'string') {
      const match = size.match(/^(\d+(?:\.\d+)?)\s*(B|KB|MB|GB)$/i);
      if (match) {
        const num = parseFloat(match[1]);
        const unit = match[2].toUpperCase();
        const multipliers = { B: 1, KB: 1024, MB: 1048576, GB: 1073741824 };
        size = Math.round(num * (multipliers[unit] || 1));
      }
    }
    
    return new Response(JSON.stringify({
      success: true,
      data: {
        downloadUrl: proxyUrl,
        quality: variant.quality || quality,
        filename: filename,
        size: size,
        sizeFormatted: size ? `${(size / 1048576).toFixed(1)} MB` : null,
        format: variant.format || 'MP4'
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

