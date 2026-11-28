import type { Plugin } from 'vite';
import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

export function providerCatalog(root: string): Plugin {
  let directory: Promise<string> | undefined;
  let dev = false;
  const generate = () =>
    (directory ??= (async () => {
      const output = await mkdtemp(path.join(tmpdir(), 'ems-provider-directory-'));
      try {
        const workspaceScripts = path.resolve(root, '../../scripts');
        const require = createRequire(path.join(workspaceScripts, 'package.json'));
        const result = await promisify(execFile)(
          process.execPath,
          ['--import', require.resolve('tsx'), path.join(root, 'build/assembleProviders.ts'), output],
          { cwd: root },
        );
        console.info(result.stdout.trim());
        return output;
      } catch (error) {
        await rm(output, { recursive: true, force: true });
        directory = undefined;
        throw error;
      }
    })());
  const cleanup = async () => {
    if (directory) await rm(await directory, { recursive: true, force: true });
  };
  return {
    name: 'department-profile-directory',
    configureServer(server) {
      dev = true;
      server.httpServer?.once('close', () => {
        void cleanup();
      });
      server.middlewares.use(async (req, res, next) => {
        const match = /\/data\/providers\/((?:(?:contacts|stations|awards|coverage)-)?[A-Z]{2}\.json)(?:\?.*)?$/.exec(
          req.url ?? '',
        );
        if (!match) return next();
        try {
          const bytes = await readFile(path.join(await generate(), match[1]));
          res.setHeader('Content-Type', 'application/json');
          res.end(bytes);
        } catch (error) {
          next(error);
        }
      });
    },
    async generateBundle() {
      const output = await generate();
      for (const file of await readdir(output)) {
        this.emitFile({
          type: 'asset',
          fileName: 'data/providers/' + file,
          source: await readFile(path.join(output, file)),
        });
      }
    },
    async closeBundle() {
      if (!dev) await cleanup();
    },
  };
}
