(function () {
  'use strict';

  var ROOT = (window.Shopify && window.Shopify.routes && window.Shopify.routes.root)
    ? window.Shopify.routes.root
    : '/';
  var CART_ENDPOINT = ROOT + 'cart.js';
  var DESKTOP = window.matchMedia('(min-width: 990px)');
  var NO_HOVER = window.matchMedia('(hover: none)');

  var header = null;
  var overlayMode = false;
  var scrollLocks = 0;

  var state = {
    hover: false,
    focus: false,
    scrolled: false,
    mega: false,
    search: false,
    drawer: false
  };

  var timers = {
    hoverLeave: null,
    megaOpen: null,
    megaClose: null
  };

  var openMegaItem = null;

  function lockScroll() {
    scrollLocks++;
    document.body.style.overflow = 'hidden';
  }

  function unlockScroll() {
    scrollLocks = Math.max(0, scrollLocks - 1);
    if (!scrollLocks) document.body.style.overflow = '';
  }

  function render() {
    if (!header) return;
    var solid = !overlayMode ||
      state.hover ||
      state.focus ||
      state.scrolled ||
      state.mega ||
      state.search ||
      state.drawer;
    header.classList.toggle('is-solid', solid);
  }

  function updateCartCount() {
    var countEls = document.querySelectorAll('[data-cart-count]');
    if (!countEls.length) return;
    fetch(CART_ENDPOINT, { credentials: 'same-origin' })
      .then(function (res) { return res.json(); })
      .then(function (cart) {
        countEls.forEach(function (el) {
          el.textContent = cart.item_count;
        });
        var wrap = document.querySelector('[data-cart-count-wrap]');
        if (wrap) wrap.hidden = cart.item_count === 0;
        var cartLink = document.querySelector('[data-cart-link]');
        if (cartLink) {
          cartLink.setAttribute('aria-label', 'Cart, ' + cart.item_count + ' items');
        }
      })
      .catch(function (err) {
        console.warn('[Aesop Header] Could not update cart count:', err);
      });
  }

  function watchCartRequests() {
    if (!window.fetch || window.__aesopFetchPatched) return;
    window.__aesopFetchPatched = true;
    var originalFetch = window.fetch;
    window.fetch = function () {
      var input = arguments[0];
      var url = typeof input === 'string' ? input : (input && input.url) || '';
      var request = originalFetch.apply(this, arguments);
      if (/\/cart\/(add|change|update|clear)/.test(url)) {
        request.then(function () {
          setTimeout(updateCartCount, 50);
        }).catch(function () {});
      }
      return request;
    };
    ['cart:updated', 'cart:change', 'cart:refresh'].forEach(function (name) {
      document.addEventListener(name, updateCartCount);
    });
  }

  function initHeaderState() {
    header.addEventListener('mouseenter', function () {
      clearTimeout(timers.hoverLeave);
      state.hover = true;
      render();
    });

    header.addEventListener('mouseleave', function () {
      clearTimeout(timers.hoverLeave);
      timers.hoverLeave = setTimeout(function () {
        state.hover = false;
        render();
      }, 120);
    });

    header.addEventListener('focusin', function (e) {
      var visible = true;
      try { visible = e.target.matches(':focus-visible'); } catch (err) {}
      if (visible) {
        state.focus = true;
        render();
      }
    });

    header.addEventListener('focusout', function (e) {
      if (!header.contains(e.relatedTarget)) {
        state.focus = false;
        render();
      }
    });

    var hideOnScroll = header.getAttribute('data-hide-on-scroll') === 'true';
    var lastY = window.pageYOffset || 0;
    var ticking = false;

    function keepVisible() {
      return state.mega || state.search || state.drawer || state.focus;
    }

    function onScroll() {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(function () {
        var y = Math.max(0, window.pageYOffset || document.documentElement.scrollTop || 0);
        var delta = y - lastY;
        state.scrolled = y > 10;

        if (hideOnScroll) {
          if (y <= 10) {
            header.classList.remove('is-hidden', 'is-condensed');
          } else if (delta > 4 && !keepVisible()) {
            header.classList.add('is-hidden');
            header.classList.remove('is-condensed');
          } else if (delta < -4) {
            header.classList.remove('is-hidden');
            header.classList.add('is-condensed');
          }
        }

        if (Math.abs(delta) > 4) lastY = y;
        ticking = false;
        render();
      });
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    header.addEventListener('focusin', function () {
      if (hideOnScroll && state.scrolled) {
        header.classList.remove('is-hidden');
        header.classList.add('is-condensed');
      }
    });
  }

  function openMega(item) {
    if (openMegaItem === item) return;
    closeMega();
    closeSearch();
    var trigger = item.querySelector('[data-mega-trigger]');
    item.classList.add('is-open');
    if (trigger) trigger.setAttribute('aria-expanded', 'true');
    openMegaItem = item;
    state.mega = true;
    render();
  }

  function closeMega() {
    if (!openMegaItem) return;
    var trigger = openMegaItem.querySelector('[data-mega-trigger]');
    openMegaItem.classList.remove('is-open');
    if (trigger) trigger.setAttribute('aria-expanded', 'false');
    openMegaItem = null;
    state.mega = false;
    render();
  }

  function initMegaMenu() {
    var items = header.querySelectorAll('.aesop-header__nav-item');
    var topRow = header.querySelector('.aesop-header__top');

    items.forEach(function (item) {
      var hasMega = item.hasAttribute('data-mega-item');
      var trigger = item.querySelector('[data-mega-trigger]');

      item.addEventListener('mouseenter', function () {
        if (!DESKTOP.matches) return;
        clearTimeout(timers.megaClose);
        clearTimeout(timers.megaOpen);
        if (!hasMega) {
          timers.megaOpen = setTimeout(closeMega, 60);
          return;
        }
        var delay = openMegaItem ? 0 : 90;
        timers.megaOpen = setTimeout(function () { openMega(item); }, delay);
      });

      item.addEventListener('mouseleave', function () {
        clearTimeout(timers.megaOpen);
      });

      item.addEventListener('focusin', function () {
        if (!DESKTOP.matches) return;
        if (hasMega) openMega(item); else closeMega();
      });

      if (trigger) {
        trigger.addEventListener('click', function (e) {
          if (!DESKTOP.matches || !NO_HOVER.matches) return;
          if (!item.classList.contains('is-open')) {
            e.preventDefault();
            openMega(item);
          }
        });
      }
    });

    header.addEventListener('mouseenter', function () {
      clearTimeout(timers.megaClose);
    });

    header.addEventListener('mouseleave', function () {
      clearTimeout(timers.megaOpen);
      clearTimeout(timers.megaClose);
      timers.megaClose = setTimeout(closeMega, 150);
    });

    if (topRow) {
      topRow.addEventListener('mouseenter', function () {
        clearTimeout(timers.megaOpen);
        clearTimeout(timers.megaClose);
        timers.megaClose = setTimeout(closeMega, 120);
      });
    }
  }

  var searchPanel = null;
  var searchInput = null;
  var searchResults = null;
  var searchAbort = null;
  var searchDebounce = null;
  var searchTriggers = [];

  function openSearch() {
    if (!searchPanel) return;
    closeMega();
    searchPanel.classList.add('is-open');
    searchPanel.setAttribute('aria-hidden', 'false');
    searchTriggers.forEach(function (t) { t.setAttribute('aria-expanded', 'true'); });
    state.search = true;
    render();
    setTimeout(function () { if (searchInput) searchInput.focus(); }, 60);
  }

  function closeSearch() {
    if (!searchPanel || !searchPanel.classList.contains('is-open')) return;
    searchPanel.classList.remove('is-open', 'is-searching');
    searchPanel.setAttribute('aria-hidden', 'true');
    searchTriggers.forEach(function (t) { t.setAttribute('aria-expanded', 'false'); });
    if (searchAbort && searchAbort.abort) searchAbort.abort();
    if (searchInput) searchInput.value = '';
    if (searchResults) searchResults.textContent = '';
    state.search = false;
    render();
  }

  function formatPrice(value) {
    var number = parseFloat(value);
    if (isNaN(number)) return value || '';
    var currency = window.Shopify && window.Shopify.currency && window.Shopify.currency.active;
    if (currency && window.Intl && Intl.NumberFormat) {
      try {
        return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency }).format(number);
      } catch (err) {}
    }
    return number.toFixed(2);
  }

  function renderResults(query, products) {
    searchResults.textContent = '';

    if (!products.length) {
      var empty = document.createElement('p');
      empty.className = 'aesop-search__empty';
      empty.textContent = searchResults.getAttribute('data-empty-text') || 'No results found';
      searchResults.appendChild(empty);
      return;
    }

    var grid = document.createElement('div');
    grid.className = 'aesop-search__grid';

    products.forEach(function (product) {
      var link = document.createElement('a');
      link.className = 'aesop-search__item';
      link.href = product.url;

      if (product.image) {
        var img = document.createElement('img');
        img.src = product.image;
        img.alt = '';
        img.loading = 'lazy';
        link.appendChild(img);
      } else {
        var placeholder = document.createElement('span');
        placeholder.className = 'aesop-search__item-media';
        link.appendChild(placeholder);
      }

      var title = document.createElement('span');
      title.className = 'aesop-search__item-title';
      title.textContent = product.title;
      link.appendChild(title);

      if (product.price) {
        var price = document.createElement('span');
        price.className = 'aesop-search__item-price';
        price.textContent = formatPrice(product.price);
        link.appendChild(price);
      }

      grid.appendChild(link);
    });

    searchResults.appendChild(grid);

    var all = document.createElement('a');
    all.className = 'aesop-search__all';
    all.href = ROOT + 'search?q=' + encodeURIComponent(query) + '&options[prefix]=last';
    all.textContent = searchResults.getAttribute('data-all-text') || 'View all results';
    searchResults.appendChild(all);
  }

  function fetchSuggestions(query) {
    if (searchAbort && searchAbort.abort) searchAbort.abort();
    searchAbort = (typeof AbortController !== 'undefined') ? new AbortController() : null;

    var url = ROOT + 'search/suggest.json?q=' + encodeURIComponent(query) +
      '&resources[type]=product&resources[limit]=4';

    fetch(url, {
      credentials: 'same-origin',
      signal: searchAbort ? searchAbort.signal : undefined
    })
      .then(function (res) {
        if (!res.ok) throw new Error('Search request failed: ' + res.status);
        return res.json();
      })
      .then(function (data) {
        var products = (data.resources && data.resources.results && data.resources.results.products) || [];
        renderResults(query, products);
      })
      .catch(function (err) {
        if (err && err.name === 'AbortError') return;
        console.warn('[Aesop Header] Predictive search failed:', err);
      });
  }

  function initSearch() {
    searchPanel = header.querySelector('[data-search-panel]');
    if (!searchPanel) return;
    searchInput = searchPanel.querySelector('[data-search-input]');
    searchResults = searchPanel.querySelector('[data-search-results]');
    searchTriggers = Array.prototype.slice.call(document.querySelectorAll('[data-search-open]'));

    searchTriggers.forEach(function (trigger) {
      trigger.addEventListener('click', function () {
        if (searchPanel.classList.contains('is-open')) closeSearch(); else openSearch();
      });
    });

    searchPanel.querySelectorAll('[data-search-close]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        closeSearch();
        if (searchTriggers[0]) searchTriggers[0].focus();
      });
    });

    if (searchInput) {
      searchInput.addEventListener('input', function () {
        var query = searchInput.value.trim();
        clearTimeout(searchDebounce);

        if (query.length < 2) {
          searchPanel.classList.remove('is-searching');
          if (searchAbort && searchAbort.abort) searchAbort.abort();
          searchResults.textContent = '';
          return;
        }

        searchPanel.classList.add('is-searching');
        searchDebounce = setTimeout(function () { fetchSuggestions(query); }, 250);
      });
    }
  }

  var drawer = null;
  var drawerOpener = null;

  function openDrawer(opener) {
    if (!drawer) return;
    drawerOpener = opener || null;
    drawer.classList.add('is-open');
    drawer.setAttribute('aria-hidden', 'false');
    document.querySelectorAll('[data-drawer-open]').forEach(function (b) {
      b.setAttribute('aria-expanded', 'true');
    });
    state.drawer = true;
    lockScroll();
    render();
    var closeBtn = drawer.querySelector('.aesop-drawer__head [data-drawer-close]');
    if (closeBtn) closeBtn.focus();
  }

  function closeDrawer() {
    if (!drawer || !drawer.classList.contains('is-open')) return;
    drawer.classList.remove('is-open');
    drawer.setAttribute('aria-hidden', 'true');
    document.querySelectorAll('[data-drawer-open]').forEach(function (b) {
      b.setAttribute('aria-expanded', 'false');
    });
    state.drawer = false;
    unlockScroll();
    render();
    if (drawerOpener) drawerOpener.focus();
  }

  function initDrawer() {
    drawer = document.querySelector('[data-drawer]');
    if (!drawer) return;

    document.querySelectorAll('[data-drawer-open]').forEach(function (btn) {
      btn.addEventListener('click', function () { openDrawer(btn); });
    });

    drawer.querySelectorAll('[data-drawer-close]').forEach(function (btn) {
      btn.addEventListener('click', closeDrawer);
    });

    drawer.querySelectorAll('[data-accordion-trigger]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var expanded = btn.getAttribute('aria-expanded') === 'true';
        btn.setAttribute('aria-expanded', expanded ? 'false' : 'true');
        var panel = document.getElementById(btn.getAttribute('aria-controls'));
        if (panel) panel.hidden = expanded;
      });
    });

    drawer.querySelectorAll('[data-email-signup]').forEach(function (link) {
      link.addEventListener('click', closeDrawer);
    });

    window.addEventListener('resize', function () {
      if (DESKTOP.matches) closeDrawer();
    });
  }

  function initEmailModal() {
    var modal = document.querySelector('[data-email-modal]');
    if (!modal) return;
    var openTriggers = document.querySelectorAll('[data-email-signup]');
    var closeTriggers = modal.querySelectorAll('[data-email-modal-close]');
    var lastTrigger = null;

    function openModal(e) {
      if (e) e.preventDefault();
      lastTrigger = e && e.currentTarget ? e.currentTarget : null;
      modal.classList.add('is-open');
      modal.setAttribute('aria-hidden', 'false');
      lockScroll();
      var firstInput = modal.querySelector('input[type="email"]');
      if (firstInput) firstInput.focus();
    }

    function closeModal() {
      if (!modal.classList.contains('is-open')) return;
      modal.classList.remove('is-open');
      modal.setAttribute('aria-hidden', 'true');
      unlockScroll();
      if (lastTrigger && lastTrigger.focus) lastTrigger.focus();
    }

    openTriggers.forEach(function (trigger) {
      trigger.addEventListener('click', openModal);
    });

    closeTriggers.forEach(function (trigger) {
      trigger.addEventListener('click', closeModal);
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && modal.classList.contains('is-open')) {
        closeModal();
      }
    });

    if (modal.querySelector('[data-email-posted]')) {
      openModal();
    }
  }

  function initLanguageSwitcher() {
    var switchers = document.querySelectorAll('[data-language-switcher]');
    switchers.forEach(function (switcher) {
      switcher.addEventListener('click', function (e) {
        if (switcher.getAttribute('href') === '#') e.preventDefault();
      });
    });
  }

  function applyBodyOffset() {
    if (!header) return;
    var root = document.documentElement;

    function setHeight() {
      root.style.setProperty('--aesop-header-h', header.offsetHeight + 'px');
    }
    setHeight();

    if (window.ResizeObserver) {
      new ResizeObserver(setHeight).observe(header);
    } else {
      window.addEventListener('resize', setHeight);
    }

    var style = window.getComputedStyle(header);
    if (!overlayMode && style.position === 'fixed') {
      document.body.classList.add('aesop-header-active');
    }
  }

  function initGlobalListeners() {
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (openMegaItem) {
        var trigger = openMegaItem.querySelector('[data-mega-trigger]');
        closeMega();
        if (trigger) trigger.focus();
      }
      if (searchPanel && searchPanel.classList.contains('is-open')) {
        closeSearch();
        if (searchTriggers[0]) searchTriggers[0].focus();
      }
      closeDrawer();
    });

    document.addEventListener('click', function (e) {
      if (!header || header.contains(e.target)) return;
      closeMega();
      closeSearch();
    });
  }

  function init() {
    header = document.querySelector('[data-aesop-header]');
    if (header) {
      overlayMode = header.getAttribute('data-overlay') === 'true';
      header.classList.add('is-ready');
    }

    applyBodyOffset();

    if (header) {
      initHeaderState();
      initMegaMenu();
      initSearch();
      initDrawer();
      initGlobalListeners();
      render();
    }

    updateCartCount();
    watchCartRequests();
    initEmailModal();
    initLanguageSwitcher();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.AesopHeader = {
    updateCartCount: updateCartCount,
    openSearch: openSearch,
    closeSearch: closeSearch
  };
})();