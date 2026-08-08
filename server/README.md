# Hello World — Auth Server

Backend for the Hello World Android app. Provides signup, login (JWT), and
Google SSO ID-token verification.

## Run

```bash
cd server
npm install
cp .env.example .env      # then edit values
npm start                 # http://localhost:3000
```

Environment variables (see `.env.example`):

| Var                    | Purpose                                              |
|------------------------|------------------------------------------------------|
| `PORT`                 | Port to listen on (default 3000)                     |
| `JWT_SECRET`           | Secret for signing JWTs — change in production       |
| `GOOGLE_WEB_CLIENT_ID` | Google OAuth *Web* client ID; enables `/auth/google` |

User data is stored in `server/data/users.json` (passwords are bcrypt-hashed).
Swap `src/db.js` for a real database in production.

## Endpoints

| Method | Path            | Body                            | Notes                          |
|--------|-----------------|---------------------------------|--------------------------------|
| GET    | `/health`       | —                               | Status + whether Google is set |
| POST   | `/auth/signup`  | `{name,email,password}`         | Returns `{token,user}`         |
| POST   | `/auth/login`   | `{email,password}`              | Returns `{token,user}`         |
| POST   | `/auth/google`  | `{idToken}`                     | Verifies Google ID token       |
| GET    | `/me`           | — (Bearer token)                | Returns current user           |

## Connecting the Android app

The Android app currently authenticates locally on-device. To use this server
instead, point it at your host and call these endpoints. On an emulator the host
machine is reachable at `http://10.0.2.2:3000`.

For the Google flow: the app obtains a Google **ID token** via Credential Manager
and POSTs it to `/auth/google`; the server verifies it against
`GOOGLE_WEB_CLIENT_ID` (which must match the app's web client ID).
