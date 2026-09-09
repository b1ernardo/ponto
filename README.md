# Relógio de Ponto com Reconhecimento Facial

Sistema web de registro de entrada/saída de funcionários pelo **celular da empresa**,
com **reconhecimento facial no navegador** (face-api.js), **trava por dispositivo**,
**foto + GPS a cada batida**, relatórios (espelho de ponto, horas, atrasos, faltas) e
exportação **AFD** (layout Portaria 1510, aceito pela Portaria 671/2021 para REP alternativo).

- Stack: **Node.js + Express + EJS**, banco **SQLite embutido** (`node:sqlite`, sem servidor de BD).
- Reconhecimento facial roda **no dispositivo**; o servidor só guarda o vetor facial (128 números) e compara.

## Requisitos

- **Node.js 22.5+** (recomendado 24). O módulo `node:sqlite` não existe em versões antigas.
- Câmera + **HTTPS** no dispositivo que vai bater ponto (navegador só libera câmera em contexto seguro).

## Rodar localmente

```bash
npm install
cp .env.example .env          # ajuste SESSION_SECRET e a senha do admin
npm run models                # baixa os modelos faciais para public/models (opcional, mas recomendado)
npm start
```

- Painel administrativo: <http://localhost:3000/login>
  (admin inicial = `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` do `.env`)
- Tela de bater ponto: <http://localhost:3000/kiosk>

> Para testar a câmera fora de `localhost` use HTTPS (ex.: `ngrok http 3000`) ou publique (ver `DEPLOY-HOSTINGER.md`).

## Como usar

1. **Empresa** → preencha razão social e CNPJ/CPF (vão no cabeçalho do AFD).
2. **Escalas** → defina a jornada por dia da semana e a tolerância.
3. **Funcionários** → cadastre o funcionário (com **PIS**, obrigatório para o AFD) e clique em **Rosto**
   para capturar 3–5 amostras faciais.
4. **Dispositivos** → gere um token e cadastre-o no celular da empresa abrindo `/kiosk` e colando o token.
   Só dispositivos com token válido conseguem registrar ponto.
5. No **celular da empresa**, deixe `/kiosk` aberto. Ao aproximar o rosto, o ponto é registrado
   automaticamente (entrada/saída alternadas), com foto e GPS.
6. **Relatórios**:
   - *Espelho de ponto* (por funcionário) — PDF e CSV
   - *Resumo de horas* (todos) — CSV
   - *Atrasos e faltas* — CSV
7. **AFD** → escolha o mês e baixe o arquivo `.txt`.

## Regras de cálculo

- As marcações são pareadas em ordem: 1ª entrada, 2ª saída, 3ª entrada... (número ímpar = inconsistência).
- **Atraso**: 1ª batida depois do início da escala + tolerância.
- **Hora extra**: saldo do dia acima da tolerância.
- **Falta**: dia com jornada prevista e nenhuma marcação.
- **Banco de horas**: soma de (trabalhado − previsto) no período.

## Segurança e privacidade

- O rosto é convertido em um vetor de 128 números (descritor). A foto de referência e as fotos de
  cada batida ficam em `data/uploads/`.
- Trava por dispositivo via token (revogável em **Dispositivos**).
- Toda ação administrativa fica registrada em **Empresa → Auditoria**.
- Reconhecimento biométrico é **dado pessoal sensível (LGPD)**: colete consentimento dos funcionários
  e ofereça alternativa de registro quando exigido.

## Variáveis de ambiente

Veja `.env.example`. Principais:

| Variável | Descrição |
|---|---|
| `PORT` / `HOST` | porta/bind (a Hostinger define `PORT`) |
| `SESSION_SECRET` | segredo da sessão (troque!) |
| `SECURE_COOKIES` / `TRUST_PROXY` | `true` em produção atrás de HTTPS/proxy |
| `DATA_DIR` / `UPLOAD_DIR` | pastas persistentes (use caminho absoluto em produção) |
| `FACE_MATCH_THRESHOLD` | distância máx. para reconhecer (0.45–0.6; padrão 0.52) |
| `FACE_MODEL_URL` | fonte dos modelos (fallback do `public/models`) |
| `PUNCH_MIN_INTERVAL_SECONDS` | trava anti-duplicidade entre batidas |

## Estrutura

```
src/
  server.js            bootstrap Express
  config.js  db.js      config + schema SQLite
  middleware/auth.js    sessão admin + token de dispositivo
  routes/               auth, dashboard, employees, schedules, devices, punch, reports, afd, company
  services/             face (match), workhours (cálculo), afd, pdf, storage, time
  views/                EJS (painel + kiosk)
public/                 css, js do navegador (face-common.js), modelos faciais
scripts/download-models.mjs
```

## Limitações do AFD

Gera os registros tipo **1 (cabeçalho)**, **3 (marcação)** e **9 (trailer)** no layout 1510.
O registro **tipo 7 assinado digitalmente** do REP-P depende de hardware/certificado homologado
e não é gerado por este sistema.
