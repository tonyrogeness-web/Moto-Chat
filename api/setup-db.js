const pool = require('./db');

module.exports = async (req, res) => {
  const secret = req.headers['x-setup-secret'] || req.query.secret;
  if (!process.env.SETUP_SECRET || secret !== process.env.SETUP_SECRET) {
    return res.status(403).json({ error: 'Não autorizado. Informe o header x-setup-secret correto.' });
  }

  let client;
  try {
    client = await pool.connect();

    await client.query(`
      CREATE TABLE IF NOT EXISTS entregas (
        id SERIAL PRIMARY KEY,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        coleta_nome VARCHAR(255) NOT NULL,
        coleta_endereco TEXT,
        coleta_complemento TEXT,
        destinos JSONB NOT NULL,
        valor_total NUMERIC(10,2) NOT NULL,
        retorno BOOLEAN DEFAULT FALSE,
        obs TEXT,
        tags JSONB DEFAULT '[]',
        status VARCHAR(50) DEFAULT 'pendente',
        motoboy_nome VARCHAR(255),
        motoboy_telefone VARCHAR(50),
        accepted_at TIMESTAMP WITH TIME ZONE,
        completed_at TIMESTAMP WITH TIME ZONE
      );
      ALTER TABLE entregas ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]';
    `);

    res.status(200).json({ success: true, message: 'Tabela entregas configurada com sucesso!' });
  } catch (error) {
    console.error('Database setup error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      hint: error.message.includes('channel_binding')
        ? 'Remova channel_binding=require da DATABASE_URL ou use a connection string sem pooling.'
        : error.message.includes('SSL')
        ? 'Erro SSL. Verifique se a DATABASE_URL contém ?sslmode=require'
        : 'Verifique se DATABASE_URL está correta nas Environment Variables da Vercel.'
    });
  } finally {
    if (client) client.release();
  }
};
