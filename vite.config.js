import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // Манифест лежит в public/ и правится руками — плагин его не генерирует
      manifest: false,
      injectRegister: null,

      // 'prompt', а не 'autoUpdate': при autoUpdate плагин сам перезагружает
      // страницу, как только приезжает новая версия — прямо посреди работы.
      // Нам нужна плашка с кнопкой, поэтому обновление ждёт решения.
      registerType: 'prompt',

      workbox: {
        // Оболочка приложения: html/js/css/шрифты/картинки
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,webmanifest}'],
        // SPA: любая навигация отдаётся из закешированной оболочки —
        // приложение поднимается офлайн и само показывает заглушку.
        // Отдельная offline.html тут не нужна: она бы перехватывала
        // и те переходы, которые прекрасно работают из кеша.
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/rest\//, /^\/auth\//],
        cleanupOutdatedCaches: true,
        // Новый SW ждёт команды из плашки «Обновить»
        skipWaiting: false,
        clientsClaim: false,

        runtimeCaching: [
          {
            // Данные Supabase (REST, RPC, Realtime, авторизация) — только сеть.
            // Закешированная доска показывала бы вчерашние задачи как сегодняшние,
            // а это хуже, чем честное «нет соединения».
            urlPattern: ({ url }) =>
              /\.supabase\.(co|in)$/.test(url.hostname) &&
              !url.pathname.startsWith('/storage/'),
            handler: 'NetworkOnly',
          },
          {
            // Аватары и вложения из Storage — редко меняются, тяжёлые
            urlPattern: ({ url }) =>
              /\.supabase\.(co|in)$/.test(url.hostname) &&
              url.pathname.startsWith('/storage/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'azimut-storage',
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 дней
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },

      devOptions: {
        // В dev service worker не мешает: включать вручную при отладке
        enabled: false,
      },
    }),
  ],
})
