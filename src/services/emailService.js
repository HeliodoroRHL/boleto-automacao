const nodemailer = require('nodemailer');
const db         = require('../db/database');
const smtpDb     = require('../db/smtp');

function criarTransporte() {
  // Prioridade: config salva na UI > variáveis de ambiente
  const cfg = smtpDb.get();
  if (cfg && cfg.host && cfg.user && cfg.password) {
    return nodemailer.createTransport({
      host:   cfg.host,
      port:   cfg.port || 587,
      secure: cfg.secure || false,
      auth:   { user: cfg.user, pass: cfg.password },
      tls:    { rejectUnauthorized: false },
    });
  }
  // Fallback para .env
  return nodemailer.createTransport({
    host:   process.env.EMAIL_HOST,
    port:   parseInt(process.env.EMAIL_PORT || '587'),
    secure: process.env.EMAIL_SECURE === 'true',
    auth:   { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASSWORD },
    tls:    { rejectUnauthorized: false },
  });
}

function resolverFrom(emailFromOverride) {
  if (emailFromOverride) return emailFromOverride;
  const cfg = smtpDb.get();
  const user = cfg?.user || process.env.EMAIL_USER || '';
  // Se o campo "from" não contiver um endereço de email, monta "Nome <user>"
  if (cfg?.from) {
    return cfg.from.includes('@') ? cfg.from : `${cfg.from} <${user}>`;
  }
  return process.env.EMAIL_FROM || user;
}

// Gera nome do arquivo PDF com nome do cliente (sem caracteres especiais)
function nomePdf(clienteNome, boletoId) {
  if (clienteNome) {
    const seguro = clienteNome
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove acentos
      .replace(/[^a-zA-Z0-9 ]/g, '')                   // só letras, números e espaço
      .trim().replace(/\s+/g, '_')                      // espaços viram _
      .substring(0, 40);                                // máx 40 chars
    if (seguro) return `boleto_${seguro}.pdf`;
  }
  return `boleto-${boletoId || 'documento'}.pdf`;
}

function textoParaHtml(texto) {
  return `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;font-size:14px;color:#1e293b;line-height:1.7;max-width:600px;margin:0 auto;padding:24px">
${texto.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>')}
</body></html>`;
}

module.exports = {
  async enviar({ to, cc, subject, body, pdfBuffer, boletoId, clienteNome, emailFromOverride }) {
    const transport = criarTransporte();
    const from      = resolverFrom(emailFromOverride);

    await transport.sendMail({
      from,
      to,
      cc:          cc || undefined,
      subject,
      text:        body,
      html:        textoParaHtml(body),
      textEncoding: 'base64',
      attachments: pdfBuffer ? [{
        filename:    nomePdf(clienteNome, boletoId),
        content:     pdfBuffer,
        contentType: 'application/pdf',
        contentDisposition: 'attachment',
      }] : [],
    });

    db.addHistoricoEmail({ to, cc, subject, boletoId, clienteNome, comPdf: !!pdfBuffer, from, status: 'enviado' });
    return { enviado: true };
  },

  async testarConexao() {
    const transport = criarTransporte();
    await transport.verify();
    return true;
  },
};
