const axios = require('axios');

// Cria cliente Axios para uma chave específica (ou a chave padrão do .env)
function client(apiKey) {
  const key = apiKey || process.env.ASAAS_API_KEY;
  if (!key || key === 'sua_chave_api_asaas') throw new Error('ASAAS_API_KEY não configurada. Edite o arquivo .env');
  return axios.create({
    baseURL: process.env.ASAAS_BASE_URL || 'https://api.asaas.com/v3',
    headers: { 'access_token': key, 'Content-Type': 'application/json' },
    timeout: 15000,
  });
}

// Cache de clientes por conta (evita recriação)
const _clienteCache = new Map();

async function getCliente(customerId, apiKey) {
  const cacheKey = `${apiKey || 'default'}:${customerId}`;
  if (_clienteCache.has(cacheKey)) return _clienteCache.get(cacheKey);
  try {
    const { data } = await client(apiKey).get(`/customers/${customerId}`);
    _clienteCache.set(cacheKey, data);
    return data;
  } catch { return null; }
}

module.exports = {
  // Testa se a chave API é válida — retorna info básica da conta
  async testarChave(apiKey) {
    const { data } = await client(apiKey).get('/payments', { params: { limit: 1 } });
    return { ok: true, totalCount: data.totalCount };
  },

  // Lista pagamentos de uma conta (boletos, PIX, cartão — todos os tipos)
  async listarBoletos({ status, offset = 0, limit = 50, apiKey } = {}) {
    const params = { offset, limit };
    if (status) params.status = status;
    const { data } = await client(apiKey).get('/payments', { params });
    return data;
  },

  // Lista pagamentos com vencimento em uma data específica (YYYY-MM-DD)
  async listarPorData({ data: dueDate, billingTypes = ['BOLETO'], status, apiKey } = {}) {
    const todos = await Promise.all(billingTypes.map(tipo =>
      client(apiKey).get('/payments', { params: { billingType: tipo, dueDate, status, limit: 100 } })
        .then(r => r.data.data || [])
        .catch(() => [])
    ));
    return todos.flat();
  },

  // Lista clientes cadastrados
  async listarClientes({ limit = 100, offset = 0, apiKey } = {}) {
    const { data } = await client(apiKey).get('/customers', { params: { limit, offset } });
    return data;
  },

  // Busca um boleto específico
  async getBoleto(id, apiKey) {
    const { data } = await client(apiKey).get(`/payments/${id}`);
    return data;
  },

  // Retorna o código PIX copia e cola de uma cobrança
  async getPixQrCode(id, apiKey) {
    const { data } = await client(apiKey).get(`/payments/${id}/pixQrCode`);
    return data; // { encodedImage, payload, expirationDate }
  },

  // Dados do cliente (com cache por conta)
  async getCliente(customerId, apiKey) {
    return getCliente(customerId, apiKey);
  },

  // Baixa o PDF do boleto como Buffer para anexar no email
  async downloadPdf(bankSlipUrl) {
    if (!bankSlipUrl) return null;
    try {
      const resp = await axios.get(bankSlipUrl, { responseType: 'arraybuffer', timeout: 20000 });
      return Buffer.from(resp.data);
    } catch { return null; }
  },

  // Stats de uma conta (4 queries paralelas)
  async getStats(apiKey) {
    const [pendentes, pagos, vencidos, cancelados] = await Promise.all([
      client(apiKey).get('/payments', { params: { billingType: 'BOLETO', status: 'PENDING',   limit: 1 } }),
      client(apiKey).get('/payments', { params: { billingType: 'BOLETO', status: 'RECEIVED',  limit: 1 } }),
      client(apiKey).get('/payments', { params: { billingType: 'BOLETO', status: 'OVERDUE',   limit: 1 } }),
      client(apiKey).get('/payments', { params: { billingType: 'BOLETO', status: 'CANCELLED', limit: 1 } }),
    ]);
    return {
      pendentes:  pendentes.data.totalCount  || 0,
      pagos:      pagos.data.totalCount      || 0,
      vencidos:   vencidos.data.totalCount   || 0,
      cancelados: cancelados.data.totalCount || 0,
      total: (pendentes.data.totalCount  || 0) + (pagos.data.totalCount  || 0) +
             (vencidos.data.totalCount   || 0) + (cancelados.data.totalCount || 0),
    };
  },
};
