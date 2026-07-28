/* Vercel serverless entry point. Every request is rewritten here by
   vercel.json, and the Express app handles routing and static files. */

module.exports = require('../shop/app');
