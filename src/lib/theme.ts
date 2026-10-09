/**
 * Colour theme. The site is designed light — laid paper and iron-gall ink —
 * so dark pens read against it. `?theme=dark` keeps the original dark
 * direction available for comparison.
 */
export type Theme = 'light' | 'dark'

const q = new URLSearchParams(window.location.search)
export const THEME: Theme = q.get('theme') === 'dark' ? 'dark' : 'light'
export const HERO_THEME: Theme = q.get('hero') === 'dark' ? 'dark' : q.get('hero') === 'light' ? 'light' : THEME

export function applyTheme() {
  document.documentElement.dataset.theme = THEME
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME === 'light' ? '#e8e6e0' : '#10131b')
}
