"use strict";

const { startControlPlaneFromEnv } = require("../apps/control-plane/src/server");

startControlPlaneFromEnv().catch((error) => {
  console.error(error);
  process.exit(1);
});
