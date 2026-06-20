const { pool, ensureTable } = require('./db');
const { handleError } = require('./_utils');

module.exports = async (req, res) => {
  // Vercel envia automaticamente o header Authorization: Bearer <CRON_SECRET>
  const authHeader = req.headers['authorization'];
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Não autorizado.' });
  }

  try { await ensureTable(); } catch (e) {
    return res.status(500).json({ error: 'Falha ao conectar ao banco: ' + e.message });
  }

  try {
    const { rowCount } = await pool.query(
      "DELETE FROM entregas WHERE created_at < NOW() - INTERVAL '7 days'"
    );
    console.log(`[CRON] Limpeza automática: ${rowCount || 0} corrida(s) removida(s).`);
    res.status(200).json({ success: true, removidas: rowCount || 0 });
  } catch (error) { handleError(res, error, 'Cron cleanup'); }
};
