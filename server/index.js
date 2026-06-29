const { resolveAdminToken, server, validateBoardState } = require("../apps/selfhost/server");

if (require.main === module) {
  const port = Number(process.env.PORT || 4173);
  resolveAdminToken()
    .then(() => {
      server.listen(port);
    })
    .catch((error) => {
      console.error("Failed to resolve admin token:", error);
      process.exit(1);
    });
}

module.exports = {
  server,
  validateBoardState,
};
