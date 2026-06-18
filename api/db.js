const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

let pool;
let _tableEnsured = false;

const CREATE_SQL = `
  CREATE TABLE IF NOT EXISTS entregas (
    id SERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    coleta_nome VARCHAR(255) NOT NULL,
    coleta_endereco TEXT,
    coleta_complemento TEXT,
    destinos JSONB NOT NULL,
    valor_total NUMERIC(10,2) NOT NULL,
    retorno BOOLEAN DEFAULT FALSE,
    obs TEXT,
    tags JSONB DEFAULT '[]',
    status VARCHAR(50) DEFAULT 'pendente',
    motoboy_nome VARCHAR(255),
    motoboy_telefone VARCHAR(50),
    accepted_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE
  );
  ALTER TABLE entregas ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]';
`;

async function ensureTable() {
  if (_tableEnsured) return;
  try {
    await pool.query(CREATE_SQL);
    _tableEnsured = true;
    console.log('[DB] Tabela entregas verificada/criada com sucesso.');
  } catch (e) {
    console.error('[DB] Falha ao criar tabela:', e.message);
    throw e;
  }
}

if (process.env.DATABASE_URL) {
  // Remove channel_binding que a lib pg não suporta (presente no pooling do Neon)
  const connStr = process.env.DATABASE_URL
    .replace(/[?&]channel_binding=[^&]*/g, '')
    .replace(/\?$/, '')
    .replace(/&$/, '');

  pool = new Pool({
    connectionString: connStr,
    ssl: { rejectUnauthorized: false },
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

} else {
  const isProduction = process.env.VERCEL || process.env.NODE_ENV === 'production';

  if (isProduction) {
    throw new Error('DATABASE_URL não configurada. Acesse Vercel > Settings > Environment Variables e adicione DATABASE_URL.');
  }

  console.warn('[DEV] DATABASE_URL ausente — usando mock local em /tmp/mock-db.json');

  const mockDbPath = path.join('/tmp', 'mock-db.json');
  if (!fs.existsSync(mockDbPath)) fs.writeFileSync(mockDbPath, '[]');

  pool = {
    isMock: true,
    async query(text, params = []) {
      let db = [];
      try { db = JSON.parse(fs.readFileSync(mockDbPath, 'utf8')); } catch(e) {}
      const save = () => fs.writeFileSync(mockDbPath, JSON.stringify(db, null, 2));

      if (text.includes('CREATE TABLE') || text.includes('ALTER TABLE')) return { rows: [] };

      if (text.includes('WHERE id = $1') && text.startsWith('SELECT')) {
        return { rows: db.filter(x => String(x.id) === String(params[0])) };
      }
      if (text.includes('motoboy_telefone = $1')) {
        const cut = Date.now() - 7 * 24 * 3600000;
        const rows = db.filter(x =>
          String(x.motoboy_telefone) === String(params[0]) &&
          ['aceito','concluido'].includes(x.status) &&
          new Date(x.created_at||0).getTime() > cut
        ).sort((a,b) => new Date(b.created_at)-new Date(a.created_at)).slice(0,100);
        return { rows };
      }
      if (text.startsWith('SELECT')) {
        const cut = Date.now() - 48 * 3600000;
        let rows = db.filter(x => new Date(x.created_at||0).getTime() > cut);
        rows.sort((a,b) => new Date(b.created_at)-new Date(a.created_at));
        return { rows: rows.slice(0,100) };
      }
      if (text.startsWith('INSERT')) {
        const [cn,ce,cc,dj,vt,rt,ob,tj] = params;
        const rec = {
          id: Date.now(), created_at: new Date().toISOString(),
          coleta_nome: cn, coleta_endereco: ce, coleta_complemento: cc,
          destinos: JSON.parse(dj), valor_total: parseFloat(vt),
          retorno: !!rt, obs: ob, tags: tj ? JSON.parse(tj) : [],
          status: 'pendente', motoboy_nome: null, motoboy_telefone: null,
          accepted_at: null, completed_at: null
        };
        db.unshift(rec); save();
        return { rows: [rec] };
      }
      if (text.includes("status = 'concluido'") && text.includes('motoboy_nome')) {
        const [mn, mt, id] = params;
        const r = db.find(x => String(x.id) === String(id));
        if (r) { Object.assign(r, { status:'concluido', motoboy_nome:mn, motoboy_telefone:mt, completed_at:new Date().toISOString() }); save(); return { rows:[r] }; }
        return { rows:[] };
      }
      if (text.startsWith('UPDATE')) {
        const [status, id] = params;
        const r = db.find(x => String(x.id) === String(id));
        if (r) { r.status=status; if(status==='concluido') r.completed_at=new Date().toISOString(); save(); return { rows:[r] }; }
        return { rows:[] };
      }
      if (text.includes('DELETE FROM entregas WHERE id')) {
        const i = db.findIndex(x => String(x.id) === String(params[0]));
        if (i!==-1) { const [d]=db.splice(i,1); save(); return { rows:[d] }; }
        return { rows:[] };
      }
      if (text.includes('DELETE FROM entregas WHERE created_at')) {
        const cut = new Date(Date.now()-48*3600000).toISOString();
        const rem = db.filter(x => x.created_at >= cut);
        fs.writeFileSync(mockDbPath, JSON.stringify(rem, null, 2));
        return { rows:[], rowCount: db.length - rem.length };
      }
      return { rows:[] };
    },
    async connect() { return { query: this.query.bind(this), release(){} }; }
  };
  _tableEnsured = true;
}

module.exports = { pool, ensureTable };
