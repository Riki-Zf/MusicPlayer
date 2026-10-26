# Deploy to Vercel

This project deploys the Vite frontend and Python API from the repository root.
The Python API is implemented as a Vercel Function in `api/index.py`; the
existing Express server remains available for local development.

## Vercel project settings

Import the repository into Vercel and use the repository root as the project
root directory. `vercel.json` configures:

- Install command: install the frontend lockfile dependencies and root Python requirements.
- Build command: `npm --prefix frontend run build`.
- Output directory: `frontend/dist`.
- API route: `/api/*` is forwarded to the Python function.
- SPA route: other paths fall back to `index.html`.

The `VITE_API_BASE_URL` build environment variable is optional; the default is
`/api`, which keeps browser requests on the Vercel deployment origin.

## Optional YouTube Music account features

Public search, charts, stream URL lookup, watch playlists, metadata, and lyrics
do not require account authentication. Library, play history, subscriptions,
and playlist management require a ytmusicapi authentication header.

Create an auth file locally with ytmusicapi's `setup()` helper. Do not commit or
share this file. To enable account features on Vercel, copy its JSON contents
into a Vercel environment variable named `YTMUSIC_AUTH_JSON`. Keep the value
private and enable it only for the deployment environments that need it.

For local Express development, configure `YTMUSIC_AUTH_FILE` in
`backend/.env`; for local Vercel Function development, the Python API also
accepts `YTMUSIC_AUTH_FILE`.

## Deploy

Install the Vercel CLI, authenticate with `vercel login`, then run from the
repository root:

```powershell
vercel
```

For a production deployment:

```powershell
vercel --prod
```

Vercel Functions have execution-time limits. Stream URL extraction and calls
to YouTube Music can take longer than a static frontend request; the configured
API function allows up to 60 seconds where the Vercel plan supports it.
