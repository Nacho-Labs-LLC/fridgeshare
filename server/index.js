const { server, validateBoardState } = require("../apps/selfhost/server");

if (require.main === module) {
  const port = Number(process.env.PORT || 4173);
  server.listen(port, () => {
    console.log(`FridgeShare server is running at http://localhost:${port}`);
  });
}

module.exports = {
  server,
  validateBoardState,
};
