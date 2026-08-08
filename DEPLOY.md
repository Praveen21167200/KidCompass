# Deploying KidCompass to Render

Your app is a standard Node/Express web server, so deployment is straightforward.
Render gives you a public HTTPS URL automatically (e.g.
`https://kidcompass.onrender.com`) and can bind a custom domain.

---

## 1. Push the project to GitHub

From the project root (`helloworld-apk/`):

```bash
git init
git add .
git commit -m "KidCompass web app"
git branch -M main
# create an empty repo on github.com first, then:
git remote add origin https://github.com/<you>/kidcompass.git
git push -u origin main
```

> `node_modules/`, `data/`, and `.env` are already git-ignored.

## 2. Create the service on Render

**Option A — Blueprint (recommended, uses `render.yaml`):**
1. Go to <https://dashboard.render.com> → **New** → **Blueprint**.
2. Connect your GitHub repo. Render reads `render.yaml` and creates the
   `kidcompass` web service automatically.
3. Click **Apply**. First deploy takes ~1–2 minutes.

**Option B — Manual:**
1. **New** → **Web Service** → connect the repo.
2. Set **Root Directory** = `server`, **Build** = `npm install`,
   **Start** = `npm start`, **Health check path** = `/health`.
3. Add env var `JWT_SECRET` (any long random string).

## 3. Open your site

Render shows a URL like `https://kidcompass.onrender.com`. That's your live site.

## 4. (Optional) Custom domain

Service → **Settings** → **Custom Domains** → add e.g. `app.yourdomain.com`,
then add the CNAME record Render shows at your DNS provider. HTTPS is automatic.

---

## Important: data persistence

The current store writes JSON files to disk. On Render's **free** plan the disk
is **ephemeral** — data resets on every deploy/restart. Choose one:

| Option | How | Best for |
|--------|-----|----------|
| Persistent disk | Upgrade to a paid instance, then uncomment the `disk` block and `DATA_DIR` in `render.yaml` | Quick fix, low volume |
| Database (recommended) | Add Render PostgreSQL and swap `store.js`/`db.js` to use it | Production |

Ask and I can migrate the storage layer to PostgreSQL.

## Enable Google SSO in production

1. In Google Cloud Console, add your Render URL to the OAuth client's authorized
   origins/redirects.
2. In Render → service → **Environment**, set `GOOGLE_WEB_CLIENT_ID` to your
   Google **Web** client ID and redeploy.

## Free-plan note

Free web services sleep after ~15 min of inactivity and take a few seconds to
wake on the next request. Upgrade to a paid instance to keep it always on.
