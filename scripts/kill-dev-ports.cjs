/**
 * scripts/kill-dev-ports.cjs
 *
 * Kills any processes occupying the Express dev port (3000) and Vite's
 * HMR WebSocket port (24678) before `npm run dev` starts.
 * Works on Windows, macOS, and Linux.
 */

const { execSync } = require('child_process');

const PORTS = [3000, 24678];

for (const port of PORTS) {
  try {
    if (process.platform === 'win32') {
      // Find the PID listening on the port and kill it
      execSync(
        `powershell -Command "` +
          `Get-NetTCPConnection -LocalPort ${port} -ErrorAction SilentlyContinue ` +
          `| ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }` +
        `"`,
        { stdio: 'ignore' }
      );
    } else {
      execSync(`lsof -ti:${port} | xargs kill -9 2>/dev/null || true`, { stdio: 'ignore' });
    }
    console.log(`✓ Cleared port ${port}`);
  } catch (_) {
    // Port not in use — nothing to do
  }
}
