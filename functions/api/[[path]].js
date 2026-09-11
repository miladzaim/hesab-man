const SUPABASE_ORIGIN = 'https://clvwnkpphjrrywdiefoe.supabase.co';

export async function onRequest(context) {
  const req = context.request;
  const incoming = new URL(req.url);
  const suffix = incoming.pathname.replace(/^\/api/, '') || '/';
  const target = new URL(SUPABASE_ORIGIN + suffix);
  target.search = incoming.search;

  const headers = new Headers();
  const allowedRequestHeaders = [
    'apikey','authorization','content-type','prefer','range','accept','accept-profile','content-profile','x-client-info'
  ];
  for (const name of allowedRequestHeaders) {
    const value = req.headers.get(name);
    if (value) headers.set(name, value);
  }

  const init = { method: req.method, headers, redirect: 'follow' };
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    init.body = await req.arrayBuffer();
  }

  try {
    const upstream = await fetch(target.toString(), init);
    const outHeaders = new Headers();
    const passResponseHeaders = [
      'content-type','content-range','range-unit','location','x-total-count','www-authenticate','cache-control'
    ];
    for (const name of passResponseHeaders) {
      const value = upstream.headers.get(name);
      if (value) outHeaders.set(name, value);
    }
    outHeaders.set('x-hesab-man-cloud-proxy', 'v11.4.0');
    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: outHeaders
    });
  } catch (error) {
    return Response.json({
      error: 'CLOUD_PROXY_FAILED',
      message: 'Cloud proxy could not reach the data server.'
    }, { status: 502 });
  }
}
