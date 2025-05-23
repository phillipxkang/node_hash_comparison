const { workerData } = require('worker_threads');

const { buffer, flags, algo } = workerData;
const dataView = new Uint8Array(buffer);
const flagView = new Int32Array(flags); // [status, length]

// States:
// 0: Ready for new data
// 1: Data available for processing
// 2: EOF signal

let hashFn;
let finalDigest;

if (algo === 'sha256') {
  const crypto = require('crypto');
  const hash = crypto.createHash('sha256');
  hashFn = (chunk) => hash.update(chunk);
  finalDigest = () => hash.digest('hex');
} else if (algo === 'crc32c') {
  const { crc32c } = require('@node-rs/crc32');
  let crc = 0;
  hashFn = (chunk) => { crc = crc32c(chunk, crc); };
  finalDigest = () => {
    // crc32c returns a number, ensure we convert it properly
    return typeof crc === 'number' ? crc.toString(16) : String(crc);
  };
} else if (algo === 'xxh64') {
  const { Xxh64 } = require('@node-rs/xxhash');
  const hasher = new Xxh64();
  hashFn = (chunk) => hasher.update(chunk);
  finalDigest = () => {
    const result = hasher.digest();
    // xxh64 returns a BigInt, convert to hex string
    return typeof result === 'bigint' ? result.toString(16) : result.toString();
  };
} else if (algo === 'xxh3-64') {
  const { xxh3 } = require('@node-rs/xxhash');
  const hasher = xxh3.Xxh3.withSeed();
  hashFn = (chunk) => hasher.update(chunk);
  finalDigest = () => {
    const result = hasher.digest();
    // xxh3-64 returns a BigInt, convert to hex string
    return typeof result === 'bigint' ? result.toString(16) : result.toString();
  };
} else {
  throw new Error(`Unknown algorithm: ${algo}`);
}

// Initialize: signal we're ready for first chunk
Atomics.store(flagView, 0, 0); // status = ready for data
Atomics.notify(flagView, 0);

let iterations = 0;
const MAX_ITERATIONS = 1000000; // Prevent infinite loops

while (iterations < MAX_ITERATIONS) {
  iterations++;
  
  // Wait for data to be available (status == 1) or EOF (status == 2)
  // Use a timeout to prevent indefinite waiting
  let waitResult = 'ok';
  try {
    while (Atomics.load(flagView, 0) === 0) {
      waitResult = Atomics.wait(flagView, 0, 0, 1000); // 1 second timeout
      if (waitResult === 'timed-out') {
        // Check if we should continue waiting or exit
        const currentStatus = Atomics.load(flagView, 0);
        if (currentStatus === 2) break; // EOF received
        if (iterations > 100) {
          console.error('Hasher: Timeout waiting for data, exiting');
          process.exit(1);
        }
      }
    }
  } catch (error) {
    console.error('Hasher: Atomics.wait error:', error);
    process.exit(1);
  }
  
  const status = Atomics.load(flagView, 0);
  
  if (status === 2) {
    // EOF signal
    break;
  }
  
  if (status === 1) {
    // Data available
    const len = Atomics.load(flagView, 1);
    
    if (len > 0) {
      const chunk = dataView.subarray(0, len);
      hashFn(chunk);
    }
    
    // Signal we're ready for next chunk
    Atomics.store(flagView, 0, 0); // status = ready for data
    Atomics.notify(flagView, 0);
  }
}

try {
  console.log(`Worker Hash (${algo}): ${finalDigest()}`);
} catch (error) {
  console.error(`Error generating final digest for ${algo}:`, error);
  console.error('Stack:', error.stack);
  process.exit(1);
}
process.exit(0);