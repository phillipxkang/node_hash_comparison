#!/usr/bin/env node

const fs = require('fs');
const { spawn } = require('child_process');
const chalk = require('chalk');
const cliProgress = require('cli-progress');
const ora = require('ora');
const boxen = require('boxen');

const FILENAME = 'temp_10GB_file';
const SIZE_GB = 10;
const SIZE_BYTES = SIZE_GB * 1024 * 1024 * 1024;



async function createSparseFile() {
  const spinner = ora({
    text: chalk.blue('Creating 10GB sparse test file...'),
    spinner: 'dots'
  }).start();
  
  try {
    const fd = fs.openSync(FILENAME, 'w');
    fs.writeSync(fd, Buffer.alloc(1, 0), 0, 1, SIZE_BYTES - 1);
    fs.closeSync(fd);
    
    spinner.succeed(chalk.green(`Created ${FILENAME} (${SIZE_GB}GB sparse file)`));
    return true;
  } catch (error) {
    spinner.fail(chalk.red('Sparse file creation failed: ' + error.message));
    return false;
  }
}

async function createRealFile() {
  console.log(chalk.yellow('⚠️  Creating file with actual data - this will take longer!'));
  console.log();
  
  const progressBar = new cliProgress.SingleBar({
    format: chalk.cyan('Progress') + ' |' + chalk.cyan('{bar}') + '| {percentage}% | {value}/{total} chunks | ETA: {eta}s',
    barCompleteChar: '\u2588',
    barIncompleteChar: '\u2591',
    hideCursor: true
  });
  
  try {
    const fd = fs.openSync(FILENAME, 'w');
    const chunkSize = 64 * 1024 * 1024; // 64MB chunks
    const chunk = Buffer.alloc(chunkSize, 0x41); // Fill with 'A' characters
    const totalChunks = Math.ceil(SIZE_BYTES / chunkSize);
    
    progressBar.start(totalChunks, 0);
    
    for (let i = 0; i < totalChunks; i++) {
      const remainingBytes = SIZE_BYTES - (i * chunkSize);
      const bytesToWrite = Math.min(chunkSize, remainingBytes);
      
      fs.writeSync(fd, chunk, 0, bytesToWrite);
      progressBar.update(i + 1);
    }
    
    fs.closeSync(fd);
    progressBar.stop();
    
    console.log(chalk.green(`✅ Created ${FILENAME} (${SIZE_GB}GB real file with data)`));
    return true;
  } catch (error) {
    progressBar.stop();
    console.log(chalk.red('❌ Real file creation failed: ' + error.message));
    return false;
  }
}

async function createRandomDataFile() {
  console.log(chalk.yellow('⚠️  Creating file with random data - this will take the longest!'));
  console.log();
  
  const progressBar = new cliProgress.SingleBar({
    format: chalk.magenta('Random Data') + ' |' + chalk.magenta('{bar}') + '| {percentage}% | {value}/{total} chunks | Speed: {speed} MB/s',
    barCompleteChar: '\u2588',
    barIncompleteChar: '\u2591',
    hideCursor: true
  }, cliProgress.Presets.shades_classic);
  
  try {
    const fd = fs.openSync(FILENAME, 'w');
    const chunkSize = 16 * 1024 * 1024; // 16MB chunks for random data
    const totalChunks = Math.ceil(SIZE_BYTES / chunkSize);
    
    progressBar.start(totalChunks, 0, { speed: '0' });
    const startTime = Date.now();
    
    for (let i = 0; i < totalChunks; i++) {
      const remainingBytes = SIZE_BYTES - (i * chunkSize);
      const bytesToWrite = Math.min(chunkSize, remainingBytes);
      
      // Generate random data
      const chunk = Buffer.alloc(bytesToWrite);
      for (let j = 0; j < bytesToWrite; j++) {
        chunk[j] = Math.floor(Math.random() * 256);
      }
      
      fs.writeSync(fd, chunk, 0, bytesToWrite);
      
      // Calculate speed
      const elapsed = (Date.now() - startTime) / 1000;
      const bytesWritten = (i + 1) * chunkSize;
      const speed = Math.round((bytesWritten / 1024 / 1024) / elapsed);
      
      progressBar.update(i + 1, { speed: speed.toString() });
    }
    
    fs.closeSync(fd);
    progressBar.stop();
    
    console.log(chalk.green(`✅ Created ${FILENAME} (${SIZE_GB}GB file with random data)`));
    return true;
  } catch (error) {
    progressBar.stop();
    console.log(chalk.red('❌ Random data file creation failed: ' + error.message));
    return false;
  }
}

