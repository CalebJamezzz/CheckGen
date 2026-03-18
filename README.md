# CheckGen

AI-powered QA checklist generator. Paste a ticket or AC, get a grouped test checklist in seconds. Works solo or shared with your team in real time.

**Live:** [checkgen.dev](https://checkgen.dev)

---

## Stack

- **Frontend** — Vanilla HTML/CSS/JS, no framework
- **AI** — Claude Haiku via Anthropic API (proxied through Netlify Function)
- **Realtime sync** — Supabase (plain fetch, no SDK)
- **Hosting** — Netlify
- **Domain** — Namecheap → checkgen.dev

## Repo structure

```
checkgen/
├── index.html              # Landing page
├── app/
│   └── index.html          # The CheckGen tool
├── css/
│   └── main.css            # Design system + all styles
├── js/
│   ├── app.js              # Checklist app logic
│   └── supabase.js         # Supabase REST helpers
├── netlify/
│   └── functions/
│       └── ask.js          # Anthropic API proxy
├── netlify.toml
└── README.md
```

## Local dev

No build step — just open files directly or use any static server:

```bash
npx serve .
```

## Environment

The Netlify function reads `ANTHROPIC_API_KEY` from environment variables. Set this in the Netlify dashboard under Site settings → Environment variables.

## Supabase tables

Run `supabase-checklist-sessions.sql` in your Supabase SQL editor to create the `checklist_sessions` table.

## Roadmap

- [ ] Auth (accounts + cloud-saved history)
- [ ] Pricing tiers (personal free, team paid)
- [ ] Bug Scratch Pad integration
- [ ] Export to Jira / Linear
