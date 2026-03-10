import { downloadAndUnzipVSCode } from '@vscode/test-electron';
import * as cp from 'child_process';
import * as path from 'path';

/**
 * On Windows, paths with spaces break when passed via shell=true spawn
 * (the shell joins the args array with spaces, splitting paths at spaces).
 * Wrap each arg that contains a space in double-quotes so cmd.exe treats it
 * as a single token.
 */
function quoteArg(arg: string): string {
  return arg.includes(' ') ? `"${arg}"` : arg;
}

async function main() {
  const extDevPath = path.resolve(__dirname, '../../');
  const extTestsPath = path.resolve(__dirname, './suite/index');
  const userDataDir = path.join(__dirname, '../../.vscode-test/user-data');

  const vscodeExe = await downloadAndUnzipVSCode();

  const rawArgs = [
    '--no-sandbox',
    '--disable-gpu-sandbox',
    '--disable-updates',
    '--skip-welcome',
    '--skip-release-notes',
    '--disable-workspace-trust',
    '--disable-extensions',
    `--user-data-dir=${userDataDir}`,
    `--extensionDevelopmentPath=${extDevPath}`,
    `--extensionTestsPath=${extTestsPath}`,
  ];

  const isWin = process.platform === 'win32';
  const args = isWin ? rawArgs.map(quoteArg) : rawArgs;

  const cmd = cp.spawn(isWin ? `"${vscodeExe}"` : vscodeExe, args, {
    stdio: 'inherit',
    shell: isWin,
  });

  cmd.on('close', (code) => process.exit(code ?? 0));
  cmd.on('error', (err) => {
    console.error('Failed to start VS Code:', err);
    process.exit(1);
  });
}

main();
