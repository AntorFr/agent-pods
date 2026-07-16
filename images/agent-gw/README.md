# agent-gw — gateway d'Alfred

Conteneur principal du pod Alfred : **la porte d'entrée utilisateur *et* le runtime de
l'agent**. FastAPI + PWA de chat + SDK Claude (`query()`).

Déployé via `smart-home-charts` (chart `agent-pod`) ; manifeste :
`k8s-home-lab/clusters/homenode/home/assist/alfred-helm.yml`. Image publiée sur
`ghcr.io/antorfr/agent-gw` (repo `agent-pods`).

## Rôle

1. **Sert la PWA** — l'appli web de chat (`https://alfred.berard.me`), front + statics.
2. **Fait tourner l'agent** — appelle le SDK Claude avec le cerveau dans
   `/workspace/memory`, les skills et les MCP (workspace-mcp Google, etc.). Un message =
   un tour d'agent exécuté ici.
3. **Authentifie** — OIDC via Authelia, cookie de session signé, bouclier 🛡 des actions
   sensibles.
4. **Expose `/mcp`** — endpoint `ask_alfred` (bearer `GW_MCP_TOKEN`) : d'autres agents
   confient des tâches à Alfred sans intermédiaire.
5. **Sert la mémoire** — API `/api/memory/raw/...` (md, images, pièces jointes) que le
   moteur de rendu de la PWA consomme.

Le pod porte un **2ᵉ conteneur `tunnel`** (image `claude-pod`) dédié au tunnel VS Code
vers `/workspace` — accès dev direct, indépendant de la gateway.

## Configuration (variables d'environnement)

| Variable | Défaut | Rôle |
|---|---|---|
| `GW_CHANNEL` | `pwa` | Identité du canal. Sa **présence** = mode headless (personne pour répondre à une invite) → le bouclier s'applique. Posé au niveau conteneur, hors d'atteinte du modèle. |
| `GW_PERMISSION_MODE` | `bypassPermissions` | Mode permission du SDK Claude. En `bypass`, les `permissions.deny` sont ignorées → **seul un hook `exit 2` bloque** (cf. `alfred/.claude/hooks/google_guard.py`). |
| `GW_WORKSPACE` | `/workspace` | Racine du cerveau (repo mémoire d'Alfred). |
| `GW_MEMORY_DIR` | `memory` | Dossier mémoire, relatif au workspace. |
| `GW_TODO_FILE` | `todo/taches.md` | Fichier todo, relatif à la mémoire. |
| `GW_STATE_DIR` | `~/.agent-gw` | État **côté serveur** : pointeur de session (`session-<canal>.json`). Persistant (hostPath home). |
| `GW_CONFIRM_TTL` | `120` | Durée de validité (s) d'une autorisation bouclier 🛡. |
| `GW_MCP_ALLOWED_HOSTS` | `alfred.berard.me` | Hôtes autorisés du transport MCP (anti DNS-rebinding). |
| `OIDC_ISSUER` / `OIDC_CLIENT_ID` / `OIDC_REDIRECT_URI` / `OIDC_ALLOWED_GROUP` | `""` / `""` / `""` / `admins` | Client OIDC Authelia. Dès qu'`OIDC_ISSUER` est posé, l'auth passe en OIDC (le bearer `GW_AUTH_TOKEN` devient inutilisé). |

### Secrets

| Secret | Généré | Consommé | Où il vit |
|---|---|---|---|
| `GW_SESSION_SECRET` | `openssl rand -hex 32` (setup initial / rotation) | signe le cookie de session (`secret_key` du `SessionMiddleware`) | coffre `secret/apps/alfred` → `gw_session_secret`, tiré par `externalSecrets` |
| `GW_MCP_TOKEN` | `openssl rand -hex 32` | bearer du endpoint `/mcp` (`ask_alfred`) | manifeste, en clair (DR-via-git) |
| `OIDC_CLIENT_SECRET` | côté Authelia (hash) + clair ici | login OIDC | manifeste, en clair (DR-via-git) ; cf. `app-auth-oidc.md` |
| `GW_AUTH_TOKEN` | — | bearer de secours, **uniquement si OIDC absent** (mode dev) | **inutilisé en prod** (OIDC actif) → hors coffre volontairement |
| `CLAUDE_CODE_OAUTH_TOKEN` | `claude setup-token`, sinon session `~/.claude` | **pas lu par agent-gw** — seulement par le SDK Claude | Alfred tourne sur `~/.claude` (persistant, auto-refresh) → hors coffre volontairement |

> Absent de la liste : `GOOGLE_MAPS_API_KEY` (clé du MCP Maps) — tirée du coffre
> `secret/llm/google-api` → `google_map_api_key` via `externalSecrets`, consommée par le
> serveur MCP Maps, pas par agent-gw lui-même.

## Sessions & reprise après sinistre (DR)

Le **secret de session n'est pas critique**. À retenir :

- Si `GW_SESSION_SECRET` **change ou se régénère** (fallback `token_hex(32)` quand la
  variable est absente, p.ex. coffre scellé au boot), tous les cookies existants sont
  invalidés → **simple re-login Authelia**. Comme Authelia garde en général la session
  SSO, c'est souvent un redirect transparent.
- **Aucune donnée perdue** dans ce cas : l'historique de conversation vit **côté
  serveur** (`GW_STATE_DIR`, pointant vers le `.jsonl` du SDK dans `~/.claude/projects`),
  la mémoire dans `/workspace` (git), l'auth Claude dans `~/.claude`. Rien de tout ça ne
  dépend du secret de session.
- **DR-via-git** : `git clone` + sync ArgoCD restaure la valeur committée telle quelle —
  rien à régénérer. La régénération ne sert qu'au **premier setup** ou à une rotation
  volontaire. (Politique secrets : cf. `k8s-config.md` / `secrets-vault.md`.)
