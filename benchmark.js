#!/usr/bin/env node

const { spawn } = require('child_process');
const fs = require('fs');
const chalk = require('chalk');
const ora = require('ora');
const boxen = require('boxen');
const cliProgress = require('cli-progress');
const os = require('os');

const FILENAME = 'temp_10GB_file';

function runCommand(command, args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { 
      stdio: 'inherit',
      shell: process.platform === 'win32' 
    });
    
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command failed with exit code ${code}`));
      }
    });
    
    child.on('error', reject);
  });
}

async function runBenchmark() {
  const testType = process.argv[2] || 'basic';
  const keepFile = process.argv.includes('--keep-file');
    
  console.log(boxen(
    chalk.bold.cyan('🏁 Hash Performance Benchmark Suite\n\n') +
    chalk.blue('Test type: ') + chalk.white(testType) + '\n' +
    chalk.blue('Keep file: ') + chalk.white(keepFile ? 'Yes' : 'No') + '\n' +
    chalk.blue('Platform: ') + chalk.white(process.platform) + '\n' +
    chalk.blue('Available memory: ') + chalk.white(os.freemem() / 1024 / 1024 / 1024 + 'GB') + '\n' +
    chalk.blue('Total memory: ') + chalk.white(os.totalmem() / 1024 / 1024 / 1024 + 'GB') + '\n' +
    chalk.blue('CPU: ') + chalk.white(os.cpus()[0].model) + '\n' + 
    chalk.blue('CPU cores: ') + chalk.white(os.cpus().length) + '\n' +
    chalk.blue('CPU speed: ') + chalk.white(os.cpus()[0].speed + 'MHz') + '\n' +
    chalk.blue('CPU architecture: ') + chalk.white(os.arch()) + '\n' +
    chalk.blue('Available parallel cores: ') + chalk.white(os.availableParallelism()) + '\n' +
    chalk.blue('Node.js: ') + chalk.white(process.version),
    { padding: 1, margin: 1, borderStyle: 'double', borderColor: 'cyan', title: 'Configuration' }
  ));
  
  // Create progress bar for the overall benchmark
  const progressBar = new cliProgress.SingleBar({
    format: chalk.cyan('Overall Progress') + ' |' + chalk.cyan('{bar}') + '| {percentage}% | Step {value}/{total}: {step}',
    barCompleteChar: '\u2588',
    barIncompleteChar: '\u2591',
    hideCursor: true
  });
  
  const totalSteps = keepFile ? 3 : 4;
  let currentStep = 0;
  
  progressBar.start(totalSteps, 0, { step: 'Initializing...' });
  
  try {
    // Create test file
    currentStep++;
    progressBar.update(currentStep, { step: 'Creating test file' });
    
    console.log(chalk.bold.green('\n📁 Creating test file...'));
    await runCommand('node', ['create-testfile.js', 'random']);
    
    // Show file info
    currentStep++;
    progressBar.update(currentStep, { step: 'File information' });
    
    console.log(chalk.bold.blue('\n📋 File information...'));
    await runCommand('node', ['info.js']);
    
    currentStep++;
    if (testType === 'full') {
      // Main performance benchmark
      progressBar.update(currentStep, { step: 'Main performance benchmark' });
    
      console.log(chalk.bold.magenta('\n🏆 Main performance benchmark...'));
      if (fs.existsSync('index.js')) {
        await runCommand('node', ['index.js', FILENAME]);
      } else {
        console.log(chalk.yellow('⚠️  Main performance test file not found'));
      }
    } else {
      // Quick test
      progressBar.update(currentStep, { step: 'Quick performance test' });
      console.log(chalk.bold.yellow('\n🚀 Quick performance test...'));
      await runCommand('node', ['quick-test.js']);
    }
    
    // Cleanup (unless keeping file)
    if (!keepFile) {
      currentStep++;
      progressBar.update(currentStep, { step: 'Cleaning up' });
      
      console.log(chalk.bold.red('\n🧹 Final Step: Cleaning up...'));
      await runCommand('node', ['clean.js']);
    } else {
      console.log(chalk.bold.green('\n📁 Keeping test file for further testing'));
    }
    
    progressBar.update(totalSteps, { step: 'Complete!' });
    progressBar.stop();
    
    console.log(boxen(
      chalk.bold.green('🎉 Benchmark completed successfully!\n\n') +
      chalk.white('Results summary:\n') +
      chalk.green('• ') + chalk.white('All performance tests completed\n') +
      chalk.green('• ') + chalk.white('Check the output above for detailed results\n') +
      (keepFile 
        ? chalk.green('• ') + chalk.white('Test file preserved for additional testing\n')
        : chalk.green('• ') + chalk.white('Test file cleaned up automatically\n')
      ) +
      '\n' +
      chalk.dim('To run again: ') + chalk.white(`npm run benchmark${testType === 'full' ? ':full' : ''}`),
      { padding: 1, margin: 1, borderStyle: 'double', borderColor: 'green', title: 'Success' }
    ));
    
  } catch (error) {
    progressBar.stop();
    
    console.log(boxen(
      chalk.red('❌ Benchmark failed\n\n') +
      chalk.white('Error: ') + chalk.yellow(error.message) + '\n\n' +
      chalk.dim('Possible solutions:\n') +
      chalk.dim('• Check disk space\n') +
      chalk.dim('• Ensure dependencies are installed\n') +
      chalk.dim('• Try a different test type'),
      { padding: 1, margin: 1, borderStyle: 'round', borderColor: 'red', title: 'Error' }
    ));
    
    // Try to clean up on failure (unless keeping file)
    if (!keepFile && fs.existsSync(FILENAME)) {
      const cleanupSpinner = ora('Attempting cleanup after failure...').start();
      try {
        await runCommand('node', ['clean.js']);
        cleanupSpinner.succeed('Cleanup completed');
      } catch (cleanupError) {
        cleanupSpinner.fail('Cleanup also failed: ' + cleanupError.message);
      }
    }
    
    process.exit(1);
  }
}

function showHelp() {  
  const helpText = 
    chalk.bold.cyan('Usage:\n') +
    chalk.white('  node benchmark.js [type] [options]\n\n') +
    
    chalk.bold.cyan('Types:\n') +
    chalk.green('  basic        ') + chalk.dim('Run basic performance tests (default)\n') +
    chalk.green('  full         ') + chalk.dim('Run all performance tests including I/O\n\n') +
    
    chalk.bold.cyan('Options:\n') +
    chalk.yellow('  --keep-file  ') + chalk.dim('Keep the test file after completion\n') +
    chalk.yellow('  --help       ') + chalk.dim('Show this help message\n\n') +
    
    chalk.bold.cyan('Examples:\n') +
    chalk.white('  node benchmark.js                ') + chalk.dim('# Basic benchmark\n') +
    chalk.white('  node benchmark.js full           ') + chalk.dim('# Full benchmark with I/O tests\n') +
    chalk.white('  node benchmark.js basic --keep-file  ') + chalk.dim('# Keep test file after\n') +
    chalk.white('  npm run benchmark                ') + chalk.dim('# Using npm script\n') +
    chalk.white('  npm run benchmark:full           ') + chalk.dim('# Full benchmark via npm\n\n') +
    
    chalk.bold.yellow('What gets tested:\n') +
    chalk.white('• ') + chalk.cyan('Built-in crypto algorithms (SHA, MD5, BLAKE2)') + '\n' +
    chalk.white('• ') + chalk.magenta('External hash libraries (xxHash, CRC32)') + '\n' +
    chalk.white('• ') + chalk.green('Streaming hash performance (10GB file)') + '\n' +
    chalk.white('• ') + chalk.blue('Pure I/O performance (full benchmark only)') + '\n\n' +
    
    chalk.bold.green('Tips:\n') +
    chalk.dim('• Use "full" for comprehensive I/O analysis\n') +
    chalk.dim('• Use --keep-file to run multiple tests on same file\n') +
    chalk.dim('• Ensure you have at least 15GB free disk space');

  console.log(boxen(helpText, { 
    padding: 1, 
    margin: 1, 
    borderStyle: 'round',
    borderColor: 'cyan',
    title: 'Benchmark Help'
  }));
}

if (process.argv.includes('--help')) {
  showHelp();
} else {
  runBenchmark();
}