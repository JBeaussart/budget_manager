# Astro + Supabase – Plan d’implémentation pas‑à‑pas

> **Objectif** : App web perso pour importer des relevés **CSV**, **catégoriser** les transactions et afficher un **budget mensuel**. Stack : **Astro** (front + routes API) + **Supabase** (Auth + Postgres + RLS) + **Netlify** (hébergement).
>
> **Style des tâches** : étapes petites, atomiques, prêtes pour un outil d’IA dans VS Code. Chaque étape indique **fichiers à créer/modifier**, **commandes**, et **critères d’acceptation**.

---

## 0) Pré-requis
- [x] Avoir **Node 18+** (`node -v`) et **npm**.
- [x] Avoir un compte **Supabase** (free) et **Netlify** (free).
- [x] Avoir créé un projet Astro via `npm create astro@latest` (template minimal conseillé).

---

## 1) Initialisation du projet
**Commandes**
- [x] `cd <mon-projet-astro>`
- [x] `npm i @supabase/supabase-js papaparse dayjs zod`
- [x] `npm i -D @types/papaparse @types/node tailwindcss postcss autoprefixer @tailwindcss/forms`
- [x] `npx astro add tailwind --yes`

**Critères d’acceptation**
- `package.json` contient les dépendances ci‑dessus.
- `astro.config.mjs` inclut le plugin Tailwind (`@tailwindcss/vite`) et `src/styles/global.css` importe Tailwind.

---

## 2) Structure de dossiers
**Créer**
- [x] `src/lib/` (utils, clients)
- [x] `src/pages/api/` (endpoints serverless)
- [x] `src/pages/app/` (pages protégées)
- [x] `src/components/` (UI)
- [x] `src/styles/` (styles globaux)
- [x] `src/styles/global.css` (ou `tailwind.css`) avec `@import "tailwindcss";`
- [x] Import global des styles Tailwind dans le layout principal (`src/layouts/BaseLayout.astro` ou équivalent)

**Critères d’acceptation**
- Arborescence présente dans le repo.
- Les styles Tailwind sont chargés globalement et disponibles dans les pages/components.

---

## 3) Variables d’environnement
**Créer** `.env` (développement) et `.env.example`
- [x] Ajouter :
```
PUBLIC_SUPABASE_URL=""
PUBLIC_SUPABASE_ANON_KEY=""
# (Optionnel serveur) SUPABASE_SERVICE_ROLE_KEY=""
```
- [x] Compléter `.env.example` avec des placeholders explicites (`<YOUR_SUPABASE_URL>`…) et le **commiter** tout de suite.
- [x] Vérifier que `.env` est listé dans `.gitignore` et conserver les vraies valeurs uniquement en local.

**Critères d’acceptation**
- `.env.example` committé, `.env` ignoré par git (via `.gitignore`).
- Procédure claire (ici ou dans `README`) expliquant où placer les credentials en local et en production.

---

## 4) Projet Supabase
**Actions**
- [x] Créer un **projet Supabase**.
- [x] Récupérer **Project URL** et **anon key** (Settings → API).
- [x] Renseigner ces valeurs dans `.env`.
- [x] Mettre à jour les placeholders de `.env.example` (`<YOUR_SUPABASE_URL>`, etc.) pour refléter la structure attendue.
- [x] Stocker les valeurs réelles dans un gestionnaire de secrets et noter qu’elles devront être saisies dans Netlify (étape 18).

**Critères d’acceptation**
- `PUBLIC_SUPABASE_URL` et `PUBLIC_SUPABASE_ANON_KEY` valides.
- Credentials prêts à être saisis côté Netlify au moment du déploiement.

---

## 5) Base de données : tables & RLS
**Dans Supabase (SQL Editor)**
- [x] Exécuter le SQL suivant :
```sql
create table if not exists public.transactions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  occurred_at   date not null,
  amount        numeric(12,2) not null,
  currency      text not null default 'EUR',
  description   text,
  counterparty  text,
  category      text,
  raw           jsonb,
  created_at    timestamptz default now()
);

alter table public.transactions enable row level security;

create policy "read own" on public.transactions
  for select to authenticated
  using (auth.uid() = user_id);

create policy "insert own" on public.transactions
  for insert to authenticated
  with check (auth.uid() = user_id);

create policy "update own" on public.transactions
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "delete own" on public.transactions
  for delete to authenticated
  using (auth.uid() = user_id);

-- Index utiles
create index if not exists idx_tx_user_date on public.transactions(user_id, occurred_at);
create index if not exists idx_tx_user_category on public.transactions(user_id, category);
```
**Critères d’acceptation**
- Table `transactions` créée.
- RLS activée + 4 policies OK.

---

## 6) Client Supabase (navigateur)
**Créer** `src/lib/supabaseClient.ts`
```ts
import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  import.meta.env.PUBLIC_SUPABASE_URL!,
  import.meta.env.PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: true, autoRefreshToken: true } }
)
```
**Critères d’acceptation**
- [x] Importable sans erreur dans des composants/pages.

---

