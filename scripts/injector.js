const { root: siteRoot = "/" } = hexo.config;
// layout 为 photo的时候导入这些js与css
hexo.extend.injector.register(
  "body_end",
  `
  <link rel="stylesheet" href="https://cdn.staticfile.org/fancybox/3.5.7/jquery.fancybox.min.css">
  <script src="//cdn.jsdelivr.net/npm/minigrid@3.1.1/dist/minigrid.min.js"></script>
  <script src="https://cdn.staticfile.org/fancybox/3.5.7/jquery.fancybox.min.js"></script>
  <script src="https://cdn.bootcdn.net/ajax/libs/lazyloadjs/3.2.2/lazyload.js"></script>
  <script defer src="${siteRoot}js/gallery.js"></script>
  `,
  "photo"
);