const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

// Parse .env file if it exists
try {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split(/\r?\n/).forEach(line => {
      line = line.trim();
      if (line && !line.startsWith('#')) {
        const firstEquals = line.indexOf('=');
        if (firstEquals !== -1) {
          const key = line.substring(0, firstEquals).trim();
          let val = line.substring(firstEquals + 1).trim();
          // Remove quotes if present
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.substring(1, val.length - 1);
          }
          process.env[key] = val;
        }
      }
    });
    console.log('Environment variables loaded from .env');
  }
} catch (err) {
  console.error('Error loading .env file:', err);
}

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  console.log(`[${new Date().toISOString().split('T')[1].slice(0, 8)}] ${req.method} ${pathname}`);

  // Handle API routes
  if (pathname.startsWith('/api/')) {
    const apiName = pathname.substring(5); // e.g. "orders" from "/api/orders"
    const apiPath = path.join(__dirname, 'api', `${apiName}.js`);

    if (fs.existsSync(apiPath)) {
      // Clear require cache for hot reloading in development
      delete require.cache[require.resolve(apiPath)];
      const apiHandler = require(apiPath);

      // Setup query params
      req.query = parsedUrl.query;

      // Read request body
      let bodyData = '';
      req.on('data', chunk => {
        bodyData += chunk;
      });
      req.on('end', async () => {
        if (bodyData) {
          try {
            req.body = JSON.parse(bodyData);
          } catch (e) {
            req.body = bodyData;
          }
        } else {
          req.body = {};
        }

        // Response helpers to mimic Express/Connect/Vercel APIs
        res.status = (statusCode) => {
          res.statusCode = statusCode;
          return res;
        };

        res.json = (jsonData) => {
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify(jsonData));
        };

        res.send = (data) => {
          if (typeof data === 'object') {
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify(data));
          } else {
            res.end(data);
          }
        };

        try {
          // Execute Vercel serverless function
          await apiHandler(req, res);
        } catch (err) {
          console.error(`API Error on ${pathname}:`, err);
          if (!res.writableEnded) {
            res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ error: 'Internal Server Error', message: err.message }));
          }
        }
      });
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'API endpoint not found' }));
    }
    return;
  }

  // Handle static files (fallback to index.html for SPA/PWA routes)
  let filePath = '';
  if (pathname === '/' || pathname === '/index.html') {
    filePath = path.join(__dirname, 'index.html');
  } else if (pathname === '/manifest.json') {
    filePath = path.join(__dirname, 'manifest.json');
  } else if (pathname === '/sw.js') {
    filePath = path.join(__dirname, 'sw.js');
  } else {
    // If request matches a file extension that exists, serve it
    const potentialPath = path.join(__dirname, pathname);
    if (fs.existsSync(potentialPath) && fs.statSync(potentialPath).isFile()) {
      filePath = potentialPath;
    } else {
      // Otherwise fallback to index.html (client-side routing)
      filePath = path.join(__dirname, 'index.html');
    }
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = mimeTypes[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`=====================================================================`);
  console.log(`Moto-Chat local server running at http://localhost:${PORT}`);
  console.log(`=====================================================================`);
});
