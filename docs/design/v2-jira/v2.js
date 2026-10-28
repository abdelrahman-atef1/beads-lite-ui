const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)], H = document.documentElement;
function view(v) {
  $$('.view').forEach(e => e.classList.toggle('on', e.id === v));
  $$('.tabs a').forEach(a => a.setAttribute('aria-current', a.dataset.v === v ? 'page' : 'false'));
}
addEventListener('hashchange', () => view(location.hash.slice(1) || 'board'));
view(location.hash.slice(1) || 'board');
$('#theme').onclick = () => { H.dataset.theme = H.dataset.theme === 'dark' ? 'light' : 'dark'; };
$('#dir').onclick = () => {
  const toLtr = H.dir === 'rtl';
  H.dir = toLtr ? 'ltr' : 'rtl'; H.lang = toLtr ? 'en' : 'ar';
  $$('[data-ar]').forEach(e => { if (e.dataset.en === undefined) e.dataset.en = e.textContent; e.textContent = toLtr ? e.dataset.en : e.dataset.ar; });
};
$('.proj > button').onclick = e => { const p = e.currentTarget.parentElement; p.classList.toggle('open'); e.currentTarget.setAttribute('aria-expanded', p.classList.contains('open')); };
$$('.chip').forEach(c => c.onclick = () => c.setAttribute('aria-pressed', c.getAttribute('aria-pressed') !== 'true'));
$$('.lane').forEach(l => l.onclick = () => l.setAttribute('aria-expanded', l.getAttribute('aria-expanded') === 'false'));
const P = $('#panel'), S = $('#scrim');
const open = () => { P.classList.add('on'); S.classList.add('on'); $('.x', P).focus(); };
const close = () => { P.classList.remove('on'); S.classList.remove('on'); };
$$('.card:not(.dec), tr.r').forEach(c => c.onclick = open);
$('.x', P).onclick = close; S.onclick = close;
addEventListener('keydown', e => { if (e.key === 'Escape') { close(); $('.proj').classList.remove('open'); } });
$$('.opt').forEach(o => o.onclick = () => { const c = o.closest('.dcard'); c.classList.add('done'); $('.res b', c).textContent = o.dataset.pick; });
