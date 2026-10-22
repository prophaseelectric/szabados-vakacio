# Szabados őszi vakáció

Family trip planner PWA for Oct 25–31, 2026. No sign-in: anyone with the link can edit. Hosted on Azure Static Web Apps (free tier) with a managed Azure Functions API and one JSON document in Azure Blob Storage.

```
app/   static PWA (index.html, app.js, app.css, manifest, service worker, icons)
api/   Azure Functions (Node 20): GET /api/plan, POST /api/plan/mutate
```

## Azure setup (one time, ~10 minutes)

### 1. Storage account (holds the plan data)
1. Azure portal → **Create a resource** → **Storage account**.
2. Resource group: new, e.g. `vakacio-rg`. Name: anything unique, e.g. `vakaciodata`. Region: West US 2. Performance: Standard. Redundancy: LRS. Everything else default.
3. After it's created: **Security + networking → Access keys → key1 → Connection string → Show → copy**. You'll paste this in step 2.

### 2. Static Web App (hosts the site + API)
1. Azure portal → **Create a resource** → **Static Web App**.
2. Resource group: `vakacio-rg`. Name: `szabados-vakacio`. Plan: **Free**. Region: West US 2.
3. Source: **GitHub** → sign in → org `prophaseelectric`, repo `szabados-vakacio`, branch `main`.
4. Build presets: **Custom**. App location: `app`. Api location: `api`. Output location: leave empty.
5. **Review + create**. Azure adds a workflow file to the repo and a repo secret (`AZURE_STATIC_WEB_APPS_API_TOKEN`). If it adds a second workflow file, delete the one in this repo (`.github/workflows/azure-static-web-apps.yml`) and keep Azure's.
6. Open the new Static Web App → **Settings → Environment variables** (older portals: Configuration) → **Add**:
   - Name: `STORAGE_CONNECTION`
   - Value: the connection string from step 1.
   Save.
7. Wait for the GitHub Action to finish (Actions tab in the repo, ~2 min). The site URL is on the Static Web App overview page (`https://<something>.azurestaticapps.net`).

### 3. Seed the three calendar stops
```
scripts/seed.sh https://<your-site>.azurestaticapps.net
```
Or just add them in the app.

### 4. Share
Send the URL. On iPhone: Safari → Share → **Add to Home Screen** and it opens as an app. Android: Chrome offers "Install app".

## Notes
- Edits from two phones at once are safe: the API uses the blob ETag and retries.
- The page polls every 4 seconds, so changes show up for everyone within a few seconds.
- Limits: 400 stops, 1000 notes, 300 packing items. More than enough for a week.
- Custom domain: Static Web App → Custom domains → Add. Optional.

## Local run
```
cd api && npm install
# needs Azure Functions Core Tools + Azurite, or point STORAGE_CONNECTION at a real storage account in api/local.settings.json
func start
# serve app/ with any static server and proxy /api to :7071
```
