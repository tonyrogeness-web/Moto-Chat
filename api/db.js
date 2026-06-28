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
    motoboy_pix VARCHAR(255),
    accepted_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE
  );
  ALTER TABLE entregas ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]';
  ALTER TABLE entregas ADD COLUMN IF NOT EXISTS motoboy_pix VARCHAR(255);
  CREATE INDEX IF NOT EXISTS idx_entregas_created_at ON entregas (created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_entregas_status ON entregas (status);
  CREATE INDEX IF NOT EXISTS idx_entregas_motoboy_telefone ON entregas (motoboy_telefone);
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

      // 1. SELECT by specific id
      if (text.includes('WHERE id = $1') && text.startsWith('SELECT')) {
        return { rows: db.filter(x => String(x.id) === String(params[0])) };
      }

      // 2. SELECT by motoboy_telefone
      if (text.includes('motoboy_telefone') && text.startsWith('SELECT')) {
        const cut = Date.now() - 30 * 24 * 3600000; // 30 days interval
        const rows = db.filter(x =>
          String(x.motoboy_telefone) === String(params[0]) &&
          ['aceito','concluido','cancelado','cancelado_loja','cancelado_motoboy'].includes(x.status) &&
          new Date(x.created_at||0).getTime() > cut
        ).sort((a,b) => new Date(b.created_at)-new Date(a.created_at)).slice(0,100);
        return { rows };
      }

      // 3. SELECT all (with filter parameters)
      if (text.startsWith('SELECT')) {
        let rows = [...db];
        let statusParam = null;
        let searchParam = null;

        for (const p of params) {
          if (typeof p === 'string' && p.startsWith('%') && p.endsWith('%')) {
            searchParam = p.slice(1, -1).toLowerCase();
          } else if (typeof p === 'string') {
            statusParam = p;
          }
        }

        const cut = Date.now() - 48 * 3600 * 1000; // 48 hours interval
        rows = rows.filter(x => new Date(x.created_at||0).getTime() > cut);

        if (statusParam) {
          rows = rows.filter(x => x.status === statusParam);
        }
        if (searchParam) {
          rows = rows.filter(x => {
            const coletaOk = String(x.coleta_nome).toLowerCase().includes(searchParam);
            const obsOk = String(x.obs || '').toLowerCase().includes(searchParam);
            const destinosOk = JSON.stringify(x.destinos || []).toLowerCase().includes(searchParam);
            return coletaOk || obsOk || destinosOk;
          });
        }

        rows.sort((a,b) => new Date(b.created_at)-new Date(a.created_at));
        return { rows: rows.slice(0,100) };
      }

      // 4. INSERT order
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

      // 5. UPDATE - accept order
      if (text.includes("status='aceito'") || text.includes("status = 'aceito'")) {
        const mn = params[0];
        const mt = params[1];
        const mp = params.length === 4 ? params[2] : null;
        const id = params.length === 4 ? params[3] : params[2];
        const r = db.find(x => String(x.id) === String(id));
        if (r && r.status === 'pendente') {
          Object.assign(r, {
            status: 'aceito',
            motoboy_nome: mn,
            motoboy_telefone: mt,
            motoboy_pix: mp,
            accepted_at: new Date().toISOString()
          });
          save();
          return { rows: [r] };
        }
        return { rows: [] };
      }

      // 6. UPDATE - auto-concluir single expired order
      if (text.includes("status='concluido'") && text.includes('WHERE id=$1')) {
        const [id] = params;
        const r = db.find(x => String(x.id) === String(id));
        if (r && r.status === 'aceito') {
          r.status = 'concluido';
          r.completed_at = new Date().toISOString();
          save();
          return { rows: [r] };
        }
        return { rows: [] };
      }

      // 7. UPDATE - auto-concluir all expired orders (interval)
      if (text.includes("status='concluido'") && text.includes("status='aceito'") && !text.includes('WHERE id')) {
        const cut = Date.now() - 80 * 60 * 1000;
        let count = 0;
        for (const r of db) {
          if (r.status === 'aceito' && r.accepted_at && new Date(r.accepted_at).getTime() < cut) {
            r.status = 'concluido';
            r.completed_at = new Date().toISOString();
            count++;
          }
        }
        if (count > 0) save();
        return { rows: [], rowCount: count };
      }

      // 8. UPDATE - cron auto-concluir previous days
      if (text.includes("status IN ('pendente', 'aceito')") && text.includes('America/Sao_Paulo')) {
        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        let count = 0;
        for (const r of db) {
          if (['pendente', 'aceito'].includes(r.status) && new Date(r.created_at).getTime() < startOfToday) {
            r.status = 'concluido';
            r.completed_at = r.completed_at || new Date().toISOString();
            count++;
          }
        }
        if (count > 0) save();
        return { rows: [], rowCount: count };
      }

      // 9. UPDATE - generic PUT status change
      if (text.includes('SET status = $1') && text.includes('id = $2')) {
        const [status, id] = params;
        const r = db.find(x => String(x.id) === String(id));
        if (r) {
          r.status = status;
          if (status === 'concluido') {
            r.completed_at = new Date().toISOString();
          } else if (status === 'pendente') {
            r.motoboy_nome = null;
            r.motoboy_telefone = null;
            r.accepted_at = null;
          }
          save();
          return { rows: [r] };
        }
        return { rows: [] };
      }

      // 10. UPDATE - legacy concluido by motoboy
      if (text.includes("status = 'concluido'") && text.includes('motoboy_nome')) {
        const [mn, mt, id] = params;
        const r = db.find(x => String(x.id) === String(id));
        if (r) {
          Object.assign(r, {
            status: 'concluido',
            motoboy_nome: mn,
            motoboy_telefone: mt,
            completed_at: new Date().toISOString()
          });
          save();
          return { rows: [r] };
        }
        return { rows: [] };
      }

      // 11. DELETE - single order by id
      if (text.includes('DELETE FROM entregas WHERE id')) {
        const i = db.findIndex(x => String(x.id) === String(params[0]));
        if (i !== -1) {
          const [d] = db.splice(i, 1);
          save();
          return { rows: [d] };
        }
        return { rows: [] };
      }

      // 12. DELETE - clear all orders
      if (text.includes('DELETE FROM entregas') && !text.includes('WHERE')) {
        const count = db.length;
        db = [];
        save();
        return { rows: [], rowCount: count };
      }

      // 13. DELETE - cron cleanup older than 7 days
      if (text.includes('DELETE FROM entregas WHERE created_at')) {
        const cut = new Date(Date.now() - 7 * 24 * 3600000).toISOString();
        const rem = db.filter(x => x.created_at >= cut);
        fs.writeFileSync(mockDbPath, JSON.stringify(rem, null, 2));
        return { rows: [], rowCount: db.length - rem.length };
      }

      return { rows: [] };
    },
    async connect() { return { query: this.query.bind(this), release(){} }; }
  };
  _tableEnsured = true;
}

module.exports = { pool, ensureTable };
