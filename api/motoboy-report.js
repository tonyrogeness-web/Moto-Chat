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
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }
  
  try {
    const { telefone } = req.query;
    
    if (!telefone) {
      return res.status(400).json({ error: 'Número de telefone é obrigatório' });
    }
    
    // Fetch last 100 runs for this motoboy (either accepted or completed)
    // This allows them to see active runs as well as completed ones.
    // It avoids time-zone issues on midnight shifts.
    const queryText = `
      SELECT * FROM entregas 
      WHERE motoboy_telefone = $1 
        AND status IN ('aceito', 'concluido')
      ORDER BY created_at DESC 
      LIMIT 100
    `;
    
    const { rows } = await pool.query(queryText, [telefone]);
    res.status(200).json(rows);
  } catch (error) {
    handleError(res, error, 'Motoboy report');
  }
};
