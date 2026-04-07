#!/bin/bash
# Execute como admin-rhl: sudo bash /home/rhl-server/boleto-automacao/corrigir-nginx.sh

set -e

NGINX_CONF="/etc/nginx/sites-enabled/itdoc"

echo "Corrigindo bloco /boletos/ no nginx..."

python3 - "$NGINX_CONF" << 'PYEOF'
import sys, re

path = sys.argv[1]
with open(path, 'r') as f:
    content = f.read()

# Remove o bloco antigo /boletos/ (com rewrite) e o location = /boletos
content = re.sub(
    r'\s*# ── Boleto Automação Asaas.*?location = /boletos \{[^}]*\}\n',
    '\n',
    content,
    flags=re.DOTALL
)

# Insere o bloco correto antes do bloco Gestão Financeira
bloco_correto = """
    # ── Boleto Automação Asaas ────────────────────────────────────────────────
    location ^~ /boletos/ {
        proxy_pass http://localhost:3003/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        client_max_body_size 10m;
        proxy_read_timeout 60s;
        add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
        add_header X-Content-Type-Options "nosniff" always;
        add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    }

    location = /boletos {
        return 301 /boletos/;
    }

    # ── Gestão Financeira"""

content = re.sub(
    r'\s*# ── Gestão Financeira',
    bloco_correto,
    content,
    count=1
)

with open(path, 'w') as f:
    f.write(content)

print("Bloco corrigido com sucesso.")
PYEOF

echo "Testando configuração..."
nginx -t

echo "Recarregando nginx..."
systemctl reload nginx

echo ""
echo "✅ Pronto! Testando internamente..."
curl -s http://localhost:3003/health
echo ""
echo "Acesse: https://192.168.70.187/boletos/"
