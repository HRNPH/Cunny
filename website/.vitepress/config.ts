import { defineConfig } from 'vitepress'

export default defineConfig({
  title: '@cunny-ai',
  description: 'Browser AI SDK. Inference only, client only.',
  srcDir: '../docs',
  ignoreDeadLinks: true,
  cleanUrls: true,

  head: [['link', { rel: 'icon', href: '/favicon.svg' }]],

  themeConfig: {
    nav: [
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'API', link: '/api/' },
      { text: 'Tasks', link: '/tasks' },
      { text: 'Roadmap', link: '/roadmaps/roadmap' },
    ],

    sidebar: [
      {
        text: 'Guide',
        items: [
          { text: 'Getting Started', link: '/guide/getting-started' },
          { text: 'Architecture', link: '/architecture' },
          { text: 'Task Catalog', link: '/tasks' },
          { text: 'Roadmap', link: '/roadmaps/roadmap' },
          { text: 'Releases', link: '/releases' },
        ],
      },
      {
        text: 'API Reference',
        items: [
          { text: 'Overview', link: '/api/' },
          { text: '@cunny-ai/core', link: '/api/core/' },
          { text: '@cunny-ai/provider-mediapipe', link: '/api/provider-mediapipe/' },
          { text: '@cunny-ai/face-detect', link: '/api/face-detect/' },
        ],
      },
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/HRNPH/Cunny' },
    ],

    outline: { level: [2, 3] },
    search: { provider: 'local' },
  },
})
