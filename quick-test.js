#!/usr/bin/env node

const crypto = require('crypto');
const chalk = require('chalk');
const Table = require('cli-table3');
const ora = require('ora');
const boxen = require('boxen');

function formatPerformance(sizeBytes, timeMs) {
  const sizeGB = sizeBytes / (1024 * 1024 * 1024);
  const timeSeconds = timeMs / 1000;
  const gbps = sizeGB / timeSeconds;
  return gbps;
}

async function quickCryptoTest() {  
  console.log(boxen(
    chalk.bold.cyan('🚀 Quick In-Memory Performance Test\n\n') +
    chalk.blue('Test data: ') + chalk.white('100MB of repeated \'A\' characters\n') +
    chalk.blue('Purpose: ') + chalk.white('Fast in-memory performance comparison'),
    { padding: 1, margin: 1, borderStyle: 'round', borderColor: 'cyan', title: 'Test Info' }
  ));
  
  const testSize = 100 * 1024 * 1024; // 100MB
  const data = Buffer.alloc(testSize, 'A');
  
  const builtInTable = new Table({
    head: [
      chalk.bold.white('Built-in Algorithm'),
      chalk.bold.cyan('Time (ms)'),
      chalk.bold.green('Speed (GB/s)'),
      chalk.bold.yellow('Hash Sample')
    ],
    colWidths: [20, 12, 15, 20],
    style: {
      head: [],
      border: ['cyan']
    }
  });
  
  const algorithms = [
    { name: 'SHA-256', algo: 'sha256', color: 'green' },
    { name: 'SHA-1', algo: 'sha1', color: 'blue' },
    { name: 'MD5', algo: 'md5', color: 'red' },
    { name: 'BLAKE2b', algo: 'blake2b512', color: 'magenta' },
    { name: 'BLAKE2s', algo: 'blake2s256', color: 'yellow' }
  ];
  
  console.log(chalk.bold.cyan('\n🔐 Testing Built-in Crypto Algorithms...\n'));
  
  for (const { name, algo, color } of algorithms) {
    const spinner = ora(`Testing ${name}...`).start();
    
    try {
      const start = process.hrtime.bigint();
      const hash = crypto.createHash(algo).update(data).digest('hex');
      const end = process.hrtime.bigint();
      
      const durationMs = Number(end - start) / 1_000_000;
      const gbps = formatPerformance(testSize, durationMs);
      
      spinner.succeed(`${name} completed`);
      
      const coloredGbps = gbps > 5 ? chalk.green(`${gbps.toFixed(2)} GB/s`) :
                         gbps > 2 ? chalk.yellow(`${gbps.toFixed(2)} GB/s`) :
                         chalk.red(`${gbps.toFixed(2)} GB/s`);
      
      builtInTable.push([
        chalk[color](name),
        chalk.cyan(durationMs.toFixed(2)),
        coloredGbps,
        chalk.dim(hash.substring(0, 16) + '...')
      ]);
      
    } catch (error) {
      spinner.fail(`${name} not available`);
      builtInTable.push([
        chalk.gray(name),
        chalk.gray('N/A'),
        chalk.gray('N/A'),
        chalk.gray('Not available')
      ]);
    }
  }
  
  console.log(builtInTable.toString());
  
  // Test external libraries if available
  console.log(chalk.bold.magenta('\n⚡ Testing External Libraries...\n'));
  
  const externalTable = new Table({
    head: [
      chalk.bold.white('External Library'),
      chalk.bold.cyan('Time (ms)'),
      chalk.bold.green('Speed (GB/s)'),
      chalk.bold.yellow('Hash Sample')
    ],
    colWidths: [20, 12, 15, 20],
    style: {
      head: [],
      border: ['magenta']
    }
  });
  
  // Test xxHash
  try {
    const { xxh64, xxh3 } = require('@node-rs/xxhash');
    
    // XXH64
    const spinner64 = ora('Testing xxHash64...').start();
    const start64 = process.hrtime.bigint();
    const hash64 = xxh64(data);
    const end64 = process.hrtime.bigint();
    const duration64 = Number(end64 - start64) / 1_000_000;
    const gbps64 = formatPerformance(testSize, duration64);
    spinner64.succeed('xxHash64 completed');
    
    const colored64 = gbps64 > 15 ? chalk.green(`${gbps64.toFixed(2)} GB/s`) :
                     gbps64 > 8 ? chalk.yellow(`${gbps64.toFixed(2)} GB/s`) :
                     chalk.red(`${gbps64.toFixed(2)} GB/s`);
    
    externalTable.push([
      chalk.blue('xxHash64'),
      chalk.cyan(duration64.toFixed(2)),
      colored64,
      chalk.dim(hash64.toString(16))
    ]);
    
    // XXH3-64
    const spinner3 = ora('Testing xxHash3-64...').start();
    const start3 = process.hrtime.bigint();
    const hash3 = xxh3.xxh64(data);
    const end3 = process.hrtime.bigint();
    const duration3 = Number(end3 - start3) / 1_000_000;
    const gbps3 = formatPerformance(testSize, duration3);
    spinner3.succeed('xxHash3-64 completed');
    
    const colored3 = gbps3 > 15 ? chalk.green(`${gbps3.toFixed(2)} GB/s`) :
                    gbps3 > 8 ? chalk.yellow(`${gbps3.toFixed(2)} GB/s`) :
                    chalk.red(`${gbps3.toFixed(2)} GB/s`);
    
    externalTable.push([
      chalk.blue('xxHash3-64'),
      chalk.cyan(duration3.toFixed(2)),
      colored3,
      chalk.dim(hash3.toString(16))
    ]);
    
  } catch (error) {
    externalTable.push([
      chalk.gray('@node-rs/xxhash'),
      chalk.gray('N/A'),
      chalk.gray('Not installed'),
      chalk.gray('npm install @node-rs/xxhash')
    ]);
  }
  
  // Test CRC32
  try {
    const { crc32, crc32c } = require('@node-rs/crc32');
    
    // CRC32
    const spinnerCrc = ora('Testing CRC32...').start();
    const startCrc = process.hrtime.bigint();
    const hashCrc = crc32(data);
    const endCrc = process.hrtime.bigint();
    const durationCrc = Number(endCrc - startCrc) / 1_000_000;
    const gbpsCrc = formatPerformance(testSize, durationCrc);
    spinnerCrc.succeed('CRC32 completed');
    
    const coloredCrc = gbpsCrc > 15 ? chalk.green(`${gbpsCrc.toFixed(2)} GB/s`) :
                      gbpsCrc > 8 ? chalk.yellow(`${gbpsCrc.toFixed(2)} GB/s`) :
                      chalk.red(`${gbpsCrc.toFixed(2)} GB/s`);
    
    externalTable.push([
      chalk.green('CRC32'),
      chalk.cyan(durationCrc.toFixed(2)),
      coloredCrc,
      chalk.dim((hashCrc >>> 0).toString(16))
    ]);
    
    // CRC32C
    const spinnerCrcC = ora('Testing CRC32C...').start();
    const startCrcC = process.hrtime.bigint();
    const hashCrcC = crc32c(data);
    const endCrcC = process.hrtime.bigint();
    const durationCrcC = Number(endCrcC - startCrcC) / 1_000_000;
    const gbpsCrcC = formatPerformance(testSize, durationCrcC);
    spinnerCrcC.succeed('CRC32C completed');
    
    const coloredCrcC = gbpsCrcC > 15 ? chalk.green(`${gbpsCrcC.toFixed(2)} GB/s`) :
                       gbpsCrcC > 8 ? chalk.yellow(`${gbpsCrcC.toFixed(2)} GB/s`) :
                       chalk.red(`${gbpsCrcC.toFixed(2)} GB/s`);
    
    externalTable.push([
      chalk.green('CRC32C'),
      chalk.cyan(durationCrcC.toFixed(2)),
      coloredCrcC,
      chalk.dim((hashCrcC >>> 0).toString(16))
    ]);
    
  } catch (error) {
    externalTable.push([
      chalk.gray('@node-rs/crc32'),
      chalk.gray('N/A'),
      chalk.gray('Not installed'),
      chalk.gray('npm install @node-rs/crc32')
    ]);
  }
  
  console.log(externalTable.toString());
  
  console.log(boxen(
    chalk.bold.green('💡 Quick Test Analysis\n\n') +
    chalk.white('• ') + chalk.green('Higher GB/s = better performance') + '\n' +
    chalk.white('• ') + chalk.cyan('This is in-memory testing - streaming may differ') + '\n' +
    chalk.white('• ') + chalk.yellow('External libraries often outperform built-in crypto') + '\n' +
    chalk.white('• ') + chalk.blue('CRC32C typically fastest for integrity checking') + '\n' +
    chalk.white('• ') + chalk.magenta('Run full benchmark: ') + chalk.white('npm run benchmark'),
    { padding: 1, margin: 1, borderStyle: 'double', borderColor: 'green', title: 'Tips' }
  ));
}

if (require.main === module) {
  quickCryptoTest();
}