# BoletoHub

Portal web de automação de boletos e PIX integrado com a API do **Asaas**, com envio de e-mails automáticos via SMTP, histórico de envios, múltiplas contas e auditoria de segurança.

## Funcionalidades

### Painel (Dashboard)
- Cards com total, pendentes, pagos e vencidos
- Cards de e-mails enviados hoje / últimos 7 dias / mês atual
- Tabela de boletos do **mês atual** com ação de envio de e-mail
- Tabela dos últimos e-mails enviados
- **Modo privacidade** — oculta valores, e-mails e dados sensíveis com um clique

### Boletos Asaas
- Listagem paginada com filtro por status e intervalo de datas
- Link direto para visualizar o boleto no Asaas
- Envio de e-mail individual com um clique

### Nova Cobrança
- Criação de **cobrança avulsa** (boleto, PIX ou cartão) diretamente no portal
- Criação de **cobrança recorrente** (assinatura) com ciclo semanal, mensal, bimestral, trimestral, semestral ou anual
- Criação automática de cliente no Asaas se não informado

### Contas Asaas
- Suporte a múltiplas contas Asaas (cada uma com API key própria)
- E-mail remetente por conta (opcional)
- Teste de conexão por conta

### Envio de E-mail Manual
- Composição com destinatário, CC, assunto e corpo
- Modelos de assunto pré-salvos (configuráveis em Personalização)
- Anexo automático do PDF do boleto (quando disponível)
- Pré-preenchimento com dados do cliente e boleto selecionado

### Layout de E-mail
- Template HTML responsivo com cabeçalho escuro e logo da empresa
- Logo enviada como **CID attachment** — compatível com Gmail, Outlook e Apple Mail
- Rodapé configurável com ícones de WhatsApp, e-mail, Instagram e site
- Disclaimer fixo de e-mail automático

### Histórico de Envios
- Registro completo de todos os e-mails enviados
- Data/hora, destinatário, assunto, cliente e indicador de PDF

### Automações de E-mail
- Crie automações com 3 tipos de gatilho:
  - **Dia fixo do mês** — ex: todo dia 5 às 08:00
  - **X dias antes do vencimento** — ex: 3 dias antes
  - **No dia do vencimento**
- Filtro por tipo de pagamento (boleto e/ou PIX)
- Filtro por status (pendentes / vencidos)
- **Filtro por clientes específicos** — selecione clientes cadastrados no Asaas
- Template de assunto e corpo com variáveis: `{{nome}}`, `{{valor}}`, `{{vencimento}}`, `{{mes}}`, `{{ano}}`, `{{linkBoleto}}`
- Bloco condicional: `{{#linkBoleto}}...{{/linkBoleto}}`
- Modelos de assunto pré-salvos (selecionável por dropdown)
- Anexar PDF do boleto automaticamente
- **E-mails em cópia (CC)** — adicione múltiplos endereços que recebem cópia de todos os envios da automação
- **Notificação ao admin** após cada execução (resumo com enviados/erros)

### Personalização
- Nome do portal
- Upload de logo (PNG/JPG/SVG)
- Modelos de assunto de e-mail (até 20 presets)
- Dados do rodapé: telefone/WhatsApp, e-mail de contato, Instagram, site

### Configuração SMTP
- Interface web para configurar servidor SMTP (Brevo, Gmail, HostGator etc.)
- Suporte a STARTTLS (porta 587) e SSL direto (porta 465)
- Teste de conexão em tempo real
- Sem necessidade de reiniciar o servidor

### Auditoria de Segurança
- Registro de todos os eventos: login, falhas, logout, alterações de perfil, execuções de automações
- Tabela colorida por tipo de evento
- Últimos 500 eventos armazenados

## Requisitos

