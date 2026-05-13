const { resolveAdminToken, server, validateBoardState } = require("../apps/selfhost/server");

if (require.main === module) {
  const port = Number(process.env.PORT || 4173);
  resolveAdminToken()
    .then(() => {
      server.listen(port, () => {
        console.log(`FridgeShare server is running at http://localhost:${port}`);
      });
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
