const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

let pool;

if (process.env.DATABASE_URL) {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false
    }
  });
} else {
  const isProduction = process.env.VERCEL || process.env.NODE_ENV === 'production';

  if (isProduction) {
    console.error('[FATAL] DATABASE_URL não definida em produção. Configure a variável de ambiente na Vercel.');
    throw new Error('DATABASE_URL é obrigatória em ambiente de produção.');
  }

  console.warn('[DEV] DATABASE_URL não definida. Usando mock database local (mock-db.json).');

  const mockDbPath = path.join(__dirname, '..', 'mock-db.json');

  if (!fs.existsSync(mockDbPath)) {
    fs.writeFileSync(mockDbPath, JSON.stringify([], null, 2));
  }

  pool = {
    isMock: true,
    async connect() {
      return {
        async query(text, params) {
          return { rows: [] };
        },
        release() {}
      };
    },
    async query(text, params) {
      const dbData = JSON.parse(fs.readFileSync(mockDbPath, 'utf8'));

      if (text.startsWith('SELECT * FROM entregas') || text.startsWith('SELECT status, motoboy_nome FROM entregas')) {
        let filtered = [...dbData];

        if (text.includes('id = $1')) {
          const id = params[0];
          filtered = filtered.filter(x => String(x.id) === String(id));
          return { rows: filtered };
        }

        if (text.includes('motoboy_telefone = $1')) {
          const tel = params[0];
          const limitTime = Date.now() - 7 * 24 * 60 * 60 * 1000;
          filtered = filtered.filter(x => {
            const time = new Date(x.created_at || x.id).getTime();
            return String(x.motoboy_telefone) === String(tel) &&
                   ['aceito', 'concluido'].includes(x.status) &&
                   !isNaN(time) && time > limitTime;
          });
          filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
          return { rows: filtered.slice(0, 100) };
        }

        const limitTime = Date.now() - 48 * 60 * 60 * 1000;
        filtered = filtered.filter(x => {
          const time = new Date(x.created_at || x.id).getTime();
          return !isNaN(time) && time > limitTime;
        });

        const statusIdx = text.indexOf('status = $');
        if (statusIdx !== -1) {
          const paramNum = parseInt(text.substr(statusIdx + 10, 1)) - 1;
          const status = params[paramNum];
          filtered = filtered.filter(x => x.status === status);
        }

        if (text.includes('ILIKE')) {
          const searchVal = params[params.length - 1].replace(/%/g, '').toLowerCase();
          filtered = filtered.filter(x =>
            (x.coleta_nome && x.coleta_nome.toLowerCase().includes(searchVal)) ||
            (x.obs && x.obs.toLowerCase().includes(searchVal)) ||
            JSON.stringify(x.destinos).toLowerCase().includes(searchVal)
          );
        }

        filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        return { rows: filtered.slice(0, 100) };
      }

      if (text.startsWith('INSERT INTO entregas')) {
        const [coleta_nome, coleta_endereco, coleta_complemento, destinosJson, valor_total, retorno, obs, tagsJson] = params;
        const newRecord = {
          id: Date.now(),
          created_at: new Date().toISOString(),
          coleta_nome,
          coleta_endereco,
          coleta_complemento,
          destinos: JSON.parse(destinosJson),
          valor_total: parseFloat(valor_total),
          retorno: !!retorno,
          obs,
          tags: tagsJson ? JSON.parse(tagsJson) : [],
          status: 'pendente',
          motoboy_nome: null,
          motoboy_telefone: null,
          accepted_at: null,
          completed_at: null
        };

        dbData.unshift(newRecord);
        fs.writeFileSync(mockDbPath, JSON.stringify(dbData, null, 2));
        return { rows: [newRecord] };
      }

      if (text.startsWith('UPDATE entregas SET status = $1')) {
        const [status, id] = params;
        const record = dbData.find(x => String(x.id) === String(id));
        if (record) {
          record.status = status;
          if (status === 'concluido') {
            record.completed_at = new Date().toISOString();
          }
          fs.writeFileSync(mockDbPath, JSON.stringify(dbData, null, 2));
          return { rows: [record] };
        }
        return { rows: [] };
      }

      if (text.includes("status = 'concluido'") && text.includes('motoboy_nome = $1')) {
        const [motoboy_nome, motoboy_telefone, orderId] = params;
        const record = dbData.find(x => String(x.id) === String(orderId));
        if (record) {
          record.status = 'concluido';
          record.motoboy_nome = motoboy_nome;
          record.motoboy_telefone = motoboy_telefone;
          record.accepted_at = record.accepted_at || new Date().toISOString();
          record.completed_at = new Date().toISOString();
          fs.writeFileSync(mockDbPath, JSON.stringify(dbData, null, 2));
          return { rows: [record] };
        }
        return { rows: [] };
      }

      if (text.includes('DELETE FROM entregas WHERE id = $1')) {
        const id = params[0];
        const idx = dbData.findIndex(x => String(x.id) === String(id));
        if (idx !== -1) {
          const [deleted] = dbData.splice(idx, 1);
          fs.writeFileSync(mockDbPath, JSON.stringify(dbData, null, 2));
          return { rows: [deleted] };
        }
        return { rows: [] };
      }

      if (text.includes("DELETE FROM entregas WHERE created_at <")) {
        const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
        const before = dbData.length;
        const remaining = dbData.filter(x => x.created_at >= cutoff);
        fs.writeFileSync(mockDbPath, JSON.stringify(remaining, null, 2));
        return { rows: [], rowCount: before - remaining.length };
      }

      return { rows: [] };
    }
  };
}

module.exports = pool;
