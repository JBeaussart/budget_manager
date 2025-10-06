# Astro Starter Kit: Basics

```sh
npm create astro@latest -- --template basics
```

> 🧑‍🚀 **Seasoned astronaut?** Delete this file. Have fun!

## 🚀 Project Structure

Inside of your Astro project, you'll see the following folders and files:

```text
/
├── public/
│   └── favicon.svg
├── src
│   ├── assets
│   │   └── astro.svg
│   ├── components
│   │   └── Welcome.astro
│   ├── layouts
│   │   └── Layout.astro
│   └── pages
│       └── index.astro
└── package.json
```

To learn more about the folder structure of an Astro project, refer to [our guide on project structure](https://docs.astro.build/en/basics/project-structure/).

## 🧞 Commands

All commands are run from the root of the project, from a terminal:

| Command                   | Action                                           |
| :------------------------ | :----------------------------------------------- |
| `npm install`             | Installs dependencies                            |
| `npm run dev`             | Starts local dev server at `localhost:4321`      |
| `npm run build`           | Build your production site to `./dist/`          |
| `npm run preview`         | Preview your build locally, before deploying     |
| `npm run astro ...`       | Run CLI commands like `astro add`, `astro check` |
| `npm run astro -- --help` | Get help using the Astro CLI                     |

## 🔐 Environment Variables

Create a `.env` file (ignored by git) based on `.env.example` and fill in your Supabase credentials:

```
PUBLIC_SUPABASE_URL="<YOUR_SUPABASE_URL>"
PUBLIC_SUPABASE_ANON_KEY="<YOUR_SUPABASE_ANON_KEY>"
# Optional server-side key (keep private)
SUPABASE_SERVICE_ROLE_KEY="<YOUR_SUPABASE_SERVICE_ROLE_KEY>"
```

The `.env.example` file is tracked in the repo so collaborators know which variables are required. Configure the same values in your hosting provider (Netlify) before deploying.

## 👀 Want to learn more?

Feel free to check [our documentation](https://docs.astro.build) or jump into our [Discord server](https://astro.build/chat).
