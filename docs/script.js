/* ============================================================
   CXone Device Signal Bridge — Story Website Script
   - Sticky nav active-state via IntersectionObserver
   - Scroll-reveal animation via IntersectionObserver
   - Accordion (troubleshooting) toggle
   - Collapsible architecture toggle
   ============================================================ */

(function () {
  'use strict';

  /* ── Scroll-reveal ── */
  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          revealObserver.unobserve(entry.target); // fire once
        }
      });
    },
    { threshold: 0.08, rootMargin: '0px 0px -40px 0px' }
  );

  function initReveal() {
    document.querySelectorAll('.reveal').forEach((el) => revealObserver.observe(el));
  }

  /* ── Sticky nav active-state ── */
  const sections = [];
  const navTabs = [];

  function initNav() {
    document.querySelectorAll('.nav-tab').forEach((tab) => {
      const href = tab.getAttribute('href') || tab.dataset.target;
      if (href && href.startsWith('#')) {
        const target = document.querySelector(href);
        if (target) {
          navTabs.push({ tab, section: target });
          sections.push(target);
        }
      }
    });

    if (!sections.length) return;

    const navObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const id = entry.target.id;
            navTabs.forEach(({ tab, section }) => {
              tab.classList.toggle('active', section.id === id);
            });
          }
        });
      },
      {
        // Fire when the top of a section crosses ~25% from the top of the viewport
        rootMargin: '-15% 0px -70% 0px',
        threshold: 0,
      }
    );

    sections.forEach((s) => navObserver.observe(s));
  }

  /* Nav tab click — smooth scroll */
  function initNavClicks() {
    document.querySelectorAll('.nav-tab').forEach((tab) => {
      tab.addEventListener('click', (e) => {
        const href = tab.getAttribute('href') || tab.dataset.target;
        if (href && href.startsWith('#')) {
          e.preventDefault();
          const target = document.querySelector(href);
          if (target) {
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }
      });
    });
  }

  /* CTA button smooth-scroll */
  function initCTAs() {
    document.querySelectorAll('[data-scroll-to]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const target = document.querySelector(btn.dataset.scrollTo);
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }

  /* ── Accordion ── */
  function initAccordion() {
    document.querySelectorAll('.accordion-header').forEach((header) => {
      header.addEventListener('click', () => {
        const item = header.closest('.accordion-item');
        const isOpen = item.classList.contains('open');
        // Close all in this accordion
        const accordion = item.closest('.accordion');
        accordion.querySelectorAll('.accordion-item.open').forEach((openItem) => {
          openItem.classList.remove('open');
        });
        if (!isOpen) item.classList.add('open');
      });
    });
  }

  /* ── Collapsible (arch detailed image) ── */
  function initCollapsibles() {
    document.querySelectorAll('.collapsible-toggle').forEach((btn) => {
      btn.addEventListener('click', () => {
        const targetId = btn.dataset.target;
        const body = document.getElementById(targetId);
        if (!body) return;
        const isOpen = body.classList.contains('open');
        body.classList.toggle('open', !isOpen);
        // Update button text
        const labelOpen = btn.dataset.labelOpen || 'Hide';
        const labelClosed = btn.dataset.labelClosed || btn.textContent.trim();
        if (!btn.dataset.labelClosed) btn.dataset.labelClosed = btn.querySelector('.btn-text')
          ? btn.querySelector('.btn-text').textContent
          : btn.textContent.trim();
        const textEl = btn.querySelector('.btn-text') || btn;
        if (textEl.tagName !== 'BUTTON') {
          textEl.textContent = isOpen ? (btn.dataset.labelClosed || 'Show detailed architecture') : labelOpen;
        }
        // Flip chevron
        const chevron = btn.querySelector('.chevron');
        if (chevron) chevron.style.transform = isOpen ? '' : 'rotate(180deg)';
      });
    });
  }

  /* ── Init all ── */
  function init() {
    initReveal();
    initNav();
    initNavClicks();
    initCTAs();
    initAccordion();
    initCollapsibles();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
