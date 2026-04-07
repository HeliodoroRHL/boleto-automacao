/* ─────────────────────────────────────────────────────────────────────────────
   BoletoHub — SPA multiaccount
───────────────────────────────────────────────────────────────────────────── */

const BASE = (() => {
  const p = window.location.pathname.split('/').filter(Boolean);
  return p.length && !p[0].includes('.') ? '/' + p[0] : '';
})();

const state = {
  user: null,
  contas: [],
  contaId: sessionStorage.getItem('contaId') || '',
  boletosOffset: 0,
  boletosStatus: '',
  boletosTotalCount: 0,
  editandoConta: null,
  privacyMode: sessionStorage.getItem('privacyMode') === '1',
};

function togglePrivacy() {
  state.privacyMode = !state.privacyMode;
  sessionStorage.setItem('privacyMode', state.privacyMode ? '1' : '0');
  applyPrivacy();
}
function applyPrivacy() {
  document.getElementById('content').classList.toggle('privacy-on', state.privacyMode);
  const btn   = document.getElementById('btn-privacidade');
  const show  = document.getElementById('prv-icon-show');
  const hide  = document.getElementById('prv-icon-hide');
  const label = document.getElementById('prv-label');
  if (!btn) return;
  btn.classList.toggle('ativo', state.privacyMode);
  if (show)  show.style.display  = state.privacyMode ? 'none' : '';
  if (hide)  hide.style.display  = state.privacyMode ? '' : 'none';
  if (label) label.textContent   = state.privacyMode ? 'Mostrar dados' : 'Ocultar dados';
}

// ── Segurança ─────────────────────────────────────────────────────────────────
function esc(v) {
  if (v === null || v === undefined) return '';
  return String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#x27;');
}
function safeUrl(url) {
  if (!url || typeof url !== 'string') return null;
  try { const u = new URL(url); return u.protocol === 'https:' ? url : null; } catch { return null; }
}

// Gera link wa.me para abrir WhatsApp Web com mensagem pré-preenchida (sem número — abre seletor de contato)
function waShareLink(nomeCliente, valor, dueDate, linkBoleto) {
  const nome = nomeCliente || 'Cliente';
  const val  = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor || 0);
  const [y, m, d] = (dueDate || '').split('-');
  const venc = dueDate ? `${d}/${m}/${y}` : '';
  const msg  = `Olá, ${nome}! 😊\n\nSegue seu boleto referente ao valor de *${val}*${venc ? `, com vencimento em *${venc}*` : ''}.\n\nAcesse pelo link abaixo:\n${linkBoleto}\n\nQualquer dúvida, estamos à disposição!`;
  return `https://wa.me/?text=${encodeURIComponent(msg)}`;
}

// ── API ───────────────────────────────────────────────────────────────────────
async function apiFetch(path, opts = {}) {
  const res  = await fetch(BASE + path, { credentials: 'same-origin', headers: { 'Content-Type': 'application/json', ...(opts.headers||{}) }, ...opts });
  const json = await res.json().catch(() => ({}));
  if (res.status === 401) { showLogin(); throw new Error('session'); }
  if (!res.ok) throw new Error(json.erro || `Erro ${res.status}`);
  return json;
}

const api = {
  me:            ()      => apiFetch('/auth/me'),
  login:         (b)     => apiFetch('/auth/login',  { method:'POST', body: JSON.stringify(b) }),
  logout:        ()      => apiFetch('/auth/logout', { method:'POST' }),

  // Contas Asaas
  contas:        ()      => apiFetch('/api/contas'),
  criarConta:    (b)     => apiFetch('/api/contas',       { method:'POST',   body: JSON.stringify(b) }),
  editarConta:   (id,b)  => apiFetch(`/api/contas/${id}`, { method:'PUT',    body: JSON.stringify(b) }),
  deletarConta:  (id)    => apiFetch(`/api/contas/${id}`, { method:'DELETE' }),
  testarConta:   (id)    => apiFetch(`/api/contas/${id}/testar`, { method:'POST' }),

  // Painel (contaId opcional em todos)
  stats:         (c)     => apiFetch(`/api/painel/stats?${q({contaId:c})}`),
  boletos:       (p)     => apiFetch(`/api/painel/boletos?${new URLSearchParams(p)}`),
  boleto:        (id,c)  => apiFetch(`/api/painel/boletos/${id}?${q({contaId:c})}`),
  boletoCliente: (id,c)  => apiFetch(`/api/painel/boletos/${id}/cliente?${q({contaId:c})}`),
  enviarEmail:   (b)     => apiFetch('/api/painel/email/enviar', { method:'POST', body: JSON.stringify(b) }),
  historico:     ()      => apiFetch('/api/painel/email/historico'),
  testarSmtp:    ()      => apiFetch('/api/painel/email/testar', { method:'POST' }),
  emailResumo:   ()      => apiFetch('/api/painel/email/resumo'),
  salvarPerfil:  (b)     => apiFetch('/auth/perfil', { method:'PUT', body: JSON.stringify(b) }),

  // SMTP
  getSmtp:       ()      => apiFetch('/api/smtp'),
  salvarSmtp:    (b)     => apiFetch('/api/smtp', { method:'PUT', body: JSON.stringify(b) }),
  testarSmtpCfg: ()      => apiFetch('/api/smtp/testar', { method:'POST' }),

  // Automações
  automacoes:        ()     => apiFetch('/api/automacoes'),
  getAutomacao:      (id)   => apiFetch(`/api/automacoes/${id}`),
  criarAutomacao:    (b)    => apiFetch('/api/automacoes', { method:'POST', body: JSON.stringify(b) }),
  salvarAutomacao:   (id,b) => apiFetch(`/api/automacoes/${id}`, { method:'PUT', body: JSON.stringify(b) }),
  deletarAutomacao:  (id)   => apiFetch(`/api/automacoes/${id}`, { method:'DELETE' }),
  executarAutomacao: (id)   => apiFetch(`/api/automacoes/${id}/executar`, { method:'POST' }),
  simularAutomacao:  (id)   => apiFetch(`/api/automacoes/${id}/simular`,  { method:'POST' }),

  // Clientes Asaas
  listarClientes: (c) => apiFetch(`/api/painel/clientes?${q({contaId:c})}`),

  // Auditoria
  auditoria: (limit=100) => apiFetch(`/api/auditoria?limit=${limit}`),

};

function q(obj) { return new URLSearchParams(Object.fromEntries(Object.entries(obj).filter(([,v])=>v))); }

// ── Utils ─────────────────────────────────────────────────────────────────────
const moeda   = v  => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(v||0);
const dataFmt = d  => { if(!d)return'—'; const[y,m,dia]=d.split('T')[0].split('-'); return`${dia}/${m}/${y}`; };
const dataHora = d => d ? new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(d)) : '—';

function formatCnpj(v='') {
  const n = v.replace(/\D/g,'');
  return n.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,'$1.$2.$3/$4-$5') || v;
}

const statusMap = {
  PENDING:  {label:'Pendente', cls:'badge-pending'},  RECEIVED: {label:'Pago',     cls:'badge-received'},
  OVERDUE:  {label:'Vencido',  cls:'badge-overdue'},  CANCELLED:{label:'Cancelado',cls:'badge-cancelled'},
  REFUNDED: {label:'Estornado',cls:'badge-refunded'},
};
function badge(s) { const m=statusMap[s]||{label:esc(s),cls:'badge-cancelled'}; return `<span class="badge ${m.cls}">${m.label}</span>`; }

function toast(msg,type='info') {
  const icons={success:'&#10003;',error:'&#10005;',info:'i',warning:'!'};
  const el=document.createElement('div'); el.className=`toast ${type}`;
  el.innerHTML=`<span>${icons[type]}</span><span>${esc(msg)}</span>`;
  document.getElementById('toasts').appendChild(el);
  setTimeout(()=>el.remove(),4500);
}

function setTitle(t) { document.getElementById('page-title').textContent=t; }
function render(h)   { document.getElementById('content').innerHTML=h; applyPrivacy(); }
function setActive(p){ document.querySelectorAll('.nav-item[data-page]').forEach(el=>el.classList.toggle('active',el.dataset.page===p)); }

// ── Conta selecionada ─────────────────────────────────────────────────────────
function getContaId() { return state.contaId; }
function setContaId(id) { state.contaId=id; sessionStorage.setItem('contaId',id); }

function contaBar() {
  if (!state.contas.length) return '';
  const opts = `<option value="">Padrão (.env)</option>` +
    state.contas.map(c=>`<option value="${esc(c.id)}" ${state.contaId===c.id?'selected':''}>${esc(c.nome)} — ${formatCnpj(c.cnpj)}</option>`).join('');
  return `<div class="conta-bar">
    <span class="text-muted">Conta Asaas:</span>
    <select class="select" id="conta-sel" style="width:auto;min-width:220px">${opts}</select>
  </div>`;
}

function bindContaBar() {
  document.getElementById('conta-sel')?.addEventListener('change', e => {
    setContaId(e.target.value);
    route(); // recarrega a página atual com nova conta
  });
}

