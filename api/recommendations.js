// api/recommendations.js - Recommendations endpoint
export const config = { runtime: 'edge' };
const CACHE_TTL = 3600; // 1 hour

export default async function handler(request) {
  const url = new URL(request.url);
  const subjectId = url.searchParams.get('id');
  const page = parseInt(url.searchParams.get('page')) || 1;
  const perPage = parseInt(url.searchParams.get('perPage')) || 20;
  
  if (!subjectId) {
    return new Response(JSON.stringify({ 
      success: false,
      error: 'Missing subjectId parameter',
      usage: '/api/recommendations?id=123'
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
      `https://zstlab.cyou/api/recommendations?subjectId=${subjectId}&page=${page}&perPage=${perPage}&apikey=${apiKey}`
    );
    
    const data = await response.json();
    const items = data?.data?.items || [];
    
    return new Response(JSON.stringify({
      success: true,
      data: {
        subjectId: subjectId,
        page: page,
        perPage: perPage,
        total: items.length,
        items: items.map(item => ({
          id: item.subjectId || item.id,
          title: item.title || item.name || 'Unknown',
          poster: item.cover || item.poster || null,
          rating: item.rating || 0,
          year: item.releaseDate || item.year || null,
          type: item.subjectType === 2 ? 'series' : 'movie',
          isSeries: item.subjectType === 2
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

