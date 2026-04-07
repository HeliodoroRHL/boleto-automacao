# BoletoHub

Portal web de automação de boletos e PIX integrado com a API do **Asaas**, com envio de e-mails automáticos via SMTP, histórico de envios, múltiplas contas e auditoria de segurança.

## Funcionalidades

### Painel (Dashboard)
- Cards com total, pendentes, pagos e vencidos
- Cards de e-mails enviados hoje / últimos 7 dias / mês atual
- Tabela de boletos recentes com ação de envio de e-mail
- Tabela dos últimos e-mails enviados

### Boletos Asaas
- Listagem paginada com filtro por status
- Link direto para visualizar o boleto no Asaas
- Envio de e-mail individual com um clique

### Contas Asaas
- Suporte a múltiplas contas Asaas (cada uma com API key própria)
- E-mail remetente por conta (opcional)
- Teste de conexão por conta

### Envio de E-mail Manual
- Composição com destinatário, CC, assunto e corpo
- Anexo automático do PDF do boleto (quando disponível)
- Pré-preenchimento com dados do cliente e boleto selecionado

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
- Anexar PDF do boleto automaticamente
- **Notificação ao admin** após cada execução (resumo com enviados/erros)

### Configuração SMTP
- Interface web para configurar servidor SMTP
- Suporte a TLS (porta 587) e SSL (porta 465)
- Teste de conexão em tempo real
- Sem necessidade de reiniciar o servidor

### Auditoria de Segurança
- Registro de todos os eventos: login, falhas, logout, alterações de perfil, execuções de automações
- Tabela colorida por tipo de evento
- Últimos 500 eventos armazenados

## Requisitos

- Node.js >= 14
- Conta Asaas com API key
- Servidor SMTP para envio de e-mails

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
SMTP_HOST=smtp.seudominio.com.br
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=envio@seudominio.com.br
SMTP_PASS=sua_senha_smtp
SMTP_FROM=Financeiro <envio@seudominio.com.br>
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
│   │   ├── boletos.js
│   │   ├── contas.js
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
| POST | `/api/painel/email/enviar` | Enviar e-mail |
| GET | `/api/painel/email/historico` | Histórico |
| GET | `/api/painel/email/resumo` | Resumo para dashboard |
| GET/PUT | `/api/smtp` | Configuração SMTP |
| POST | `/api/smtp/testar` | Testar SMTP |
| GET/POST | `/api/automacoes` | Listar/criar automações |
| PUT/DELETE | `/api/automacoes/:id` | Editar/excluir |
| POST | `/api/automacoes/:id/executar` | Executar manualmente |
| GET/POST/PUT/DELETE | `/api/contas` | Gerenciar contas Asaas |
| GET | `/api/auditoria` | Log de auditoria |
| POST | `/webhook/asaas` | Webhook Asaas |
| GET | `/health` | Health check |

## Licença

MIT
