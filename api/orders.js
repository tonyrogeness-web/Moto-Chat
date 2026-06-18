const { pool, ensureTable } = require('./db');
const { handleError } = require('./_utils');

function checkApiKey(req, res) {
  const key = req.headers['x-api-key'];
  if (process.env.API_SECRET_KEY && key !== process.env.API_SECRET_KEY) {
    res.status(401).json({ error: 'Não autorizado.' });
    return false;
  }
  return true;
}

module.exports = async (req, res) => {
  try { await ensureTable(); } catch (e) {
    return res.status(500).json({ error: 'Falha ao conectar ao banco de dados: ' + e.message });
  }

  const method = req.method;

  if (method === 'GET') {
    try {
      const { status, search, id } = req.query;

      if (id) {
        if (!/^\d+$/.test(String(id))) return res.status(200).json([]);
        // Auto-completa corridas aceitas há mais de 1h20 antes de retornar
        await pool.query(
          `UPDATE entregas SET status='concluido', completed_at=CURRENT_TIMESTAMP
           WHERE id=$1 AND status='aceito'
           AND accepted_at < NOW() - INTERVAL '80 minutes'`,
          [id]
        ).catch(() => {});
        const { rows } = await pool.query('SELECT * FROM entregas WHERE id = $1', [id]);
        return res.status(200).json(rows);
      }

      // Auto-completa em lote todas as corridas aceitas há mais de 1h20
      await pool.query(
        `UPDATE entregas SET status='concluido', completed_at=CURRENT_TIMESTAMP
         WHERE status='aceito' AND accepted_at < NOW() - INTERVAL '80 minutes'`
      ).catch(() => {});

      let queryText = 'SELECT * FROM entregas';
      let queryParams = [];
      let where = ["created_at > NOW() - INTERVAL '48 hours'"];

      if (status && status !== 'todos') {
        where.push(`status = $${queryParams.length + 1}`);
        queryParams.push(status);
      }
      if (search) {
        const i = queryParams.length + 1;
        where.push(`(coleta_nome ILIKE $${i} OR obs ILIKE $${i} OR destinos::text ILIKE $${i})`);
        queryParams.push(`%${search}%`);
      }

      queryText += ' WHERE ' + where.join(' AND ') + ' ORDER BY created_at DESC LIMIT 100';
      const { rows } = await pool.query(queryText, queryParams);
      res.status(200).json(rows);
    } catch (error) { handleError(res, error, 'GET orders'); }

  } else if (method === 'POST') {
    if (!checkApiKey(req, res)) return;
    try {
      const { coleta_nome, coleta_endereco, coleta_complemento, destinos, valor_total, retorno, obs, tags } = req.body;
      if (!coleta_nome || !destinos || valor_total === undefined)
        return res.status(400).json({ error: 'Faltam dados obrigatórios' });

      const { rows } = await pool.query(
        `INSERT INTO entregas (coleta_nome,coleta_endereco,coleta_complemento,destinos,valor_total,retorno,obs,tags)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [coleta_nome, coleta_endereco||'', coleta_complemento||'', JSON.stringify(destinos),
         valor_total, retorno||false, obs||'', JSON.stringify(tags||[])]
      );
      res.status(201).json(rows[0]);
    } catch (error) { handleError(res, error, 'POST orders'); }

  } else if (method === 'PUT') {
    if (!checkApiKey(req, res)) return;
    try {
      const { id, status } = req.body;
      if (!id || !status) return res.status(400).json({ error: 'ID e status são obrigatórios' });

      let q = 'UPDATE entregas SET status = $1';
      let p = [status, id];
      if (status === 'concluido') q += ', completed_at = CURRENT_TIMESTAMP';
      q += ' WHERE id = $2 RETURNING *';

      const { rows } = await pool.query(q, p);
      if (!rows.length) return res.status(404).json({ error: 'Corrida não encontrada' });
      res.status(200).json(rows[0]);
    } catch (error) { handleError(res, error, 'PUT orders'); }

  } else if (method === 'DELETE') {
    if (!checkApiKey(req, res)) return;
    try {
      const { id, clearAll } = req.body;
      if (clearAll) {
        await pool.query("DELETE FROM entregas WHERE created_at < NOW() - INTERVAL '48 hours'");
        return res.status(200).json({ success: true });
      }
      if (!id) return res.status(400).json({ error: 'ID é obrigatório' });
      const { rows } = await pool.query('DELETE FROM entregas WHERE id = $1 RETURNING *', [id]);
      if (!rows.length) return res.status(404).json({ error: 'Corrida não encontrada' });
      res.status(200).json({ success: true, deleted: rows[0] });
    } catch (error) { handleError(res, error, 'DELETE order'); }

  } else {
    res.setHeader('Allow', ['GET','POST','PUT','DELETE']);
    res.status(405).end(`Method ${method} Not Allowed`);
  }
};
