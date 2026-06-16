const pool = require('./db');

module.exports = async (req, res) => {
  try {
    const client = await pool.connect();
    
    // Create Table Schema
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
      -- add tags column to existing tables that don't have it
      ALTER TABLE entregas ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]';
    `);
    
    client.release();
    res.status(200).json({ success: true, message: 'Tabela entregas configurada com sucesso!' });
  } catch (error) {
    console.error('Database setup error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};
