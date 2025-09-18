let colleagues = [];
const API_BASE = (window.APP_CONFIG && window.APP_CONFIG.API_BASE) || '';

const grid = document.getElementById('cardsGrid');
const searchInput = document.getElementById('searchInput');
const cardTpl = document.getElementById('cardTemplate');

function renderCards(list) {
  grid.innerHTML = '';
  list.forEach(person => {
    const node = cardTpl.content.cloneNode(true);
    const card = node.querySelector('.card');
    const img = node.querySelector('.avatar');
    img.src = person.avatar || 'assets/avatars/default.svg';
    img.onerror = () => { img.src = 'assets/avatars/default.svg'; };
    node.querySelector('.name').textContent = person.name;
    node.querySelector('.position').textContent = person.position || '';
    node.querySelector('.dept').textContent = person.department || '';
    // Телефон не показываем, если в данных явно указано '-'
    const phoneEl = node.querySelector('.phone');
    if ((person.phone || '').trim() === '-') {
      phoneEl.closest('.contact')?.remove();
    } else {
      phoneEl.textContent = person.phone || '';
    }
    node.querySelector('.email').textContent = person.email || '';
    node.querySelector('.address').textContent = person.address || '';

  function open() { window.location.href = `card.html?id=${encodeURIComponent(person.id)}`; }
    card.addEventListener('click', open);
    card.addEventListener('keypress', (e) => { if (e.key === 'Enter') open(); });

    grid.appendChild(node);
  });
}

function normalize(s) { return (s || '').toString().toLowerCase().trim(); }

function filterCards() {
  const q = normalize(searchInput.value);
  if (!q) return renderCards(colleagues);
  const filtered = colleagues.filter(p =>
    normalize(p.name).includes(q) ||
    normalize(p.position).includes(q) ||
    normalize(p.department).includes(q) ||
    normalize(p.email).includes(q) ||
    normalize(p.phone).includes(q)
  );
  renderCards(filtered);
}

searchInput.addEventListener('input', filterCards);

// Загрузка данных: при наличии API_BASE берём с Render, иначе локальный JSON
const listUrl = API_BASE ? `${API_BASE.replace(/\/$/, '')}/api/colleagues` : 'assets/colleagues.json';
fetch(listUrl)
  .then(r => r.json())
  .then(data => {
    // Применяем overrides из localStorage ко всем записям
    try {
      const raw = localStorage.getItem('overrides');
      if (raw) {
        const overrides = JSON.parse(raw);
        data = data.map(p => overrides[p.id] ? { ...p, ...overrides[p.id] } : p);
      }
    } catch(e) { /* ignore */ }
    colleagues = data;
    renderCards(colleagues);
  })
  .catch(err => { console.error('Не удалось загрузить данные коллег:', err); });