// ── Auto-logout por inatividade (30 min) ──────────────────────────────────────
let _idleTimer = null;
function resetIdleTimer() {
  clearTimeout(_idleTimer);
  if (state.user) {
    _idleTimer = setTimeout(() => {
      toast('Sessão encerrada por inatividade', 'warning');
      logout();
    }, 30 * 60 * 1000);
  }
}
['mousemove','keydown','click','scroll','touchstart'].forEach(ev =>
  document.addEventListener(ev, resetIdleTimer, { passive: true })
);

// ── Auth ──────────────────────────────────────────────────────────────────────
function showLogin() {
  clearTimeout(_idleTimer);
  document.getElementById('login-screen').hidden=false;
  document.getElementById('app').hidden=true;
}
async function showApp(user) {
  state.user=user;
  document.getElementById('login-screen').hidden=true;
  document.getElementById('app').hidden=false;
  const lbl=document.getElementById('user-label');
  if(lbl) lbl.textContent=esc(user.nome||user.email);

  // Wire up topbar buttons (evita depender de onclick inline bloqueado pelo CSP)
  const btnPriv    = document.getElementById('btn-privacidade');
  const btnConta   = document.getElementById('btn-minha-conta');
  const btnLogout  = document.getElementById('btn-logout');
  if (btnPriv   && !btnPriv._bound)   { btnPriv.addEventListener('click', togglePrivacy);          btnPriv._bound=true; }
  if (btnConta  && !btnConta._bound)  { btnConta.addEventListener('click', ()=>navigate('perfil')); btnConta._bound=true; }
  if (btnLogout && !btnLogout._bound) { btnLogout.addEventListener('click', logout);                btnLogout._bound=true; }

  // Carrega lista de contas disponíveis
  try { state.contas=await api.contas(); } catch {}
  resetIdleTimer();
  route();
}
async function logout() {
  clearTimeout(_idleTimer);
  try{await api.logout();}catch{}
  state.user=null; showLogin();
}

document.getElementById('login-form').addEventListener('submit', async e => {
  e.preventDefault();
  const email=document.getElementById('l-email').value.trim();
  const pw=document.getElementById('l-password').value;
  const errEl=document.getElementById('login-error');
  const btn=document.getElementById('login-btn');
  errEl.textContent='';
  if(!email||!pw){errEl.textContent='Preencha e-mail e senha.';return;}
  btn.disabled=true; btn.textContent='Entrando...';
  try { const user=await api.login({email,password:pw}); await showApp(user); }
  catch(err){ errEl.textContent=err.message==='session'?'E-mail ou senha inválidos.':esc(err.message); }
  finally { btn.disabled=false; btn.textContent='Entrar'; }
});

// ── Página: Dashboard ─────────────────────────────────────────────────────────
async function pageDashboard() {
  setTitle('Dashboard'); setActive('dashboard');
  const skCard = `<div class="stat-card"><div class="skeleton" style="width:42px;height:42px;border-radius:10px"></div><div><div class="skeleton" style="width:60px;height:24px;margin-bottom:6px"></div><div class="skeleton" style="width:80px;height:14px"></div></div></div>`;
  render(contaBar() + `<div class="stats-grid">${[1,2,3,4].map(()=>skCard).join('')}</div><div class="stats-grid email-stats-grid">${[1,2,3].map(()=>skCard).join('')}</div><div class="card"><div class="loading-overlay"><div class="skeleton" style="width:200px;height:20px"></div></div></div>`);
  bindContaBar();
  try {
    const cid=getContaId();
    const [stats, lista, emailRes] = await Promise.all([
      api.stats(cid),
      api.boletos({limit:10,offset:0,...(cid?{contaId:cid}:{})}),
      api.emailResumo().catch(()=>null),
    ]);
    const bCards=[
      {color:'blue',  icon:svgDoc(),   value:stats.total,     label:'Total boletos'},
      {color:'yellow',icon:svgClock(), value:stats.pendentes, label:'Pendentes'},
      {color:'green', icon:svgCheck(), value:stats.pagos,     label:'Pagos'},
      {color:'red',   icon:svgAlert(), value:stats.vencidos,  label:'Vencidos'},
    ];
    const eCards = emailRes ? [
      {color:'blue',   icon:svgSend(), value:emailRes.totalHoje,   label:'E-mails hoje'},
      {color:'green',  icon:svgSend(), value:emailRes.totalSemana, label:'Últimos 7 dias'},
      {color:'yellow', icon:svgSend(), value:emailRes.totalMes,    label:'Este mês'},
    ] : [];
    const hoje=new Date(), mesAtual=`${hoje.getFullYear()}-${String(hoje.getMonth()+1).padStart(2,'0')}`;
    const rows=(lista.data||[]).map(b=>{
      const link=safeUrl(b.bankSlipUrl);
      const isMes=(b.dueDate||'').startsWith(mesAtual);
      return `<tr ${isMes?'style="background:#f0fdf4"':''}>
        <td><span class="prv">${esc(b.customerName||'—')}</span></td>
        <td><strong class="prv">${moeda(b.value)}</strong></td>
        <td>${dataFmt(b.dueDate)}${isMes?'<span class="tag-mes-atual">Mês atual</span>':''}</td>
        <td>${badge(b.status)}</td>
        <td>${link?`<a href="${esc(link)}" target="_blank" rel="noopener noreferrer" class="btn btn-ghost btn-sm">Ver</a>`:''}
        <button class="btn btn-primary btn-sm" data-boleto="${esc(b.id)}">Enviar e-mail</button></td></tr>`;
    }).join('');
    const emailRows = (emailRes?.recentes||[]).map(e=>`
      <tr>
        <td>${esc(e.cliente||e.to)}</td>
        <td class="text-muted" style="font-size:12px">${esc(e.to)}</td>
        <td style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(e.assunto||'—')}</td>
        <td>${dataHora(e.enviadoEm)}</td>
        <td>${e.comPdf?'<span class="badge badge-pending">PDF</span>':''}</td>
      </tr>`).join('');
    document.getElementById('content').innerHTML = contaBar() + `
      <div class="stats-grid">${bCards.map(c=>`<div class="stat-card"><div class="stat-icon ${c.color}">${c.icon}</div><div class="stat-info"><div class="value">${c.value}</div><div class="label">${c.label}</div></div></div>`).join('')}</div>
      ${eCards.length?`<div class="stats-grid email-stats-grid">${eCards.map(c=>`<div class="stat-card"><div class="stat-icon ${c.color}">${c.icon}</div><div class="stat-info"><div class="value">${c.value}</div><div class="label">${c.label}</div></div></div>`).join('')}</div>`:''}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:start">
        <div class="card">
          <div class="card-header"><span class="card-title">Boletos Recentes</span><button class="btn btn-secondary btn-sm" id="btn-ver-todos">Ver todos</button></div>
          <div class="table-wrap"><table>
            <thead><tr><th>Cliente</th><th>Valor</th><th>Vencimento</th><th>Status</th><th>Ações</th></tr></thead>
            <tbody>${rows||`<tr><td colspan="5"><div class="empty-state"><p>Nenhum boleto encontrado</p></div></td></tr>`}</tbody>
          </table></div>
        </div>
        <div class="card">
          <div class="card-header"><span class="card-title">Últimos E-mails Enviados</span><button class="btn btn-secondary btn-sm" id="btn-ver-historico">Ver histórico</button></div>
          <div class="table-wrap"><table>
            <thead><tr><th>Cliente</th><th>E-mail</th><th>Assunto</th><th>Enviado em</th><th></th></tr></thead>
            <tbody>${emailRows||`<tr><td colspan="5"><div class="empty-state"><p>Nenhum e-mail enviado ainda</p></div></td></tr>`}</tbody>
          </table></div>
        </div>
      </div>`;
    bindContaBar();
    applyPrivacy();
    document.getElementById('btn-ver-todos')?.addEventListener('click', ()=>navigate('boletos'));
    document.getElementById('btn-ver-historico')?.addEventListener('click', ()=>navigate('historico'));
    document.querySelectorAll('[data-boleto]').forEach(btn=>btn.addEventListener('click',()=>navigate('email',btn.dataset.boleto)));
  } catch(e){ if(e.message==='session')return; render(contaBar()+erroCard(e.message)); bindContaBar(); }
}

