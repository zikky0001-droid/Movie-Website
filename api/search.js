// api/search.js - Search endpoint
export const config = { runtime: 'edge' };
const CACHE_TTL = 300; // 5 minutes

export default async function handler(request) {
  const url = new URL(request.url);
  const query = url.searchParams.get('q') || '';
  const type = url.searchParams.get('type') || 'ALL';
  const page = parseInt(url.searchParams.get('page')) || 1;
  const perPage = parseInt(url.searchParams.get('perPage')) || 24;
  
  if (!query || query.length < 2) {
    return new Response(JSON.stringify({ 
      success: false, 
      error: 'Query must be at least 2 characters',
      usage: '/api/search?q=matrix&type=movie&page=1'
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
      `https://zstlab.cyou/api/search?query=${encodeURIComponent(query)}&subjectType=${type}&page=${page}&perPage=${perPage}&apikey=${apiKey}`
    );
    
    const data = await response.json();
    const items = data?.data?.items || [];
    const totalCount = data?.data?.pager?.totalCount || 0;
    const totalPages = Math.ceil(totalCount / perPage);
    
    // ✅ Clean search results
    return new Response(JSON.stringify({
      success: true,
      data: {
        query: query,
        type: type,
        page: page,
        perPage: perPage,
        totalCount: totalCount,
        totalPages: totalPages,
        items: items.map(item => ({
          id: item.subjectId || item.id,
          title: item.title || item.name || 'Unknown',
          poster: item.cover || item.poster || null,
          rating: item.rating || 0,
          year: item.releaseDate || item.year || null,
          type: item.subjectType === 2 ? 'series' : 'movie',
          isSeries: item.subjectType === 2,
          description: item.description || item.overview || ''
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

