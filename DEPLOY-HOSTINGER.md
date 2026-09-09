# Deploy na Hostinger

## Produção atual (já no ar)

- **URL:** https://ponto.gestaosystem.tech  (SSL Let's Encrypt via Traefik)
- **VPS:** `1741392` (KVM 1) — projeto Docker Compose `relogio-ponto` em `/docker/relogio-ponto/`
- **Imagem:** `ghcr.io/b1ernardo/relogio-ponto:latest`, buildada pelo GitHub Actions
  (`.github/workflows/build-and-push`) a cada push na branch `main` do repo `b1ernardo/ponto`
- **Porta:** container `3000` → host `3025` (Traefik roteia por `Host(ponto.gestaosystem.tech)`)
- **Dados persistentes:** volume Docker `relogioponto_data` montado em `/data`
  (banco `relogio-ponto.db` + `uploads/`)
- **Login admin:** `b1ernardo@gmail.com` (senha definida no deploy; troque em **Empresa → Administradores**)

### Atualizar a aplicação

```bash
git push origin main          # GitHub Actions publica a nova imagem no GHCR
```
Depois, no hPanel → VPS → Docker → projeto `relogio-ponto` → **Redeploy** (ou recriar o
projeto pelo mesmo docker-compose.yml). Isso puxa a imagem `:latest` e recria o container;
o volume `relogioponto_data` é preservado.

### Observação

A sessão do admin é persistida no próprio SQLite (`SqliteStore`), então "Manter-me
conectado" sobrevive a reinícios/deploys do container.

---


O reconhecimento facial exige **HTTPS** (o navegador só libera a câmera em contexto seguro).
A Hostinger oferece SSL grátis nos dois cenários abaixo.

> **Atenção à versão do Node:** o sistema usa `node:sqlite`, que só existe no **Node 22.5+**.
> Confirme a versão disponível antes de escolher o plano. Se não houver Node 22+, use a **VPS**.

---

## Opção A — VPS Hostinger (recomendada)

Controle total, Node na versão que quiser, SQLite e uploads persistentes.

### 1. Criar a VPS
- hPanel → VPS → contratar (KVM 1 já atende) → template **Ubuntu 24.04**.
- Aponte um domínio/subdomínio (ex.: `ponto.suaempresa.com`) para o IP da VPS (registro A).

### 2. Instalar Node 24 e dependências
```bash
ssh root@SEU_IP
curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
apt-get install -y nodejs git nginx
```

### 3. Publicar a aplicação
```bash
adduser --system --group ponto
cd /opt && git clone SEU_REPO relogio-ponto   # ou envie os arquivos via SFTP
cd relogio-ponto
npm install --omit=dev
npm run models                                 # baixa os modelos faciais
mkdir -p /var/lib/relogio-ponto
chown -R ponto:ponto /opt/relogio-ponto /var/lib/relogio-ponto
```

### 4. Configurar `.env`
```bash
cp .env.example .env && nano .env
```
```ini
PORT=3000
HOST=127.0.0.1
SESSION_SECRET=<gere: openssl rand -hex 32>
SECURE_COOKIES=true
TRUST_PROXY=true
DATA_DIR=/var/lib/relogio-ponto
UPLOAD_DIR=/var/lib/relogio-ponto/uploads
SEED_ADMIN_EMAIL=voce@suaempresa.com
SEED_ADMIN_PASSWORD=<senha forte>
```

### 5. Serviço systemd
```bash
cat >/etc/systemd/system/relogio-ponto.service <<'EOF'
[Unit]
Description=Relogio de Ponto
After=network.target

[Service]
Type=simple
User=ponto
WorkingDirectory=/opt/relogio-ponto
ExecStart=/usr/bin/node src/server.js
Restart=always
EnvironmentFile=/opt/relogio-ponto/.env

[Install]
WantedBy=multi-user.target
EOF
systemctl enable --now relogio-ponto
systemctl status relogio-ponto
```

### 6. Nginx + HTTPS
```bash
cat >/etc/nginx/sites-available/ponto <<'EOF'
server {
  server_name ponto.suaempresa.com;
  client_max_body_size 15M;
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
EOF
ln -s /etc/nginx/sites-available/ponto /etc/nginx/sites-enabled/
apt-get install -y certbot python3-certbot-nginx
certbot --nginx -d ponto.suaempresa.com     # emite e configura o SSL
nginx -t && systemctl reload nginx
```

Pronto: `https://ponto.suaempresa.com/login` (painel) e `.../kiosk` (celular da empresa).

### Atualizar depois
```bash
cd /opt/relogio-ponto && git pull && npm install --omit=dev && systemctl restart relogio-ponto
```

### Backup
Copie periodicamente `/var/lib/relogio-ponto` (banco `relogio-ponto.db` + pasta `uploads`).

---

## Opção B — Hospedagem Node.js no hPanel (planos Business/Cloud)

1. hPanel → seu site → **Avançado → Node.js**.
2. **Node version**: escolha **22 ou superior** (se não houver, use a Opção A).
3. **Application root**: pasta onde você subiu os arquivos (via Gerenciador de Arquivos ou Git).
4. **Application startup file**: `src/server.js`.
5. Clique em **NPM install**.
6. Em **variáveis de ambiente**, defina `SESSION_SECRET`, `SECURE_COOKIES=true`,
   `TRUST_PROXY=true`, `DATA_DIR=/home/USUARIO/ponto-data`, `UPLOAD_DIR=/home/USUARIO/ponto-data/uploads`,
   `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`. **Não** defina `PORT` (a Hostinger injeta).
7. Pelo SSH, rode `npm run models` na pasta da aplicação (ou deixe o `FACE_MODEL_URL` padrão via CDN).
8. hPanel → **SSL** → ative o certificado grátis para o domínio.
9. Reinicie a aplicação no painel.

Acesse `https://seudominio/login` e `https://seudominio/kiosk`.

> Limitações do plano compartilhado: processo pode ser reciclado (SQLite aguenta bem 1 ponto de
> registro; para vários simultâneos prefira a VPS) e o disco é compartilhado — faça backup de `DATA_DIR`.

---

## Checklist pós-deploy

- [ ] `https://.../health` responde `{ "ok": true }`
- [ ] Login no painel com o admin do `.env`
- [ ] **Empresa**: CNPJ/razão social preenchidos
- [ ] **Escala** criada e vinculada aos funcionários
- [ ] Funcionário com **PIS** e **rosto** cadastrados
- [ ] **Dispositivo** criado e token colado no `/kiosk` do celular da empresa
- [ ] Bater ponto de teste → aparece em **Batidas** com foto e GPS
- [ ] **AFD** do mês baixa sem erro
