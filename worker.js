import acceptHandler from './api/accept.js';
import cronHandler from './api/cron-cleanup.js';
import motoboyReportHandler from './api/motoboy-report.js';
import ordersHandler from './api/orders.js';
import setupDbHandler from './api/setup-db.js';

// Setup environment variables in global process.env because the api/ files read from process.env
function populateEnv(env) {
  process.env = process.env || {};
  for (const [key, val] of Object.entries(env)) {
    if (typeof val === 'string') {
      process.env[key] = val;
    }
  }
}

export default {
  async fetch(request, env, ctx) {
    populateEnv(env);
    const url = new URL(request.url);
    const pathname = url.pathname;

    // Handle API routes
    if (pathname.startsWith('/api/')) {
      const apiName = pathname.substring(5); // e.g. "orders" from "/api/orders"
      
      let handler;
      if (apiName === 'orders') handler = ordersHandler;
      else if (apiName === 'accept') handler = acceptHandler;
      else if (apiName === 'motoboy-report') handler = motoboyReportHandler;
      else if (apiName === 'setup-db') handler = setupDbHandler;
      else if (apiName === 'cron-cleanup') handler = cronHandler;

      if (handler) {
        // Setup request headers mock
        const reqHeaders = {};
        for (const [k, v] of request.headers.entries()) {
          reqHeaders[k] = v;
        }

        // Setup query params mock
        const query = {};
        for (const [k, v] of url.searchParams.entries()) {
          query[k] = v;
        }

        // Read request body mock
        let body = {};
        if (request.method !== 'GET' && request.method !== 'HEAD') {
          try {
            const text = await request.text();
            if (text) {
              try {
                body = JSON.parse(text);
              } catch (_) {
                body = text;
              }
            }
          } catch (_) {}
        }

        const reqMock = {
          method: request.method,
          url: request.url,
          headers: reqHeaders,
          query: query,
          body: body
        };

        let responseStatus = 200;
        let responseHeaders = {
          'Content-Type': 'application/json; charset=utf-8',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': '*',
          'Access-Control-Allow-Methods': '*'
        };
        let responseBody = '';

        const resMock = {
          status(code) {
            responseStatus = code;
            return this;
          },
          setHeader(name, value) {
            responseHeaders[name.toLowerCase()] = value;
            return this;
          },
          json(data) {
            responseBody = JSON.stringify(data);
            responseHeaders['content-type'] = 'application/json; charset=utf-8';
          },
          send(data) {
            if (typeof data === 'object') {
              responseBody = JSON.stringify(data);
              responseHeaders['content-type'] = 'application/json; charset=utf-8';
            } else {
              responseBody = String(data);
              if (!responseHeaders['content-type']) {
                responseHeaders['content-type'] = 'text/plain; charset=utf-8';
              }
            }
          },
          end(data) {
            if (data) this.send(data);
          }
        };

        // Handle CORS Preflight
        if (request.method === 'OPTIONS') {
          return new Response(null, {
            status: 204,
            headers: responseHeaders
          });
        }

        try {
          await handler(reqMock, resMock);
          return new Response(responseBody, {
            status: responseStatus,
            headers: responseHeaders
          });
        } catch (err) {
          console.error(`Error executing api/${apiName}:`, err);
          return new Response(JSON.stringify({ error: err.message }), {
            status: 500,
            headers: responseHeaders
          });
        }
      } else {
        return new Response(JSON.stringify({ error: 'Endpoint não encontrado.' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json; charset=utf-8' }
        });
      }
    }

    // Serve static assets using Cloudflare Workers Assets
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response('Not Found', { status: 404 });
  }
};
