// api/media.js - Using frontend logic
export const config = { runtime: 'edge' };
const CACHE_TTL = 300;

// Copy the same helper functions from stream.js
// (resolveField, unwrapMedia, unwrapMediaCollection, normalizeQuality, getMediaVariants, proxyUrl)

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
    
    // ✅ Get both stream and download variants using frontend logic
    const streamVariants = getMediaVariants(data, 'stream');
    const downloadVariants = getMediaVariants(data, 'download');
    
    const title = data?.data?.title || 'Video';
    
    // Format subtitle tracks (handle both array and object)
    let subtitles = [];
    const subtitlesData = data?.data?.subtitles?.data || data?.data?.subtitles;
    if (Array.isArray(subtitlesData)) {
      subtitles = subtitlesData;
    } else if (subtitlesData && typeof subtitlesData === 'object') {
      subtitles = Object.values(subtitlesData);
    }
    
    const subtitleTracks = subtitles.map(s => {
      const url = s?.url || s?.downloadUrl || s?.src;
      return {
        language: s?.language || s?.lan || s?.srclang || 'unknown',
        label: s?.label || s?.lanName || s?.name || s?.language || 'Subtitle',
        url: url ? `/api/proxy?url=${encodeURIComponent(url)}&name=${encodeURIComponent(`${title}${season && episode ? ` S${season}E${episode}` : ''} - ${s?.language || 'subtitle'}.srt`)}` : null
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
          available: streamVariants.length > 0,
          variants: streamVariants.map(v => ({
            quality: v.quality,
            url: proxyUrl(v.rawUrl || v.url),
            size: v.size,
            format: v.format || 'MP4',
            rawUrl: v.rawUrl || v.url
          }))
        },
        download: {
          available: downloadVariants.length > 0,
          variants: downloadVariants.map(v => ({
            quality: v.quality,
            url: proxyUrl(v.rawUrl || v.url),
            size: v.size,
            format: v.format || 'MP4',
            rawUrl: v.rawUrl || v.url
          }))
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
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}