async function createWithSystemCommand(forceReal = false) {
  return new Promise((resolve) => {
    let command, args, description, color;
    
    if (process.platform === 'win32') {
      if (forceReal) {
        command = 'powershell';
        args = ['-Command', `$data = [byte[]]::new(1048576); for($i=0; $i -lt 10240; $i++){ [System.IO.File]::WriteAllBytes('${FILENAME}_temp$i', $data) }; Get-Content '${FILENAME}_temp*' -Raw | Set-Content '${FILENAME}' -NoNewline; Remove-Item '${FILENAME}_temp*'`];
        description = 'Windows PowerShell (real data)';
        color = 'blue';
      } else {
        command = 'fsutil';
        args = ['file', 'createnew', FILENAME, SIZE_BYTES.toString()];
        description = 'Windows fsutil (sparse)';
        color = 'cyan';
      }
    } else {
      if (forceReal) {
        command = 'dd';
        args = ['if=/dev/zero', `of=${FILENAME}`, 'bs=1M', `count=${SIZE_GB * 1024}`, 'oflag=dsync'];
        description = 'Unix dd with real data';
        color = 'blue';
      } else {
        command = 'dd';
        args = ['if=/dev/zero', `of=${FILENAME}`, 'bs=1M', `count=${SIZE_GB * 1024}`];
        description = 'Unix dd';
        color = 'cyan';
      }
    }
    
    const spinner = ora({
      text: chalk[color](`Creating file using ${description}...`),
      spinner: 'bouncingBar'
    }).start();
    
    if (forceReal) {
      spinner.text = chalk.yellow(`${spinner.text} (This will take longer!)`);
    }
    
    const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'], shell: true });
    
    child.on('close', (code) => {
      if (code === 0) {
        spinner.succeed(chalk.green(`Created ${FILENAME} using ${description}`));
        resolve(true);
      } else {
        spinner.fail(chalk.red(`${description} failed with exit code ${code}`));
        resolve(false);
      }
    });
    
    child.on('error', (error) => {
      spinner.fail(chalk.red(`${description} command failed: ${error.message}`));
      resolve(false);
    });
  });
}

