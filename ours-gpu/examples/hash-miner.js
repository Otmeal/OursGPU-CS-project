// A simple CPU-bound hash mining program.
// Goal: find a nonce such that sha256(SEED + nonce) has at least DIFFICULTY leading zero bits.
// Usage in worker entryCommand: DIFFICULTY=20 SEED="hello" node "$PAYLOAD_PATH"
const crypto = require('crypto');

function leadingZeroBits(hex) {
  let bits = 0;
  for (let i = 0; i < hex.length; i++) {
    const nibble = parseInt(hex[i], 16);
    if (nibble === 0) {
      bits += 4;
    } else {
      // count leading zeros in nibble
      if (nibble < 2) bits += 3; // 0001
      else if (nibble < 4) bits += 2; // 001x
      else if (nibble < 8) bits += 1; // 01xx
      break;
    }
  }
  return bits;
}

function main() {
  const difficulty = Number.parseInt(process.env.DIFFICULTY ?? '20', 10);
  const seed = process.env.SEED ?? 'seed';
  const targetBits = Number.isFinite(difficulty) ? difficulty : 20;
  let nonce = 0n;
  const start = Date.now();
  let best = 0;
  while (true) {
    const data = seed + String(nonce);
    const digest = crypto.createHash('sha256').update(data).digest('hex');
    const lz = leadingZeroBits(digest);
    if (lz > best) best = lz;
    if (lz >= targetBits) {
      const ms = Date.now() - start;
      // Print solution as: nonce hexHash ms
      process.stdout.write(`Seed: ${seed}\nNonce: ${nonce.toString()}\nDigest${digest}\nTime spent(ms):${ms}`);
      return;
    }
    nonce++;

    if (nonce % 100000n === 0n) {
      if (Date.now() - start > 30 * 60 * 1000) {
        // 30 minutes cap to avoid infinite runs in tests
        process.stderr.write(`timeout after ${Date.now() - start}ms, best=${best} bits`);
        process.exit(1);
      }
    }
  }
}

main();