- Node.js >= 14
- Conta Asaas com API key
- Servidor SMTP para envio de e-mails (recomendado: [Brevo](https://brevo.com) — 300 e-mails/dia grátis, excelente entregabilidade no Gmail)

## Instalação

```bash
git clone https://github.com/HeliodoroRHL/boleto-automacao.git
cd boleto-automacao
npm install
cp .env.example .env
# edite o .env com suas configurações
npm start
```

## Configuração (.env)

```env
PORT=3003
NODE_ENV=production

# JWT — gere uma string aleatória longa
JWT_SECRET=sua_chave_secreta_min_32_chars

# Usuário administrador inicial
ADMIN_EMAIL=admin@suaempresa.com.br
ADMIN_PASSWORD=SuaSenhaForte@123
ADMIN_NOME=Administrador

# API Asaas (conta padrão — opcional se usar múltiplas contas)
ASAAS_API_KEY=sua_chave_api_asaas
ASAAS_BASE_URL=https://api.asaas.com/v3

# SMTP padrão (opcional — pode configurar pela interface)
# Exemplo com Brevo:
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=seu@email.com
SMTP_PASS=sua_smtp_key_brevo
SMTP_FROM=Empresa <financeiro@suaempresa.com.br>
```

## Estrutura do Projeto

```
boleto-automacao/
├── public/               # Frontend SPA
│   ├── index.html
│   ├── css/style.css
│   └── js/app.js
├── src/
│   ├── db/               # Persistência JSON
│   │   ├── automacoes.js
│   │   ├── auditoria.js
│   │   ├── config.js
│   │   ├── contas.js
│   │   ├── database.js
│   │   ├── smtp.js
│   │   └── users.js
│   ├── middleware/
│   │   ├── authMiddleware.js
│   │   └── logger.js
│   ├── routes/
│   │   ├── auth.js
│   │   ├── auditoria.js
│   │   ├── automacoes.js
│   │   ├── config.js
│   │   ├── painel.js
│   │   ├── smtp.js
│   │   └── webhook.js
│   ├── services/
│   │   ├── asaasService.js
│   │   ├── automacaoService.js
│   │   └── emailService.js
│   └── index.js
├── data/                 # Dados locais (gitignored)
├── .env.example
└── package.json
```

## Segurança

- Autenticação JWT em cookie `HttpOnly`, `Secure`, `SameSite=Strict`
- Senhas com bcrypt (12 rounds)
- Requisitos de senha: mínimo 8 caracteres, letra maiúscula, número e caractere especial
- Rate limiting no endpoint de login (10 tentativas/15min)
- Rate limiting no envio de e-mail (30/min por IP)
- Proteção contra timing attacks no login
- Headers HTTP seguros via Helmet
- CORS restrito à própria origem
- Auto-logout por inatividade (30 minutos)
- Auditoria de todos os eventos de acesso e configuração

## API Endpoints

Todos os endpoints `/api/*` requerem autenticação via cookie `bhtoken`.

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| POST | `/auth/login` | Autenticação |
| POST | `/auth/logout` | Encerrar sessão |
| GET | `/auth/me` | Dados do usuário atual |
| PUT | `/auth/perfil` | Alterar dados/senha |
| GET | `/api/painel/stats` | Estatísticas de boletos |
| GET | `/api/painel/boletos` | Listar boletos |
| GET | `/api/painel/clientes` | Listar clientes |
| POST | `/api/painel/cobrancas` | Criar cobrança avulsa |
| POST | `/api/painel/assinaturas` | Criar cobrança recorrente |
| POST | `/api/painel/email/enviar` | Enviar e-mail |
| GET | `/api/painel/email/historico` | Histórico de e-mails |
| GET | `/api/painel/email/resumo` | Resumo para dashboard |
| GET/PUT | `/api/smtp` | Configuração SMTP |
| POST | `/api/smtp/testar` | Testar SMTP |
| GET/PUT | `/api/config` | Personalização do portal |
| GET/POST | `/api/automacoes` | Listar/criar automações |
| PUT/DELETE | `/api/automacoes/:id` | Editar/excluir |
| POST | `/api/automacoes/:id/executar` | Executar manualmente |
| POST | `/api/automacoes/:id/simular` | Simular sem enviar |
| GET/POST/PUT/DELETE | `/api/contas` | Gerenciar contas Asaas |
| GET | `/api/auditoria` | Log de auditoria |
| POST | `/webhook/asaas` | Webhook Asaas |
| GET | `/health` | Health check |

## Licença

MIT
