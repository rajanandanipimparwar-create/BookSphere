
require('dotenv').config();

const mongoose = require('mongoose');
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const User = require('./models/User');
const Session = require('./models/Session');
const Listing = require('./models/Listing');

const PORT = process.env.PORT || 3000;
const PUB = path.join(__dirname, 'public');
const DATA = path.join(__dirname, 'data');

fs.mkdirSync(path.join(DATA, 'cache'), { recursive: true });

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml'
};

const send = (res, code, obj) => {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
};

const body = req => new Promise((resolve, reject) => {
  let b = '';

  req.on('data', chunk => {
    b += chunk;

    if (b.length > 8e6) {
      reject(new Error('Request body too large'));
      req.destroy();
    }
  });

  req.on('end', () => {
    try {
      resolve(JSON.parse(b || '{}'));
    } catch {
      resolve({});
    }
  });

  req.on('error', reject);
});

const hash = (password, salt) =>
  crypto.scryptSync(String(password), salt, 32).toString('hex');

const auth = async req => {
  const token = (req.headers.authorization || '')
    .replace(/^Bearer\s+/, '');

  if (!token) return null;

  const session = await Session.findOne({ token });

  if (!session) return null;

  return User.findOne({ email: session.email });
};

const nice = n =>
  (n || 'Unknown').replace(/^(.+), (.+)$/, '$2 $1');

