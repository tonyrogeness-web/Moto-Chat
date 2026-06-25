const { pool, ensureTable } = require('./db');
const { handleError } = require('./_utils');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).end();

  try { await ensureTable(); } catch (e) {
    return res.status(500).json({ error: 'Falha ao conectar ao banco: ' + e.message });
  }

  try {
    const { telefone } = req.query;
    if (!telefone) return res.status(400).json({ error: 'Telefone é obrigatório' });

    const { rows } = await pool.query(
      `SELECT * FROM entregas WHERE motoboy_telefone=$1 AND status IN ('aceito','concluido')
       AND created_at > NOW() - INTERVAL '30 days' ORDER BY created_at DESC LIMIT 100`,
      [telefone]
    );
    res.status(200).json(rows);
  } catch (error) { handleError(res, error, 'Motoboy report'); }
};
