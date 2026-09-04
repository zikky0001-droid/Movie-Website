// api/details.js - Add detailPath
export const config = { runtime: 'edge' };
const CACHE_TTL = 3600;

export default async function handler(request) {
  const url = new URL(request.url);
  const subjectId = url.searchParams.get('id');
  
  if (!subjectId) {
    return new Response(JSON.stringify({ 
      success: false,
      error: 'Missing subjectId parameter',
      usage: '/api/details?id=123'
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
    const response = await fetch(
      `https://zstlab.cyou/api/item-details?subjectId=${subjectId}&apikey=${apiKey}`
    );
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (!data?.data?.subject) {
      return new Response(JSON.stringify({ 
        success: false,
        error: 'Content not found'
      }), {
        status: 404,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    const subject = data.data.subject;
    
    // ✅ Extract detailPath from subject
    const detailPath = subject.detailPath || subject.slug || subject.path || subjectId;
    
    return new Response(JSON.stringify({
      success: true,
      data: {
        id: subjectId,
        detailPath: detailPath,  // ✅ ADD THIS!
        title: subject.title || subject.name || 'Unknown',
        originalTitle: subject.originalTitle || null,
        description: subject.description || subject.overview || '',
        poster: subject.cover || subject.poster || null,
        backdrop: subject.image || subject.backdrop || null,
        rating: subject.rating || subject.voteAverage || 0,
        year: subject.releaseDate || subject.year || null,
        genres: Array.isArray(subject.genre) ? subject.genre : 
                (subject.genre ? subject.genre.split(',').map(g => g.trim()) : []),
        duration: subject.duration || subject.runtime || 0,
        country: subject.countryName || subject.country || null,
        type: subject.subjectType === 2 ? 'series' : 'movie',
        isSeries: subject.subjectType === 2,
        seasons: (data.data.seasons || []).map(season => ({
          number: season.se || season.season || 1,
          title: season.title || season.name || `Season ${season.se || 1}`,
          episodeCount: season.episodes?.length || season.episodeList?.length || 0,
          episodes: (season.episodes || season.episodeList || []).map(ep => ({
            number: ep.episodeNumber || ep.epNum || 1,
            title: ep.title || ep.name || `Episode ${ep.episodeNumber || 1}`,
            description: ep.description || ep.overview || '',
            poster: ep.cover || ep.poster || null,
            duration: ep.duration || ep.runtime || 0
          }))
        })),
        cast: (data.data.stars || []).slice(0, 20).map(star => ({
          name: star.name,
          character: star.character || '',
          avatar: star.avatarUrl || null,
          role: star.staffType === 2 ? 'Director' : 
                 star.staffType === 3 ? 'Writer' : 'Cast'
        })),
        recommendations: (data.data.recommendations || []).slice(0, 10).map(rec => ({
          id: rec.subjectId || rec.id,
          title: rec.title || rec.name,
          poster: rec.cover || rec.poster,
          rating: rec.rating || 0,
          year: rec.releaseDate || rec.year,
          type: rec.subjectType === 2 ? 'series' : 'movie'
        }))
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
      error: error.message,
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


