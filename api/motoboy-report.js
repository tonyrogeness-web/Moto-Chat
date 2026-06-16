const pool = require('./db');

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
    
    // Fetch last 100 runs for this motoboy (either accepted or completed)
    // This allows them to see active runs as well as completed ones.
    // It avoids time-zone issues on midnight shifts.
    const queryText = `
      SELECT * FROM entregas 
      WHERE motoboy_telefone = $1 
        AND status IN ('aceito', 'concluido')
      ORDER BY created_at DESC 
      LIMIT 100
    `;
    
    const { rows } = await pool.query(queryText, [telefone]);
    res.status(200).json(rows);
  } catch (error) {
    console.error('Motoboy report error:', error);
    res.status(500).json({ error: error.message });
  }
};
