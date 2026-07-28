/* Local / self-hosted entry point. On Vercel, api/index.js is used instead. */

const app = require('./app');
const { ready, DB_URL, IS_REMOTE } = require('./lib/db');

const PORT = Number(process.env.SHOP_PORT || process.env.PORT || 4000);

if (require.main === module) {
  ready()
    .then(() => {
      app.listen(PORT, () => {
        console.log(`☕ Shop Board on http://localhost:${PORT}`);
        console.log(`   database: ${IS_REMOTE ? DB_URL.replace(/\?.*$/, '') : DB_URL}`);
      });
    })
    .catch((err) => {
      console.error('[shop] could not start:', err.message);
      process.exit(1);
    });
}

module.exports = app;
