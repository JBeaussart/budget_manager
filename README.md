# Budget Manager (Astro + Supabase)

Budget Manager est une application web perso pour importer des releves bancaires CSV, categoriser les transactions et suivre un budget mensuel. Le projet combine Astro (front + endpoints API) et Supabase (authentification email/mot de passe, Postgres et RLS) pour offrir un MVP rapide a deplier.

## Stack principale
- Astro 5 pour le routage statique et les fonctions serverless
- Supabase JavaScript client v2 (`@supabase/supabase-js`)
- Tailwind CSS via `@tailwindcss/vite` et `@tailwindcss/forms`
- `dayjs` pour les dates, `papaparse` pour l'import CSV, `zod` pour la validation

## Etat actuel du MVP
- Pages `/signup`, `/login` et `/logout` fonctionnelles, integrees avec Supabase Auth.
- Endpoint `/api/auth/session` qui synchronise les tokens Supabase dans des cookies HTTP-only.
- Middleware `src/middleware.ts` qui protege toutes les routes `/app/*` en redirigeant vers `/login` sans session valide.
- Shell `/app` (non prerender) qui affiche l'email de l'utilisateur connecte et assure la navigation interne.
- Styles globaux charges via `src/styles/global.css` avec configuration Tailwind.
- `plan.md` documente toutes les etapes du MVP : import CSV, normalisation, ingestion API, dashboard, regles, deploiement Netlify, etc.

## Etapes prioritaires
Les prochains chantiers sequentiels (voir `plan.md` pour le detail) :
1. Composant `CsvUploader` avec mapping des colonnes et previsualisation.
2. Normalisation (`src/lib/normalizer.ts`) et validation des donnees via Zod.
3. Endpoint `/api/ingest` securise pour inserer les transactions sous RLS.
4. Tableau des transactions, calculs budget mensuel et dashboard avec graphiques.
5. Deploiement Netlify + configuration des variables d'environnement.

## Prerequis
- Node.js >= 18 et npm.
- Compte Supabase (projet Postgres provisionne) et acces au SQL editor.
- (Optionnel) Compte Netlify pour le deploiement serverless.

## Mise à jour du schéma Supabase
Pour suivre la nouvelle colonne de budget, ajoutez la colonne suivante à la table `transactions` (nullable) :

```sql
alter table transactions
  add column if not exists budget_category text;

alter table rules
  add column if not exists budget_category text;
```

Les policies RLS existantes restent valables ; aucune mise à jour n'est requise tant que la colonne est accessible en lecture/écriture comme le reste des champs.

## Demarrage rapide
```bash
# 1. Installer les dependances
npm install

# 2. Lancer le serveur de developpement
npm run dev
```
Le serveur dev est expose par defaut sur `http://localhost:4321`.

## Variables d'environnement
Copier le fichier d'exemple et completer les valeurs fournies par Supabase :
```bash
cp .env.example .env
```
Remplir ensuite :
```bash
PUBLIC_SUPABASE_URL="https://<PROJECT>.supabase.co"
PUBLIC_SUPABASE_ANON_KEY="<ANON_KEY>"
# Optionnel (usage cote serveur uniquement)
SUPABASE_SERVICE_ROLE_KEY="<SERVICE_ROLE_KEY>"
```
Verifier que `.env` est ignore par git et reporter les memes variables dans votre provider (Netlify lors du deploiement).

## Structure du projet
```
/
├── public/                # Assets statiques servis tels quels
├── src/
│   ├── assets/            # Illustrations et icones (astro.svg, background.svg)
│   ├── components/        # Composants UI (Welcome, CsvUploader a venir)
│   ├── layouts/           # Layout racine qui importe les styles globaux
│   ├── lib/               # Clients et utilitaires (client Supabase)
│   ├── pages/             # Pages Astro + routes API (`/api/auth/session`)
│   └── styles/            # Fichier `global.css` avec Tailwind
├── plan.md                # Roadmap detaillee et criteres d'acceptation
├── package.json           # Scripts npm et dependances
└── README.md
```

## Scripts npm disponibles
| Commande        | Description                                             |
|-----------------|---------------------------------------------------------|
| `npm run dev`   | Lance le serveur Astro en mode developpement            |
| `npm run build` | Genere la version production dans `dist/`               |
| `npm run preview` | Sert localement le build de production                |
| `npm run astro` | Acces direct a la CLI Astro (`astro add`, `astro check`)|

## Mise en place Supabase
1. Creer un projet Supabase puis recuperer l'URL et la cle anon dans **Settings > API**.
2. Coller ces valeurs dans votre `.env` local et dans les secrets de votre plateforme de deploiement.
3. Dans le SQL editor, creer la table `transactions` et activer la RLS (voir requete dans le chapitre 5 de `plan.md`).
4. Controler que la politique RLS limite bien l'acces aux transactions de l'utilisateur connecte.

## Deploiement
- Installer l'adapter Netlify (`npm i -D @astrojs/netlify`) et declarer l'adapter dans `astro.config.mjs` (etapes detaillees en section 18 du plan).
- Configurer les variables d'environnement Supabase dans Netlify avant le premier build.
- Verifier que les routes `/api/*` restent fonctionnelles en production et que la connexion Supabase aboutit.

## Ressources utiles
- [Documentation Astro](https://docs.astro.build)
- [Documentation Supabase JavaScript](https://supabase.com/docs/reference/javascript/start)
- [Tailwind CSS](https://tailwindcss.com/docs)

Pour toute contribution, suivre les criteres d'acceptation de `plan.md` et completer les tests pertinents avant de livrer.