async function main() {  
  const method = process.argv[2] || 'auto';
  
  // Check if file already exists
  if (fs.existsSync(FILENAME)) {
    const stats = fs.statSync(FILENAME);
    const sizeGB = (stats.size / 1024 / 1024 / 1024).toFixed(2);
    
    console.log(boxen(
      chalk.yellow(`⚠️  File ${FILENAME} already exists (${sizeGB}GB)\n`) +
      (stats.size === SIZE_BYTES 
        ? chalk.green('✅ File is correct size, no need to recreate\n') +
          chalk.dim('💡 Use --force to recreate anyway')
        : chalk.red('❌ File size incorrect, will recreate')
      ),
      { padding: 1, margin: 1, borderStyle: 'round', borderColor: 'yellow' }
    ));
    
    if (stats.size === SIZE_BYTES && !process.argv.includes('--force')) {
      return;
    }
    
    const spinner = ora('Removing existing file...').start();
    fs.unlinkSync(FILENAME);
    spinner.succeed('Removed existing file');
  }
  
  let success = false;
  
  console.log(chalk.bold(`📁 Creating file using method: ${chalk.cyan(method)}`));
  console.log();
  
  switch (method) {
    case 'sparse':
    case 'node':
      success = await createSparseFile();
      break;
      
    case 'real':
    case 'full':
      success = await createRealFile();
      break;
      
    case 'random':
      success = await createRandomDataFile();
      break;
      
    case 'system':
      success = await createWithSystemCommand(false);
      break;
      
    case 'system-real':
      success = await createWithSystemCommand(true);
      break;
      
    case 'auto':
    default:
      success = await createSparseFile();
      if (!success) {
        console.log(chalk.yellow('🔄 Trying system command...'));
        success = await createWithSystemCommand(false);
      }
      break;
  }
  
  if (success) {
    // Verify file was created correctly
    try {
      const stats = fs.statSync(FILENAME);
      const actualSizeGB = (stats.size / 1024 / 1024 / 1024).toFixed(2);
      
      let fileTypeInfo = '';
      let boxColor = 'green';
      
      if (stats.size !== SIZE_BYTES) {
        fileTypeInfo = chalk.yellow(`⚠️  Warning: Expected ${SIZE_GB}GB but got ${actualSizeGB}GB\n`);
        boxColor = 'yellow';
      }
      
      // Check if it's sparse (Unix/Mac only)
      if (process.platform !== 'win32' && stats.blocks !== undefined) {
        const actualBlocks = stats.blocks;
        const expectedBlocks = Math.ceil(stats.size / 512);
        const sparseRatio = actualBlocks / expectedBlocks;
        
        if (sparseRatio < 0.1) {
          fileTypeInfo += chalk.blue('💾 File type: ') + chalk.cyan('Sparse file (uses minimal disk space)\n') +
                         chalk.dim('💡 for realistic I/O testing, use: ') + chalk.white('node create-testfile.js real');
        } else {
          fileTypeInfo += chalk.blue('💾 File type: ') + chalk.green('Real file (uses actual disk space)\n') +
                         chalk.dim('✅ Good for realistic I/O performance testing');
        }
      }
      
      console.log();
      console.log(boxen(
        chalk.green(`✅ File created successfully!\n`) +
        chalk.blue(`📊 Final size: `) + chalk.white(`${actualSizeGB}GB\n`) +
        (fileTypeInfo || ''),
        { padding: 1, margin: 1, borderStyle: 'round', borderColor: boxColor }
      ));
      
    } catch (error) {
      console.log(chalk.red('❌ Could not verify file: ' + error.message));
    }
  } else {
    console.log();
    console.log(boxen(
      chalk.red('❌ Failed to create test file\n') +
      chalk.dim('Try a different method or check disk space'),
      { padding: 1, margin: 1, borderStyle: 'round', borderColor: 'red' }
    ));
    process.exit(1);
  }
}

function showHelp() {
  showTitle();
  
  const helpText = 
    chalk.bold.cyan('Usage:\n') +
    chalk.white('  node create-testfile.js [method] [options]\n\n') +
    
    chalk.bold.cyan('Methods:\n') +
    chalk.green('  auto         ') + chalk.dim('Try sparse first, fallback to system (default)\n') +
    chalk.green('  sparse       ') + chalk.dim('Create sparse file (fast, minimal disk usage)\n') +
    chalk.green('  real         ') + chalk.dim('Create file with actual zeros (slower, realistic I/O)\n') +
    chalk.green('  random       ') + chalk.dim('Create file with random data (slowest, most realistic)\n') +
    chalk.green('  system       ') + chalk.dim('Use system command (dd/fsutil)\n') +
    chalk.green('  system-real  ') + chalk.dim('Use system command with real data\n\n') +
    
    chalk.bold.cyan('Options:\n') +
    chalk.yellow('  --force      ') + chalk.dim('Recreate file even if it exists\n') +
    chalk.yellow('  --help       ') + chalk.dim('Show this help\n\n') +
    
    chalk.bold.cyan('Examples:\n') +
    chalk.white('  node create-testfile.js                    ') + chalk.dim('# Auto (sparse first)\n') +
    chalk.white('  node create-testfile.js sparse             ') + chalk.dim('# Fast sparse file\n') +
    chalk.white('  node create-testfile.js real               ') + chalk.dim('# Real data (better for I/O testing)\n') +
    chalk.white('  node create-testfile.js random             ') + chalk.dim('# Random data (most realistic)\n') +
    chalk.white('  node create-testfile.js real --force       ') + chalk.dim('# Force recreate with real data\n\n') +
    
    chalk.bold.yellow('💡 Tips:\n') +
    chalk.dim('• For hash performance testing, "real" or "random" gives more accurate results\n') +
    chalk.dim('• Sparse files may show unrealistically fast I/O performance');

  console.log(boxen(helpText, { 
    padding: 1, 
    margin: 1, 
    borderStyle: 'round',
    borderColor: 'cyan'
  }));
}

if (process.argv.includes('--help')) {
  showHelp();
} else {
  main();
}