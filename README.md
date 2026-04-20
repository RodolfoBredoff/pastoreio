# Pastoreio

Sistema de gestão para pequenos grupos (células / grupos de estudo), entregue como **Progressive Web App (PWA)** com Next.js e PostgreSQL. Nome do repositório e do pacote npm: **`pastoreio`**; a marca exibida no app é **Pastoreio**.

## Características principais

### Gestão e pessoas

- **CRUD de pessoas** com tipo Participante / Visitante, telefone, data de nascimento e integração **WhatsApp**
- **Tags personalizáveis** por organização, filtros e gráficos por tag
- **Funil de visitantes** (estágios) e painel de acompanhamento
- **Discipulador** (vínculo e relatórios por discipulador)
- **Exportação LGPD** de dados do membro (conformidade)
- **Log de contatos** para histórico de interações

### Agenda e encontros

- **Agenda** com geração automática, edição manual, tipos (regular / evento especial), cancelamento e **calendário** (visualização e CRUD com suporte a cache para uso offline)
- **Histórico** com contagem de presenças (membros + visitantes não cadastrados)
- **Lista de presença pública** por link com token (prazo de expiração, telefone opcional, convidados em eventos especiais)
- **Checklist interno** na lista de presença (campos customizáveis, rótulos para não marcados)
- **Compartilhamento de engajamento** (relatório público por link, com filtros)

### Chamada e engajamento

- **Chamada digital**: membros + visitantes não cadastrados; contadores; salvamento em lote; conversão em membro após critérios definidos
- **Engajamento**: gráficos por período, por encontro ou por nome; filtro por tipo (Total / Participantes / Visitantes); comparação entre grupos (coordenador/admin)
- **Integração Google Sheets** para exportar/visualizar engajamento (ver `docs/GOOGLE_SHEETS_ENGAGEMENT.md`)

### Comunicação e alertas

- **Broadcast** e mensagens em massa via links WhatsApp (incl. faltantes em eventos)
- **Notificações push** (Web Push) e **notificações in-app** (faltas consecutivas, aniversários, desvinculação de visitantes, etc.)
- **Alertas dedicados** e **cron** (`/api/webhooks/cron` / rotas de cron protegidas por segredo)
- **Configurações de notificação por grupo** (habilitar/desabilitar tipos)

### Produto e plataforma

- **PWA** instalável (iOS/Android), **modo offline** sincronizando quando possível
- **Multi-tenancy**: organizações, grupos, líderes
- **Papéis**: Líder, Secretário (chamada / leitura), Coordenador (organização), Admin (sistema)
- **Autenticação**: JWT em cookies httpOnly, magic link, login com senha, troca de senha e fluxos de segurança (ex.: senha obrigatória após política)
- **Deploy AWS**: EC2, CloudFront, PostgreSQL em Docker, SSM Parameter Store, GitHub Actions (OIDC); backup para S3 documentado

## Stack tecnológica

| Camada | Tecnologias |
|--------|-------------|
| Frontend | Next.js (App Router), React, TypeScript, Tailwind CSS, shadcn/ui, Radix, Recharts, react-big-calendar |
| Backend | API Routes Next.js, PostgreSQL, JWT |
| PWA | next-pwa, Dexie (offline) |
| Deploy | Docker, AWS (SSM, SES, S3 conforme guias), GitHub Actions |

## Pré-requisitos

- Node.js 18+
- PostgreSQL 15+ (local ou remoto)
- Docker (opcional, para PostgreSQL local)
- Conta AWS (para deploy em produção)

## Quick start

Referência rápida: [`QUICKSTART.md`](./QUICKSTART.md).

```bash
cd pastoreio
npm install

# PostgreSQL (Docker) — exemplo de nome de container
docker run -d --name pastoreio-db \
  -e POSTGRES_PASSWORD=senha_segura \
  -e POSTGRES_DB=pequenos_grupos \
  -p 5432:5432 postgres:15-alpine

# Aplicar todas as migrações em ordem (001, 002, … até a última em db/migrations/)
docker exec -i pastoreio-db psql -U postgres -d pequenos_grupos < db/migrations/001_initial_schema.sql
# ... demais migrações na ordem numérica ...

cp .env.example .env.local
# Ajuste DATABASE_*, APP_SECRET, NEXT_PUBLIC_APP_URL, etc.

./scripts/setup-database.sh
npm run dev
```

