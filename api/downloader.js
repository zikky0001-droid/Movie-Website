// api/downloader.js - Force download with proper headers
export const config = { runtime: 'edge' };

export default async function handler(request) {
  const url = new URL(request.url);
  const fileUrl = url.searchParams.get('url');
  const filename = url.searchParams.get('name') || 'download.mp4';
  const quality = url.searchParams.get('quality') || 'unknown';
  const title = url.searchParams.get('title') || 'Video';
  
  if (!fileUrl) {
    return new Response(JSON.stringify({ 
      success: false, 
      error: 'Missing url parameter' 
    }), {
      status: 400,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }

  try {
    // Fetch the file from the proxy
    const response = await fetch(fileUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'video/mp4, video/webm, */*'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.status}`);
    }

    // Get content type from response
    const contentType = response.headers.get('content-type') || 'video/mp4';
    const contentLength = response.headers.get('content-length');

    // Build response with download headers
    const headers = {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Range, Origin'
    };

    if (contentLength) {
      headers['Content-Length'] = contentLength;
    }

    // Return the file as a download
    return new Response(response.body, {
      status: 200,
      headers: headers
    });

  } catch (error) {
    console.error('Downloader error:', error);
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


