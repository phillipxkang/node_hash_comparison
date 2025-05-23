const { workerData } = require('worker_threads');
const fs = require('fs');

const { file, buffer, flags, chunkSize } = workerData;
const dataView = new Uint8Array(buffer);
const flagView = new Int32Array(flags); // [status, length]

// States:
// 0: Ready for new data
// 1: Data available for processing
// 2: EOF signal

const stream = fs.createReadStream(file, { highWaterMark: chunkSize });

(async () => {
  let iterations = 0;
  const MAX_ITERATIONS = 1000000; // Prevent infinite loops
  
  try {
    for await (const chunk of stream) {
      iterations++;
      if (iterations > MAX_ITERATIONS) {
        console.error('Reader: Max iterations reached, exiting');
        break;
      }
      
      // Wait for hasher to be ready (status == 0) with timeout
      let waitCount = 0;
      while (Atomics.load(flagView, 0) !== 0 && waitCount < 1000) {
        waitCount++;
        const waitResult = Atomics.wait(flagView, 0, Atomics.load(flagView, 0), 100); // 100ms timeout
        if (waitResult === 'timed-out') {
          // Check if hasher is still alive by trying to notify
          const currentStatus = Atomics.load(flagView, 0);
          if (currentStatus === 2) {
            // Hasher signaled EOF, something's wrong
            throw new Error('Hasher signaled EOF prematurely');
          }
        }
      }
      
      if (waitCount >= 1000) {
        throw new Error('Reader: Timeout waiting for hasher to be ready');
      }
      
      // Copy data into shared buffer
      dataView.set(chunk);
      
      // Set length and signal data is available
      Atomics.store(flagView, 1, chunk.length);
      Atomics.store(flagView, 0, 1); // status = data available
      Atomics.notify(flagView, 0);
    }
    
    // Send EOF signal
    // Wait for hasher to be ready with timeout
    let waitCount = 0;
    while (Atomics.load(flagView, 0) !== 0 && waitCount < 1000) {
      waitCount++;
      const waitResult = Atomics.wait(flagView, 0, Atomics.load(flagView, 0), 100);
      if (waitResult === 'timed-out' && waitCount > 10) {
        console.warn('Reader: Timeout waiting for hasher before EOF, forcing EOF signal');
        break;
      }
    }
    
    // Signal EOF
    Atomics.store(flagView, 0, 2); // status = EOF
    Atomics.notify(flagView, 0);
    
  } catch (error) {
    console.error('Reader error:', error);
    // Signal EOF on error
    try {
      Atomics.store(flagView, 0, 2);
      Atomics.notify(flagView, 0);
    } catch (atomicError) {
      console.error('Reader: Error signaling EOF:', atomicError);
    }
  }
  
  process.exit(0);
})();