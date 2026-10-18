document.querySelectorAll('[data-year]').forEach((node) => { node.textContent = new Date().getFullYear(); });
const orb = document.querySelector('.visual-orb');
if (orb) document.querySelector('.hero-visual')?.addEventListener('pointermove', (event) => {
  const box = event.currentTarget.getBoundingClientRect();
  const x = (event.clientX - box.left) / box.width - .5;
  const y = (event.clientY - box.top) / box.height - .5;
  orb.style.marginLeft = `${x * 18}px`;
  orb.style.marginTop = `${y * 18}px`;
});
