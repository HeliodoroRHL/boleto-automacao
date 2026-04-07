const nodemailer = require('nodemailer');
const fs         = require('fs');
const path       = require('path');
const db         = require('../db/database');
const smtpDb     = require('../db/smtp');
const cfgDb      = require('../db/config');

function criarTransporte() {
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
  if (cfg?.from) {
    return cfg.from.includes('@') ? cfg.from : `${cfg.from} <${user}>`;
  }
  return process.env.EMAIL_FROM || user;
}

function nomePdf(clienteNome, boletoId) {
  if (clienteNome) {
    const seguro = clienteNome
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9 ]/g, '')
      .trim().replace(/\s+/g, '_')
      .substring(0, 40);
    if (seguro) return `boleto_${seguro}.pdf`;
  }
  return `boleto-${boletoId || 'documento'}.pdf`;
}

// SVGs dos logos de cada rede/contato — embutidos como data URI base64
function svgUri(svgStr) {
  return 'data:image/svg+xml;base64,' + Buffer.from(svgStr).toString('base64');
}

const ICON_WHATSAPP = svgUri(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">` +
  `<rect width="24" height="24" rx="6" fill="#25d366"/>` +
  `<path fill="white" d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.16-.17.2-.35.22-.64.07-.3-.15-1.26-.46-2.39-1.48-.88-.79-1.48-1.76-1.65-2.06-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.03-.52-.07-.15-.67-1.61-.92-2.21-.24-.58-.49-.5-.67-.51-.17-.01-.37-.01-.57-.01-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48 0 1.46 1.07 2.88 1.21 3.07.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.69.63.71.23 1.36.2 1.87.12.57-.09 1.76-.72 2.01-1.41.25-.7.25-1.29.17-1.41-.07-.12-.27-.2-.57-.35z"/>` +
  `</svg>`
);

const ICON_EMAIL = svgUri(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">` +
  `<rect width="24" height="24" rx="6" fill="#2563eb"/>` +
  `<rect x="4" y="7" width="16" height="11" rx="1.5" fill="none" stroke="white" stroke-width="1.5"/>` +
  `<polyline points="4,7 12,14 20,7" fill="none" stroke="white" stroke-width="1.5"/>` +
  `</svg>`
);

const ICON_INSTAGRAM = svgUri(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">` +
  `<defs><linearGradient id="g" x1="0%" y1="100%" x2="100%" y2="0%">` +
  `<stop offset="0%" stop-color="#f09433"/><stop offset="33%" stop-color="#e6683c"/>` +
  `<stop offset="66%" stop-color="#dc2743"/><stop offset="100%" stop-color="#bc1888"/>` +
  `</linearGradient></defs>` +
  `<rect width="24" height="24" rx="6" fill="url(#g)"/>` +
  `<rect x="4" y="4" width="16" height="16" rx="5" fill="none" stroke="white" stroke-width="1.5"/>` +
  `<circle cx="12" cy="12" r="4" fill="none" stroke="white" stroke-width="1.5"/>` +
  `<circle cx="17" cy="7" r="1.2" fill="white"/>` +
  `</svg>`
);

const ICON_GLOBE = svgUri(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">` +
  `<rect width="24" height="24" rx="6" fill="#0ea5e9"/>` +
  `<circle cx="12" cy="12" r="6.5" fill="none" stroke="white" stroke-width="1.4"/>` +
  `<ellipse cx="12" cy="12" rx="3" ry="6.5" fill="none" stroke="white" stroke-width="1.4"/>` +
  `<line x1="5.5" y1="12" x2="18.5" y2="12" stroke="white" stroke-width="1.4"/>` +
  `<line x1="6.5" y1="8.5" x2="17.5" y2="8.5" stroke="white" stroke-width="1"/>` +
  `<line x1="6.5" y1="15.5" x2="17.5" y2="15.5" stroke="white" stroke-width="1"/>` +
  `</svg>`
);

function itemRodape(iconUri, texto) {
  return `<td style="padding:0 10px;white-space:nowrap;vertical-align:middle">` +
    `<img src="${iconUri}" width="18" height="18" alt="" border="0" ` +
    `style="display:inline-block;vertical-align:middle;width:18px;height:18px">` +
    `&nbsp;<span style="color:#475569;font-size:12px;vertical-align:middle;font-family:Arial,sans-serif">${texto}</span>` +
    `</td>`;
}

