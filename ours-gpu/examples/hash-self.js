// Example program for OursGPU worker
// Computes SHA-256 of the file specified by PAYLOAD_PATH
// Prints the hex digest to stdout; worker captures it as the job solution.

const fs = require('fs');
const crypto = require('crypto');

function main() {
  const p = process.env.PAYLOAD_PATH;
  if (!p) {
    console.error('PAYLOAD_PATH is not set');
    process.exit(2);
  }
  const buf = fs.readFileSync(p);
  const digest = crypto.createHash('sha256').update(buf).digest('hex');
  process.stdout.write(digest);
}

main();

