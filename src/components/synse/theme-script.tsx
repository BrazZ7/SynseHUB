/**
 * Aplica o tema antes da primeira pintura, evitando o flash de tema claro.
 * Roda inline no `<head>` — precisa ser síncrono.
 */
const script = `
(function () {
  try {
    var stored = localStorage.getItem('synse-theme');
    var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    var dark = stored ? stored === 'dark' : prefersDark;
    document.documentElement.classList.toggle('dark', dark);
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
  } catch (error) {
    /* localStorage indisponível: mantém o tema claro. */
  }
})();
`

export function ThemeScript() {
  // eslint-disable-next-line react/no-danger
  return <script dangerouslySetInnerHTML={{ __html: script }} />
}
