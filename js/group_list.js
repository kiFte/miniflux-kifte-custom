/* /feeds 和 /unread 页面按分类分组 + 折叠
 * 注入方式: Miniflux per-user custom_js (PUT /v1/users/<id> {"custom_js": "..."})
 * 兼容 CSP: 仅用 DOM API (createElement/appendChild/textContent)，不用 innerHTML (Trusted Types)
 *
 * 两页差异化（适应各自风格）:
 *   /feeds  — 订阅源管理场景: 醒目标题 (1.05rem) + 该分类 feed 未读总数 (从 counter 提取)
 *   /unread — 文章阅读场景:    低调标题 (小号 uppercase meta 色) + 本页该分类文章数
 *
 * 排序: 按计数降序; 分类内保持原条目顺序
 *       /unread 额外: 默认新→旧 (desc)，page-header 加箭头按钮切 asc/desc，状态存 localStorage
 *       (键名 miniflux:unread:sort-dir)。客户端排序，跨页不一致视为已知边界(多数情况翻不到页)。
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

  // ===== /unread 排序 (客户端) =====
  const SORT_KEY = 'miniflux:unread:sort-dir';
  const currentDir = () => {
    try { return localStorage.getItem(SORT_KEY) || 'desc'; } catch (e) { return 'desc'; }
  };
  const setDir = (d) => {
    try { localStorage.setItem(SORT_KEY, d); } catch (e) {}
  };
  const entryTime = (art) => {
    const t = art.querySelector('time[datetime]');
    if (!t) return 0;
    const ts = Date.parse(t.getAttribute('datetime') || '');
    return Number.isNaN(ts) ? 0 : ts;
  };
  // stable sort：时间相同维持原顺序；desc=新→旧(大→小)，asc=旧→新(小→大)
  const sortArticles = (arr, dir) => {
    const sign = dir === 'asc' ? 1 : -1;
    return arr
      .map((el, i) => [el, i])
      .sort((a, b) => {
        const d = (entryTime(a[0]) - entryTime(b[0])) * sign;
        return d !== 0 ? d : a[1] - b[1];
      })
      .map(([el]) => el);
  };
  // 切换时对已有分组 body 重新排序：append 移动已有节点，事件/data-id 全保留
  const applySortToGroups = (dir) => {
    const bodies = document.querySelectorAll('.items .' + cfg.groupClass + '-body');
    for (const body of bodies) {
      const ordered = sortArticles(Array.from(body.children), dir);
      for (const el of ordered) body.appendChild(el);
    }
  };
  const insertSortToggle = () => {
    const nav = document.querySelector('.page-header nav ul');
    if (!nav) return;
    if (nav.querySelector('[data-sort-toggle="1"]')) return;

    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.className = 'page-button';
    btn.setAttribute('type', 'button');
    btn.setAttribute('data-sort-toggle', '1');

    const sync = () => {
      const d = currentDir();
      btn.textContent = d === 'asc' ? '↑' : '↓';
      const label = d === 'asc' ? '排序：旧→新' : '排序：新→旧';
      btn.setAttribute('title', label);
      btn.setAttribute('aria-label', label);
    };
    btn.addEventListener('click', () => {
      const next = currentDir() === 'asc' ? 'desc' : 'asc';
      setDir(next);
      applySortToGroups(next);
      sync();
    });
    sync();
    li.appendChild(btn);
    nav.appendChild(li);
  };

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
      const bodyArts = isUnread ? sortArticles(g.articles, currentDir()) : g.articles;
      for (const art of bodyArts) body.appendChild(art);
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

    if (isUnread) insertSortToggle();
  }
})();
