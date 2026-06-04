# Playwright's official image ships Chromium + all system deps, pinned to the
# same Playwright version as package.json.
FROM mcr.microsoft.com/playwright:v1.48.0-jammy

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY server.js ./

ENV PORT=8080
EXPOSE 8080

CMD ["node", "server.js"]
