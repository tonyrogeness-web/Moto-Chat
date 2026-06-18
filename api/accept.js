const pool = require('./db');
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
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  if (!checkApiKey(req, res)) return;

  try {
    const { orderId, motoboy_nome, motoboy_telefone } = req.body;

    if (!orderId || !motoboy_nome || !motoboy_telefone) {
      return res.status(400).json({ error: 'Faltam dados obrigatórios (orderId, motoboy_nome, motoboy_telefone)' });
    }

    const checkQuery = 'SELECT status, motoboy_nome FROM entregas WHERE id = $1';
    const checkRes = await pool.query(checkQuery, [orderId]);

    if (checkRes.rows.length === 0) {
      return res.status(404).json({ error: 'Corrida não encontrada' });
    }

    const order = checkRes.rows[0];
    if (order.status !== 'pendente') {
      return res.status(400).json({
        alreadyAccepted: true,
        message: `Esta corrida já foi concluída pelo motoboy ${order.motoboy_nome}!`
      });
    }

    const updateQuery = `
      UPDATE entregas
      SET status = 'concluido',
          motoboy_nome = $1,
          motoboy_telefone = $2,
          accepted_at = COALESCE(accepted_at, CURRENT_TIMESTAMP),
          completed_at = CURRENT_TIMESTAMP
      WHERE id = $3
      RETURNING *
    `;

    const { rows } = await pool.query(updateQuery, [motoboy_nome, motoboy_telefone, orderId]);
    res.status(200).json({ success: true, order: rows[0] });
  } catch (error) {
    handleError(res, error, 'Accept order');
  }
};
