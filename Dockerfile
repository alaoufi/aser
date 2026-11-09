FROM node:24-alpine AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:24-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN npm run build && ./node_modules/.bin/esbuild scripts/cleanup-auth.ts --bundle --platform=node --format=cjs --external:pg --outfile=cleanup-auth.cjs

# صورة الترحيل: تُبنى مع الإصدار نفسه وتشغّل scripts/migrate.ts دون أي تنزيل وقت التشغيل.
# لا تُبنى افتراضيًا؛ تُطلب بـ --target migrator من سكربت النشر.
FROM build AS migrator
USER node
CMD ["node_modules/.bin/tsx", "scripts/migrate.ts"]

FROM node:24-alpine AS runtime
WORKDIR /app
ARG SOURCE_COMMIT=local
LABEL org.opencontainers.image.revision=$SOURCE_COMMIT
ENV SOURCE_COMMIT=$SOURCE_COMMIT
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup -S -g 10001 jdatna && adduser -S -D -u 10001 -G jdatna jdatna
COPY --from=build --chown=10001:10001 /app/.next/standalone ./
COPY --from=build --chown=10001:10001 /app/.next/static ./.next/static
COPY --from=build --chown=10001:10001 /app/public ./public
COPY --chown=10001:10001 scripts/start-runtime.cjs ./start-runtime.cjs
COPY --from=build --chown=10001:10001 /app/cleanup-auth.cjs ./cleanup-auth.cjs
USER 10001:10001
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node","start-runtime.cjs"]