## 7) Pages d’authentification
**Créer** `src/pages/login.astro`
- [ ] Formulaire email + mot de passe.
- [ ] Boutons : « Se connecter », « Créer un compte », « Magic link ».
- [ ] Appeler :
```ts
// sign in
await supabase.auth.signInWithPassword({ email, password })
// sign up
await supabase.auth.signUp({ email, password })
// magic link
await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: new URL('/app', window.location.origin).toString() }})
```
**Créer** `src/pages/logout.ts` (endpoint simple)
```ts
import type { APIRoute } from 'astro'
import { supabase } from '../lib/supabaseClient'

export const get: APIRoute = async () => {
  await supabase.auth.signOut()
  return new Response(null, { status: 302, headers: { Location: '/login' } })
}
```
**Critères d’acceptation**
- On peut créer un compte, se connecter, se déconnecter.

---

## 8) Middleware de protection des routes `/app/*`
**Créer** `src/middleware.ts`
```ts
import type { MiddlewareHandler } from 'astro'
import { supabase } from './lib/supabaseClient'

export const onRequest: MiddlewareHandler = async (ctx, next) => {
  const url = new URL(ctx.request.url)
  if (url.pathname.startsWith('/app')) {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return ctx.redirect('/login')
  }
  return next()
}
```
**Critères d’acceptation**
- Toute URL `/app/*` redirige vers `/login` si non connecté.

> *Note : Pour un SSR/Edge strict, on peut lire le JWT côté serveur via cookies/headers et vérifier la session. Pour le MVP, ce guard client/middle hybride suffit.*

---

## 9) Page shell protégée
**Créer** `src/pages/app/index.astro`
- [ ] Layout simple avec navbar (Mon Budget, Importer, Déconnexion).
- [ ] Appeler `supabase.auth.getUser()` et afficher l’email.

**Critères d’acceptation**
- Page accessible uniquement connecté, affiche l’utilisateur courant.

---

## 10) Composant d’upload CSV
**Créer** `src/components/CsvUploader.tsx`
- [ ] Input `<input type="file" accept=".csv">`.
- [ ] Parser avec **Papa Parse** (header true, skipEmptyLines true).
- [ ] Détecter séparateur `;`/`,` automatiquement.
- [ ] Afficher un **mapping de colonnes** (selects) vers : `date`, `amount`, `description`, `counterparty`, `currency`, `type`.
- [ ] Bouton « Prévisualiser 20 lignes ».

**Critères d’acceptation**
- Après sélection de fichier, prévisualisation & mapping visibles.

---

## 11) Normalisation & validation
**Créer** `src/lib/normalizer.ts`
- [ ] Fonctions :
```ts
import { z } from 'zod'

export const NormalizedTx = z.object({
  occurred_at: z.string(), // ISO date
  amount: z.number(),
  currency: z.string().default('EUR'),
  description: z.string().optional(),
  counterparty: z.string().optional(),
  category: z.string().optional(),
  raw: z.any()
})
export type NormalizedTx = z.infer<typeof NormalizedTx>

export function normalizeRow(row: any, map: Record<string,string>): NormalizedTx {
  const parseAmount = (v: string) => parseFloat(String(v).replace(',', '.'))
  const rawDate = row[map.date]
  const iso = new Date(rawDate).toISOString().slice(0,10)
  let amt = parseAmount(row[map.amount])
  const type = row[map.type]?.toLowerCase()
  if (/(debit|déb|sortie)/.test(type)) amt = -Math.abs(amt)
  return NormalizedTx.parse({
    occurred_at: iso,
    amount: amt,
    currency: row[map.currency] || 'EUR',
    description: row[map.description]?.trim(),
    counterparty: row[map.counterparty]?.trim(),
    raw: row
  })
}
```
**Critères d’acceptation**
- Données normalisées en objets **`NormalizedTx`** valides.

---

## 12) Appel API d’ingestion (côté client)
**Dans `CsvUploader.tsx`**
- [ ] Bouton « Importer » → envoie un tableau de `NormalizedTx` vers `/api/ingest`.
- [ ] Inclure le token d’accès courant :
```ts
const { data: { session } } = await supabase.auth.getSession()
await fetch('/api/ingest', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${session?.access_token ?? ''}`
  },
  body: JSON.stringify({ rows })
})
```
**Critères d’acceptation**
- Requête POST envoyée avec JWT en header.

---

## 13) Endpoint `/api/ingest` (côté serveur)
**Créer** `src/pages/api/ingest.ts`
```ts
import type { APIRoute } from 'astro'
import { createClient } from '@supabase/supabase-js'