// ── Página: Boletos ───────────────────────────────────────────────────────────
async function pageBoletos() {
  setTitle('Boletos Asaas'); setActive('boletos');
  render(contaBar() + `
    <div class="filters">
      <select class="select" id="f-status" style="width:150px">
        <option value="">Todos os status</option>
        <option value="PENDING"   ${state.boletosStatus==='PENDING'  ?'selected':''}>Pendente</option>
        <option value="RECEIVED"  ${state.boletosStatus==='RECEIVED' ?'selected':''}>Pago</option>
        <option value="OVERDUE"   ${state.boletosStatus==='OVERDUE'  ?'selected':''}>Vencido</option>
        <option value="CANCELLED" ${state.boletosStatus==='CANCELLED'?'selected':''}>Cancelado</option>
      </select>
      <button class="btn btn-secondary btn-sm" id="btn-filtrar">Filtrar</button>
      <button class="btn btn-secondary btn-sm" id="btn-refresh">${svgRefresh()} Atualizar</button>
    </div>
    <div class="card"><div class="loading-overlay"><div class="skeleton" style="width:200px;height:20px"></div></div></div>`);
  bindContaBar();
  document.getElementById('btn-filtrar').addEventListener('click',()=>{state.boletosStatus=document.getElementById('f-status').value;state.boletosOffset=0;pageBoletos();});
  document.getElementById('btn-refresh').addEventListener('click',pageBoletos);
  try {
    const cid=getContaId();
    const params={limit:20,offset:state.boletosOffset,...(cid?{contaId:cid}:{})};
    if(state.boletosStatus) params.status=state.boletosStatus;
    const lista=await api.boletos(params);
    state.boletosTotalCount=lista.totalCount||0;

    // Ordena: mês atual primeiro (crescente por vencimento), depois o resto
    const hoje2=new Date(), mesAtual2=`${hoje2.getFullYear()}-${String(hoje2.getMonth()+1).padStart(2,'0')}`;
    const dados=[...(lista.data||[])];
    dados.sort((a,b)=>{
      const am=(a.dueDate||'').startsWith(mesAtual2), bm=(b.dueDate||'').startsWith(mesAtual2);
      if(am&&!bm)return -1; if(!am&&bm)return 1;
      return (a.dueDate||'').localeCompare(b.dueDate||'');
    });

    const rows=dados.map(b=>{
      const link=safeUrl(b.bankSlipUrl||b.invoiceUrl);
      const tipo=b.billingType==='PIX'?'PIX':'Boleto';
      const isMes=(b.dueDate||'').startsWith(mesAtual2);
      const waLink=link?waShareLink(b.customerName,b.value,b.dueDate,link):'';
      return `<tr ${isMes?'style="background:#f0fdf4"':''}>
        <td><span class="prv">${esc(b.customerName||'—')}</span></td>
        <td><strong class="prv">${moeda(b.value)}</strong> <span class="text-muted" style="font-size:11px">${tipo}</span></td>
        <td>${dataFmt(b.dueDate)}${isMes?'<span class="tag-mes-atual">Mês atual</span>':''}</td>
        <td>${badge(b.status)}</td>
        <td>${dataFmt(b.paymentDate)}</td>
        <td style="white-space:nowrap">
          ${link?`<a href="${esc(link)}" target="_blank" rel="noopener noreferrer" class="btn btn-ghost btn-sm">Ver</a>`:''}
          ${waLink?`<a href="${esc(waLink)}" target="_blank" rel="noopener noreferrer" class="btn btn-wa btn-sm" title="Enviar via WhatsApp Web">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
            WhatsApp
          </a>`:''}
          <button class="btn btn-primary btn-sm" data-boleto="${esc(b.id)}">Enviar email</button>
        </td></tr>`;
    }).join('');
    const pg=Math.floor(state.boletosOffset/20)+1, tp=Math.ceil(state.boletosTotalCount/20);
    document.querySelector('.card').innerHTML=`
      <div class="card-header"><span class="card-title">${state.boletosTotalCount} boleto(s)</span></div>
      <div class="table-wrap"><table>
        <thead><tr><th>Cliente</th><th>Valor</th><th>Vencimento</th><th>Status</th><th>Pago em</th><th>Ações</th></tr></thead>
        <tbody>${rows||`<tr><td colspan="6"><div class="empty-state"><p>Nenhum boleto encontrado</p></div></td></tr>`}</tbody>
      </table></div>
      ${tp>1?`<div class="pagination"><span>Página ${pg} de ${tp}</span>
        <button class="btn btn-secondary btn-sm" id="btn-prev" ${state.boletosOffset===0?'disabled':''}>Anterior</button>
        <button class="btn btn-secondary btn-sm" id="btn-next" ${!lista.hasMore?'disabled':''}>Próxima</button></div>`:''}`;
    applyPrivacy();
    document.querySelectorAll('[data-boleto]').forEach(btn=>btn.addEventListener('click',()=>navigate('email',btn.dataset.boleto)));
    document.getElementById('btn-prev')?.addEventListener('click',()=>{state.boletosOffset=Math.max(0,state.boletosOffset-20);pageBoletos();});
    document.getElementById('btn-next')?.addEventListener('click',()=>{state.boletosOffset+=20;pageBoletos();});
  } catch(e){ if(e.message==='session')return; document.querySelector('.card').innerHTML=`<div class="card-body">${erroCard(e.message)}</div>`; }
}

// ── Página: Email ─────────────────────────────────────────────────────────────
async function pageEmail(boletoId) {
  setTitle('Enviar Email'); setActive('email');
  render(`<div class="loading-overlay"><div class="skeleton" style="width:200px;height:20px"></div></div>`);
  const cid=getContaId();
  let boleto=null, cliente=null;
  if(boletoId){
    try { [boleto,cliente]=await Promise.all([api.boleto(boletoId,cid),api.boletoCliente(boletoId,cid)]); }
    catch(e){ if(e.message==='session')return; toast('Erro ao carregar boleto: '+e.message,'error'); }
  }
  const nomePre=cliente?.nome||boleto?.customerName||'';
  const emailPre=cliente?.email||'';
  const assunto=boleto?`Boleto - ${moeda(boleto.value)} - Vencimento ${dataFmt(boleto.dueDate)}`:'';
  const corpo=templateEmail(boleto,nomePre);
  const link=safeUrl(boleto?.bankSlipUrl);
  const contaAtual=state.contas.find(c=>c.id===cid);
  const boletoCard=boleto
    ?`<div class="boleto-info-card">
        <div class="card-header"><span class="card-title">Boleto selecionado</span></div>
        <div class="info-row"><span class="info-label">Cliente</span><span class="info-value">${esc(boleto.customerName)}</span></div>
        <div class="info-row"><span class="info-label">Valor</span><span class="info-value"><strong>${moeda(boleto.value)}</strong></span></div>
        <div class="info-row"><span class="info-label">Vencimento</span><span class="info-value">${dataFmt(boleto.dueDate)}</span></div>
        <div class="info-row"><span class="info-label">Status</span><span class="info-value">${badge(boleto.status)}</span></div>
        ${contaAtual?`<div class="info-row"><span class="info-label">Conta</span><span class="info-value"><span class="conta-badge">${esc(contaAtual.nome)}</span></span></div>`:''}
        ${link?`<div class="info-row"><a href="${esc(link)}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary btn-sm" style="width:100%;justify-content:center">Ver boleto</a></div>`:''}
      </div>`
    :`<div class="card card-body text-muted" style="text-align:center"><p>Nenhum boleto selecionado.<br>Va em <strong>Boletos Asaas</strong> e clique em "Enviar email".</p></div>`;
  render(`
    <div class="email-layout">
      <div class="card">
        <div class="card-header"><span class="card-title">Compor e-mail</span><button class="btn btn-ghost btn-sm" id="btn-testar-smtp">Testar SMTP</button></div>
        <div class="card-body"><div class="form-grid">
          <div class="form-row">
            <div class="field"><label for="e-to">Para *</label><input class="input" id="e-to" type="email" autocomplete="off" placeholder="cliente@email.com"></div>
            <div class="field"><label for="e-cc">CC</label><input class="input" id="e-cc" type="email" autocomplete="off" placeholder="copia@email.com"></div>
          </div>
          <div class="field"><label for="e-subject">Assunto *</label><input class="input" id="e-subject" type="text" autocomplete="off"></div>
          <div class="field"><label for="e-body">Corpo *</label><textarea class="textarea" id="e-body" style="min-height:280px"></textarea></div>
          <label class="checkbox-row"><input type="checkbox" id="e-pdf" ${link?'':'disabled'}>Anexar PDF do boleto ${!link?'<span class="text-muted">(não disponível)</span>':''}</label>
          <div style="display:flex;gap:10px;padding-top:4px">
            <button class="btn btn-primary" id="btn-enviar">${svgSend()} Enviar e-mail</button>
            <button class="btn btn-secondary" onclick="navigate('boletos')">Cancelar</button>
          </div>
        </div></div>
      </div>
      <div>${boletoCard}</div>
    </div>`);
  document.getElementById('e-to').value=emailPre;
  document.getElementById('e-subject').value=assunto;
  document.getElementById('e-body').value=corpo;
  if(link) document.getElementById('e-pdf').checked=true;
  document.getElementById('btn-enviar').addEventListener('click',()=>enviarEmail(boletoId||null,cid));
  document.getElementById('btn-testar-smtp').addEventListener('click',testarSmtp);
}

// ── Página: Histórico ─────────────────────────────────────────────────────────
async function pageHistorico() {
  setTitle('Histórico de Envios'); setActive('historico');
  render(`<div class="card"><div class="loading-overlay"><div class="skeleton" style="width:200px;height:20px"></div></div></div>`);
  try {
    const hist=await api.historico();
    const rows=hist.map(h=>`<tr>
      <td>${dataHora(h.enviadoEm)}</td><td>${esc(h.to)}</td><td>${esc(h.cc)||'—'}</td>
      <td>${esc(h.subject)}</td><td>${esc(h.clienteNome)||'—'}</td>
      <td>${h.comPdf?'<span class="badge badge-received">Sim</span>':'<span class="badge badge-cancelled">Nao</span>'}</td></tr>`).join('');
    document.querySelector('.card').innerHTML=`
      <div class="card-header"><span class="card-title">${hist.length} e-mail(s)</span></div>
      <div class="table-wrap"><table>
        <thead><tr><th>Data/Hora</th><th>Para</th><th>CC</th><th>Assunto</th><th>Cliente</th><th>PDF</th></tr></thead>
        <tbody>${rows||`<tr><td colspan="6"><div class="empty-state"><p>Nenhum e-mail enviado ainda</p></div></td></tr>`}</tbody>
      </table></div>`;
  } catch(e){ if(e.message==='session')return; document.querySelector('.card').innerHTML=`<div class="card-body">${erroCard(e.message)}</div>`; }
}

