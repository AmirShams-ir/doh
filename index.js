// SPDX-License-Identifier: 0BSD

// Tier-1 upstreams
const DOH_UPSTREAMS = [
  'https://security.cloudflare-dns.com/dns-query',
  'https://dns.google/dns-query',
  'https://dns.quad9.net/dns-query'
];

const DOH_JSON_UPSTREAMS = [
  'https://security.cloudflare-dns.com/dns-query',
  'https://dns.google/dns-query',
  'https://dns.quad9.net/dns-query'
];

const contype = 'application/dns-message';
const jsontype = 'application/dns-json';

const path = '';
const r404 = new Response(null, { status: 404 });

export default {
  async fetch(request, env, ctx) {
    return handleRequest(request);
  },
};

async function handleRequest(request) {

  const { method, headers, url } = request;
  const { searchParams, pathname } = new URL(url);

  if (!pathname.startsWith(path)) {
    return r404;
  }

  // ---------- DNS binary GET ----------
  if (method === 'GET' && searchParams.has('dns')) {

    const query = '?dns=' + searchParams.get('dns');

    return raceFetchBinary(query);

  }

  // ---------- DNS binary POST ----------
  if (method === 'POST' && headers.get('content-type') === contype) {

    const bodyStream = request.body;

    return raceFetchBinary('', bodyStream);

  }

  // ---------- DNS JSON ----------
  if (method === 'GET' && headers.get('accept') === jsontype) {

    const search = new URL(url).search;

    return raceFetchJSON(search);

  }

  return r404;
}


// racing for binary DNS
async function raceFetchBinary(search, bodyStream) {

  const controllers = DOH_UPSTREAMS.map(() => new AbortController());

  return new Promise((resolve, reject) => {

    let finished = false;

    DOH_UPSTREAMS.forEach((upstream, index) => {

      fetch(upstream + search, {
        method: bodyStream ? 'POST' : 'GET',
        headers: {
          'Accept': contype,
          'Content-Type': contype,
        },
        body: bodyStream,
        signal: controllers[index].signal,
        keepalive: true,
        cf: {
          cacheEverything: true,
          cacheTtl: 300,
        }
      })
      .then(response => {

        if (!finished && response.ok) {

          finished = true;

          // abort slower upstreams
          controllers.forEach((c, i) => {
            if (i !== index) c.abort();
          });

          resolve(response);
        }

      })
      .catch(() => {});

    });

    setTimeout(() => {
      if (!finished) reject('DNS upstream timeout');
    }, 2000);

  });

}


// racing for JSON DNS
async function raceFetchJSON(search) {

  const controllers = DOH_JSON_UPSTREAMS.map(() => new AbortController());

  return new Promise((resolve, reject) => {

    let finished = false;

    DOH_JSON_UPSTREAMS.forEach((upstream, index) => {

      fetch(upstream + search, {
        method: 'GET',
        headers: {
          'Accept': jsontype,
        },
        signal: controllers[index].signal,
        keepalive: true,
        cf: {
          cacheEverything: true,
          cacheTtl: 300,
        }
      })
      .then(response => {

        if (!finished && response.ok) {

          finished = true;

          controllers.forEach((c, i) => {
            if (i !== index) c.abort();
          });

          resolve(response);
        }

      })
      .catch(() => {});

    });

    setTimeout(() => {
      if (!finished) reject('DNS upstream timeout');
    }, 2000);

  });

}
