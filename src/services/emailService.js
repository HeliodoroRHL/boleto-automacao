const nodemailer = require('nodemailer');
const fs         = require('fs');
const path       = require('path');
const db         = require('../db/database');
const smtpDb     = require('../db/smtp');
const cfgDb      = require('../db/config');

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

// Monta HTML do email com layout e logo da empresa
function montarHtmlEmail(body, nomePortal, temLogo) {
  const corpoHtml = body
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');

  const logoHtml = temLogo
    ? `<img src="cid:logo_empresa" alt="${nomePortal}" style="max-height:60px;max-width:200px;object-fit:contain;display:block">`
    : `<span style="font-size:20px;font-weight:700;color:#2563eb">${nomePortal}</span>`;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 0">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)">

        <!-- Cabeçalho com logo -->
        <tr>
          <td style="background:#2563eb;padding:24px 32px;text-align:left">
            ${logoHtml}
          </td>
        </tr>

        <!-- Corpo -->
        <tr>
          <td style="padding:32px;color:#1e293b;font-size:15px;line-height:1.75">
            ${corpoHtml}
          </td>
        </tr>

        <!-- Rodapé -->
        <tr>
          <td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:16px 32px;text-align:center;color:#94a3b8;font-size:12px">
            ${nomePortal} &nbsp;·&nbsp; Este é um e-mail automático, não responda a esta mensagem.
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

module.exports = {
  async enviar({ to, cc, subject, body, pdfBuffer, boletoId, clienteNome, emailFromOverride }) {
    const transport = criarTransporte();
    const from      = resolverFrom(emailFromOverride);

    // Carrega config do portal para o layout do email
    const cfg        = cfgDb.get();
    const nomePortal = cfg.nomePortal || 'BoletoHub';
    const logoPath   = cfg.logoPath
      ? path.join(__dirname, '../../public', cfg.logoPath)
      : null;
    const temLogo = logoPath && fs.existsSync(logoPath);

    const attachments = [];

    // Logo embutida como CID (funciona mesmo sem domínio público)
    if (temLogo) {
      attachments.push({
        filename:    path.basename(logoPath),
        path:        logoPath,
        cid:         'logo_empresa',
      });
    }

    // PDF do boleto
    if (pdfBuffer) {
      attachments.push({
        filename:           nomePdf(clienteNome, boletoId),
        content:            pdfBuffer,
        contentType:        'application/pdf',
        contentDisposition: 'attachment',
      });
    }

    await transport.sendMail({
      from,
      to,
      cc:           cc || undefined,
      subject,
      text:         body,
      html:         montarHtmlEmail(body, nomePortal, temLogo),
      textEncoding: 'base64',
      attachments,
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
