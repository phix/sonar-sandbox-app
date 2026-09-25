# The app's image, built and booted by the container gate
# (sonar-remediation-automation: verify/container.mjs — see that file's header
# for what this proves and, more importantly, what it does not).
#
# The runtime runs the Express API, because that is the process that can fail
# to start in a way no unit test sees: the api suite drives the app in-process
# through supertest and never executes `api/src/server.js`. The Angular build
# stays a job step (`npm run build`) rather than living in this image — the API
# does not serve the web bundle, so building it in here would bake an unused
# artifact into the runtime image and prove nothing extra.
FROM node:24-bookworm

WORKDIR /app
# server.js reads PORT; 3000 matches the workflow's published port.
ENV NODE_ENV=production PORT=3000

# Manifests only, so the dependency layer caches independently of the source.
# The web manifest is needed even though web is not built here: `npm ci` at the
# root installs every workspace, and it fails if one is missing.
COPY package.json package-lock.json ./
COPY api/package.json api/
COPY web/package.json web/
RUN npm ci --no-audit --no-fund

COPY api ./api

EXPOSE 3000
USER node
CMD ["node", "api/src/server.js"]