export const post: APIRoute = async ({ request }) => {
  const auth = request.headers.get('authorization') || ''
  const token = auth.replace(/^Bearer\s+/i, '')
  if (!token) return new Response('Unauthorized', { status: 401 })

  // Client service-side avec le même URL + anon (suffit pour insert sous RLS)
  const supabase = createClient(
    import.meta.env.PUBLIC_SUPABASE_URL!,
    import.meta.env.PUBLIC_SUPABASE_ANON_KEY!
  )
  const { data: { user }, error: userErr } = await supabase.auth.getUser(token)
  if (userErr || !user) return new Response('Unauthorized', { status: 401 })

  const { rows } = await request.json()
  if (!Array.isArray(rows)) return new Response('Bad Request', { status: 400 })

  // Sécurise : écrase user_id côté serveur
  const payload = rows.map((r: any) => ({ ...r, user_id: user.id }))

  const { error } = await supabase.from('transactions').insert(payload)
  if (error) return new Response(error.message, { status: 400 })

  return new Response(null, { status: 204 })
}
```
**Critères d’acceptation**
- Ingestion renvoie **204** si OK ; lignes visibles dans Supabase.

---

## 14) Récupération & affichage des transactions
**Créer** `src/components/TransactionsTable.tsx`
- [ ] Appeler : `supabase.from('transactions').select('*').order('occurred_at', { ascending: false })`
- [ ] Filtres simples : par mois, par catégorie, par texte.
- [ ] Pagination (limite 50, bouton « Plus »).

**Critères d’acceptation**
- Tableau affiche les données insérées.

---

## 15) Calculs budget mensuel
**Créer** `src/lib/metrics.ts`
- [ ] Fonctions :
  - `sumIncome(rows)` → somme `amount > 0`
  - `sumExpenses(rows)` → somme absolue `amount < 0`
  - `saving(rows)` → revenus − dépenses
  - `groupByMonth(rows)` → `YYYY-MM`
  - `topCategories(rows, n=5)`

**Critères d’acceptation**
- Retourne des nombres corrects sur un échantillon de test.

---

## 16) Dashboard
**Créer** `src/pages/app/dashboard.astro`
- [ ] Récupérer transactions (client ou via endpoint `/api/transactions` pour SSR).
- [ ] Afficher :
  - Carte **Revenus / Dépenses / Épargne** du mois courant.
  - **Camembert** dépenses par catégorie (Chart.js via `react-chartjs-2`).
  - **Histogramme** par mois (12 derniers mois).

**Critères d’acceptation**
- Graphiques visibles avec données de test.

---

## 17) Éditeur de règles (version simple)
**Créer** `src/pages/app/rules.astro`
- [ ] Stockage local (localStorage) d’une liste de règles `{pattern, field, category, enabled}`.
- [ ] Bouton « Re‑catégoriser » : applique les règles en local et propose de ré‑importer (amélioration ultérieure : table `rules` en DB).

**Critères d’acceptation**
- On peut créer/modifier/supprimer des règles locales et re‑catégoriser.

---

## 18) Déploiement Netlify
**Commandes**
- [ ] `npm i -D @astrojs/netlify`
- [ ] Ajouter dans `astro.config.mjs` :
```js
import netlify from '@astrojs/netlify/functions'
export default {
  output: 'server',
  adapter: netlify(),
}
```
- [ ] Push sur GitHub, connecter le repo à **Netlify**.
- [ ] Configurer variables d’env sur Netlify :
  - `PUBLIC_SUPABASE_URL`
  - `PUBLIC_SUPABASE_ANON_KEY`
  - (optionnel) `SUPABASE_SERVICE_ROLE_KEY` (ne pas exposer côté client)

**Critères d’acceptation**
- Build Netlify passe ; routes `/api/*` fonctionnelles ; login OK en production.

---

## 19) Vérifications sécurité
- [ ] **RLS activé** sur `transactions` (déjà fait).
- [ ] Ingestion **écrase** toujours `user_id` côté serveur.
- [ ] Aucune clé **service** n’est exposée au client.
- [ ] Désactiver indexation robots : créer `public/robots.txt` avec `Disallow: /` (optionnel).

**Critères d’acceptation**
- Test : un utilisateur A ne voit pas les données de B.

---

## 20) Qualité de vie
- [ ] Bouton **Export CSV** des transactions filtrées.
- [ ] Import **JSON** des règles / Export.
- [ ] Messages d’erreur UX (toasts) en cas d’échec ingestion.
- [ ] Tests unitaires basiques (normalizer/metrics) avec **Vitest**.

**Critères d’acceptation**
- Fonctionnalités présentes et testées localement.

---

## 21) Roadmap (évolutions)
- Table `categories` + relation forte, couleurs.
- `rules` en base + RLS.
- Multi‑comptes (compte bancaire) et tags.
- Budgets cibles par catégorie + alertes.
- Import OFX/QIF.

---

## 22) Commandes utiles
- [ ] **Développement** : `npm run dev`
- [ ] **Build** : `npm run build`
- [ ] **Preview** : `npm run preview`

---

## 23) Check de fin de MVP
- [ ] Je peux me **connecter** / me **déconnecter**.
- [ ] Je peux **uploader** mon CSV et voir la **prévisualisation**.
- [ ] Je peux **importer** et voir mes transactions **seulement pour mon compte**.
- [ ] Le **dashboard** montre revenus, dépenses, épargne, top catégories.
- [ ] Le site est **en ligne** sur Netlify.