Acesse: http://localhost:3000

## Configuração (.env.local)

Copie `.env.example` para `.env.local`. Variáveis principais:

| Variável | Obrigatório | Descrição |
|----------|-------------|-----------|
| `DATABASE_URL` | Sim | `postgresql://…/pequenos_grupos` |
| `APP_SECRET` | Sim | Chave para JWT/sessões |
| `NODE_ENV` | Sim | `development` ou `production` |
| `NEXT_PUBLIC_APP_URL` | Produção | URL pública (magic link, redirects) |
| `CRON_SECRET` | Cron | Proteção das rotas de cron |
| `AWS_*` | Deploy | SSM/SES conforme [`DEPLOY_AWS_GUIDE.md`](./DEPLOY_AWS_GUIDE.md) |

Em produção na EC2, a aplicação pode ler secrets do **AWS SSM Parameter Store**. Os parâmetros legados continuam usando o prefixo `/pequenos-grupos/…` (não altere em produção sem migração coordenada).

## Banco de dados

Migrações em `db/migrations/` (numeradas sequencialmente). O **nome lógico do banco** usado pelo projeto é `pequenos_grupos` (histórico de compatibilidade).

### Esquema resumido

```
users, sessions, magic_link_tokens
organizations
groups (default_meeting_day, default_meeting_time, …)
leaders (group_id, organization_id, role: leader|secretary|coordinator)
members (group_id, tags, discipulador, visitor funnel, …)
meetings (meeting_date, meeting_type, …)
attendance, guest_visitors, attendance_guests
notifications, push_subscriptions, contact_log, …
```

## Estrutura do repositório

```
pastoreio/
├── app/                 # Rotas (auth, dashboard, coordenador, admin, lista de presença pública, API)
├── components/          # UI
├── lib/                 # db, auth, agenda, alertas, AWS, integrações
├── db/migrations/       # SQL
├── scripts/             # setup, deploy, backup
├── docs/                # Documentação adicional
└── public/              # manifest PWA, ícones
```

## Scripts úteis

| Script | Uso |
|--------|-----|
| `./scripts/setup-database.sh` | Primeiro líder, grupo e dados iniciais |
| `./scripts/create-admin.sh` | Usuário admin |
| `./scripts/setup-ec2.sh` | EC2 (Docker, etc.) |
| `npm run dev` / `build` / `start` / `lint` | Desenvolvimento e produção |

## Deploy (AWS)

- **[`DEPLOY_AWS_GUIDE.md`](./DEPLOY_AWS_GUIDE.md)** — EC2, CloudFront, SSM, GitHub Actions  
- Push em `main` pode disparar deploy conforme workflow configurado.

## Documentação

- [`QUICKSTART.md`](./QUICKSTART.md)

### Renomear o repositório no GitHub

1. No GitHub: **Settings → General → Repository name** → altere para `pastoreio` (ou `Pastoreio` não é permitido na URL; use `pastoreio`).
2. Atualize o remote local:

```bash
git remote set-url origin git@github.com:RodolfoBredoff/pastoreio.git
# ou HTTPS: https://github.com/RodolfoBredoff/pastoreio.git
```

3. Ajuste URLs em **GitHub Actions**, **secrets** (`APP_DIR` na EC2 se ainda apontar para pasta antiga), **registry de imagens** (`ghcr.io/.../pastoreio`) e **OIDC** para o novo nome do repositório, se aplicável.

## Troubleshooting

- **DATABASE_URL**: conferir `.env.local` e reiniciar o servidor.
- **relation does not exist**: aplicar todas as migrações em ordem.
- **Magic Link**: conferir `NEXT_PUBLIC_APP_URL`.
- **504 / CloudFront**: ver `docs/TROUBLESHOOT_504_CLOUDFRONT.md`.

---

Desenvolvido para comunidades de pequenos grupos — **Pastoreio**.
