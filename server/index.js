const { resolveAdminToken, server, validateBoardState } = require("../apps/selfhost/server");
const logger = require("pino")();

if (require.main === module) {
  const port = Number(process.env.PORT || 4173);
  resolveAdminToken()
    .then(() => {
      server.listen(port);
    })
    .catch((error) => {
      logger.error("Failed to resolve admin token:", error);
      process.exit(1);
    });
}

module.exports = {
  server,
  validateBoardState,
};
