# Helemy web image. Build context is web/ (this folder), see infrastructure/docker-compose.yml.
# Targets: `dev` (Vite dev server, code mounted from the host) and `prod` (static build behind nginx).

# ---- Dependencies: installed from the lockfile, Linux binaries (not the host's node_modules) ----
FROM node:26.13.1-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- dev: the source comes from a bind mount, node_modules stays the image's own ----
FROM deps AS dev
EXPOSE 3000
# --host: listen on all interfaces, otherwise the dev server is unreachable from outside the container
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

# ---- build: type check + production bundle into /app/dist ----
FROM deps AS build
COPY . .
# Empty = the API is on the same origin (nginx below proxies /api). Set it only when the API is
# served from another domain, e.g. --build-arg VITE_API_URL=https://api.example.com
ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}
RUN npm run build

# ---- prod: nginx serves the static files and forwards API paths to the API container ----
FROM nginx:1.30.2-alpine AS prod
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
