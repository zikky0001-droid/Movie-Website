// api/media.js - Get all media info (stream + download + subtitles)
export const config = { runtime: 'edge' };
const CACHE_TTL = 300; // 5 minutes

export default async function handler(request) {
  const url = new URL(request.url);
  const subjectId = url.searchParams.get('id');
  const season = url.searchParams.get('season');
  const episode = url.searchParams.get('episode');
  
  if (!subjectId) {
    return new Response(JSON.stringify({ 
      success: false,
      error: 'Missing subjectId parameter',
      usage: '/api/media?id=123&season=1&episode=1'
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
    let mediaUrl = `https://zstlab.cyou/api/media?subjectId=${subjectId}&apikey=${apiKey}`;
    
    if (season && episode) {
      mediaUrl += `&season=${season}&episode=${episode}`;
    }
    
    const response = await fetch(mediaUrl);
    const data = await response.json();
    
    // Extract all variants
    const downloadVariants = data?.data?.downloads?.data || [];
    const streamVariants = data?.data?.stream?.data || [];
    const subtitles = data?.data?.subtitles?.data || [];
    
    // Get title
    const title = data?.data?.title || 'Video';
    
    // Build clean response
    return new Response(JSON.stringify({
      success: true,
      data: {
        title: title,
        subjectId: subjectId,
        season: season || null,
        episode: episode || null,
        stream: {
          available: streamVariants.length > 0 || downloadVariants.length > 0,
          variants: (streamVariants.length > 0 ? streamVariants : downloadVariants).map(v => ({
            quality: v.quality || v.resolution || 'Unknown',
            url: `/api/proxy?url=${encodeURIComponent(v.url)}&name=${encodeURIComponent(`${title}${season && episode ? ` S${season}E${episode}` : ''} - ${v.quality || '1080p'}.mp4`)}`,
            size: v.size || null,
            format: v.format || 'MP4'
          }))
        },
        download: {
          available: downloadVariants.length > 0,
          variants: downloadVariants.map(v => ({
            quality: v.quality || v.resolution || 'Unknown',
            url: `/api/proxy?url=${encodeURIComponent(v.url)}&name=${encodeURIComponent(`${title}${season && episode ? ` S${season}E${episode}` : ''} - ${v.quality || '1080p'}.mp4`)}`,
            size: v.size || null,
            format: v.format || 'MP4'
          }))
        },
        subtitles: {
          available: subtitles.length > 0,
          tracks: subtitles.map(s => ({
            language: s.language || s.lan || 'Unknown',
            label: s.label || s.lanName || s.language || 'Unknown',
            url: `/api/proxy?url=${encodeURIComponent(s.url || s.downloadUrl)}&name=${encodeURIComponent(`${title}${season && episode ? ` S${season}E${episode}` : ''} - ${s.language || 'subtitle'}.srt`)}`
          }))
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
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
}

