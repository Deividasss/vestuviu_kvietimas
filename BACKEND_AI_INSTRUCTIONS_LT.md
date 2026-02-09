# Instrukcija kitam AI: sukurti backend + DB (Railway) šiam projektui

Tikslas: sukurti atskirą Node.js backend servisą (deploy į Railway), kuris priims RSVP registracijas iš esamo React front-end ir išsaugos jas Railway Postgres duomenų bazėje.

Šiame repo front-end jau turi RSVP siuntimą (žr. `src/App.js`). Šiuo metu yra ir minimalus endpoint’as `api/rsvp.js` (Vercel serverless), bet jis tik `console.log`’ina ir nerašo į DB. Railway atveju mums reikia tikro backend’o su Postgres.

## 0) Kas jau yra (kontraktas)

### Front-end siunčia į:
- Endpoint: pagal nutylėjimą `POST /api/rsvp`
- Pilnas URL sudaromas taip:
  - `REACT_APP_API_BASE_URL` (pvz. `https://mano-backend.up.railway.app`)
  - `REACT_APP_RSVP_ENDPOINT` (pvz. `/api/rsvp`, nebūtina keisti)
- Realaus siuntimo įjungimas: `REACT_APP_RSVP_POST_ENABLED=true`

### Payload (JSON) forma
Front-end siunčia tokią struktūrą:

```json
{
  "wedding": { "groom": "Deividas", "bride": "Aistė", "dateISO": "2026-06-25T14:00:00+03:00" },
  "rsvp": { "name": "Vardas Pavardė", "attending": "taip", "guests": 2, "diet": "", "note": "" },
  "submittedAtISO": "2026-02-09T12:34:56.789Z",
  "source": "web"
}
```

Minimalūs validacijos reikalavimai (atitinka front-end logiką):
- `rsvp.name` privalomas (string, trimmed, ne tuščias)
- `rsvp.attending` privalomas (string; UI naudoja `"taip"`/`"ne"`)
- `rsvp.guests` privalomas skaičius 1–6

## 1) Pageidaujamas backend sprendimas (rekomenduojama)

- Node.js + Express
- ORM: Prisma
- DB: Railway Postgres (vienas `DATABASE_URL`)
- Validacija: `zod`
- Saugumas: `helmet`, `cors`, `express-rate-limit`

> Pastaba: darykite backend kaip atskirą folderį `backend/` (tai mažiausiai griauna esamą CRA struktūrą).

## 2) Ką sukurti repozitorijoje

### 2.1. Naujas folderis
Sukurti:
- `backend/`
  - `package.json`
  - `src/server.js`
  - `src/routes/rsvp.js` (arba tiesiai `server.js` – kaip patogiau)
  - `prisma/schema.prisma`
  - `prisma/migrations/...` (generuos Prisma)
  - `.env.example`
  - `README.md` (backend paleidimui)

### 2.2. Backend priklausomybės
`backend/package.json` priklausomybės:
- `express`
- `cors`
- `helmet`
- `express-rate-limit`
- `zod`
- `dotenv`
- `prisma` (dev)
- `@prisma/client`

Script’ai:
- `dev`: node su watch (galima `nodemon` arba `node --watch`)
- `start`: `node src/server.js`
- `prisma:migrate`: `prisma migrate deploy`

Rekomenduojama Node versija: 20+.

## 3) DB schema (Railway Postgres)

### 3.1. Prisma modelis
Sukurti lentelę RSVP įrašams. Minimaliai reikia išsaugoti tai, ką siunčia front-end.

Rekomenduojamas modelis (galite adaptuoti):
- `id` UUID
- `createdAt` (server time)
- `submittedAt` (iš payload `submittedAtISO`, jei pateikta)
- `name` text
- `attending` text
- `guests` int
- `diet` text (nullable)
- `note` text (nullable)
- `weddingGroom`, `weddingBride` text
- `weddingDateISO` text
- `source` text
- `ip` text (nullable)
- `userAgent` text (nullable)

Jei norite paprasčiau: laikykite `payload` kaip JSONB viename stulpelyje + indeksuokite `createdAt`. Bet praktikoje patogiau turėti atskirus stulpelius.

### 3.2. Migracijos
- Lokaliai: `npx prisma migrate dev`
- Railway deploy metu: `npx prisma migrate deploy`

## 4) API reikalavimai

