const pool = require('./db');
const { handleError } = require('./_utils');

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

    const queryText = `
      SELECT * FROM entregas
      WHERE motoboy_telefone = $1
        AND status IN ('aceito', 'concluido')
        AND created_at > NOW() - INTERVAL '7 days'
      ORDER BY created_at DESC
      LIMIT 100
    `;

    const { rows } = await pool.query(queryText, [telefone]);
    res.status(200).json(rows);
  } catch (error) {
    handleError(res, error, 'Motoboy report');
  }
};
