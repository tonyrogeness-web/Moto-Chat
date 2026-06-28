const { pool, ensureTable } = require('./db');
const { handleError } = require('./_utils');

module.exports = async (req, res) => {
  const method = req.method;

  if (method === 'POST') {
    try { await ensureTable(); } catch (e) {
      return res.status(500).json({ error: 'Falha ao conectar ao banco: ' + e.message });
    }
    try {
      const { telefone } = req.body;
      if (!telefone) return res.status(400).json({ error: 'Telefone é obrigatório' });
      const cleanTel = String(telefone).replace(/\D/g, '');
      await pool.query(
        `UPDATE entregas SET motoboy_ocultado=TRUE WHERE motoboy_telefone=$1 AND COALESCE(motoboy_ocultado, FALSE) = FALSE`,
        [cleanTel]
      );
      return res.status(200).json({ success: true });
    } catch (error) { handleError(res, error, 'POST motoboy-report'); }

  } else if (method === 'GET') {
    try { await ensureTable(); } catch (e) {
      return res.status(500).json({ error: 'Falha ao conectar ao banco: ' + e.message });
    }
    try {
      const { telefone } = req.query;
      if (!telefone) return res.status(400).json({ error: 'Telefone é obrigatório' });

      const { rows } = await pool.query(
        `SELECT * FROM entregas WHERE motoboy_telefone=$1 AND status IN ('aceito','concluido','cancelado','cancelado_loja','cancelado_motoboy')
         AND COALESCE(motoboy_ocultado, FALSE) = FALSE
         AND created_at > NOW() - INTERVAL '30 days' ORDER BY created_at DESC LIMIT 100`,
        [telefone]
      );
      res.status(200).json(rows);
    } catch (error) { handleError(res, error, 'GET motoboy-report'); }
  } else {
    res.setHeader('Allow', ['GET', 'POST']);
    res.status(405).end(`Method ${method} Not Allowed`);
  }
};
