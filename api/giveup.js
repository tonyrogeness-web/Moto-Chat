const { pool, ensureTable } = require('./db');
const { handleError } = require('./_utils');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  try { await ensureTable(); } catch (e) {
    return res.status(500).json({ error: 'Falha ao conectar ao banco: ' + e.message });
  }

  try {
    const { orderId, motivo } = req.body;
    if (!orderId || !motivo)
      return res.status(400).json({ error: 'Faltam dados obrigatórios' });

    const check = await pool.query('SELECT status, motoboy_nome, obs FROM entregas WHERE id = $1', [orderId]);
    if (!check.rows.length) return res.status(404).json({ error: 'Corrida não encontrada' });

    const order = check.rows[0];
    if (order.status !== 'aceito') {
      return res.status(400).json({ error: 'Apenas corridas aceitas podem ser canceladas pelo entregador.' });
    }

    const motoboy = order.motoboy_nome || 'Entregador';
    const cleanMotivo = String(motivo || '').trim();
    const msgDesistencia = `[Desistência de ${motoboy}]: ${cleanMotivo || 'Sem motivo informado'}`;
    const newObs = order.obs ? `${order.obs}\n${msgDesistencia}` : msgDesistencia;

    const { rows } = await pool.query(
      `UPDATE entregas SET status='cancelado_motoboy', obs=$1 WHERE id=$2 RETURNING *`,
      [newObs, orderId]
    );

    return res.status(200).json({ success: true, order: rows[0] });
  } catch (error) {
    handleError(res, error, 'Give up order');
  }
};
