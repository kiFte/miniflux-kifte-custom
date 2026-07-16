/* /feeds 和 /unread 页面按分类分组 + 折叠
 * 注入方式: Miniflux per-user custom_js (PUT /v1/users/<id> {"custom_js": "..."})
 * 兼容 CSP: 仅用 DOM API (createElement/appendChild/textContent)，不用 innerHTML (Trusted Types)
 *
 * 两页差异化（适应各自风格）:
 *   /feeds  — 订阅源管理场景: 醒目标题 (1.05rem) + 该分类 feed 未读总数 (从 counter 提取)
 *   /unread — 文章阅读场景:    低调标题 (小号 uppercase meta 色) + 本页该分类文章数
 *
 * 排序: 按计数降序; 分类内保持原条目顺序
 * 折叠: 点击标题切换，状态存 localStorage (key 前缀区分两页)
 * 保留: 移动 article 节点 (非克隆)，保留所有 form/button/swipe 事件与 data-id
 */
(() => {
  const path = location.pathname;
  const isFeeds = path === '/feeds';
  const isUnread = path === '/unread';
  if (!isFeeds && !isUnread) return;

  const cfg = isFeeds
    ? { selector: 'article.feed-item', groupClass: 'category-group', titleClass: 'category-group-title', countClass: 'cat-unread', storagePrefix: 'miniflux:feeds:collapsed:', countFromCounter: true }
    : { selector: 'article.entry-item', groupClass: 'entries-group', titleClass: 'entries-group-title', countClass: 'entries-group-count', storagePrefix: 'miniflux:unread:collapsed:', countFromCounter: false };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }

  function init() {
    const items = document.querySelector('.items');
    if (!items) return;
    const articles = Array.from(items.querySelectorAll(cfg.selector));
    if (articles.length === 0) return;

    const groups = new Map();
    const order = [];

    for (const art of articles) {
      const catLink = art.querySelector('span.category a');
      let catName = '未分类';
      let catId = '0';
      if (catLink) {
        catName = (catLink.textContent || '').trim() || '未分类';
        const m = (catLink.getAttribute('href') || '').match(/\/category\/(\d+)\//);
        if (m) catId = m[1];
      }
      let n = 0;
      if (cfg.countFromCounter) {
        const counter = art.querySelector('[id^="feed-entries-counter-"]');
        if (counter) {
          const m = counter.textContent.match(/\(\s*(\d+)\s*\//);
          if (m) n = parseInt(m[1], 10) || 0;
        }
      } else {
        n = 1;
      }
      let g = groups.get(catId);
      if (!g) {
        g = { catId, catName, count: 0, articles: [] };
        groups.set(catId, g);
        order.push(catId);
      }
      g.count += n;
      g.articles.push(art);
    }

    const sorted = Array.from(groups.values()).sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return order.indexOf(a.catId) - order.indexOf(b.catId);
    });

    for (const g of sorted) {
      const section = document.createElement('section');
      section.className = cfg.groupClass;
      section.dataset.catId = g.catId;

      const h2 = document.createElement('h2');
      h2.className = cfg.titleClass;
      h2.setAttribute('role', 'button');
      h2.setAttribute('tabindex', '0');

      const nameSpan = document.createElement('span');
      nameSpan.className = 'cat-name';
      nameSpan.textContent = g.catName;
      h2.appendChild(nameSpan);

      const countSpan = document.createElement('span');
      countSpan.className = cfg.countClass;
      countSpan.textContent = '(' + g.count + ')';
      h2.appendChild(countSpan);

      section.appendChild(h2);

      const body = document.createElement('div');
      body.className = cfg.groupClass + '-body';
      for (const art of g.articles) body.appendChild(art);
      section.appendChild(body);

      const key = cfg.storagePrefix + g.catId;
      let collapsed = false;
      try { collapsed = localStorage.getItem(key) === '1'; } catch (e) {}
      if (collapsed) {
        section.classList.add('collapsed');
        h2.setAttribute('aria-expanded', 'false');
      } else {
        h2.setAttribute('aria-expanded', 'true');
      }

      const toggle = () => {
        const c = section.classList.toggle('collapsed');
        h2.setAttribute('aria-expanded', c ? 'false' : 'true');
        try { localStorage.setItem(key, c ? '1' : '0'); } catch (e) {}
      };
      h2.addEventListener('click', toggle);
      h2.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggle();
        }
      });

      items.appendChild(section);
    }
  }
})();
