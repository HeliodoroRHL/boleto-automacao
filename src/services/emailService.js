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

// Ícone outline puro HTML/CSS — compatível com Outlook, Gmail, Apple Mail, todos
// Usando bordas e pseudo-formas via células de tabela (sem imagem, sem SVG)
const ICONES = {
  // ícone câmera (Instagram) — quadrado arredondado com círculo interno + ponto
  instagram:
    `<table cellpadding="0" cellspacing="0" style="display:inline-table;vertical-align:middle">` +
    `<tr><td style="width:18px;height:18px;border:1.5px solid #888;border-radius:4px;text-align:center;vertical-align:middle;line-height:18px;font-size:11px;color:#888;font-family:Arial">` +
    `&#9711;` + // ○ círculo outline (câmera)
    `</td></tr></table>`,

  // ícone telefone/WhatsApp — fone outline
  whatsapp:
    `<table cellpadding="0" cellspacing="0" style="display:inline-table;vertical-align:middle">` +
    `<tr><td style="width:18px;height:18px;border:1.5px solid #888;border-radius:4px;text-align:center;vertical-align:middle;line-height:18px;font-size:11px;color:#888;font-family:Arial">` +
    `&#9990;` + // ☎ telefone
    `</td></tr></table>`,

  // ícone envelope (email)
  email:
    `<table cellpadding="0" cellspacing="0" style="display:inline-table;vertical-align:middle">` +
    `<tr><td style="width:18px;height:18px;border:1.5px solid #888;border-radius:4px;text-align:center;vertical-align:middle;line-height:18px;font-size:11px;color:#888;font-family:Arial">` +
    `&#9993;` + // ✉ envelope
    `</td></tr></table>`,

  // ícone globo (site)
  globe:
    `<table cellpadding="0" cellspacing="0" style="display:inline-table;vertical-align:middle">` +
    `<tr><td style="width:18px;height:18px;border:1.5px solid #888;border-radius:4px;text-align:center;vertical-align:middle;line-height:18px;font-size:11px;color:#888;font-family:Arial">` +
    `&#8853;` + // ⊕ círculo com cruz (globo)
    `</td></tr></table>`,
};

function itemRodape(icone, texto) {
  return `<td style="padding:0 10px;white-space:nowrap;vertical-align:middle">` +
    `<table cellpadding="0" cellspacing="0"><tr>` +
    `<td style="vertical-align:middle;padding-right:5px">${icone}</td>` +
    `<td style="vertical-align:middle;color:#555;font-size:12px;font-family:Arial,sans-serif">${texto}</td>` +
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
