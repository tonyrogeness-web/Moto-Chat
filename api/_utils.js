const handleError = (res, error, prefix) => {
  console.error(`${prefix} error:`, error);
  let errMsg = error.message || String(error);
  if (errMsg.includes('relation "entregas" does not exist')) {
    errMsg = 'A tabela "entregas" nao existe no banco de dados. Acesse o endpoint /api/setup-db para configurar as tabelas automaticamente.';
  }
  res.status(500).json({ error: errMsg });
};

module.exports = { handleError };
