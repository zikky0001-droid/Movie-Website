// api/home.js - Homepage endpoint
export const config = { runtime: 'edge' };
const CACHE_TTL = 600; // 10 minutes

export default async function handler(request) {
  try {
    const apiKey = process.env.ZSTLAB_API_KEY || 'zst_A301yYAojr9gqZKmshjA9NmLVua0ghfYu5leVNxf';
    
    // Fetch all data in parallel
    const [homepage, hot, trending] = await Promise.all([
      fetch(`https://zstlab.cyou/api/homepage?apikey=${apiKey}`),
      fetch(`https://zstlab.cyou/api/hot-movies-series?apikey=${apiKey}`),
      fetch(`https://zstlab.cyou/api/trending?page=0&perPage=18&apikey=${apiKey}`)
    ]);
    
    const homepageData = await homepage.json();
    const hotData = await hot.json();
    const trendingData = await trending.json();
    
    // ✅ Structured homepage response
    return new Response(JSON.stringify({
      success: true,
      data: {
        banner: (homepageData?.data?.banner?.items || []).map(item => ({
          id: item.subjectId || item.id,
          title: item.title || item.name,
          description: item.description || item.overview || '',
          backdrop: item.image || item.backdrop || null,
          poster: item.cover || item.poster || null,
          rating: item.rating || 0,
          year: item.releaseDate || item.year || null,
          type: item.subjectType === 2 ? 'series' : 'movie'
        })),
        hotMovies: (hotData?.data?.movie || []).map(item => ({
          id: item.subjectId || item.id,
          title: item.title || item.name,
          poster: item.cover || item.poster,
          rating: item.rating || 0,
          year: item.releaseDate || item.year
        })),
        hotSeries: (hotData?.data?.series || []).map(item => ({
          id: item.subjectId || item.id,
          title: item.title || item.name,
          poster: item.cover || item.poster,
          rating: item.rating || 0,
          year: item.releaseDate || item.year
        })),
        trending: (trendingData?.data?.subjectList || []).map(item => ({
          id: item.subjectId || item.id,
          title: item.title || item.name,
          poster: item.cover || item.poster,
          rating: item.rating || 0,
          year: item.releaseDate || item.year,
          type: item.subjectType === 2 ? 'series' : 'movie'
        })),
        sections: (homepageData?.data?.operatingList || []).map(section => ({
          title: section.title || section.name || 'Featured',
          type: section.type || 'SECTION',
          items: (section.banner?.items || section.subjects || []).map(item => ({
            id: item.subjectId || item.id,
            title: item.title || item.name,
            poster: item.cover || item.poster,
            rating: item.rating || 0,
            year: item.releaseDate || item.year
          }))
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

