const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

let pool;

if (process.env.DATABASE_URL) {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false // Neon Postgres requires SSL
    }
  });
} else {
  // Local Development Mock Database
  const isVercel = process.env.VERCEL || process.env.NOW_BUILDER;
  const mockDbPath = isVercel
    ? path.join('/tmp', 'mock-db.json')
    : path.join(__dirname, '..', 'mock-db.json');
    
  if (!fs.existsSync(mockDbPath)) {
    fs.writeFileSync(mockDbPath, JSON.stringify([], null, 2));
  }
  
  pool = {
    isMock: true,
    async connect() {
      return {
        async query(text, params) {
          return { rows: [] }; // Mock schema setup query
        },
        release() {}
      };
    },
    async query(text, params) {
      const dbData = JSON.parse(fs.readFileSync(mockDbPath, 'utf8'));
      
      // Simulating: SELECT * FROM entregas WHERE id = $1
      if (text.startsWith('SELECT * FROM entregas') || text.startsWith('SELECT status, motoboy_nome FROM entregas')) {
        let filtered = [...dbData];
        
        // Single order query
        if (text.includes('id = $1')) {
          const id = params[0];
          filtered = filtered.filter(x => String(x.id) === String(id));
          return { rows: filtered };
        }
        
        // Motoboy report query — keep 7 days so motoboys see their full week
        if (text.includes('motoboy_telefone = $1')) {
          const tel = params[0];
          const limitTime = Date.now() - 7 * 24 * 60 * 60 * 1000;
          filtered = filtered.filter(x => {
            const time = new Date(x.created_at || x.id).getTime();
            return String(x.motoboy_telefone) === String(tel) && 
                   ['aceito', 'concluido'].includes(x.status) &&
                   !isNaN(time) && time > limitTime;
          });
          return { rows: filtered };
        }
        
        // Active history: only last 24h for dispatcher view
        const limitTime = Date.now() - 24 * 60 * 60 * 1000;
        filtered = filtered.filter(x => {
          const time = new Date(x.created_at || x.id).getTime();
          return !isNaN(time) && time > limitTime;
        });
        
        // Status filter
        const statusIdx = text.indexOf('status = $');
        if (statusIdx !== -1) {
          const paramNum = parseInt(text.substr(statusIdx + 10, 1)) - 1;
          const status = params[paramNum];
          filtered = filtered.filter(x => x.status === status);
        }
        
        // Text search
        if (text.includes('ILIKE')) {
          const searchVal = params[params.length - 1].replace(/%/g, '').toLowerCase();
          filtered = filtered.filter(x => 
            (x.coleta_nome && x.coleta_nome.toLowerCase().includes(searchVal)) ||
            (x.obs && x.obs.toLowerCase().includes(searchVal)) ||
            JSON.stringify(x.destinos).toLowerCase().includes(searchVal)
          );
        }
        
        return { rows: filtered };
      }
      
      // Simulating: INSERT INTO entregas
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

      
      // Simulating: UPDATE entregas SET status = $1 ...
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
      
      // Simulating: UPDATE entregas SET status = 'concluido' ... (motoboy accept/conclude)
      if (text.includes("status = 'concluido'") && text.includes("motoboy_nome = $1")) {
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
      
      return { rows: [] };
    }
  };
}

module.exports = pool;
