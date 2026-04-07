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

// Ícones SVG inline — Gmail, Apple Mail, Yahoo, Outlook.com suportam
// Outlook desktop (Windows): fallback via <!--[if mso]> com texto
function mkIcone(svgPath, fallbackChar) {
  return (
    `<!--[if !mso]><!-->` +
    `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22" ` +
    `style="display:inline-block;vertical-align:middle">${svgPath}</svg>` +
    `<!--<![endif]-->` +
    `<!--[if mso]><span style="font-size:14px;color:#333">${fallbackChar}</span><![endif]-->`
  );
}

const ICONES = {
  // Envelope outline (branco, traços diagonais)
  email: mkIcone(
    `<rect x="1" y="3" width="20" height="16" rx="2.5" fill="none" stroke="#222" stroke-width="1.6"/>` +
    `<polyline points="1,3 11,12 21,3" fill="none" stroke="#222" stroke-width="1.6" stroke-linejoin="round"/>`,
    '✉'
  ),

  // Instagram — círculo preto, câmera branca dentro
  instagram: mkIcone(
    `<circle cx="11" cy="11" r="11" fill="#111"/>` +
    `<rect x="5.5" y="5.5" width="11" height="11" rx="3.2" fill="none" stroke="white" stroke-width="1.4"/>` +
    `<circle cx="11" cy="11" r="3.2" fill="none" stroke="white" stroke-width="1.4"/>` +
    `<circle cx="15.2" cy="6.8" r="1" fill="white"/>`,
    '📷'
  ),

  // Globo — círculo preto, grade branca
  globe: mkIcone(
    `<circle cx="11" cy="11" r="11" fill="#111"/>` +
    `<circle cx="11" cy="11" r="6.5" fill="none" stroke="white" stroke-width="1.2"/>` +
    `<ellipse cx="11" cy="11" rx="2.8" ry="6.5" fill="none" stroke="white" stroke-width="1.2"/>` +
    `<line x1="4.5" y1="11" x2="17.5" y2="11" stroke="white" stroke-width="1.2"/>` +
    `<line x1="5.5" y1="7.5" x2="16.5" y2="7.5" stroke="white" stroke-width="0.9"/>` +
    `<line x1="5.5" y1="14.5" x2="16.5" y2="14.5" stroke="white" stroke-width="0.9"/>`,
    '🌐'
  ),

  // WhatsApp — círculo preto, ícone fone branco
  whatsapp: mkIcone(
    `<circle cx="11" cy="11" r="11" fill="#111"/>` +
    `<path fill="white" d="M11 5.5a5.5 5.5 0 0 0-4.75 8.25l-.75 2.25 2.3-.73A5.5 5.5 0 1 0 11 5.5zm0 10a4.4 4.4 0 0 1-2.24-.62l-.16-.1-1.62.42.44-1.57-.12-.17A4.5 4.5 0 1 1 11 15.5z"/>` +
    `<path fill="white" d="M8.5 8.8c-.13-.28-.27-.29-.4-.29s-.22 0-.34 0a.65.65 0 0 0-.47.22c-.16.18-.62.6-.62 1.47s.64 1.7.73 1.82c.09.12 1.24 1.94 3.04 2.65.42.18.75.28 1 .36.42.13.8.11 1.1.07.34-.05 1.04-.43 1.19-.84.14-.41.14-.77.1-.84-.05-.08-.18-.13-.38-.22-.2-.09-1.18-.59-1.36-.65-.18-.07-.32-.1-.45.1-.13.2-.5.65-.62.78-.11.13-.23.15-.43.05a5.3 5.3 0 0 1-1.56-1 5.9 5.9 0 0 1-1.08-1.36c-.11-.2 0-.3.08-.4l.3-.35c.08-.1.11-.18.17-.3.06-.11.03-.22-.02-.3z"/>`,
    '📱'
  ),
};

function itemRodape(icone, texto) {
  return `<td style="padding:0 8px;white-space:nowrap;vertical-align:middle">` +
    `<table cellpadding="0" cellspacing="0"><tr>` +
    `<td style="vertical-align:middle;padding-right:4px">${icone}</td>` +
    `<td style="vertical-align:middle;color:#444;font-size:12px;font-family:Arial,sans-serif">${texto}</td>` +
    `</tr></table></td>`;
}

function montarRodape(cfg, nomePortal) {
  const tel  = (cfg.rodapeTelefone     || '').trim();
  const mail = (cfg.rodapeEmailContato || '').trim();
  const ig   = (cfg.rodapeInstagram    || '').trim().replace(/^@/, '');
  const site = (cfg.rodapeSite         || '').trim();

  const celulas = [];
  if (tel)  celulas.push(itemRodape(ICONES.whatsapp,  tel.replace(/&/g,'&amp;')));
  if (mail) celulas.push(itemRodape(ICONES.email,     mail.replace(/&/g,'&amp;')));
  if (ig)   celulas.push(itemRodape(ICONES.instagram, `@${ig.replace(/&/g,'&amp;')}`));
  if (site) celulas.push(itemRodape(ICONES.globe,     site.replace(/&/g,'&amp;')));

  if (celulas.length > 0) {
    return `
      <table cellpadding="0" cellspacing="0" width="100%">
        <tr><td align="center" style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:16px 20px">
          <p style="margin:0 0 10px 0;font-size:11px;color:#888;font-family:Arial,sans-serif;text-transform:uppercase;letter-spacing:.5px">
            Acesse nossas redes e contatos
          </p>
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
