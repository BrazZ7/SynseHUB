# ---------------------------------------------------------------------------
# SynseHub — imagem de produção
#
# Sobe sem nenhuma variável de ambiente: sem credenciais de Supabase a
# aplicação entra em modo de demonstração, com dados em memória.
# Para conectar um banco real, passe as variáveis de `.env.example`.
# ---------------------------------------------------------------------------

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Liga a saída autocontida: sem isso não existe `.next/standalone`.
ENV BUILD_STANDALONE=1
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Nunca rodar como root.
RUN addgroup -g 1001 -S nodejs && adduser -S synse -u 1001

COPY --from=builder /app/public ./public
COPY --from=builder --chown=synse:nodejs /app/.next/standalone ./
COPY --from=builder --chown=synse:nodejs /app/.next/static ./.next/static

USER synse
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