// ── Página: Contas Asaas ──────────────────────────────────────────────────────
async function pageContas() {
  setTitle('Contas Asaas'); setActive('contas');
  render(`<div class="loading-overlay"><div class="skeleton" style="width:200px;height:20px"></div></div>`);
  try {
    const contas=await api.contas();
    state.contas=contas;
    renderContas(contas);
  } catch(e){ if(e.message==='session')return; render(erroCard(e.message)); }
}

function renderContas(contas, editId=null) {
  const rows=contas.map(c=>`<tr>
    <td><strong>${esc(c.nome)}</strong></td>
    <td class="cnpj">${formatCnpj(c.cnpj||'')}</td>
    <td class="key-masked">${esc(c.asaasApiKey)}</td>
    <td>${c.emailFrom?esc(c.emailFrom):'<span class="text-muted">Padrão</span>'}</td>
    <td>${c.ativa?'<span class="badge badge-received">Ativa</span>':'<span class="badge badge-cancelled">Inativa</span>'}</td>
    <td style="white-space:nowrap">
      <button class="btn btn-ghost btn-sm" data-testar="${esc(c.id)}">Testar</button>
      <button class="btn btn-secondary btn-sm" data-editar="${esc(c.id)}">Editar</button>
      <button class="btn btn-ghost btn-sm" style="color:var(--danger)" data-deletar="${esc(c.id)}">Excluir</button>
    </td></tr>`).join('');

  const c=editId?contas.find(x=>x.id===editId):null;
  const formTitle=c?`Editar: ${esc(c.nome)}`:'Nova Conta';

  render(`
    <div class="contas-layout">
      <div class="card">
        <div class="card-header">
          <span class="card-title">${contas.length} conta(s) cadastrada(s)</span>
          <button class="btn btn-primary btn-sm" id="btn-nova">+ Nova Conta</button>
        </div>
        <div class="table-wrap"><table>
          <thead><tr><th>Nome</th><th>CNPJ</th><th>Chave API</th><th>E-mail</th><th>Status</th><th>Ações</th></tr></thead>
          <tbody>${rows||`<tr><td colspan="6"><div class="empty-state"><p>Nenhuma conta cadastrada ainda.<br>Clique em "+ Nova Conta" para começar.</p></div></td></tr>`}</tbody>
        </table></div>
      </div>
      <div class="card" id="form-card">
        <div class="card-header"><span class="card-title">${formTitle}</span></div>
        <div class="card-body">
          <div class="form-grid">
            <div class="field"><label>Nome da empresa *</label><input class="input" id="f-nome" placeholder="Ex: Empresa A LTDA" value="${esc(c?.nome||'')}"></div>
            <div class="field"><label>CNPJ</label><input class="input" id="f-cnpj" placeholder="00.000.000/0001-00" maxlength="18" value="${formatCnpj(c?.cnpj||'')}"></div>
            <div class="field">
              <label>Chave API Asaas *</label>
              <input class="input" id="f-apikey" type="password" autocomplete="off" placeholder="${c?'Deixe em branco para manter a atual':'Cole sua API key aqui'}">
              <span class="text-muted" style="font-size:11px">Encontre em: Asaas &gt; Minha Conta &gt; Integrações</span>
            </div>
            <div class="field"><label>E-mail remetente</label><input class="input" id="f-email" type="email" placeholder="financeiro@suaempresa.com.br" value="${esc(c?.emailFrom||'')}">
              <span class="text-muted" style="font-size:11px">Opcional — deixe em branco para usar o padrão do .env</span></div>
            <div class="field"><label>Nome do remetente</label><input class="input" id="f-emailnome" placeholder="Financeiro Empresa A" value="${esc(c?.emailNome||'')}"></div>
            <div style="display:flex;gap:8px;padding-top:4px">
              <button class="btn btn-primary" id="btn-salvar-conta" data-id="${esc(c?.id||'')}">Salvar</button>
              <button class="btn btn-secondary" id="btn-cancelar-conta">Cancelar</button>
            </div>
          </div>
        </div>
      </div>
    </div>`);

  // Máscara CNPJ
  document.getElementById('f-cnpj').addEventListener('input', e => {
    let v=e.target.value.replace(/\D/g,'').slice(0,14);
    v=v.replace(/^(\d{2})(\d)/,'$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/,'$1.$2.$3').replace(/\.(\d{3})(\d)/,'.$1/$2').replace(/(\d{4})(\d)/,'$1-$2');
    e.target.value=v;
  });

  // Botões da tabela
  document.querySelectorAll('[data-editar]').forEach(btn=>btn.addEventListener('click',async()=>{
    const contas=await api.contas(); renderContas(contas,btn.dataset.editar);
  }));
  document.querySelectorAll('[data-deletar]').forEach(btn=>btn.addEventListener('click',async()=>{
    if(!confirm('Excluir esta conta?'))return;
    try { await api.deletarConta(btn.dataset.deletar); toast('Conta excluída','success'); state.contas=await api.contas(); renderContas(state.contas); }
    catch(e){ toast('Erro: '+e.message,'error'); }
  }));
  document.querySelectorAll('[data-testar]').forEach(btn=>btn.addEventListener('click',async()=>{
    btn.disabled=true; btn.textContent='Testando...';
    try { await api.testarConta(btn.dataset.testar); toast('Conexão com Asaas OK!','success'); }
    catch(e){ toast('Falha: '+e.message,'error'); }
    finally{ btn.disabled=false; btn.textContent='Testar'; }
  }));

  // Botão nova conta
  document.getElementById('btn-nova').addEventListener('click',()=>renderContas(state.contas,null));
  document.getElementById('btn-cancelar-conta').addEventListener('click',()=>renderContas(state.contas,null));

  // Salvar
  document.getElementById('btn-salvar-conta').addEventListener('click',async()=>{
    const id=document.getElementById('btn-salvar-conta').dataset.id;
    const payload={
      nome:      document.getElementById('f-nome').value.trim(),
      cnpj:      document.getElementById('f-cnpj').value,
      asaasApiKey: document.getElementById('f-apikey').value,
      emailFrom: document.getElementById('f-email').value.trim(),
      emailNome: document.getElementById('f-emailnome').value.trim(),
    };
    if(!payload.nome) return toast('Informe o nome da empresa','warning');
    if(!id && !payload.asaasApiKey) return toast('Informe a chave API','warning');
    const btn=document.getElementById('btn-salvar-conta');
    btn.disabled=true; btn.textContent='Salvando...';
    try {
      if(id) await api.editarConta(id,payload);
      else   await api.criarConta(payload);
      toast(id?'Conta atualizada!':'Conta criada!','success');
      state.contas=await api.contas();
      renderContas(state.contas);
    } catch(e){ toast('Erro: '+e.message,'error'); btn.disabled=false; btn.textContent='Salvar'; }
  });
}

// ── Página: Minha Conta ───────────────────────────────────────────────────────
async function pagePerfil() {
  setTitle('Minha Conta'); setActive('');
  render(`
    <div style="max-width:500px;margin:0 auto">

      <div class="perfil-banner">
        Login atual: <strong>${esc(state.user?.email||'')}</strong>
      </div>

      <div class="card">
        <div class="card-header"><span class="card-title">Dados pessoais</span></div>
        <div class="card-body">
          <div class="form-grid">
            <div class="field">
              <label>Nome de exibição</label>
              <input class="input" id="p-nome" type="text" value="${esc(state.user?.nome||'')}">
            </div>
            <div class="field">
              <label>E-mail de login</label>
              <input class="input" id="p-email" type="email" autocomplete="email" value="${esc(state.user?.email||'')}">
              <span class="text-muted" style="font-size:11px">Este é o e-mail usado para entrar no sistema</span>
            </div>
          </div>
        </div>
      </div>

      <div class="card" style="margin-top:16px">
        <div class="card-header"><span class="card-title">Alterar senha</span></div>
        <div class="card-body">
          <div class="form-grid">
            <div class="field">
              <label>Nova senha <span class="text-muted">(deixe em branco para manter)</span></label>
              <input class="input" id="p-nova" type="password" autocomplete="new-password" placeholder="Nova senha">
              <div id="pwd-bar" style="display:none"><div class="pwd-strength" id="pwd-strength-bar"></div><span class="pwd-hint" id="pwd-hint"></span></div>
              <ul class="req-lista">
                <li>Mínimo 8 caracteres</li>
                <li>Pelo menos uma letra maiúscula (A–Z)</li>
                <li>Pelo menos um número (0–9)</li>
                <li>Pelo menos um caractere especial (!@#$%...)</li>
              </ul>
            </div>
            <div class="field">
              <label>Confirmar nova senha</label>
              <input class="input" id="p-confirma" type="password" autocomplete="new-password" placeholder="Repita a nova senha">
            </div>
          </div>
        </div>
      </div>

      <div class="card" style="margin-top:16px">
        <div class="card-body">
          <div class="field">
            <label>Senha atual <span style="color:var(--danger)">*</span> <span class="text-muted">(obrigatória para salvar qualquer alteração)</span></label>
            <input class="input" id="p-atual" type="password" autocomplete="current-password" placeholder="Digite sua senha atual para confirmar">
          </div>
          <div style="display:flex;gap:8px;padding-top:14px">
            <button class="btn btn-primary" id="btn-salvar-perfil">Salvar alterações</button>
            <button class="btn btn-secondary" onclick="navigate('dashboard')">Cancelar</button>
          </div>
        </div>
      </div>

    </div>`);

  // Indicador de força de senha
  document.getElementById('p-nova').addEventListener('input', e => {
    const v = e.target.value;
    const bar = document.getElementById('pwd-bar');
    const barEl = document.getElementById('pwd-strength-bar');
    const hint = document.getElementById('pwd-hint');
    if (!v) { bar.style.display='none'; return; }
    bar.style.display='block';
    const ok = [v.length>=8, /[A-Z]/.test(v), /[0-9]/.test(v), /[^A-Za-z0-9]/.test(v)];
    const pts = ok.filter(Boolean).length;
    barEl.className = 'pwd-strength ' + (pts<=1?'fraca':pts<=3?'media':'forte');
    const msgs = [];
    if (!ok[0]) msgs.push('8+ caracteres');
    if (!ok[1]) msgs.push('maiúscula');
    if (!ok[2]) msgs.push('número');
    if (!ok[3]) msgs.push('especial');
    hint.textContent = msgs.length ? 'Faltando: ' + msgs.join(', ') : 'Senha forte!';
  });

  document.getElementById('btn-salvar-perfil').addEventListener('click', async () => {
    const nome      = document.getElementById('p-nome').value.trim();
    const email     = document.getElementById('p-email').value.trim();
    const novaSenha = document.getElementById('p-nova').value;
    const confirma  = document.getElementById('p-confirma').value;
    const senhaAtual= document.getElementById('p-atual').value;

    if (!senhaAtual) return toast('Informe a senha atual para salvar', 'warning');
    if (novaSenha && novaSenha !== confirma) return toast('As novas senhas não coincidem', 'warning');
    if (novaSenha && novaSenha.length < 8)       return toast('A senha deve ter pelo menos 8 caracteres', 'warning');
    if (novaSenha && !/[A-Z]/.test(novaSenha))   return toast('A senha deve ter pelo menos uma letra maiúscula', 'warning');
    if (novaSenha && !/[0-9]/.test(novaSenha))   return toast('A senha deve ter pelo menos um número', 'warning');
    if (novaSenha && !/[^A-Za-z0-9]/.test(novaSenha)) return toast('A senha deve ter pelo menos um caractere especial', 'warning');

    const btn = document.getElementById('btn-salvar-perfil');
    btn.disabled = true; btn.textContent = 'Salvando...';

    try {
      const res = await api.salvarPerfil({ nome, email, novaSenha: novaSenha || undefined, senhaAtual });
      state.user = res;
      const lbl = document.getElementById('user-label');
      if (lbl) lbl.textContent = esc(res.nome || res.email);
      toast('Dados atualizados com sucesso!', 'success');
      document.getElementById('p-atual').value = '';
      document.getElementById('p-nova').value  = '';
      document.getElementById('p-confirma').value = '';
    } catch(e) {
      toast(e.message, 'error');
    } finally {
      btn.disabled = false; btn.textContent = 'Salvar alterações';
    }
  });
}

// ── Ações ─────────────────────────────────────────────────────────────────────
async function enviarEmail(boletoId, contaId) {
  const to=document.getElementById('e-to')?.value?.trim();
  const cc=document.getElementById('e-cc')?.value?.trim();
  const subject=document.getElementById('e-subject')?.value?.trim();
  const body=document.getElementById('e-body')?.value?.trim();
  const pdf=document.getElementById('e-pdf')?.checked;
  if(!to) return toast('Informe o destinatário','warning');
  if(!subject) return toast('Informe o assunto','warning');
  if(!body) return toast('Informe o corpo','warning');
  const btn=document.getElementById('btn-enviar');
  if(btn){btn.disabled=true;btn.textContent='Enviando...';}
  try {
    const res=await api.enviarEmail({to,cc,subject,body,boletoId:boletoId||undefined,attachPdf:pdf,contaId:contaId||undefined});
    toast(`E-mail enviado${res.comPdf?' com PDF em anexo':''}!`,'success');
    setTimeout(()=>navigate('historico'),1500);
  } catch(e){
    if(e.message==='session')return;
    toast('Erro ao enviar: '+e.message,'error');
    if(btn){btn.disabled=false;btn.innerHTML=`${svgSend()} Enviar e-mail`;}
  }
}

async function testarSmtp() {
  const btn=document.getElementById('btn-testar-smtp');
  if(!btn)return; btn.disabled=true; btn.textContent='Testando...';
  try{ await api.testarSmtp(); toast('Conexão SMTP funcionando!','success'); }
  catch(e){ toast('Falha SMTP: '+e.message,'error'); }
  finally{ btn.disabled=false; btn.textContent='Testar SMTP'; }
}

// ── Template ──────────────────────────────────────────────────────────────────
function templateEmail(boleto, nome) {
  if(!boleto) return '';
  const link=safeUrl(boleto.bankSlipUrl);
  return `Prezado(a) ${nome||'Cliente'},\n\nSegue o boleto referente ao valor de ${moeda(boleto.value)}, com vencimento em ${dataFmt(boleto.dueDate)}.\n\n${link?'Link para acesso ao boleto:\n'+link+'\n\n':''}O boleto em PDF esta em anexo a este e-mail.\n\nEm caso de duvidas, estamos a disposicao.\n\nAtenciosamente.`;
}

// ── Página: Configuração SMTP ─────────────────────────────────────────────────
async function pageSmtp() {
  setTitle('Configuração de E-mail (SMTP)'); setActive('smtp');
  render(`<div class="loading-overlay"><div class="skeleton" style="width:200px;height:20px"></div></div>`);
  let cfg = {};
  try { cfg = await api.getSmtp() || {}; } catch(e) { render(erroCard(e.message)); return; }

  render(`
    <div style="max-width:640px">
      <p class="text-muted" style="margin-bottom:20px;font-size:13px">
        Configure o servidor SMTP do seu provedor para envio de e-mails. Estas configurações são usadas em todos os envios manuais e automações.
      </p>
      <div class="card">
        <div class="card-header"><span class="card-title">Servidor SMTP</span></div>
        <div class="card-body">
          <div class="form-grid">
            <div class="field">
              <label>Servidor (host) *</label>
              <input class="input" id="smtp-host" placeholder="smtp.seudominio.com.br" value="${esc(cfg.host||'')}">
            </div>
            <div class="field">
              <label>Porta</label>
              <input class="input" id="smtp-port" type="number" style="width:100px" value="${esc(String(cfg.port||587))}">
              <span class="text-muted" style="font-size:11px">587 (TLS) ou 465 (SSL) ou 25</span>
            </div>
            <div class="field" style="grid-column:1/-1">
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
                <input type="checkbox" id="smtp-secure" ${cfg.secure?'checked':''}> Usar SSL/TLS (porta 465)
              </label>
              <span class="text-muted" style="font-size:11px">Deixe desmarcado para STARTTLS (porta 587)</span>
            </div>
            <div class="field">
              <label>Usuário (e-mail) *</label>
              <input class="input" id="smtp-user" type="email" placeholder="envio@suaempresa.com.br" value="${esc(cfg.user||'')}">
            </div>
            <div class="field">
              <label>Senha</label>
              <input class="input" id="smtp-pass" type="password" autocomplete="new-password" placeholder="${cfg.user?'Deixe em branco para manter a atual':'Senha do e-mail'}">
              ${cfg.user?`<span class="text-muted" style="font-size:11px">Senha já configurada — deixe em branco para manter</span>`:''}
            </div>
            <div class="field" style="grid-column:1/-1">
              <label>Nome e e-mail remetente</label>
              <input class="input" id="smtp-from" placeholder="Financeiro Empresa &lt;financeiro@suaempresa.com.br&gt;" value="${esc(cfg.from||'')}">
              <span class="text-muted" style="font-size:11px">Formato: Nome &lt;email@dominio.com&gt; — ou só o e-mail</span>
            </div>
          </div>
          <div style="display:flex;gap:8px;margin-top:16px;flex-wrap:wrap">
            <button class="btn btn-primary" id="btn-salvar-smtp">Salvar configuração</button>
            <button class="btn btn-secondary" id="btn-testar-smtp">Testar conexão</button>
          </div>
          <div id="smtp-resultado" style="margin-top:12px"></div>
        </div>
      </div>
      <div class="card" style="margin-top:20px">
        <div class="card-header"><span class="card-title">Exemplos de configuração</span></div>
        <div class="card-body" style="font-size:13px">
          <table style="width:100%;border-collapse:collapse">
            <thead><tr style="border-bottom:1px solid var(--border)"><th style="text-align:left;padding:6px 8px">Provedor</th><th style="text-align:left;padding:6px 8px">Host</th><th style="text-align:left;padding:6px 8px">Porta</th></tr></thead>
            <tbody>
              ${[['Gmail','smtp.gmail.com','587'],['Outlook/Hotmail','smtp-mail.outlook.com','587'],['Locaweb','email-ssl.com.br','465 (SSL)'],['Hostgator','mail.seudominio.com.br','587'],['Registro.br','mail.seudominio.com.br','587'],['Seu servidor','mail.seudominio.com.br','587']].map(([p,h,po])=>`<tr style="border-bottom:1px solid var(--border)"><td style="padding:6px 8px">${p}</td><td style="padding:6px 8px;font-family:monospace">${h}</td><td style="padding:6px 8px">${po}</td></tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>`);

  document.getElementById('btn-salvar-smtp').addEventListener('click', async () => {
    const btn = document.getElementById('btn-salvar-smtp');
    btn.disabled=true; btn.textContent='Salvando...';
    try {
      await api.salvarSmtp({
        host:   document.getElementById('smtp-host').value.trim(),
        port:   parseInt(document.getElementById('smtp-port').value)||587,
        secure: document.getElementById('smtp-secure').checked,
        user:   document.getElementById('smtp-user').value.trim(),
        password: document.getElementById('smtp-pass').value,
        from:   document.getElementById('smtp-from').value.trim(),
      });
      toast('SMTP salvo com sucesso!','success');
      cfg = await api.getSmtp() || {};
    } catch(e){ toast('Erro: '+e.message,'error'); }
    finally { btn.disabled=false; btn.textContent='Salvar configuração'; }
  });

  document.getElementById('btn-testar-smtp').addEventListener('click', async () => {
    const btn = document.getElementById('btn-testar-smtp');
    const res = document.getElementById('smtp-resultado');
    btn.disabled=true; btn.textContent='Testando...';
    res.innerHTML='';
    try {
      const r = await api.testarSmtpCfg();
      res.innerHTML = `<div style="color:var(--success);font-size:13px">✓ ${esc(r.mensagem)}</div>`;
    } catch(e){
      res.innerHTML = `<div style="color:var(--danger);font-size:13px">✗ ${esc(e.message)}</div>`;
    } finally { btn.disabled=false; btn.textContent='Testar conexão'; }
  });
}

// ── Página: Automações ────────────────────────────────────────────────────────
async function pageAutomacoes() {
  setTitle('Automações de E-mail'); setActive('automacoes');
  render(`<div class="loading-overlay"><div class="skeleton" style="width:200px;height:20px"></div></div>`);

  let contas = [], automacoes = [];
  try {
    [contas, automacoes] = await Promise.all([api.contas(), api.automacoes()]);
  } catch(e) { render(erroCard(e.message)); return; }

  const contasMap = Object.fromEntries([{id:'',nome:'Padrão (.env)'},...contas].map(c=>[c.id,c.nome]));

  function nomeStatus(s)   { return {PENDING:'Pendentes',OVERDUE:'Vencidos'}[s]||s; }
  function nomesTipos(tipos=[]) { return tipos.map(t=>t==='PIX'?'PIX':'Boleto').join(' + '); }
  function nomeGatilho(a) {
    if (a.tipoGatilho==='dia_vencimento') return `No dia do vencimento às ${a.hora||'08:00'}`;
    if (a.tipoGatilho==='dias_antes') return `${a.diasAntes||3} dias antes do vencimento às ${a.hora||'08:00'}`;
    return `Dia ${a.diaDoMes} do mês às ${a.hora||'08:00'}`;
  }

  function renderLista() {
    const rows = automacoes.map(a => `
      <tr>
        <td><strong>${esc(a.nome)}</strong></td>
        <td>${esc(contasMap[a.contaId||'']||'—')}</td>
        <td>${esc(nomeGatilho(a))}</td>
        <td>${nomesTipos(a.tiposPagamento)} — ${nomeStatus(a.statusFiltro)}</td>
        <td><span class="badge ${a.ativa?'badge-received':'badge-cancelled'}">${a.ativa?'Ativa':'Inativa'}</span></td>
        <td>${a.ultimaExecucao?`<span class="text-muted" style="font-size:11px">${dataHora(a.ultimaExecucao)}<br>✉ ${a.ultimoResultado?.enviados??0} env, ${a.ultimoResultado?.erros??0} err</span>`:'—'}</td>
        <td style="white-space:nowrap">
          <button class="btn btn-ghost btn-sm" data-editar-auto="${esc(a.id)}">Editar</button>
          <button class="btn btn-secondary btn-sm" data-sim-auto="${esc(a.id)}">Simular</button>
          <button class="btn btn-primary btn-sm" data-exec-auto="${esc(a.id)}">Executar</button>
          <button class="btn btn-ghost btn-sm" data-del-auto="${esc(a.id)}" style="color:var(--danger)">Excluir</button>
        </td>
      </tr>`).join('');

    document.getElementById('auto-content').innerHTML = `
      <div class="card">
        <div class="card-header">
          <span class="card-title">Automações cadastradas</span>
          <button class="btn btn-primary btn-sm" id="btn-nova-auto">+ Nova automação</button>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Nome</th><th>Conta</th><th>Agendamento</th><th>Filtro</th><th>Status</th><th>Última execução</th><th>Ações</th></tr></thead>
            <tbody>${rows||`<tr><td colspan="7"><div class="empty-state"><p>Nenhuma automação criada ainda.<br>Clique em "+ Nova automação" para começar.</p></div></td></tr>`}</tbody>
          </table>
        </div>
      </div>`;

    document.getElementById('btn-nova-auto').addEventListener('click', () => renderForm(null));

    document.querySelectorAll('[data-editar-auto]').forEach(b =>
      b.addEventListener('click', () => renderForm(automacoes.find(a=>a.id===b.dataset.editarAuto)))
    );

    // ── Simular ───────────────────────────────────────────────────────────────
    document.querySelectorAll('[data-sim-auto]').forEach(b =>
      b.addEventListener('click', async () => {
        b.disabled=true; b.textContent='Consultando...';
        try {
          const r = await api.simularAutomacao(b.dataset.simAuto);
          const moeda = v => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(v||0);
          const rows = r.alvos.map(a => `<tr>
            <td>${esc(a.cliente)}</td>
            <td style="font-size:12px">${a.email ? esc(a.email) : '<span class="badge badge-overdue">Sem e-mail</span>'}</td>
            <td>${moeda(a.valor)}</td>
            <td>${esc(a.vencimento)}</td>
            <td><span class="badge ${a.tipo==='PIX'?'badge-refunded':'badge-pending'}">${a.tipo}</span></td>
          </tr>`).join('');
          const cor = r.total===0 ? 'var(--txt-muted)' : r.semEmail>0 ? 'var(--warning)' : 'var(--success)';
          document.getElementById('auto-content').innerHTML = `
            <div class="card" style="max-width:860px">
              <div class="card-header">
                <span class="card-title">Simulação — o que seria enviado agora</span>
                <button class="btn btn-secondary btn-sm" id="btn-voltar-sim">Voltar</button>
              </div>
              <div class="card-body">
                <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:16px">
                  <div class="stat-card" style="flex:1;min-width:140px">
                    <div class="stat-icon blue">${svgDoc()}</div>
                    <div class="stat-info"><div class="value">${r.total}</div><div class="label">Boletos encontrados</div></div>
                  </div>
                  <div class="stat-card" style="flex:1;min-width:140px">
                    <div class="stat-icon green">${svgSend()}</div>
                    <div class="stat-info"><div class="value">${r.comEmail}</div><div class="label">Receberiam e-mail</div></div>
                  </div>
                  <div class="stat-card" style="flex:1;min-width:140px">
                    <div class="stat-icon ${r.semEmail>0?'red':'green'}">${svgAlert()}</div>
                    <div class="stat-info"><div class="value">${r.semEmail}</div><div class="label">Sem e-mail cadastrado</div></div>
                  </div>
                </div>
                <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;padding:10px 14px;margin-bottom:16px;font-size:13px;color:#15803d">
                  <strong>Mês de referência:</strong> ${esc(r.mesReferencia)} — apenas boletos com vencimento em <strong>${esc(r.prefixoMes)}</strong> são incluídos.
                </div>
                ${r.total===0
                  ? `<div class="empty-state"><p>Nenhum boleto encontrado para ${esc(r.mesReferencia)}.<br>Verifique os filtros da automação.</p></div>`
                  : `<div class="table-wrap"><table>
                      <thead><tr><th>Cliente</th><th>E-mail</th><th>Valor</th><th>Vencimento</th><th>Tipo</th></tr></thead>
                      <tbody>${rows}</tbody>
                    </table></div>`}
              </div>
            </div>`;
          document.getElementById('btn-voltar-sim').addEventListener('click', () => renderLista());
        } catch(e) { toast('Erro na simulação: '+e.message,'error'); }
        finally { b.disabled=false; b.textContent='Simular'; }
      })
    );

    document.querySelectorAll('[data-exec-auto]').forEach(b =>
      b.addEventListener('click', async () => {
        if (!confirm('Executar agora? E-mails reais serão enviados.')) return;
        b.disabled=true; b.textContent='Enviando...';
        try {
          const r = await api.executarAutomacao(b.dataset.execAuto);
          toast(`Concluído! ${r.enviados} enviado(s), ${r.erros} erro(s)`, r.erros>0?'warning':'success');
          automacoes = await api.automacoes(); renderLista();
        } catch(e) { toast('Erro: '+e.message,'error'); b.disabled=false; b.textContent='Executar'; }
      })
    );
    document.querySelectorAll('[data-del-auto]').forEach(b =>
      b.addEventListener('click', async () => {
        if (!confirm('Excluir esta automação?')) return;
        try { await api.deletarAutomacao(b.dataset.delAuto); toast('Excluída','success'); automacoes=await api.automacoes(); renderLista(); }
        catch(e) { toast('Erro: '+e.message,'error'); }
      })
    );
  }

  function renderForm(a) {
    const isNova = !a;
    const tipos = a?.tiposPagamento || ['BOLETO'];
    const contaOpts = [{id:'',nome:'Padrão (.env)'},...contas].map(c=>
      `<option value="${esc(c.id)}" ${(a?.contaId||'')===(c.id)?'selected':''}>${esc(c.nome)}</option>`
    ).join('');
    const diasOpts = Array.from({length:28},(_,i)=>i+1).map(d=>
      `<option value="${d}" ${(a?.diaDoMes||1)==d?'selected':''}>${d}</option>`
    ).join('');
    const statusOpts = ['PENDING','OVERDUE'].map(s=>
      `<option value="${s}" ${(a?.statusFiltro||'PENDING')===s?'selected':''}>${nomeStatus(s)}</option>`
    ).join('');
    const gatilho = a?.tipoGatilho || 'mensal';
    const gatilhoOpts = [
      ['mensal',         'Dia fixo do mês (ex: todo dia 1)'],
      ['dias_antes',     'X dias antes do vencimento'],
      ['dia_vencimento', 'No dia do vencimento'],
    ].map(([v,l])=>`<option value="${v}" ${gatilho===v?'selected':''}>${l}</option>`).join('');

    const corpoDefault = 'Olá, {{nome}}!\n\nSegue o boleto referente ao mês de {{mes}}/{{ano}}.\n\nValor: {{valor}}\nVencimento: {{vencimento}}\n\n{{#linkBoleto}}Acesse seu boleto: {{linkBoleto}}\n\n{{/linkBoleto}}Qualquer dúvida, entre em contato.\n\nAtenciosamente.';

    document.getElementById('auto-content').innerHTML = `
      <div class="card" style="max-width:700px">
        <div class="card-header">
          <span class="card-title">${isNova?'Nova automação':'Editar automação'}</span>
          <label class="toggle-label"><input type="checkbox" id="f-ativa" ${a?.ativa?'checked':''}> Ativar ao salvar</label>
        </div>
        <div class="card-body">
          <div class="form-grid">
            <div class="field" style="grid-column:1/-1">
              <label>Nome da automação *</label>
              <input class="input" id="f-nome-auto" placeholder="Ex: Boleto mensal empresa A" value="${esc(a?.nome||'')}">
            </div>
            <div class="field">
              <label>Conta Asaas</label>
              <select class="select" id="f-conta-auto">${contaOpts}</select>
            </div>
            <div class="field">
              <label>Status a enviar</label>
              <select class="select" id="f-status-auto">${statusOpts}</select>
            </div>
            <div class="field" style="grid-column:1/-1">
              <label>Tipo de gatilho (quando enviar)</label>
              <select class="select" id="f-gatilho-auto" style="width:320px">${gatilhoOpts}</select>
            </div>
            <div class="field" id="campo-dia" ${gatilho!=='mensal'?'style="display:none"':''}>
              <label>Dia do mês</label>
              <select class="select" id="f-dia-auto" style="width:100px">${diasOpts}</select>
              <span class="text-muted" style="font-size:11px">Máx. 28</span>
            </div>
            <div class="field" id="campo-diasantes" ${gatilho!=='dias_antes'?'style="display:none"':''}>
              <label>Quantos dias antes</label>
              <input class="input" id="f-diasantes-auto" type="number" min="1" max="30" style="width:100px" value="${esc(String(a?.diasAntes||3))}">
              <span class="text-muted" style="font-size:11px">Ex: 3 = envia 3 dias antes do vencimento</span>
            </div>
            <div class="field">
              <label>Hora do disparo</label>
              <input class="input" id="f-hora-auto" type="time" value="${esc(a?.hora||'08:00')}" style="width:120px">
            </div>
            <div class="field">
              <label>Tipos de pagamento</label>
              <div style="display:flex;gap:16px;margin-top:6px">
                <label style="display:flex;align-items:center;gap:6px;cursor:pointer"><input type="checkbox" id="f-tipo-boleto" ${tipos.includes('BOLETO')?'checked':''}> Boleto bancário</label>
                <label style="display:flex;align-items:center;gap:6px;cursor:pointer"><input type="checkbox" id="f-tipo-pix" ${tipos.includes('PIX')?'checked':''}> PIX</label>
              </div>
            </div>
            <div class="field">
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
                <input type="checkbox" id="f-pdf-auto" ${a?.anexarPdf?'checked':''}> Anexar PDF do boleto
              </label>
            </div>
            <div class="field" style="grid-column:1/-1">
              <label>Assunto do e-mail</label>
              <input class="input" id="f-assunto-auto" value="${esc(a?.assunto||'Seu boleto de {{mes}}/{{ano}} está disponível')}">
              <span class="text-muted" style="font-size:11px">Variáveis: {{nome}} {{valor}} {{vencimento}} {{mes}} {{ano}} {{tipoPagamento}}</span>
            </div>
            <div class="field" style="grid-column:1/-1">
              <label>Corpo do e-mail</label>
              <textarea class="input" id="f-corpo-auto" rows="9" style="font-family:monospace;resize:vertical">${esc(a?.corpo||corpoDefault)}</textarea>
              <span class="text-muted" style="font-size:11px">{{#linkBoleto}}texto{{/linkBoleto}} — exibe o bloco só quando o link existir</span>
            </div>

            <div style="grid-column:1/-1;border-top:1px solid var(--border);padding-top:16px;margin-top:4px">
              <div class="card-title" style="margin-bottom:12px">Filtro por clientes específicos</div>
              <label class="checkbox-row" style="margin-bottom:8px">
                <input type="checkbox" id="f-filtrar-clientes" ${(a?.clientesFiltro?.length)?'checked':''}>
                Enviar somente para clientes selecionados
              </label>
              <span class="text-muted" style="font-size:11px;display:block;margin-bottom:10px">Desmarcado = envia para todos os clientes com pagamentos encontrados</span>
              <div id="clientes-filtro-section" style="${(a?.clientesFiltro?.length)?'':'display:none'}">
                <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;flex-wrap:wrap">
                  <input class="input" id="f-busca-cliente" placeholder="Buscar por nome..." style="max-width:240px">
                  <button class="btn btn-secondary btn-sm" id="btn-carregar-clientes" type="button">Carregar clientes</button>
                </div>
                <div id="clientes-lista" class="text-muted" style="font-size:13px">Clique em "Carregar clientes" para buscar do Asaas.</div>
              </div>
            </div>

            <div style="grid-column:1/-1;border-top:1px solid var(--border);padding-top:16px;margin-top:4px">
              <div class="card-title" style="margin-bottom:12px">Notificação após execução</div>
              <label class="checkbox-row" style="margin-bottom:8px">
                <input type="checkbox" id="f-notificar-admin" ${a?.notificarAdmin?'checked':''}>
                Enviar resumo ao administrador após cada execução
              </label>
              <div id="notificacao-section" style="${a?.notificarAdmin?'':'display:none'}">
                <div class="field" style="margin-top:8px">
                  <label>E-mail para notificação</label>
                  <input class="input" id="f-email-notif" type="email" placeholder="admin@suaempresa.com.br" style="max-width:320px" value="${esc(a?.emailNotificacao||'')}">
                  <span class="text-muted" style="font-size:11px">Receberá um resumo com número de enviados, erros e sem e-mail</span>
                </div>
              </div>
            </div>
          </div>
          <div style="display:flex;gap:8px;margin-top:16px;flex-wrap:wrap">
            <button class="btn btn-primary" id="btn-salvar-auto">Salvar</button>
            <button class="btn btn-secondary" id="btn-cancelar-auto">Cancelar</button>
          </div>
        </div>
      </div>`;

    document.getElementById('btn-cancelar-auto').addEventListener('click', () => renderLista());

    // Mostra/oculta campos conforme gatilho selecionado
    document.getElementById('f-gatilho-auto').addEventListener('change', e => {
      document.getElementById('campo-dia').style.display       = e.target.value==='mensal'    ? '' : 'none';
      document.getElementById('campo-diasantes').style.display = e.target.value==='dias_antes'? '' : 'none';
    });

    // Toggle: filtrar por clientes
    document.getElementById('f-filtrar-clientes').addEventListener('change', e => {
      document.getElementById('clientes-filtro-section').style.display = e.target.checked ? '' : 'none';
    });

    // Toggle: notificação admin
    document.getElementById('f-notificar-admin').addEventListener('change', e => {
      document.getElementById('notificacao-section').style.display = e.target.checked ? '' : 'none';
    });

    // Estado dos clientes selecionados (Set de IDs)
    const clientesSelecionados = new Set(a?.clientesFiltro || []);
    let todosClientes = [];

    function renderClientesLista(filtro = '') {
      const lista = document.getElementById('clientes-lista');
      if (!todosClientes.length) { lista.textContent = 'Clique em "Carregar clientes" para buscar do Asaas.'; return; }
      const filtrados = filtro
        ? todosClientes.filter(c => c.name?.toLowerCase().includes(filtro.toLowerCase()) || c.email?.toLowerCase().includes(filtro.toLowerCase()))
        : todosClientes;
      if (!filtrados.length) { lista.innerHTML = '<span class="text-muted">Nenhum cliente encontrado.</span>'; return; }
      lista.innerHTML = `<div class="clientes-lista-scroll">${filtrados.map(c => `
        <label class="cliente-item">
          <input type="checkbox" data-cid="${esc(c.id)}" ${clientesSelecionados.has(c.id)?'checked':''}>
          <span>${esc(c.name||'—')}</span>
          ${c.email?`<span class="text-muted" style="font-size:11px">${esc(c.email)}</span>`:''}
        </label>`).join('')}</div>
        <span class="text-muted" style="font-size:11px;margin-top:6px;display:block">${clientesSelecionados.size} selecionado(s)</span>`;
      lista.querySelectorAll('[data-cid]').forEach(cb => cb.addEventListener('change', () => {
        if (cb.checked) clientesSelecionados.add(cb.dataset.cid);
        else clientesSelecionados.delete(cb.dataset.cid);
        lista.querySelector('.text-muted:last-child').textContent = `${clientesSelecionados.size} selecionado(s)`;
      }));
    }

    document.getElementById('btn-carregar-clientes').addEventListener('click', async () => {
      const btn = document.getElementById('btn-carregar-clientes');
      btn.disabled=true; btn.textContent='Carregando...';
      try {
        const contaId = document.getElementById('f-conta-auto').value;
        const res = await api.listarClientes(contaId);
        todosClientes = res.data || [];
        if (!todosClientes.length) { toast('Nenhum cliente encontrado nesta conta','info'); }
        renderClientesLista(document.getElementById('f-busca-cliente').value);
      } catch(e) { toast('Erro ao carregar clientes: '+e.message,'error'); }
      finally { btn.disabled=false; btn.textContent='Carregar clientes'; }
    });

    document.getElementById('f-busca-cliente').addEventListener('input', e => renderClientesLista(e.target.value));

    // Se há clientes pré-selecionados, carrega automaticamente
    if (a?.clientesFiltro?.length) {
      const contaId = document.getElementById('f-conta-auto').value;
      api.listarClientes(contaId).then(res => {
        todosClientes = res.data || [];
        renderClientesLista();
      }).catch(() => {});
    }

    document.getElementById('btn-salvar-auto').addEventListener('click', async () => {
      const tipos = [];
      if (document.getElementById('f-tipo-boleto').checked) tipos.push('BOLETO');
      if (document.getElementById('f-tipo-pix').checked)    tipos.push('PIX');
      if (!tipos.length) { toast('Selecione ao menos um tipo de pagamento','warning'); return; }
      const nome = document.getElementById('f-nome-auto').value.trim();
      if (!nome) { toast('Informe um nome para a automação','warning'); return; }
      const filtrarClientes = document.getElementById('f-filtrar-clientes').checked;
      const notificar = document.getElementById('f-notificar-admin').checked;
      const emailNotif = document.getElementById('f-email-notif').value.trim();
      if (notificar && !emailNotif) { toast('Informe o e-mail para notificação','warning'); return; }
      const gatilhoSel = document.getElementById('f-gatilho-auto').value;
      const payload = {
        nome,
        contaId:          document.getElementById('f-conta-auto').value,
        ativa:            document.getElementById('f-ativa').checked,
        tipoGatilho:      gatilhoSel,
        diaDoMes:         parseInt(document.getElementById('f-dia-auto')?.value||1),
        diasAntes:        parseInt(document.getElementById('f-diasantes-auto')?.value||3),
        hora:             document.getElementById('f-hora-auto').value,
        tiposPagamento:   tipos,
        statusFiltro:     document.getElementById('f-status-auto').value,
        clientesFiltro:   filtrarClientes ? [...clientesSelecionados] : [],
        assunto:          document.getElementById('f-assunto-auto').value,
        corpo:            document.getElementById('f-corpo-auto').value,
        anexarPdf:        document.getElementById('f-pdf-auto').checked,
        notificarAdmin:   notificar,
        emailNotificacao: notificar ? emailNotif : '',
      };
      const btn = document.getElementById('btn-salvar-auto');
      btn.disabled=true; btn.textContent='Salvando...';
      try {
        if (isNova) await api.criarAutomacao(payload);
        else        await api.salvarAutomacao(a.id, payload);
        toast(isNova?'Automação criada!':'Automação salva!','success');
        automacoes = await api.automacoes();
        renderLista();
      } catch(e) { toast('Erro: '+e.message,'error'); btn.disabled=false; btn.textContent='Salvar'; }
    });
  }

  render(`<div id="auto-content"></div>`);
  renderLista();
}

// ── Página: Auditoria ─────────────────────────────────────────────────────────
async function pageAuditoria() {
  setTitle('Auditoria de Segurança'); setActive('auditoria');
  render(`<div class="card"><div class="loading-overlay"><div class="skeleton" style="width:200px;height:20px"></div></div></div>`);
  try {
    const eventos = await api.auditoria(200);

    const tipoBadge = t => {
      if (t === 'login')              return '<span class="badge badge-login">Login</span>';
      if (t === 'login_falha')        return '<span class="badge badge-falha">Login falhou</span>';
      if (t === 'logout')             return '<span class="badge badge-logout">Logout</span>';
      if (t === 'perfil_atualizado')  return '<span class="badge badge-perfil">Perfil</span>';
      if (t === 'automacao_executada')return '<span class="badge badge-automacao">Automação</span>';
      return `<span class="badge badge-cancelled">${esc(t)}</span>`;
    };

    const rows = eventos.map(e => `<tr>
      <td>${dataHora(e.criadoEm)}</td>
      <td>${tipoBadge(e.tipo)}</td>
      <td>${esc(e.usuario)}</td>
      <td class="text-muted" style="font-size:12px;font-family:monospace">${esc(e.ip)}</td>
      <td style="font-size:12px;color:var(--txt-muted)">${esc(e.detalhe)||'—'}</td>
    </tr>`).join('');

    document.querySelector('.card').innerHTML = `
      <div class="card-header">
        <span class="card-title">${eventos.length} evento(s)</span>
        <span class="text-muted" style="font-size:12px">Últimos 200 eventos</span>
      </div>
      <div class="table-wrap"><table>
        <thead><tr><th>Data/Hora</th><th>Tipo</th><th>Usuário</th><th>IP</th><th>Detalhe</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="5"><div class="empty-state"><p>Nenhum evento registrado ainda</p></div></td></tr>`}</tbody>
      </table></div>`;
  } catch(e) { if(e.message==='session')return; document.querySelector('.card').innerHTML=`<div class="card-body">${erroCard(e.message)}</div>`; }
}

// ── Navegação ─────────────────────────────────────────────────────────────────
function navigate(page,extra){ state.page=page; window.location.hash=extra?`${page}/${extra}`:page; }

function route(){
  const hash=window.location.hash.replace('#','')||'dashboard';
  const[page,extra]=hash.split('/');
  switch(page){
    case'dashboard': return pageDashboard();
    case'boletos':   return pageBoletos();
    case'email':     return pageEmail(extra||null);
    case'historico':   return pageHistorico();
    case'contas':      return pageContas();
    case'perfil':      return pagePerfil();
    case'automacoes':  return pageAutomacoes();
    case'smtp':        return pageSmtp();
    case'auditoria':   return pageAuditoria();
    default:         return pageDashboard();
  }
}

document.querySelectorAll('.nav-item[data-page]').forEach(el=>el.addEventListener('click',()=>navigate(el.dataset.page)));
window.addEventListener('hashchange',route);

// ── Helpers ───────────────────────────────────────────────────────────────────
function erroCard(msg){
  return `<div class="empty-state"><p class="text-muted">${msg.includes('ASAAS_API_KEY')?'API do Asaas nao configurada. Va em <strong>Contas Asaas</strong> e cadastre sua chave.':esc(msg)}</p></div>`;
}
function svgDoc()    {return`<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`;}
function svgClock()  {return`<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;}
function svgCheck()  {return`<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>`;}
function svgAlert()  {return`<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;}
function svgRefresh(){return`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>`;}
function svgSend()   {return`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`;}

// ── Init ──────────────────────────────────────────────────────────────────────
(async()=>{
  try{ const user=await api.me(); showApp(user); }
  catch{ showLogin(); }
})();