### 4.1. POST /api/rsvp
- Priima aukščiau aprašytą JSON
- Validuoja su `zod`:
  - `rsvp.name`: `min(1)`
  - `rsvp.attending`: `min(1)`
  - `rsvp.guests`: `int().min(1).max(6)`
  - `diet`, `note`: `max` (pvz. 500–1000 simbolių), optional
  - `submittedAtISO`: optional, jei yra – parse į Date
- Išsaugo į Postgres
- Atsako:
  - `200 { ok: true }` sėkmės atveju
  - `400 { ok: false, error: "..." }` validacijos klaidai

### 4.2. GET /healthz
- Grąžina `200 { ok: true }` (Railway healthcheck’ui)

### 4.3. CORS
- Kintamasis `CORS_ORIGIN`:
  - Dev: `http://localhost:3000`
  - Prod: jūsų front-end domenas
- Jei nežinote domeno – laikinai galite leisti `*`, bet geriau riboti.

### 4.4. Rate limiting
- Pvz. 30 request/minute per IP į `/api/rsvp`

## 5) Railway diegimas (deploy)

### 5.1. Railway Postgres
- Railway: sukurti projektą
- Pridėti `PostgreSQL` (plugin/service)
- Railway automatiškai suteiks `DATABASE_URL`

### 5.2. Backend servisą deploy’inti į Railway
Du variantai:

**Variantas A (paprasčiausias):** backend kaip atskiras Railway service iš šio repo
- Railway „New Service“ → „Deploy from GitHub repo“
- Nurodyti Root Directory: `backend`
- Env:
  - `DATABASE_URL` (iš Railway Postgres)
  - `PORT` (Railway dažnai nustato pats; bet Express turi klausyti `process.env.PORT`)
  - `CORS_ORIGIN` (front-end URL)

Build / start:
- Build: `npm ci` (Railway dažnai pats)
- Start: `npm start`

**Svarbu:** migracijos
- Option 1: Railway „Deploy Command“ ar „Build Command“ metu paleisti `npx prisma migrate deploy`
- Option 2: į `start` script’ą įtraukti `prisma migrate deploy` prieš `node src/server.js` (bet tai kartais lėčiau; visgi mažam projektui ok)

### 5.3. Front-end sujungimas
Front-end turi žinoti backend URL.

Produkcijai (front-end hosting vietoje):
- `REACT_APP_API_BASE_URL=https://<jusu-railway-backend>.up.railway.app`
- `REACT_APP_RSVP_POST_ENABLED=true`

Jei front-end ir backend skirtingi domenai – būtinai sutvarkyti CORS.

## 6) Lokalus paleidimas (dev)

### 6.1. Backend
- `cd backend`
- `npm i`
- Susikurti `backend/.env` pagal `.env.example`:
  - `DATABASE_URL=...` (galite naudoti Railway URL ir lokaliai)
  - `PORT=8080`
  - `CORS_ORIGIN=http://localhost:3000`
- `npx prisma migrate dev`
- `npm run dev`

### 6.2. Front-end
- root direktorijoje:
  - `REACT_APP_API_BASE_URL=http://localhost:8080`
  - `REACT_APP_RSVP_POST_ENABLED=true`
- `npm start`

Tada `POST http://localhost:8080/api/rsvp` turi priimti formą.

## 7) Testavimo checklist

- Siunčiant su tuščiu vardu – backend grąžina 400
- Siunčiant `guests=0` arba `guests=7` – backend grąžina 400
- Normalus payload – 200 ir įrašas atsiranda DB
- CORS veikia su front-end domenu

## 8) Pastabos apie esamą `api/rsvp.js`

- `api/rsvp.js` yra Vercel serverless funkcijai (kai deploy į Vercel).
- Railway atveju ją galite ignoruoti.
- Svarbiausia: išlaikyti suderinamą `POST /api/rsvp` kontraktą, kad `src/App.js` nereikėtų keisti.

---

## Greitas „prompt“ kitam AI (copy/paste)

Sukurk backend `backend/` folderyje (Node 20, Express + Prisma) su Railway Postgres.
Įgyvendink `POST /api/rsvp` kuris priima JSON payload iš `src/App.js` (wedding + rsvp + submittedAtISO + source), validuoja (name required, attending required, guests 1–6) ir įrašo į Postgres. Pridėk `GET /healthz`. Naudok `DATABASE_URL`, `PORT`, `CORS_ORIGIN` env. Pridėk rate limit ir basic security middleware. Paruošk Prisma schema+migracijas ir instrukcijas deploy’ui į Railway (root dir `backend`, migrate deploy).