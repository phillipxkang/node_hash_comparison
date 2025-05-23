#!/usr/bin/env node

const crypto = require('crypto');
const fs = require('fs');
const chalk = require('chalk');
const Table = require('cli-table3');
const ora = require('ora');
const boxen = require('boxen');
const cliProgress = require('cli-progress');
const { Worker } = require('worker_threads');
const path = require('path');

async function testWorkerSharedHashPerformance(filename) {
  const fileSizeGB = fs.statSync(filename).size / (1024 * 1024 * 1024);

  const algorithms = [
    { name: 'sha256', type: 'native' },
    { name: 'xxh64', type: 'external', module: '@node-rs/xxhash' },
    { name: 'xxh3-64', type: 'external', module: '@node-rs/xxhash' },
    { name: 'crc32c', type: 'external', module: '@node-rs/crc32' }
  ];

  console.log(boxen(
    chalk.bold.magenta('🧵 SHAREDARRAYBUFFER HASH TEST'),
    { padding: 1, margin: 1, borderStyle: 'round', borderColor: 'magenta' }
  ));

  const table = new Table({
    head: [
      chalk.bold.white('Hash Algorithm'),
      chalk.bold.cyan(`Performance (${fileSizeGB.toFixed(1)}GB)`),
      chalk.bold.green('Status')
    ],
    colWidths: [20, 25, 12],
    style: {
      head: [],
      border: ['magenta']
    }
  });

  for (const algo of algorithms) {
    const spinner = ora(`Worker SharedBuffer: ${algo.name}`).start();

    // Skip if module missing
    if (algo.module) {
      try {
        require.resolve(algo.module);
      } catch (err) {
        spinner.warn(`${algo.name} skipped (missing ${algo.module})`);
        table.push([
          chalk.magenta(algo.name),
          chalk.gray('N/A'),
          chalk.yellow('✗')
        ]);
        continue;
      }
    }

    const CHUNK_SIZE = 4 * 1024 * 1024;
    const sharedBuffer = new SharedArrayBuffer(CHUNK_SIZE);
    const sharedFlag = new SharedArrayBuffer(8); // status + length
    
    // Initialize shared flags
    const flagView = new Int32Array(sharedFlag);
    Atomics.store(flagView, 0, 0); // status = ready for data
    Atomics.store(flagView, 1, 0); // length = 0

    try {
      const duration = await measurePerformance(`Worker-${algo.name}`, async () => {
        let hasher, reader;
        let hasherExitPromise, readerExitPromise;
        let timeoutId;
        
        try {
          hasher = new Worker(path.join(__dirname, 'worker-hasher.js'), {
            workerData: { buffer: sharedBuffer, flags: sharedFlag, algo: algo.name }
          });

          reader = new Worker(path.join(__dirname, 'worker-reader.js'), {
            workerData: {
              file: filename,
              buffer: sharedBuffer,
              flags: sharedFlag,
              chunkSize: CHUNK_SIZE
            }
          });

          // Create exit promises before setting up error handlers
          hasherExitPromise = new Promise((resolve, reject) => {
            hasher.on('exit', (code) => {
              if (code === 0) resolve();
              else reject(new Error(`Hasher exited with code ${code}`));
            });
          });
          
          readerExitPromise = new Promise((resolve, reject) => {
            reader.on('exit', (code) => {
              if (code === 0) resolve();
              else reject(new Error(`Reader exited with code ${code}`));
            });
          });

          // Handle worker errors with proper cleanup
          hasher.on('error', (err) => {
            console.error('Hasher worker error:', err);
            if (reader) reader.terminate();
          });
          
          reader.on('error', (err) => {
            console.error('Reader worker error:', err);
            if (hasher) hasher.terminate();
          });

          // Set up timeout to prevent hanging (30 seconds for large files)
          const timeoutPromise = new Promise((_, reject) => {
            timeoutId = setTimeout(() => {
              reject(new Error('Worker timeout - test took too long'));
            }, 30000);
          });

          // Wait for both workers to complete or timeout
          await Promise.race([
            Promise.all([hasherExitPromise, readerExitPromise]),
            timeoutPromise
          ]);
          
          // Clear timeout if we completed successfully
          if (timeoutId) clearTimeout(timeoutId);
          
        } finally {
          // Clear timeout
          if (timeoutId) clearTimeout(timeoutId);
          
          // Force cleanup - terminate any remaining workers
          if (hasher && !hasher.killed) {
            await hasher.terminate();
          }
          if (reader && !reader.killed) {
            await reader.terminate();
          }
          
          // Small delay to ensure complete cleanup
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }, spinner);

      const gbps = fileSizeGB / duration;
      const coloredResult = gbps > 3 ? chalk.green(`${gbps.toFixed(2)} GB/s`) :
                           gbps > 1.5 ? chalk.yellow(`${gbps.toFixed(2)} GB/s`) :
                           chalk.red(`${gbps.toFixed(2)} GB/s`);

      table.push([
        chalk.magenta(algo.name),
        coloredResult,
        chalk.green('✓')
      ]);
    } catch (err) {
      spinner.fail(err.message);
      table.push([
        chalk.magenta(algo.name),
        chalk.gray('err'),
        chalk.red('✗')
      ]);
    }
  }

  console.log(table.toString());
  console.log();
}



// Helper to measure performance and return duration in seconds
async function measurePerformance(name, testFunc, spinner = null) {
  try {
    const startTime = process.hrtime.bigint();
    await testFunc();
    const endTime = process.hrtime.bigint();
    const durationSeconds = Number(endTime - startTime) / 1_000_000_000;
    if (spinner) spinner.succeed(chalk.green(`${name} completed`));
    return durationSeconds;
  } catch (error) {
    if (spinner) spinner.fail(chalk.red(`${name} failed: ${error.message}`));
    return null;
  }
}

async function testAllHashAlgorithms() {
  console.log(boxen(
    chalk.bold.cyan('🔐 IN-MEMORY HASH ALGORITHM PERFORMANCE COMPARISON'),
    { padding: 1, margin: 1, borderStyle: 'round', borderColor: 'cyan' }
  ));
  
  const sizes = [
    { size: 1 * 1024 * 1024, name: '1MB' },
    { size: 10 * 1024 * 1024, name: '10MB' },
    { size: 100 * 1024 * 1024, name: '100MB' },
    { size: 1024 * 1024 * 1024, name: '1GB' }
  ];
  
  const table = new Table({
    head: [
      chalk.bold.white('Algorithm'),
      chalk.bold.blue('Type'),
      chalk.bold.green('1MB'),
      chalk.bold.yellow('10MB'),
      chalk.bold.cyan('100MB'),
      chalk.bold.red('1GB')
    ],
    colWidths: [18, 10, 12, 12, 12, 12],
    style: {
      head: [],
      border: ['cyan']
    }
  });
  
  // Native algorithms
  const nativeAlgorithms = [
    'sha256', 'sha1', 'md5', 'blake2b512', 'blake2s256', 
    'sha3-256', 'sha512', 'shake256'
  ];
  
  // External libraries
  const externalLibraries = [
    {
      name: '@node-rs/xxhash',
      tests: [
        { name: 'xxh32', fn: (lib, data) => lib.xxh32(data) },
        { name: 'xxh64', fn: (lib, data) => lib.xxh64(data) },
        { name: 'xxh3-64', fn: (lib, data) => lib.xxh3.xxh64(data) }
      ]
    },
    {
      name: '@node-rs/crc32',
      tests: [
        { name: 'crc32', fn: (lib, data) => lib.crc32(data) },
        { name: 'crc32c', fn: (lib, data) => lib.crc32c(data) }
      ]
    }
  ];
  
  const allTests = [];
  
  // Add native algorithms
  for (const algo of nativeAlgorithms) {
    allTests.push({
      name: algo,
      type: 'native',
      testFn: (data) => crypto.createHash(algo).update(data).digest('hex')
    });
  }
  
  // Add external algorithms
  for (const library of externalLibraries) {
    try {
      const lib = require(library.name);
      for (const test of library.tests) {
        allTests.push({
          name: test.name,
          type: 'external',
          testFn: (data) => test.fn(lib, data)
        });
      }
    } catch (error) {
      // Library not installed - add placeholder entries
      for (const test of library.tests) {
        allTests.push({
          name: test.name,
          type: 'external',
          testFn: null,
          notInstalled: library.name
        });
      }
    }
  }
  
  const progressBar = new cliProgress.SingleBar({
    format: chalk.cyan('Testing Algorithms') + ' |' + chalk.cyan('{bar}') + '| {percentage}% | {value}/{total} | Current: {algorithm}',
    barCompleteChar: '\u2588',
    barIncompleteChar: '\u2591',
    hideCursor: true
  });
  
  progressBar.start(allTests.length, 0, { algorithm: 'Starting...' });
  
  // Collect performance data for analysis
  const performanceData = [];
  
  for (let i = 0; i < allTests.length; i++) {
    const test = allTests[i];
    progressBar.update(i, { algorithm: test.name });
    
    const algorithmColor = test.type === 'native' ? chalk.cyan(test.name) : chalk.magenta(test.name);
    const typeColor = test.type === 'native' ? chalk.blue('Native') : chalk.yellow('External');
    const row = [algorithmColor, typeColor];
    
    if (test.notInstalled) {
      // Library not installed
      const installMsg = chalk.dim(`npm install ${test.notInstalled}`);
      row.push(installMsg, installMsg, installMsg, installMsg);
      table.push(row);
      continue;
    }
    
    if (!test.testFn) {
      // Test function not available
      row.push(
        chalk.gray('N/A'),
        chalk.gray('N/A'),
        chalk.gray('N/A'),
        chalk.gray('N/A')
      );
      table.push(row);
      continue;
    }
    
    // Collect performance data for top performers analysis
    const testResults = [];
    
    for (const { size, name } of sizes) {
      const data = Buffer.alloc(size, 'A');
      const sizeGB = size / (1024 * 1024 * 1024);
      
      try {
        const duration = await measurePerformance(`${test.name} ${name}`, async () => {
          test.testFn(data);
        });
        
        if (duration) {
          const gbps = sizeGB / duration;
          testResults.push(gbps);
          
          const coloredResult = gbps > 15 ? chalk.green(`${gbps.toFixed(2)} GB/s`) :
                               gbps > 8 ? chalk.yellow(`${gbps.toFixed(2)} GB/s`) :
                               gbps > 3 ? chalk.cyan(`${gbps.toFixed(2)} GB/s`) :
                               chalk.red(`${gbps.toFixed(2)} GB/s`);
          row.push(coloredResult);
        } else {
          row.push(chalk.gray('err'));
        }
      } catch (error) {
        row.push(chalk.gray('N/A'));
      }
    }
    
    // Store performance data for later analysis
    if (testResults.length > 0) {
      const avgPerformance = testResults.reduce((a, b) => a + b) / testResults.length;
      performanceData.push({
        name: test.name,
        type: test.type,
        avgGbps: avgPerformance,
        maxGbps: Math.max(...testResults),
        results: testResults
      });
    }
    
    table.push(row);
  }
  
  progressBar.update(allTests.length, { algorithm: 'Complete!' });
  progressBar.stop();
  
  console.log(table.toString());
  
  // Show top performers
  if (performanceData.length > 0) {
    const topPerformers = performanceData.sort((a, b) => b.avgGbps - a.avgGbps).slice(0, 5);
    
    console.log(boxen(
      chalk.bold.green('🏆 TOP IN-MEMORY PERFORMERS (Average Speed)\n\n') +
      topPerformers.map((result, i) => {
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
        const nameColor = result.type === 'native' ? 'cyan' : 'magenta';
        const typeText = result.type === 'native' ? chalk.blue('Native') : chalk.yellow('External');
        return `${medal} ${chalk[nameColor](result.name)} ${typeText}: ${chalk.white(result.avgGbps.toFixed(2))} GB/s avg, ${chalk.green(result.maxGbps.toFixed(2))} GB/s peak`;
      }).join('\n'),
      { padding: 1, margin: 1, borderStyle: 'round', borderColor: 'green', title: 'Champions' }
    ));
  }
  
  // Show performance insights
  console.log(boxen(
    chalk.bold.green('📊 In-Memory Performance Insights\n\n') +
    chalk.white('🟢 ') + chalk.green('>15 GB/s: ') + chalk.white('Excellent - Hardware accelerated or highly optimized\n') +
    chalk.white('🟡 ') + chalk.yellow('8-15 GB/s: ') + chalk.white('Very Good - Well optimized algorithms\n') +
    chalk.white('🔵 ') + chalk.cyan('3-8 GB/s: ') + chalk.white('Good - Standard performance\n') +
    chalk.white('🔴 ') + chalk.red('<3 GB/s: ') + chalk.white('Slow - Complex algorithms or poor optimization\n\n') +
    chalk.blue('Native: ') + chalk.white('Built into Node.js crypto module\n') +
    chalk.yellow('External: ') + chalk.white('Third-party libraries (often faster)'),
    { padding: 1, margin: 1, borderStyle: 'round', borderColor: 'green', title: 'Legend' }
  ));
  
  console.log();
}

async function testStreamingPerformance(filename) {
  if (!filename) return;
  
  console.log(boxen(
    chalk.bold.yellow('🚀 STREAMING HASH PERFORMANCE'),
    { padding: 1, margin: 1, borderStyle: 'round', borderColor: 'yellow' }
  ));
  
  const stats = fs.statSync(filename);
  const fileSizeGB = stats.size / (1024 * 1024 * 1024);
  
  const table = new Table({
    head: [
      chalk.bold.white('Hash Algorithm'),
      chalk.bold.cyan(`Performance (${fileSizeGB.toFixed(1)}GB)`),
      chalk.bold.yellow('Status')
    ],
    colWidths: [20, 25, 12],
    style: {
      head: [],
      border: ['yellow']
    }
  });
  
  const algorithms = ['sha256', 'sha1', 'md5', 'blake2b512', 'blake2s256', 'sha3-256'];
  const results = [];
  
  // Test native crypto algorithms
  for (const algo of algorithms) {
    const spinner = ora(`Streaming ${algo}...`).start();
    
    try {
      const duration = await measurePerformance(`Streaming ${algo}`, async () => {
        const hash = crypto.createHash(algo);
        const stream = fs.createReadStream(filename, { highWaterMark: 4 * 1024 * 1024 });
        
        await new Promise((resolve, reject) => {
          stream.on('data', chunk => hash.update(chunk));
          stream.on('end', resolve);
          stream.on('error', reject);
        });
        
        hash.digest('hex');
      }, spinner);
      
      if (duration) {
        const gbps = fileSizeGB / duration;
        results.push({ name: algo, gbps, type: 'native' });
        
        const coloredResult = gbps > 3 ? chalk.green(`${gbps.toFixed(2)} GB/s`) :
                             gbps > 1.5 ? chalk.yellow(`${gbps.toFixed(2)} GB/s`) :
                             chalk.red(`${gbps.toFixed(2)} GB/s`);
        
        table.push([
          chalk.cyan(algo),
          coloredResult,
          chalk.green('✓')
        ]);
      } else {
        table.push([
          chalk.cyan(algo),
          chalk.gray('err'),
          chalk.red('✗')
        ]);
      }
    } catch (error) {
      spinner.fail(`${algo} failed`);
      table.push([
        chalk.cyan(algo),
        chalk.gray('err'),
        chalk.red('✗')
      ]);
    }
  }
  
  // Test external libraries
  const externalTests = [
    {
      name: 'xxh3-64',
      test: async () => {
        const { xxh3 } = require('@node-rs/xxhash');
        const xxhash = xxh3.Xxh3.withSeed();
        const stream = fs.createReadStream(filename, { highWaterMark: 4 * 1024 * 1024 });
        
        await new Promise((resolve, reject) => {
          stream.on('data', chunk => xxhash.update(chunk));
          stream.on('end', resolve);
          stream.on('error', reject);
        });
        
        xxhash.digest();
      }
    },
    {
      name: 'xxh3-64: 32MB highwatermark',
      test: async () => {
        const { xxh3 } = require('@node-rs/xxhash');
        const xxhash = xxh3.Xxh3.withSeed();
        const stream = fs.createReadStream(filename, { highWaterMark: 32 * 1024 * 1024 });
        
        await new Promise((resolve, reject) => {
          stream.on('data', chunk => xxhash.update(chunk));
          stream.on('end', resolve);
          stream.on('error', reject);
        });
        
        xxhash.digest();
      }
    },
    {
      name: 'xxh64',
      test: async () => {
        const { Xxh64 } = require('@node-rs/xxhash');
        const xxhash = new Xxh64();
        const stream = fs.createReadStream(filename, { highWaterMark: 4 * 1024 * 1024 });
        
        await new Promise((resolve, reject) => {
          stream.on('data', chunk => xxhash.update(chunk));
          stream.on('end', resolve);
          stream.on('error', reject);
        });
        
        xxhash.digest();
      }
    },
    {
      name: 'xxh64: 32MB highwatermark',
      test: async () => {
        const { Xxh64 } = require('@node-rs/xxhash');
        const xxhash = new Xxh64();
        const stream = fs.createReadStream(filename, { highWaterMark: 32 * 1024 * 1024 });
        
        await new Promise((resolve, reject) => {
          stream.on('data', chunk => xxhash.update(chunk));
          stream.on('end', resolve);
          stream.on('error', reject);
        });
        
        xxhash.digest();
      }
    },
    {
      name: 'crc32c',
      test: async () => {
        const { crc32c } = require('@node-rs/crc32');
        const stream = fs.createReadStream(filename, { highWaterMark: 4 * 1024 * 1024 });
        let crcResult = 0;
        
        await new Promise((resolve, reject) => {
          stream.on('data', chunk => {
            crcResult = crc32c(chunk, crcResult);
          });
          stream.on('end', resolve);
          stream.on('error', reject);
        });
      }
    },
    {
      name: 'crc32c: 32MB highwatermark',
      test: async () => {
        const { crc32c } = require('@node-rs/crc32');
        const stream = fs.createReadStream(filename, { highWaterMark: 32 * 1024 * 1024 });
        let crcResult = 0;
        
        await new Promise((resolve, reject) => {
          stream.on('data', chunk => {
            crcResult = crc32c(chunk, crcResult);
          });
          stream.on('end', resolve);
          stream.on('error', reject);
        });
      }
    }
  ];
  
  for (const { name, test } of externalTests) {
    const spinner = ora(`Streaming ${name}...`).start();
    
    try {
      const duration = await measurePerformance(`Streaming ${name}`, test, spinner);
      
      if (duration) {
        const gbps = fileSizeGB / duration;
        results.push({ name, gbps, type: 'external' });
        
        const coloredResult = gbps > 3 ? chalk.green(`${gbps.toFixed(2)} GB/s`) :
                             gbps > 1.5 ? chalk.yellow(`${gbps.toFixed(2)} GB/s`) :
                             chalk.red(`${gbps.toFixed(2)} GB/s`);
        
        table.push([
          chalk.magenta(name),
          coloredResult,
          chalk.green('✓')
        ]);
      } else {
        table.push([
          chalk.magenta(name),
          chalk.gray('err'),
          chalk.red('✗')
        ]);
      }
    } catch (error) {
      spinner.fail(`${name} not available`);
      table.push([
        chalk.magenta(name),
        chalk.gray('Not available'),
        chalk.yellow('!')
      ]);
    }
  }
  
  console.log(table.toString());
  console.log();
  
  // Show top performers
  if (results.length > 0) {
    const sorted = results.sort((a, b) => b.gbps - a.gbps);
    const topPerformers = sorted.slice(0, 3);
    
    console.log(boxen(
      chalk.bold.green('🏆 TOP STREAMING PERFORMERS\n\n') +
      topPerformers.map((result, i) => {
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉';
        const color = i === 0 ? 'green' : i === 1 ? 'yellow' : 'cyan';
        return `${medal} ${chalk[color](result.name)}: ${chalk.white(result.gbps.toFixed(2))} GB/s`;
      }).join('\n'),
      { padding: 1, margin: 1, borderStyle: 'round', borderColor: 'green', title: 'Winners' }
    ));
  }
  
  // Return results for efficiency comparison later
  return results.filter(r => r.gbps > 0);
}

async function testPureIOPerformance(filename) {
  console.log(boxen(
    chalk.bold.blue('💾 PURE I/O PERFORMANCE'),
    { padding: 1, margin: 1, borderStyle: 'round', borderColor: 'blue' }
  ));
  
  const stats = fs.statSync(filename);
  const fileSizeGB = stats.size / (1024 * 1024 * 1024);
  
  const table = new Table({
    head: [
      chalk.bold.white('I/O Method'),
      chalk.bold.blue(`Performance (${fileSizeGB.toFixed(1)}GB)`),
      chalk.bold.cyan('Buffer Size'),
      chalk.bold.green('Efficiency')
    ],
    colWidths: [22, 18, 12, 12],
    style: {
      head: [],
      border: ['blue']
    }
  });
  
  const results = [];
  
  // Test different Node.js streaming buffer sizes
  const bufferSizes = [
    { size: 64 * 1024, name: '64KB' },
    { size: 256 * 1024, name: '256KB' },
    { size: 1024 * 1024, name: '1MB' },
    { size: 4 * 1024 * 1024, name: '4MB' },
    { size: 16 * 1024 * 1024, name: '16MB' },
    { size: 32 * 1024 * 1024, name: '32MB' },
    { size: 64 * 1024 * 1024, name: '64MB' }
  ];
  
  for (const { size, name } of bufferSizes) {
    const spinner = ora(`Testing Node.js Stream (${name})...`).start();
    
    try {
      const duration = await measurePerformance(`Stream ${name}`, async () => {
        const stream = fs.createReadStream(filename, { highWaterMark: size });
        let totalBytes = 0;
        
        await new Promise((resolve, reject) => {
          stream.on('data', (chunk) => {
            totalBytes += chunk.length;
          });
          stream.on('end', resolve);
          stream.on('error', reject);
        });
      }, spinner);
      
      if (duration) {
        const gbps = fileSizeGB / duration;
        results.push({ method: `Node.js Stream (${name})`, gbps, bufferSize: name });
        
        const coloredResult = gbps > 8 ? chalk.green(`${gbps.toFixed(2)} GB/s`) :
                             gbps > 4 ? chalk.yellow(`${gbps.toFixed(2)} GB/s`) :
                             chalk.red(`${gbps.toFixed(2)} GB/s`);
        
        table.push([
          chalk.cyan(`Node.js Stream`),
          coloredResult,
          chalk.white(name),
          chalk.dim('Computing...')
        ]);
      } else {
        table.push([
          chalk.cyan(`Node.js Stream`),
          chalk.gray('err'),
          chalk.white(name),
          chalk.gray('N/A')
        ]);
      }
    } catch (error) {
      spinner.fail(`Stream ${name} failed`);
      table.push([
        chalk.cyan(`Node.js Stream`),
        chalk.gray('err'),
        chalk.white(name),
        chalk.gray('N/A')
      ]);
    }
  }
  
  // Test manual reading
  const manualSizes = [
    { size: 1024 * 1024, name: '1MB' },
    { size: 4 * 1024 * 1024, name: '4MB' },
    { size: 16 * 1024 * 1024, name: '16MB' }
  ];
  
  for (const { size, name } of manualSizes) {
    const spinner = ora(`Testing Manual Read (${name})...`).start();
    
    try {
      const duration = await measurePerformance(`Manual ${name}`, async () => {
        const fd = fs.openSync(filename, 'r');
        const buffer = Buffer.allocUnsafe(size);
        let position = 0;
        let bytesRead;
        
        do {
          bytesRead = fs.readSync(fd, buffer, 0, size, position);
          if (bytesRead > 0) {
            position += bytesRead;
          }
        } while (bytesRead > 0);
        
        fs.closeSync(fd);
      }, spinner);
      
      if (duration) {
        const gbps = fileSizeGB / duration;
        results.push({ method: `Manual Read (${name})`, gbps, bufferSize: name });
        
        const coloredResult = gbps > 8 ? chalk.green(`${gbps.toFixed(2)} GB/s`) :
                             gbps > 4 ? chalk.yellow(`${gbps.toFixed(2)} GB/s`) :
                             chalk.red(`${gbps.toFixed(2)} GB/s`);
        
        table.push([
          chalk.blue(`Manual Read`),
          coloredResult,
          chalk.white(name),
          chalk.dim('Computing...')
        ]);
      } else {
        table.push([
          chalk.blue(`Manual Read`),
          chalk.gray('err'),
          chalk.white(name),
          chalk.gray('N/A')
        ]);
      }
    } catch (error) {
      spinner.fail(`Manual ${name} failed`);
      table.push([
        chalk.blue(`Manual Read`),
        chalk.gray('err'),
        chalk.white(name),
        chalk.gray('N/A')
      ]);
    }
  }
  
  // Test system-level I/O
  await testSystemIO(filename, fileSizeGB, results);
  
  // Calculate efficiency ratings
  if (results.length > 0) {
    const maxGbps = Math.max(...results.map(r => r.gbps));
    
    // Clear and rebuild table with efficiency ratings
    table.splice(0);
    
    for (const result of results) {
      const efficiency = (result.gbps / maxGbps * 100).toFixed(0);
      const efficiencyColor = efficiency > 80 ? chalk.green(`${efficiency}%`) :
                             efficiency > 60 ? chalk.yellow(`${efficiency}%`) :
                             chalk.red(`${efficiency}%`);
      
      const coloredResult = result.gbps > 8 ? chalk.green(`${result.gbps.toFixed(2)} GB/s`) :
                           result.gbps > 4 ? chalk.yellow(`${result.gbps.toFixed(2)} GB/s`) :
                           chalk.red(`${result.gbps.toFixed(2)} GB/s`);
      
      const methodColor = result.method.includes('Manual') ? 'blue' :
                         result.method.includes('System') ? 'green' :
                         result.method.includes('Node.js Buffer') ? 'white' : 'cyan';
      
      table.push([
        chalk[methodColor](result.method.split('(')[0].trim()),
        coloredResult,
        chalk.white(result.bufferSize || 'N/A'),
        efficiencyColor
      ]);
    }
  }
  
  console.log(table.toString());
  console.log();
  
  // Return results for efficiency comparison
  return results.filter(r => r.gbps > 0);
}

async function testSystemIO(filename, fileSizeGB, results) {
  // Unix/Linux/macOS - dd command
  if (process.platform !== 'win32') {
    const spinner = ora('Testing system dd...').start();
    
    try {
      const { spawn } = require('child_process');
      
      const duration = await measurePerformance('System dd', async () => {
        const dd = spawn('dd', [
          `if=${filename}`,
          'of=/dev/null',
          'bs=4M'
        ], { stdio: ['pipe', 'pipe', 'pipe'] });
        
        await new Promise((resolve, reject) => {
          dd.on('close', (code) => {
            if (code === 0) resolve();
            else reject(new Error(`dd exited with code ${code}`));
          });
          dd.on('error', reject);
        });
      }, spinner);
      
      if (duration) {
        const gbps = fileSizeGB / duration;
        results.push({ method: 'System dd (Unix)', gbps, bufferSize: '4M' });
      }
    } catch (error) {
      spinner.fail('System dd failed');
      results.push({ method: 'System dd (Unix)', gbps: 0, bufferSize: '4M' });
    }
  }
  
  // Windows - PowerShell copy to null
  if (process.platform === 'win32') {
    const spinner = ora('Testing Windows PowerShell...').start();
    
    try {
      const { spawn } = require('child_process');
      
      const duration = await measurePerformance('Windows PowerShell', async () => {
        const powershell = spawn('powershell', [
          '-Command',
          `Get-Content -Path "${filename}" -Raw | Out-Null`
        ], { stdio: ['pipe', 'pipe', 'pipe'] });
        
        await new Promise((resolve, reject) => {
          powershell.on('close', (code) => {
            if (code === 0) resolve();
            else reject(new Error(`PowerShell exited with code ${code}`));
          });
          powershell.on('error', reject);
        });
      }, spinner);
      
      if (duration) {
        const gbps = fileSizeGB / duration;
        results.push({ method: 'Windows PowerShell', gbps, bufferSize: 'Auto' });
      }
    } catch (error) {
      spinner.fail('Windows PowerShell failed');
      results.push({ method: 'Windows PowerShell', gbps: 0, bufferSize: 'Auto' });
    }
  }
  
  // Cross-platform Node.js buffer copy test
  const spinner = ora('Testing Node.js Buffer Copy...').start();
  
  try {
    const duration = await measurePerformance('Node.js Buffer Copy', async () => {
      const readStream = fs.createReadStream(filename, { highWaterMark: 4 * 1024 * 1024 });
      const chunks = [];
      
      await new Promise((resolve, reject) => {
        readStream.on('data', (chunk) => {
          const copy = Buffer.from(chunk);
          chunks.push(copy);
        });
        readStream.on('end', resolve);
        readStream.on('error', reject);
      });
    }, spinner);
    
    if (duration) {
      const gbps = fileSizeGB / duration;
      results.push({ method: 'Node.js Buffer Copy', gbps, bufferSize: '4M' });
    }
  } catch (error) {
    spinner.fail('Node.js Buffer Copy failed');
    results.push({ method: 'Node.js Buffer Copy', gbps: 0, bufferSize: '4M' });
  }
}

function showEfficiencyComparison(streamingResults, ioResults) {
  console.log(boxen(
    chalk.bold.green('⚡ HASH EFFICIENCY vs PURE I/O'),
    { padding: 1, margin: 1, borderStyle: 'round', borderColor: 'green' }
  ));
  
  const maxIOSpeed = Math.max(...ioResults.map(r => r.gbps));
  const topStreamers = streamingResults.sort((a, b) => b.gbps - a.gbps).slice(0, 5);
  
  const table = new Table({
    head: [
      chalk.bold.white('Hash Algorithm'),
      chalk.bold.cyan('Hash Speed'),
      chalk.bold.yellow('Max I/O Speed'),
      chalk.bold.green('Efficiency'),
      chalk.bold.magenta('Bottleneck')
    ],
    colWidths: [16, 14, 16, 12, 14],
    style: {
      head: [],
      border: ['green']
    }
  });
  
  for (const result of topStreamers) {
    const efficiency = (result.gbps / maxIOSpeed * 100);
    const efficiencyText = efficiency > 80 ? chalk.green(`${efficiency.toFixed(0)}%`) :
                          efficiency > 50 ? chalk.yellow(`${efficiency.toFixed(0)}%`) :
                          chalk.red(`${efficiency.toFixed(0)}%`);
    
    const bottleneck = efficiency > 80 ? chalk.green('I/O Bound') :
                      efficiency > 50 ? chalk.yellow('Mixed') :
                      chalk.red('CPU Bound');
    
    const speedColor = result.gbps > 3 ? chalk.green(`${result.gbps.toFixed(2)} GB/s`) :
                      result.gbps > 1.5 ? chalk.yellow(`${result.gbps.toFixed(2)} GB/s`) :
                      chalk.red(`${result.gbps.toFixed(2)} GB/s`);
    
    const algorithmColor = result.type === 'external' ? chalk.magenta(result.name) : chalk.cyan(result.name);
    
    table.push([
      algorithmColor,
      speedColor,
      chalk.blue(`${maxIOSpeed.toFixed(2)} GB/s`),
      efficiencyText,
      bottleneck
    ]);
  }
  
  console.log(table.toString());
  
  console.log(boxen(
    chalk.bold.cyan('💡 Efficiency Analysis\n\n') +
    chalk.green('• I/O Bound (>80%): ') + chalk.white('Hash computation is very fast, limited by disk speed\n') +
    chalk.yellow('• Mixed (50-80%): ') + chalk.white('Both hash computation and I/O contribute to timing\n') +
    chalk.red('• CPU Bound (<50%): ') + chalk.white('Hash computation is the primary bottleneck\n\n') +
    chalk.dim('Higher efficiency = better match to your hardware capabilities'),
    { padding: 1, margin: 1, borderStyle: 'round', borderColor: 'cyan', title: 'Understanding Results' }
  ));
  console.log();
}

async function main() {
  const filename = process.argv[2];
  
  if (!filename) {
    console.log(boxen(
      chalk.red('❌ Error: No filename provided\n\n') +
      chalk.white('Usage: ') + chalk.cyan('node performance-test.js <filename>\n\n') +
      chalk.dim('Example: ') + chalk.white('node performance-test.js temp_10GB_file'),
      { padding: 1, margin: 1, borderStyle: 'round', borderColor: 'red' }
    ));
    process.exit(1);
  }
  
  try {
    
    const stats = fs.statSync(filename);
    const fileSizeMB = (stats.size / 1024 / 1024).toFixed(2);
    
    console.log(boxen(
      chalk.bold.white('📋 Performance Test Configuration\n\n') +
      chalk.blue('File: ') + chalk.white(filename) + '\n' +
      chalk.blue('Size: ') + chalk.white(`${fileSizeMB} MB`) + '\n' +
      chalk.blue('Node: ') + chalk.white(process.version) + '\n' +
      chalk.blue('Platform: ') + chalk.white(process.platform) + '\n' +
      chalk.blue('Time: ') + chalk.white(new Date().toLocaleString()),
      { padding: 1, margin: 1, borderStyle: 'double', borderColor: 'white', title: 'Test Configuration' }
    ));
    
    await testAllHashAlgorithms();
    const streamingResults = await testStreamingPerformance(filename);
    const ioResults = await testPureIOPerformance(filename);
    await testWorkerSharedHashPerformance(filename);
    
    // Show efficiency comparison if we have both results
    if (streamingResults && streamingResults.length > 0 && ioResults && ioResults.length > 0) {
      showEfficiencyComparison(streamingResults, ioResults);
    }
    
    console.log(boxen(
      chalk.bold.green('🎯 COMPREHENSIVE PERFORMANCE ANALYSIS\n\n') +
      chalk.white('📊 ') + chalk.green('Higher GB/s = better performance') + '\n' +
      chalk.white('🔍 ') + chalk.yellow('Compare hash algorithms against pure I/O to identify bottlenecks') + '\n' +
      chalk.white('⚡ ') + chalk.blue('System-level tools show theoretical maximum disk speed') + '\n' +
      chalk.white('🔧 ') + chalk.cyan('Manual reads are typically faster than Node.js streams') + '\n' +
      chalk.white('🚀 ') + chalk.magenta('External libraries often outperform built-in crypto') + '\n' +
      chalk.white('💡 ') + chalk.white('Use results to choose optimal algorithms for your use case') + '\n\n' +
      chalk.dim('For download hashing: Choose streaming algorithms with best GB/s\n') +
      chalk.dim('For file integrity: Balance speed with security requirements\n') +
      chalk.dim('For maximum speed: Use CRC32C or xxHash3-64 streaming'),
      { padding: 1, margin: 1, borderStyle: 'double', borderColor: 'green', title: 'Analysis & Recommendations' }
    ));
    
  } catch (error) {
    console.log(boxen(
      chalk.red('❌ Error: ') + chalk.white(error.message) + '\n\n' +
      chalk.dim('Possible causes:\n') +
      chalk.dim('• File not found or inaccessible\n') +
      chalk.dim('• Insufficient permissions\n') +
      chalk.dim('• Missing dependencies\n') +
      chalk.dim('• File system error'),
      { padding: 1, margin: 1, borderStyle: 'round', borderColor: 'red', title: 'Error Details' }
    ));
    process.exit(1);
  }
}

main();