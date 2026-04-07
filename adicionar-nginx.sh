#!/bin/bash
# Execute como admin-rhl: sudo bash /home/rhl-server/boleto-automacao/adicionar-nginx.sh

set -e

NGINX_CONF="/etc/nginx/sites-enabled/itdoc"
BACKUP="${NGINX_CONF}.bak.$(date +%Y%m%d%H%M%S)"

echo "Fazendo backup: $BACKUP"
cp "$NGINX_CONF" "$BACKUP"

# Inserir bloco antes de "# ── Gestão Financeira"
python3 - "$NGINX_CONF" << 'PYEOF'
import sys, re

path = sys.argv[1]
with open(path, 'r') as f:
    content = f.read()

bloco = """
    # ── Boleto Automação Asaas ────────────────────────────────────────────────
    location ^~ /boletos/ {
        rewrite ^/boletos/(.*) /$1 break;
        proxy_pass http://localhost:3003;
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

content = content.replace("    # ── Gestão Financeira", bloco, 1)

with open(path, 'w') as f:
    f.write(content)
print("Bloco inserido com sucesso.")
PYEOF

echo "Testando configuração nginx..."
nginx -t

echo "Recarregando nginx..."
systemctl reload nginx

echo ""
echo "✅ Pronto! Boleto Automação disponível em /boletos/"
echo "   Teste: curl https://SEU-SERVIDOR/boletos/health"
