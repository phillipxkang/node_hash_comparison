#!/usr/bin/env node

const fs = require('fs');
const chalk = require('chalk');
const ora = require('ora');
const boxen = require('boxen');

const FILENAME = 'temp_10GB_file';


async function cleanTestFile() {
  try {
    if (fs.existsSync(FILENAME)) {
      const stats = fs.statSync(FILENAME);
      const sizeGB = (stats.size / 1024 / 1024 / 1024).toFixed(2);

      const spinner = ora({
        text: chalk.yellow(`Removing ${FILENAME} (${sizeGB}GB)...`),
        spinner: 'dots'
      }).start();
      
      // Add a small delay to show the spinner
      await new Promise(resolve => setTimeout(resolve, 500));
      
      fs.unlinkSync(FILENAME);
      
      spinner.succeed(chalk.green('Test file removed successfully'));

    } else {
      console.log(boxen(
        chalk.blue('ℹ️  No cleanup needed\n\n') +
        chalk.white('The test file was not found.\n') +
        chalk.dim('Nothing to clean up.'),
        { padding: 1, margin: 1, borderStyle: 'round', borderColor: 'blue', title: 'Info' }
      ));
    }
  } catch (error) {
    console.log(boxen(
      chalk.red('❌ Failed to remove test file\n\n') +
      chalk.white('Error: ') + chalk.yellow(error.message) + '\n\n' +
      chalk.dim('Possible causes:\n') +
      chalk.dim('• File is in use by another process\n') +
      chalk.dim('• Insufficient permissions\n') +
      chalk.dim('• File system error'),
      { padding: 1, margin: 1, borderStyle: 'round', borderColor: 'red', title: 'Error' }
    ));
    process.exit(1);
  }
}

if (require.main === module) {
  cleanTestFile();
}