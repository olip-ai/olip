// Makes wide tables that scroll sideways reachable by keyboard (WCAG 2.1.1) and names them for screen readers.
function markScrollableTables() {
  document.querySelectorAll('.markdown table').forEach((t) => {
    if (t.scrollWidth > t.clientWidth + 1) {
      if (!t.hasAttribute('tabindex')) t.setAttribute('tabindex', '0');
      if (!t.hasAttribute('role')) t.setAttribute('role', 'region');
      if (!t.hasAttribute('aria-label')) {
        const h = t.previousElementSibling && /^H[2-4]$/.test(t.previousElementSibling.tagName) ? t.previousElementSibling.innerText : 'Table';
        t.setAttribute('aria-label', `${h} (scrolls sideways)`);
      }
    } else if (t.getAttribute('tabindex') === '0') {
      t.removeAttribute('tabindex');
    }
  });
}
export function onRouteDidUpdate() {
  if (typeof window === 'undefined') return;
  window.requestAnimationFrame(markScrollableTables);
}
if (typeof window !== 'undefined') window.addEventListener('resize', () => window.requestAnimationFrame(markScrollableTables));