function montarRodape(cfg, nomePortal) {
  const tel  = (cfg.rodapeTelefone     || '').trim();
  const mail = (cfg.rodapeEmailContato || '').trim();
  const ig   = (cfg.rodapeInstagram    || '').trim().replace(/^@/, '');
  const site = (cfg.rodapeSite         || '').trim();

  const celulas = [];
  if (tel)  celulas.push(itemRodape(ICON_WHATSAPP,  tel.replace(/&/g,'&amp;')));
  if (mail) celulas.push(itemRodape(ICON_EMAIL,     mail.replace(/&/g,'&amp;')));
  if (ig)   celulas.push(itemRodape(ICON_INSTAGRAM, `@${ig.replace(/&/g,'&amp;')}`));
  if (site) celulas.push(itemRodape(ICON_GLOBE,     site.replace(/&/g,'&amp;')));

  if (celulas.length > 0) {
    return `
      <table cellpadding="0" cellspacing="0" width="100%">
        <tr><td align="center" style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:14px 20px">
          <table cellpadding="0" cellspacing="0"><tr>${celulas.join('')}</tr></table>
        </td></tr>
      </table>`;
  }

  // Fallback: texto livre ou padrão
  const txt = cfg.rodapeEmail
    ? cfg.rodapeEmail.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    : `${nomePortal} &nbsp;&middot;&nbsp; Este &eacute; um e-mail autom&aacute;tico, n&atilde;o responda.`;

  return `
    <table cellpadding="0" cellspacing="0" width="100%">
      <tr><td align="center" style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:14px 32px;color:#94a3b8;font-size:12px">
        ${txt}
      </td></tr>
    </table>`;
}

function montarHtmlEmail(body, nomePortal, logoDataUri, cfg) {
  const corpoHtml = body
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');

  // Logo: height fixo, width automático — compatível com Outlook/Gmail/Apple Mail
  const logoHtml = logoDataUri
    ? `<img src="${logoDataUri}" alt="${nomePortal}" height="70" width="auto" border="0"
         style="height:70px;width:auto;max-width:220px;display:block;margin:0 auto">`
    : `<span style="font-size:22px;font-weight:bold;color:#ffffff;font-family:Arial,sans-serif">${nomePortal}</span>`;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" bgcolor="#f1f5f9">
  <tr><td align="center" style="padding:32px 16px">
    <table width="600" cellpadding="0" cellspacing="0" bgcolor="#ffffff"
           style="max-width:600px;border-radius:12px;overflow:hidden">

      <!-- Cabeçalho -->
      <tr>
        <td align="center" bgcolor="#0f172a" style="padding:24px 32px;background:#0f172a">
          ${logoHtml}
        </td>
      </tr>

      <!-- Corpo -->
      <tr>
        <td style="padding:32px;color:#1e293b;font-size:15px;line-height:1.75;font-family:Arial,sans-serif">
          ${corpoHtml}
        </td>
      </tr>

      <!-- Rodapé -->
      <tr>
        <td>${montarRodape(cfg, nomePortal)}</td>
      </tr>

    </table>
  </td></tr>
</table>
</body>
</html>`;
}

module.exports = {
  async enviar({ to, cc, subject, body, pdfBuffer, boletoId, clienteNome, emailFromOverride }) {
    const transport  = criarTransporte();
    const from       = resolverFrom(emailFromOverride);
    const cfg        = cfgDb.get();
    const nomePortal = cfg.nomePortal || 'BoletoHub';

    // Logo como base64 data URI — funciona em todos os clientes (Gmail, Outlook, Apple Mail)
    let logoDataUri = null;
    const logoPath = cfg.logoPath
      ? path.join(__dirname, '../../public', cfg.logoPath)
      : null;
    if (logoPath && fs.existsSync(logoPath)) {
      const ext  = path.extname(logoPath).toLowerCase().replace('.', '');
      const mime = ext === 'svg' ? 'image/svg+xml' : `image/${ext === 'jpg' ? 'jpeg' : ext}`;
      logoDataUri = `data:${mime};base64,${fs.readFileSync(logoPath).toString('base64')}`;
    }

    const attachments = pdfBuffer ? [{
      filename:           nomePdf(clienteNome, boletoId),
      content:            pdfBuffer,
      contentType:        'application/pdf',
      contentDisposition: 'attachment',
    }] : [];

    await transport.sendMail({
      from,
      to,
      cc:           cc || undefined,
      subject,
      text:         body,
      html:         montarHtmlEmail(body, nomePortal, logoDataUri, cfg),
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
