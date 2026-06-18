const { pool, ensureTable } = require('./db');
const { handleError } = require('./_utils');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  try { await ensureTable(); } catch (e) {
    return res.status(500).json({ error: 'Falha ao conectar ao banco: ' + e.message });
  }

  try {
    const { orderId, motoboy_nome, motoboy_telefone } = req.body;
    if (!orderId || !motoboy_nome || !motoboy_telefone)
      return res.status(400).json({ error: 'Faltam dados obrigatórios' });

    const check = await pool.query('SELECT status, motoboy_nome FROM entregas WHERE id = $1', [orderId]);
    if (!check.rows.length) return res.status(404).json({ error: 'Corrida não encontrada' });

    const order = check.rows[0];
    if (order.status !== 'pendente')
      return res.status(400).json({ alreadyAccepted: true, message: `Esta corrida já foi concluída pelo motoboy ${order.motoboy_nome}!` });

    const { rows } = await pool.query(
      `UPDATE entregas SET status='concluido', motoboy_nome=$1, motoboy_telefone=$2,
       accepted_at=COALESCE(accepted_at,CURRENT_TIMESTAMP), completed_at=CURRENT_TIMESTAMP
       WHERE id=$3 RETURNING *`,
      [motoboy_nome, motoboy_telefone, orderId]
    );
    res.status(200).json({ success: true, order: rows[0] });
  } catch (error) { handleError(res, error, 'Accept order'); }
};
