const pool = require('./db');

function handleError(res, error, prefix) {
  console.error(`${prefix} error:`, error);
  let errMsg = error.message || String(error);
  if (errMsg.includes('relation "entregas" does not exist')) {
    errMsg = 'A tabela "entregas" nao existe no banco de dados. Acesse o endpoint /api/setup-db no seu navegador para configurar as tabelas automaticamente.';
  }
  res.status(500).json({ error: errMsg });
}

module.exports = async (req, res) => {
  const method = req.method;
  
  if (method === 'GET') {
    try {
      const { status, search, id } = req.query;
      
      if (id) {
        const { rows } = await pool.query('SELECT * FROM entregas WHERE id = $1', [id]);
        return res.status(200).json(rows);
      }
      
      let queryText = 'SELECT * FROM entregas';
      let queryParams = [];
      let whereClauses = [];
      
      if (status && status !== 'todos') {
        whereClauses.push(`status = $${whereClauses.length + 1}`);
        queryParams.push(status);
      }
      
      if (search) {
        whereClauses.push(`(coleta_nome ILIKE $${whereClauses.length + 1} OR obs ILIKE $${whereClauses.length + 1} OR destinos::text ILIKE $${whereClauses.length + 1})`);
        queryParams.push(`%${search}%`);
      }
      
      if (whereClauses.length > 0) {
        queryText += ' WHERE ' + whereClauses.join(' AND ');
      }
      
      queryText += ' ORDER BY created_at DESC LIMIT 100';
      
      const { rows } = await pool.query(queryText, queryParams);
      res.status(200).json(rows);
    } catch (error) {
      handleError(res, error, 'GET orders');
    }
    
  } else if (method === 'POST') {
    try {
      const { coleta_nome, coleta_endereco, coleta_complemento, destinos, valor_total, retorno, obs } = req.body;
      
      if (!coleta_nome || !destinos || valor_total === undefined) {
        return res.status(400).json({ error: 'Faltam dados obrigatórios' });
      }
      
      const queryText = `
        INSERT INTO entregas (coleta_nome, coleta_endereco, coleta_complemento, destinos, valor_total, retorno, obs)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `;
      
      const { rows } = await pool.query(queryText, [
        coleta_nome,
        coleta_endereco || '',
        coleta_complemento || '',
        JSON.stringify(destinos),
        valor_total,
        retorno || false,
        obs || ''
      ]);
      
      res.status(201).json(rows[0]);
    } catch (error) {
      handleError(res, error, 'POST orders');
    }
    
  } else if (method === 'PUT') {
    try {
      const { id, status } = req.body;
      
      if (!id || !status) {
        return res.status(400).json({ error: 'ID e Status são obrigatórios' });
      }
      
      let queryText = 'UPDATE entregas SET status = $1';
      let params = [status, id];
      
      if (status === 'concluido') {
        queryText += ', completed_at = CURRENT_TIMESTAMP';
      }
      
      queryText += ' WHERE id = $2 RETURNING *';
      
      const { rows } = await pool.query(queryText, params);
      
      if (rows.length === 0) {
        return res.status(404).json({ error: 'Corrida não encontrada' });
      }
      
      res.status(200).json(rows[0]);
    } catch (error) {
      handleError(res, error, 'PUT orders');
    }
    
  } else {
    res.setHeader('Allow', ['GET', 'POST', 'PUT']);
    res.status(405).end(`Method ${method} Not Allowed`);
  }
};
