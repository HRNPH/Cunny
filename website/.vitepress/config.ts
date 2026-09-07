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
          { text: '@cunny-ai/bg-remove', link: '/api/bg-remove/' },
          { text: '@cunny-ai/captions', link: '/api/captions/' },
          { text: '@cunny-ai/clip', link: '/api/clip/' },
          { text: '@cunny-ai/core', link: '/api/core/' },
          { text: '@cunny-ai/denoise-audio', link: '/api/denoise-audio/' },
          { text: '@cunny-ai/depth', link: '/api/depth/' },
          { text: '@cunny-ai/detect', link: '/api/detect/' },
          { text: '@cunny-ai/embed', link: '/api/embed/' },
          { text: '@cunny-ai/face-detect', link: '/api/face-detect/' },
          { text: '@cunny-ai/face-mesh', link: '/api/face-mesh/' },
          { text: '@cunny-ai/ocr', link: '/api/ocr/' },
          { text: '@cunny-ai/pose', link: '/api/pose/' },
          { text: '@cunny-ai/provider-mediapipe', link: '/api/provider-mediapipe/' },
          { text: '@cunny-ai/provider-onnx', link: '/api/provider-onnx/' },
          { text: '@cunny-ai/search', link: '/api/search/' },
          { text: '@cunny-ai/segment', link: '/api/segment/' },
          { text: '@cunny-ai/similarity', link: '/api/similarity/' },
          { text: '@cunny-ai/stt', link: '/api/stt/' },
          { text: '@cunny-ai/stt-live', link: '/api/stt-live/' },
          { text: '@cunny-ai/track', link: '/api/track/' },
          { text: '@cunny-ai/tts', link: '/api/tts/' },
          { text: '@cunny-ai/upscale', link: '/api/upscale/' },
          { text: '@cunny-ai/vad', link: '/api/vad/' },
          { text: '@cunny-ai/vector', link: '/api/vector/' },
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
