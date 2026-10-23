'use strict';

const { run } = require('../src/changelog-main');

run().catch((err) => {
  console.log(`::error::${err.stack || err.message}`);
  process.exitCode = 1;
});
