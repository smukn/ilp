// Cloudflare Worker: ILP Video Access mit Token-Schutz
// Deploy via Cloudflare Dashboard → Workers & Pages → Create → "ilp-video-signer"
// R2 Binding: ILP_VIDEOS → ilp-videos Bucket
// Environment Variable: VIDEO_TOKEN → ein sicheres Passwort (z.B. "ilp-2026-praxis")

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.slice(1); // Remove leading /

    // CORS Headers für die App
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'Range',
    };

    // OPTIONS (preflight)
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // Token prüfen
    const token = url.searchParams.get('token');
    if (!token || token !== env.VIDEO_TOKEN) {
      return new Response('403 Forbidden – Kein gültiger Zugang.', {
        status: 403,
        headers: { 'Content-Type': 'text/plain', ...corsHeaders },
      });
    }

    // Datei aus R2 holen
    if (!path) {
      return new Response('404 Not Found', { status: 404, headers: corsHeaders });
    }

    const object = await env.ILP_VIDEOS.get(path, {
      range: request.headers.get('Range') ? { offset: 0 } : undefined,
    });

    if (!object) {
      return new Response('404 Not Found', { status: 404, headers: corsHeaders });
    }

    // Range-Request Support (für Video-Seeking)
    const rangeHeader = request.headers.get('Range');
    const headers = new Headers({
      'Content-Type': object.httpMetadata?.contentType || 'video/mp4',
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, max-age=3600',
      ...corsHeaders,
    });

    if (rangeHeader) {
      // Parse Range header
      const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
      if (match) {
        const start = parseInt(match[1]);
        const end = match[2] ? parseInt(match[2]) : object.size - 1;
        const chunk = await env.ILP_VIDEOS.get(path, {
          range: { offset: start, length: end - start + 1 },
        });
        headers.set('Content-Range', `bytes ${start}-${end}/${object.size}`);
        headers.set('Content-Length', end - start + 1);
        return new Response(chunk.body, { status: 206, headers });
      }
    }

    headers.set('Content-Length', object.size);
    return new Response(object.body, { headers });
  },
};
