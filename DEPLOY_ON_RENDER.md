# Deploy FreshBasket AI for the hackathon

This project is configured as one Render web service: FastAPI serves both the built React website and the `/api` endpoints. That avoids separate frontend/backend URLs and keeps API requests same-origin.

## Before you start

- Create or sign in to a GitHub account.
- Create or sign in to a Render account.
- Use this updated deploy-ready project folder; it includes `Dockerfile`, `render.yaml`, and the synthetic CSV datasets required by the API.

## Deploy in about 10–20 minutes (build time varies)

1. Extract the ZIP. Open the `FreshBasket_AI_Challenge04_Blue_Edition` folder.
2. Create a new **public or private GitHub repository**. In the repository's web page, choose **Add file → Upload files** and upload the *contents* of this project folder (not the outer folder itself). Ensure the top level shows `render.yaml`, `Dockerfile`, `backend.py`, `data/`, and `frontend/`. Commit the files.
3. Open https://dashboard.render.com/ and choose **New → Blueprint**. Connect GitHub and select the repository you just created.
4. Render reads `render.yaml`. Review the service named `freshbasket-ai-demo` and choose **Deploy Blueprint**.
5. Wait for the Docker build and deploy to finish. The logs should show Uvicorn running on `0.0.0.0` and the health check should pass.
6. Open the `https://<your-service-name>.onrender.com` URL Render assigns. The FreshBasket AI public landing page should open.
7. Sign in with the demo credentials below and test the overview and navigation.

## Demo login

- Email: `ops@freshbasket.demo`
- Password: `freshbasket123`

The name/designation fields are part of a **demo-only client-side gate**, not production-grade authentication. Use synthetic data only; do not enter real personal or business information.

## Quick deployment checks

- Open `/api/health` on the hosted domain. It should return JSON with `status: connected` and `report_ready: true`.
- Open `/docs` on the hosted domain to see the FastAPI documentation.
- Test landing page → login → dashboard, one dashboard tab, refresh data, in-app Back/Next, and browser Back/Forward.
- Submit the hosted URL as the deployment evidence for the hackathon only after testing it from an incognito/private window or another device.

## Free-hosting caveats

Render free web services may sleep after inactivity, so the first visit after a quiet period can take longer. The filesystem on a free instance is ephemeral: generated demo changes and approval history may reset after redeploy/restart. The app uses synthetic data and is intended for a hackathon demonstration, not real operations. A custom domain is optional; the Render-provided `onrender.com` URL is already a domain you can submit.

## Running locally

The API is still available at `http://127.0.0.1:8000`; Vite proxies `/api` calls to it during local development. Keep the regular `Run_FreshBasket_AI.bat` workflow or use the commands in `README.md`.