async function apiRoute(req, res, u, p) {
  const m = req.method;

  // REGISTER
  if (p === '/api/register' && m === 'POST') {
    const { name, email, password } = await body(req);

    if (
      !name ||
      !/^\S+@\S+$/.test(email || '') ||
      String(password || '').length < 6
    ) {
      return send(res, 400, {
        error: 'Enter your name, a valid email and a password of 6+ characters'
      });
    }

    const k = email.toLowerCase();

    const existingUser = await User.findOne({ email: k });

    if (existingUser) {
      return send(res, 400, {
        error: 'This email is already registered. Log in instead.'
      });
    }

    const salt = crypto.randomBytes(16).toString('hex');

    const newUser = await User.create({
      name: String(name).trim(),
      email: k,
      salt,
      hash: hash(password, salt),
      joined: Date.now(),
      state: null
    });

    const token = crypto.randomBytes(24).toString('hex');

    await Session.create({
      token,
      email: k
    });
  console.log('Session saved successfully for:', k);
    return send(res, 200, {
      token,
      name: newUser.name,
      email: newUser.email
    });
  }

  // LOGIN
  if (p === '/api/login' && m === 'POST') {
    const { email, password } = await body(req);
    const k = (email || '').toLowerCase();

    const us = await User.findOne({ email: k });

    if (!us || !password) {
      return send(res, 401, {
        error: 'Wrong email or password'
      });
    }

    const submittedHash = hash(password, us.salt);
    const expectedHash = Buffer.from(us.hash, 'hex');
    const actualHash = Buffer.from(submittedHash, 'hex');

    if (
      expectedHash.length !== actualHash.length ||
      !crypto.timingSafeEqual(actualHash, expectedHash)
    ) {
      return send(res, 401, {
        error: 'Wrong email or password'
      });
    }

    const token = crypto.randomBytes(24).toString('hex');

    await Session.create({
      token,
      email: k
    });
    
    console.log('Session saved successfully for:', k);
    return send(res, 200, {
      token,
      name: us.name,
      email: us.email
    });
  }

  // LOGOUT
  if (p === '/api/logout' && m === 'POST') {
    const token = (req.headers.authorization || '')
      .replace(/^Bearer\s+/, '');

    if (token) {
      await Session.deleteOne({ token });
    }

    return send(res, 200, { ok: true });
  }

  // BOOK CATALOG
  if (p === '/api/catalog') {
    const q = new URLSearchParams({ languages: 'en' });
    const s = (u.searchParams.get('search') || '').trim();
    const t = (u.searchParams.get('topic') || '').trim();

    if (s) q.set('search', s);
    if (t) q.set('topic', t);

    q.set('page', Math.max(1, +u.searchParams.get('page') || 1));

    const cacheKey = crypto
      .createHash('sha1')
      .update(q.toString())
      .digest('hex');

    const cf = path.join(
      DATA,
      'cache',
      'catalog-' + cacheKey + '.json'
    );

    try {
      if (
        fs.existsSync(cf) &&
        Date.now() - fs.statSync(cf).mtimeMs < 6 * 60 * 60 * 1000
      ) {
        return send(res, 200, JSON.parse(fs.readFileSync(cf, 'utf8')));
      }
    } catch {}

    try {
      const r = await fetch(
        'https://gutendex.com/books?' + q,
        { signal: AbortSignal.timeout(15000) }
      );

      if (!r.ok) throw new Error('Catalog unavailable');

      const d = await r.json();

      const out = {
        count: d.count,
        next: !!d.next,
        results: d.results.map(b => ({
          id: String(b.id),
          title: b.title,
          author: nice(b.authors[0] && b.authors[0].name),
          cover: b.formats['image/jpeg'] || '',
          topic: t || (b.bookshelves[0] || '').replace('Browsing: ', '')
        }))
      };

      try {
        fs.writeFileSync(cf, JSON.stringify(out));
      } catch {}

      return send(res, 200, out);
    } catch {
      let local = [];

      try {
        local = JSON.parse(
          fs.readFileSync(path.join(PUB, 'books.json'), 'utf8')
        );
      } catch {}

      const term = s.toLowerCase();

      const results = local
        .filter(b =>
          (!term ||
            `${b.title} ${b.author} ${b.topic}`
              .toLowerCase()
              .includes(term)) &&
          (!t ||
            String(b.topic || '')
              .toLowerCase()
              .includes(t.toLowerCase()))
        )
        .map(({ id, title, author, cover, topic }) => ({
          id,
          title,
          author,
          cover: cover || '',
          topic: topic || 'Free to read'
        }));

      return send(res, 200, {
        count: results.length,
        next: false,
        results,
        offline: true
      });
    }
  }

  // BOOK READER
  if (p.startsWith('/api/text/')) {
    const id = p.split('/').pop().replace(/\D/g, '');

    if (!id) {
      return send(res, 400, { error: 'Bad book id' });
    }

    const cf = path.join(DATA, 'cache', id + '.json');

    try {
      if (fs.existsSync(cf)) {
        return send(res, 200, JSON.parse(fs.readFileSync(cf, 'utf8')));
      }
    } catch {}

    let text = '';

    const urls = [
      `https://www.gutenberg.org/cache/epub/${id}/pg${id}.txt`,
      `https://www.gutenberg.org/files/${id}/${id}-0.txt`,
      `https://www.gutenberg.org/ebooks/${id}.txt.utf-8`
    ];

    for (const url of urls) {
      try {
        const r = await fetch(url);

        if (r.ok) {
          text = await r.text();
          break;
        }
      } catch {}
    }

    if (!text) {
      return send(res, 404, { error: 'Book text not found' });
    }

    text = text.replace(/^\uFEFF/, '').replace(/\r/g, '');

    const a = text.search(
      /\*\*\* ?START OF (THE|THIS) PROJECT GUTENBERG/
    );

    if (a >= 0) {
      text = text.slice(text.indexOf('\n', a) + 1);
    }

    const z = text.search(
      /\*\*\* ?END OF (THE|THIS) PROJECT GUTENBERG/
    );

    if (z >= 0) {
      text = text.slice(0, z);
    }

    let meta = {
      id,
      title: 'Book ' + id,
      author: '',
      cover: ''
    };

    try {
      const r = await fetch('https://gutendex.com/books/' + id);

      if (r.ok) {
        const b = await r.json();

        meta = {
          id,
          title: b.title,
          author: nice(b.authors && b.authors[0] && b.authors[0].name),
          cover: b.formats['image/jpeg'] || ''
        };
      }
    } catch {}

    const out = { meta, text };

    try {
      fs.writeFileSync(cf, JSON.stringify(out));
    } catch {}

    return send(res, 200, out);
  }

  // GET ALL LISTINGS
  if (p === '/api/listings' && m === 'GET') {
    const listings = await Listing.find()
      .sort({ t: -1, _id: -1 })
      .lean();

    return send(res, 200, listings);
  }

  // AUTHENTICATION FOR PRIVATE ROUTES
  const user = await auth(req);

  if (!user) {
    return send(res, 401, {
      error: 'Please log in first'
    });
  }

  // CURRENT USER
  if (p === '/api/me' && m === 'GET') {
    return send(res, 200, {
      name: user.name,
      email: user.email,
      state: user.state
    });
  }

  // SAVE USER STATE
  if (p === '/api/state' && m === 'PUT') {
    user.state = await body(req);
    await user.save();

    return send(res, 200, { ok: true });
  }

  // ADD A BOOK FOR SALE
  if (p === '/api/listings' && m === 'POST') {
    const b = await body(req);

    if (!b.title || !b.contact) {
      return send(res, 400, {
        error: 'Title and contact are required'
      });
    }

    await Listing.create({
      id: Date.now(),
      title: String(b.title).slice(0, 120),
      author: String(b.author || '').slice(0, 80),
      price: +b.price || 0,
      cond: String(b.cond || 'Good'),
      city: String(b.city || '').slice(0, 60),
      contact: String(b.contact).slice(0, 80),
      seller: user.name,
      owner: user.email,
      t: Date.now()
    });

    const listings = await Listing.find()
      .sort({ t: -1, _id: -1 })
      .lean();

    return send(res, 200, listings);
  }

  // DELETE YOUR OWN LISTING
  if (p.startsWith('/api/listings/') && m === 'DELETE') {
    const id = Number(p.split('/').pop());

    if (!Number.isFinite(id)) {
      return send(res, 400, { error: 'Invalid listing id' });
    }

    await Listing.deleteOne({
      id,
      owner: user.email
    });

    const listings = await Listing.find()
      .sort({ t: -1, _id: -1 })
      .lean();

    return send(res, 200, listings);
  }

  return send(res, 404, { error: 'Not found' });
}

async function startServer() {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is missing from .env');
  }

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('MongoDB Atlas connected successfully!');
console.log('Database name:', mongoose.connection.name);
console.log('Sessions collection:', Session.collection.name);

  console.log('MongoDB Atlas connected successfully!');

  http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://localhost');
    const p = decodeURIComponent(u.pathname);

    try {
      if (p.startsWith('/api/')) {
        await apiRoute(req, res, u, p);
        return;
      }

      let f = path.join(PUB, p === '/' ? 'index.html' : p);

      if (
        !f.startsWith(PUB) ||
        !fs.existsSync(f) ||
        fs.statSync(f).isDirectory()
      ) {
        f = path.join(PUB, 'index.html');
      }

      res.writeHead(200, {
        'Content-Type': MIME[path.extname(f)] || 'application/octet-stream'
      });

      fs.createReadStream(f).pipe(res);
    } catch (e) {
      console.error('Request error:', e);

      if (!res.headersSent) {
        send(res, 500, {
          error: 'Server error. Please try again.'
        });
      } else {
        res.end();
      }
    }
  }).listen(PORT, () => {
    console.log(`BookSphere running at http://localhost:${PORT}`);
  });
}

startServer().catch(error => {
  console.error('Failed to start BookSphere:', error.message);
  process.exit(1);
});

