import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const coachTarget = env.VITE_COACH_API_URL || process.env.VITE_COACH_API_URL || 'http://127.0.0.1:8787';

  return {
    server: {
      port: 5173,
      host: true,
      open: false,
      proxy: {
        '/api': {
          target: coachTarget,
          changeOrigin: true,
          secure: false,
          configure: (proxy) => {
            proxy.on('error', (err, req, res) => {
              if (res && !res.headersSent && typeof res.writeHead === 'function') {
                res.writeHead(503, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                  error: {
                    code: 'WORKER_OFFLINE',
                    message: 'Coach API target is offline. Run `pnpm worker:dev` in a second terminal, or continue with local coaching commands.',
                  },
                }));
              }
            });
          },
        },
      },
    },
    build: {
      chunkSizeWarningLimit: 700,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules/three')) {
              return 'vendor-three';
            }
          },
        },
      },
    },
    assetsInclude: ['**/*.glb', '**/*.gltf'],
  };
});
