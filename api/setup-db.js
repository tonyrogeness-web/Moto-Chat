const { pool, ensureTable } = require('./db');

module.exports = async (req, res) => {
  const secret = req.headers['x-setup-secret'] || req.query.secret;
  if (process.env.SETUP_SECRET && secret !== process.env.SETUP_SECRET)
    return res.status(403).json({ error: 'Não autorizado.' });

  try {
    await ensureTable();
    res.status(200).json({ success: true, message: 'Tabela entregas configurada com sucesso!' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
