#!/usr/bin/env node

const fs = require('fs');
const chalk = require('chalk');
const boxen = require('boxen');

const FILENAME = 'temp_10GB_file';
const EXPECTED_SIZE = 10 * 1024 * 1024 * 1024; // 10GB

function formatBytes(bytes) {
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  if (bytes === 0) return '0 Bytes';
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(2) + ' ' + sizes[i];
}

function formatDate(date) {
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

function checkTestFile() {
  try {
    if (fs.existsSync(FILENAME)) {
      const stats = fs.statSync(FILENAME);
      
      // Build file info content
      let fileInfo = 
        chalk.blue('📄 File: ') + chalk.white(FILENAME) + '\n' +
        chalk.blue('📏 Size: ') + chalk.white(formatBytes(stats.size)) + '\n' +
        chalk.blue('📅 Created: ') + chalk.white(formatDate(stats.birthtime)) + '\n' +
        chalk.blue('📝 Modified: ') + chalk.white(formatDate(stats.mtime)) + '\n\n';
      
      // Size analysis
      let sizeAnalysis = '';
      let boxColor = 'green';
      
      if (stats.size === EXPECTED_SIZE) {
        sizeAnalysis += chalk.green('✅ File size is correct (10GB)\n');
      } else {
        const percentage = ((stats.size / EXPECTED_SIZE) * 100).toFixed(1);
        sizeAnalysis += 
          chalk.yellow(`⚠️  Expected: ${formatBytes(EXPECTED_SIZE)}\n`) +
          chalk.yellow(`⚠️  Actual: ${formatBytes(stats.size)}\n`) +
          chalk.cyan(`📊 Size: ${percentage}% of expected\n`);
        
        if (stats.size < EXPECTED_SIZE) {
          sizeAnalysis += chalk.red('❌ File is smaller than expected\n');
        } else {
          sizeAnalysis += chalk.red('❌ File is larger than expected\n');
        }
        boxColor = 'yellow';
      }
      
      // Sparse file detection (Unix/Mac only)
      let fileTypeInfo = '';
      if (process.platform !== 'win32' && stats.blocks !== undefined) {
        const actualBlocks = stats.blocks || 0;
        const expectedBlocks = Math.ceil(stats.size / 512);
        const sparseRatio = actualBlocks / expectedBlocks;
        const diskUsage = actualBlocks * 512;
        
        if (sparseRatio < 0.1) {
          fileTypeInfo = 
            chalk.blue('💾 File type: ') + chalk.cyan('Sparse file\n') +
            chalk.blue('💿 Disk usage: ') + chalk.green(formatBytes(diskUsage)) + chalk.dim(' (efficient storage)\n') +
            chalk.yellow('⚠️  Sparse files may show unrealistic I/O performance\n') +
            chalk.dim('💡 For realistic testing: ') + chalk.white('npm run create-testfile:real');
        } else {
          fileTypeInfo = 
            chalk.blue('💾 File type: ') + chalk.green('Real file\n') +
            chalk.blue('💿 Disk usage: ') + chalk.white(formatBytes(diskUsage)) + chalk.dim(' (actual storage)\n') +
            chalk.green('✅ Good for realistic I/O performance testing');
        }
      } else if (process.platform === 'win32') {
        fileTypeInfo = chalk.blue('💾 Platform: ') + chalk.white('Windows (sparse detection not available)');
      }
      
      console.log(boxen(
        chalk.bold.green('📋 Test File Information\n\n') +
        fileInfo +
        sizeAnalysis +
        (fileTypeInfo ? '\n' + fileTypeInfo : ''),
        { padding: 1, margin: 1, borderStyle: 'round', borderColor: boxColor, title: 'File Status' }
      ));
      
    } else {
      console.log(boxen(
        chalk.red('❌ Test file does not exist\n\n') +
        chalk.white('To create the test file:\n\n') +
        
        chalk.cyan('Quick (sparse): ') + chalk.white('npm run create-testfile\n') +
        chalk.cyan('Realistic I/O: ') + chalk.white('npm run create-testfile:real\n') +
        chalk.cyan('Random data: ') + chalk.white('npm run create-testfile:random\n\n') +
        
        chalk.dim('Or use the command directly:\n') +
        chalk.white('node create-testfile.js [method]'),
        { padding: 1, margin: 1, borderStyle: 'round', borderColor: 'red', title: 'File Missing' }
      ));
    }
  } catch (error) {
    console.log(boxen(
      chalk.red('❌ Error checking test file\n\n') +
      chalk.white('Error: ') + chalk.yellow(error.message) + '\n\n' +
      chalk.dim('This might indicate file system permissions issues or\n') +
      chalk.dim('the file is in use by another process.'),
      { padding: 1, margin: 1, borderStyle: 'round', borderColor: 'red', title: 'Error' }
    ));
    process.exit(1);
  }
}

if (require.main === module) {
  checkTestFile();
}