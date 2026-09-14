# Frontend SIGCR

Aplicação React 19 compilada com Vite. A migração do Create React App/CRACO
removeu a cadeia legada de Webpack, SVGO e Webpack Dev Server que concentrava
os avisos de segurança do frontend.

## Desenvolvimento

```bash
npm ci --legacy-peer-deps
npm start
```

As variáveis públicas mantêm os nomes históricos `REACT_APP_*` por
compatibilidade. Somente as chaves explicitamente listadas em
`vite.config.mjs` são expostas ao navegador.

## Validação

```bash
npm audit --audit-level=low
npm test
npm run test:e2e
npm run build
```

O build continua sendo gerado em `frontend/build`, preservando o contrato do
deploy atômico existente.

## Produção

Nunca copie o diretório `build` manualmente. Na VPS canônica, use somente:

```bash
cd /opt/sigcr/frontend
./deploy-frontend.sh <identificador-da-release>
```
