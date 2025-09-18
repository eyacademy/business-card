function $(id){ return document.getElementById(id); }

function getParam(name){
  const url = new URL(window.location.href);
  return url.searchParams.get(name);
}

function ensureQRCode(){
  return new Promise((resolve, reject) => {
    if (window.QRCode) return resolve();
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/qrcodejs/qrcode.min.js';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Не удалось загрузить библиотеку QR'));
    document.head.appendChild(script);
  });
}

// Quoted-Printable для UTF-8 (минимальная реализация)
function qpEncodeUTF8(str){
  const utf8 = new TextEncoder().encode(str || '');
  let out = '';
  for (const b of utf8) {
    if (
      (b >= 33 && b <= 60) || // ! .. <
      (b >= 62 && b <= 126)   // > .. ~
    ) {
      if (b === 61) { // '=' -> =3D
        out += '=3D';
      } else {
        out += String.fromCharCode(b);
      }
    } else if (b === 9 || b === 32) { // таб/пробел допустимы внутри строки
      out += String.fromCharCode(b);
    } else {
      out += '=' + b.toString(16).toUpperCase().padStart(2, '0');
    }
  }
  return out;
}

function toVCard(p, { forOutlook = false } = {}) {
  const fullName = p.name || '';
  const parts = fullName.trim().split(/\s+/);
  const lastName = parts[1] ? parts[1] : parts[0];
  const firstName = parts[1] ? parts[0] : '';
  const org = p.company || '';
  const title = p.position || '';
  const tel = (p.phone || '').replace(/[()\s-]/g, '');
  const email = p.email || '';
  const url = p.website || '';
  const adr = p.address || '';

  const esc = (s) => (s || '').toString().replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g,'\\,').replace(/;/g,'\\;');

  const EOL = '\r\n';

  if (forOutlook) {
    // Используем Quoted-Printable + CHARSET=UTF-8, CRLF, без BOM — лучше открывается в Outlook
    const Nqp = [qpEncodeUTF8(lastName), qpEncodeUTF8(firstName), '', '', ''].join(';');
    const ADRqp = ['','', qpEncodeUTF8(adr), '', '', '', ''].join(';');
    const lines = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      `N;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:${Nqp}`,
      `FN;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:${qpEncodeUTF8(fullName)}`,
      org ? `ORG;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:${qpEncodeUTF8(org)}` : null,
      title ? `TITLE;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:${qpEncodeUTF8(title)}` : null,
      tel ? `TEL;TYPE=CELL:${tel}` : null,
      email ? `EMAIL;TYPE=INTERNET:${email}` : null,
      url ? `URL:${url}` : null,
      adr ? `ADR;TYPE=WORK;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:${ADRqp}` : null,
      'END:VCARD'
    ].filter(Boolean);
    return lines.join(EOL) + EOL;
  }

  // Вариант для QR: читаемость большинством сканеров, UTF-8, экранирование спецсимволов
  const lines = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `N;CHARSET=UTF-8:${esc(lastName) || ''};${esc(firstName) || ''};;;`,
    `FN;CHARSET=UTF-8:${esc(fullName)}`,
    org ? `ORG;CHARSET=UTF-8:${esc(org)}` : null,
    title ? `TITLE;CHARSET=UTF-8:${esc(title)}` : null,
    tel ? `TEL;TYPE=CELL:${tel}` : null,
    email ? `EMAIL;TYPE=INTERNET:${email}` : null,
    url ? `URL:${url}` : null,
    adr ? `ADR;TYPE=WORK;CHARSET=UTF-8:;;${esc(adr)};;;;` : null,
    'END:VCARD'
  ].filter(Boolean);
  return lines.join(EOL) + EOL;
}

function fill(p){
  const img = $('avatar');
  img.src = p.avatar || 'assets/avatars/default.svg';
  img.onerror = () => { img.src = 'assets/avatars/default.svg'; };
  $('name').textContent = p.name || '';
  $('position').textContent = p.position || '';
  $('department').textContent = p.department || '';
  $('company').textContent = p.company || '';
  $('phone').textContent = p.phone || '';
  // Если phone == '-' — скрываем блок телефона
  try {
    const phoneVal = (p.phone || '').trim();
    const phoneRow = document.querySelector('#phone')?.closest('.contact');
    if (phoneVal === '-' && phoneRow) phoneRow.style.display = 'none';
  } catch(e) { /* ignore */ }
  $('email').textContent = p.email || '';
  $('address').textContent = p.address || '';
  $('website').textContent = p.website || '';
  $('website').href = p.website || '#';
}

function init(){
  const id = getParam('id');
  if(!id){
    document.body.innerHTML = '<main class="container"><p>Не указан id визитки.</p><p><a href="index.html">Вернуться к списку</a></p></main>';
    return;
  }
  const API_BASE = (window.APP_CONFIG && window.APP_CONFIG.API_BASE) || '';
  const LOGO_URL = (window.APP_CONFIG && window.APP_CONFIG.LOGO_URL) || 'assets/brand/EY_Logo_Beam_RGB-OffBlack-Yellow.png';

  const getPerson = () => {
    if (API_BASE) {
      const url = `${API_BASE.replace(/\/$/, '')}/api/colleagues/${encodeURIComponent(id)}`;
      return fetch(url).then(r => {
        if (!r.ok) throw new Error('not ok');
        return r.json();
      });
    }
    return fetch('assets/colleagues.json').then(r => r.json()).then(list => list.find(p => p.id === id));
  };

  getPerson()
    .then(person => {
      if(!person){
        document.body.innerHTML = '<main class="container"><p>Визитка не найдена.</p><p><a href="index.html">Вернуться к списку</a></p></main>';
        return;
      }
      // Применяем локальные правки из localStorage (если есть)
      try {
        const raw = localStorage.getItem('overrides');
        if (raw) {
          const overrides = JSON.parse(raw);
          const ov = overrides[id];
          if (ov && typeof ov === 'object') Object.assign(person, ov);
        }
      } catch(e) { /* ignore */ }
      fill(person);
  const vcf = toVCard(person); // для QR

      // Загружаем lib QR динамически; если не удалось — не падаем, оставляем кнопку скачивания
      ensureQRCode()
        .then(() => {
          // Рисуем QR с высокой коррекцией ошибок (H), чтобы часть кода могла перекрываться логотипом
          const qrContainer = document.getElementById('qrcode');
          qrContainer.innerHTML = '';
          const size = 220;
          const qr = new QRCode(qrContainer, {
            text: vcf,
            width: size,
            height: size,
            colorDark : getComputedStyle(document.documentElement).getPropertyValue('--qr-dark').trim() || '#2E2E38',
            colorLight : getComputedStyle(document.documentElement).getPropertyValue('--qr-light').trim() || '#ffffff',
            correctLevel : QRCode.CorrectLevel.H
          });

          // После генерации находим canvas или img, и рисуем логотип по центру
          setTimeout(() => {
            const canvas = qrContainer.querySelector('canvas');
            const imgTag = qrContainer.querySelector('img');
            const logoSrc = LOGO_URL;
            const fallbackSrc = 'assets/brand/ey_logo_placeholder.svg';

            const drawLogo = (canvasEl, logoImg) => {
              if (!canvasEl) return;
              const ctx = canvasEl.getContext('2d');
              const s = canvasEl.width; // предполагаем квадратный QR
              const cssRatio = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--qr-logo-ratio'));
              const ratio = isNaN(cssRatio) ? 0.22 : Math.min(Math.max(cssRatio, 0.12), 0.3); // зажимаем 12%..30%
              const logoSize = Math.floor(s * ratio); // размер логотипа
              const pad = Math.floor(logoSize * 0.18); // белая подложка отступом
              const x = Math.floor((s - logoSize) / 2);
              const y = Math.floor((s - logoSize) / 2);

              // Белая подложка с лёгким скруглением, чтобы матрицы не сливались
              const bgX = x - pad;
              const bgY = y - pad;
              const bgW = logoSize + pad * 2;
              const bgH = logoSize + pad * 2;
              const r = Math.floor(pad * 0.6);
              ctx.fillStyle = '#ffffff';
              ctx.beginPath();
              ctx.moveTo(bgX + r, bgY);
              ctx.lineTo(bgX + bgW - r, bgY);
              ctx.quadraticCurveTo(bgX + bgW, bgY, bgX + bgW, bgY + r);
              ctx.lineTo(bgX + bgW, bgY + bgH - r);
              ctx.quadraticCurveTo(bgX + bgW, bgY + bgH, bgX + bgW - r, bgY + bgH);
              ctx.lineTo(bgX + r, bgY + bgH);
              ctx.quadraticCurveTo(bgX, bgY + bgH, bgX, bgY + bgH - r);
              ctx.lineTo(bgX, bgY + r);
              ctx.quadraticCurveTo(bgX, bgY, bgX + r, bgY);
              ctx.closePath();
              ctx.fill();

              // Рисуем переданную картинку поверх подложки
              if (logoImg && logoImg.complete) {
                try { ctx.drawImage(logoImg, x, y, logoSize, logoSize); } catch(e) { /* ignore */ }
              }
            };

            // Предзагружаем логотип; при ошибке — плейсхолдер
            const preload = (src) => new Promise((res) => {
              const i = new Image();
              i.onload = () => res(i);
              i.onerror = () => res(null);
              i.src = src;
            });

            preload(logoSrc).then((img) => {
              if (!img) {
                return preload(fallbackSrc);
              }
              return img;
            }).then((img) => {
              // DOM-оверлей: всегда вставляем поверх QR контейнера, не зависим от canvas/img
              const s = size;
              const cssRatio = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--qr-logo-ratio'));
              const ratio = isNaN(cssRatio) ? 0.22 : Math.min(Math.max(cssRatio, 0.12), 0.3);
              const logoSize = Math.floor(s * ratio);
              const pad = Math.floor(logoSize * 0.18);
              const bg = document.createElement('div');
              bg.className = 'qr-logo-bg';
              bg.style.width = `${logoSize + pad * 2}px`;
              bg.style.height = `${logoSize + pad * 2}px`;
              const overlay = document.createElement('img');
              overlay.className = 'qr-logo-overlay';
              overlay.src = img ? img.src : fallbackSrc;
              overlay.alt = 'EY logo';
              overlay.style.width = `${logoSize}px`;
              overlay.style.height = `${logoSize}px`;
              qrContainer.appendChild(bg);
              qrContainer.appendChild(overlay);

              // Экспорт PNG: объединяем QR + подложка + логотип
              const exportBtn = document.getElementById('downloadPng');
              const exportTransparentBtn = document.getElementById('downloadPngTransparent');
              const doExport = () => {
                // Получаем исходный QR как картинку
                const makeCanvasFrom = (el, cb) => {
                  if (el && el.tagName === 'CANVAS') {
                    cb(el);
                  } else if (el && el.tagName === 'IMG') {
                    const c = document.createElement('canvas');
                    c.width = el.naturalWidth || size;
                    c.height = el.naturalHeight || size;
                    const ctx = c.getContext('2d');
                    ctx.drawImage(el, 0, 0);
                    cb(c);
                  } else {
                    // Если внутри таблица (редко), отрендерим повторно QR в скрытый canvas
                    const c = document.createElement('canvas');
                    c.width = size; c.height = size;
                    const tmp = new QRCode(document.createElement('div'), { text: vcf, width: size, height: size, colorDark: getComputedStyle(document.documentElement).getPropertyValue('--qr-dark').trim() || '#2E2E38', colorLight: getComputedStyle(document.documentElement).getPropertyValue('--qr-light').trim() || '#ffffff', correctLevel: QRCode.CorrectLevel.H });
                    setTimeout(() => {
                      const timg = tmp._el.querySelector('img');
                      if (timg) {
                        const ctx2 = c.getContext('2d');
                        const i2 = new Image();
                        i2.onload = () => { ctx2.drawImage(i2, 0, 0); cb(c); };
                        i2.src = timg.src;
                      } else {
                        cb(null);
                      }
                    }, 0);
                  }
                };

                makeCanvasFrom(canvas || imgTag, (qrCanv) => {
                  if (!qrCanv) return;

                  // Создаём итоговый canvas чуть больше, чтобы уместить фирменную рамку
                  const cssPad = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--qr-padding')) || 10;
                  const cssBorder = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--qr-border-width')) || 2;
                  const padOuter = cssPad + cssBorder + 4; // общий внешний отступ близкий к DOM
                  const out = document.createElement('canvas');
                  out.width = qrCanv.width + padOuter * 2;
                  out.height = qrCanv.height + padOuter * 2;
                  const ctx = out.getContext('2d');

                  // Жёлтая рамка (бренд)
                  ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#FFE600';
                  ctx.lineWidth = Math.max(cssBorder, 1);
                  const radius = 16;
                  const drawRoundRect = (x,y,w,h,r) => {
                    ctx.beginPath();
                    ctx.moveTo(x+r, y);
                    ctx.lineTo(x+w-r, y);
                    ctx.quadraticCurveTo(x+w, y, x+w, y+r);
                    ctx.lineTo(x+w, y+h-r);
                    ctx.quadraticCurveTo(x+w, y+h, x+w-r, y+h);
                    ctx.lineTo(x+r, y+h);
                    ctx.quadraticCurveTo(x, y+h, x, y+h-r);
                    ctx.lineTo(x, y+r);
                    ctx.quadraticCurveTo(x, y, x+r, y);
                    ctx.closePath();
                  };
                  drawRoundRect(6, 6, out.width-12, out.height-12, radius);
                  ctx.stroke();

                  // Вставляем QR
                  ctx.drawImage(qrCanv, padOuter, padOuter);

                  // Рисуем белую подложку и логотип поверх QR (как на странице)
                  const cssRatio = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--qr-logo-ratio'));
                  const ratio = isNaN(cssRatio) ? 0.22 : Math.min(Math.max(cssRatio, 0.12), 0.3);
                  const logoSize = Math.floor(qrCanv.width * ratio);
                  const pad = Math.floor(logoSize * 0.18);
                  const x = padOuter + Math.floor((qrCanv.width - logoSize)/2);
                  const y = padOuter + Math.floor((qrCanv.height - logoSize)/2);

                  // Белая подложка
                  ctx.fillStyle = '#ffffff';
                  drawRoundRect(x - pad, y - pad, logoSize + pad*2, logoSize + pad*2, Math.floor(pad*0.6));
                  ctx.fill();

                  // Сам логотип
                  const src = (img && img.src) ? img.src : fallbackSrc;
                  const logoImg = new Image();
                  logoImg.onload = () => {
                    ctx.drawImage(logoImg, x, y, logoSize, logoSize);
                    // Скачиваем PNG
                    const link = document.createElement('a');
                    link.download = `${(person.name || 'qr').replace(/\s+/g,'_')}.png`;
                    link.href = out.toDataURL('image/png');
                    document.body.appendChild(link);
                    link.click();
                    link.remove();
                  };
                  logoImg.onerror = () => {
                    const link = document.createElement('a');
                    link.download = `${(person.name || 'qr').replace(/\s+/g,'_')}.png`;
                    link.href = out.toDataURL('image/png');
                    document.body.appendChild(link);
                    link.click();
                    link.remove();
                  };
                  logoImg.src = src;
                });
              };

              if (exportBtn) exportBtn.onclick = doExport;

              // Прозрачный экспорт: без белого фона и без жёлтой рамки
              const doExportTransparent = () => {
                const makeCanvasFrom = (el, cb) => {
                  if (el && el.tagName === 'CANVAS') {
                    cb(el);
                  } else if (el && el.tagName === 'IMG') {
                    const c = document.createElement('canvas');
                    c.width = el.naturalWidth || size;
                    c.height = el.naturalHeight || size;
                    const ctx = c.getContext('2d');
                    ctx.drawImage(el, 0, 0);
                    cb(c);
                  } else {
                    const c = document.createElement('canvas');
                    c.width = size; c.height = size;
                    const tmp = new QRCode(document.createElement('div'), { text: vcf, width: size, height: size, colorDark: getComputedStyle(document.documentElement).getPropertyValue('--qr-dark').trim() || '#2E2E38', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.H });
                    setTimeout(() => {
                      const timg = tmp._el.querySelector('img');
                      if (timg) {
                        const ctx2 = c.getContext('2d');
                        const i2 = new Image();
                        i2.onload = () => { ctx2.drawImage(i2, 0, 0); cb(c); };
                        i2.src = timg.src;
                      } else { cb(null); }
                    }, 0);
                  }
                };

                makeCanvasFrom(canvas || imgTag, (qrCanv) => {
                  if (!qrCanv) return;

                  // Делаем композицию "карточка": фон, тень, рамка, QR, подписи
                  const scale = 2; // ретина-качество
                  const qrSize = qrCanv.width; // 220
                  const padding = Math.round(qrSize * 0.18); // внешний отступ
                  const captionH = Math.round(qrSize * 0.42); // зона под текст
                  const outW = (qrSize + padding * 2) * scale;
                  const outH = (qrSize + padding * 2 + captionH) * scale;
                  const out = document.createElement('canvas');
                  out.width = outW;
                  out.height = outH;
                  const ctx = out.getContext('2d');

                  // Фон карточки с лёгким градиентом
                  const bgGrad = ctx.createLinearGradient(0, 0, 0, outH);
                  bgGrad.addColorStop(0, '#FFFFFF');
                  bgGrad.addColorStop(1, '#F7F9FC');
                  ctx.fillStyle = bgGrad;
                  ctx.fillRect(0, 0, outW, outH);

                  // Мягкая тень вокруг карточки
                  ctx.save();
                  ctx.shadowColor = 'rgba(0,0,0,0.14)';
                  ctx.shadowBlur = Math.round(24 * scale/2);
                  ctx.shadowOffsetY = Math.round(10 * scale/2);
                  ctx.fillStyle = '#FFFFFF';
                  const cardRadius = Math.round(20 * scale/2);
                  const cardInset = Math.round(8 * scale/2);
                  const drawRound = (x,y,w,h,r) => {
                    ctx.beginPath();
                    ctx.moveTo(x+r, y);
                    ctx.lineTo(x+w-r, y);
                    ctx.quadraticCurveTo(x+w, y, x+w, y+r);
                    ctx.lineTo(x+w, y+h-r);
                    ctx.quadraticCurveTo(x+w, y+h, x+w-r, y+h);
                    ctx.lineTo(x+r, y+h);
                    ctx.quadraticCurveTo(x, y+h, x, y+h-r);
                    ctx.lineTo(x, y+r);
                    ctx.quadraticCurveTo(x, y, x+r, y);
                    ctx.closePath();
                  };
                  drawRound(cardInset, cardInset, outW - cardInset*2, outH - cardInset*2, cardRadius);
                  ctx.fill();
                  ctx.restore();

                  // Параметры области QR
                  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#FFE600';
                  const frame = Math.round(4 * scale/2);
                  const qrBox = {
                    x: Math.round(padding * scale),
                    y: Math.round(padding * scale),
                    w: Math.round(qrSize * scale),
                    h: Math.round(qrSize * scale)
                  };
                  // Персональный стиль: для id=Kamilya убираем жёлтую рамку
                  const isEYAcademyVariant = (person && person.id === 'Kamilya');
                  if (!isEYAcademyVariant) {
                    ctx.strokeStyle = accent; ctx.lineWidth = frame;
                    drawRound(qrBox.x - frame, qrBox.y - frame, qrBox.w + frame*2, qrBox.h + frame*2, Math.round(16 * scale/2));
                    ctx.stroke();
                  }

                  // Сам QR
                  ctx.imageSmoothingEnabled = false; // резкие края модулей
                  ctx.drawImage(qrCanv, qrBox.x, qrBox.y, qrBox.w, qrBox.h);

                  // Логотип: белая капсула и PNG сверху
                  const cssRatio = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--qr-logo-ratio'));
                  const ratio = isNaN(cssRatio) ? 0.22 : Math.min(Math.max(cssRatio, 0.12), 0.3);
                  const logoSize = Math.floor(qrBox.w * ratio);
                  const pad = Math.floor(logoSize * 0.18);
                  const x = qrBox.x + Math.floor((qrBox.w - logoSize)/2);
                  const y = qrBox.y + Math.floor((qrBox.h - logoSize)/2);

                  const drawRoundRect = (x,y,w,h,r, ctx2) => {
                    ctx2.beginPath();
                    ctx2.moveTo(x+r, y);
                    ctx2.lineTo(x+w-r, y);
                    ctx2.quadraticCurveTo(x+w, y, x+w, y+r);
                    ctx2.lineTo(x+w, y+h-r);
                    ctx2.quadraticCurveTo(x+w, y+h, x+w-r, y+h);
                    ctx2.lineTo(x+r, y+h);
                    ctx2.quadraticCurveTo(x, y+h, x, y+h-r);
                    ctx2.lineTo(x, y+r);
                    ctx2.quadraticCurveTo(x, y, x+r, y);
                    ctx2.closePath();
                  };

                  // Белая подложка под логотип
                  ctx.fillStyle = '#ffffff';
                  drawRoundRect(x - pad, y - pad, logoSize + pad*2, logoSize + pad*2, Math.floor(pad*0.6), ctx);
                  ctx.fill();

                  const src = (img && img.src) ? img.src : fallbackSrc;
                  const logoImg = new Image();
                  logoImg.onload = () => {
                    ctx.drawImage(logoImg, x, y, logoSize, logoSize);

                    // Подписи под QR
                    const baseName = person.name || '';
                    const name = isEYAcademyVariant ? `${baseName}, FCCA` : baseName;
                    const title = person.position || '';
                    ctx.textAlign = 'center';
                    const textX = Math.round(outW/2);
                    let textY = qrBox.y + qrBox.h + Math.round(22*scale);

                    if (isEYAcademyVariant) {
                      // Для Kamilya: сначала ФИО, затем "EY Academy of Business", должность не пишем
                      ctx.fillStyle = '#111827';
                      ctx.font = `${Math.round(18*scale)}px EYInterstate, Inter, Arial`;
                      ctx.fillText(name, textX, textY);
                      textY += Math.round(22*scale);

                      ctx.fillStyle = '#374151';
                      ctx.font = `${Math.round(16*scale)}px EYInterstate, Inter, Arial`;
                      ctx.fillText('EY Academy of Business', textX, textY);
                    } else {
                      // По умолчанию: имя, затем должность
                      ctx.fillStyle = '#111827';
                      ctx.font = `${Math.round(18*scale)}px EYInterstate, Inter, Arial`;
                      ctx.fillText(name, textX, textY);
                      ctx.fillStyle = '#4B5563';
                      ctx.font = `${Math.round(14*scale)}px EYInterstate, Inter, Arial`;
                      textY += Math.round(22*scale);
                      ctx.fillText(title, textX, textY);
                    }

                    // Скачиваем PNG
                    const link = document.createElement('a');
                    link.download = `${(person.name || 'qr').replace(/\s+/g,'_')}.png`;
                    link.href = out.toDataURL('image/png');
                    document.body.appendChild(link);
                    link.click();
                    link.remove();
                  };
                  logoImg.onerror = () => {
                    // Если лого не загрузилось — всё равно рисуем подписи
                    const baseName = person.name || '';
                    const name = isEYAcademyVariant ? `${baseName}, FCCA` : baseName;
                    const title = person.position || '';
                    ctx.textAlign = 'center';
                    const textX = Math.round(outW/2);
                    let textY = qrBox.y + qrBox.h + Math.round(22*scale);
                    if (isEYAcademyVariant) {
                      // Для Kamilya: сначала ФИО, затем "EY Academy of Business", должность не пишем
                      ctx.fillStyle = '#111827';
                      ctx.font = `${Math.round(18*scale)}px EYInterstate, Inter, Arial`;
                      ctx.fillText(name, textX, textY);
                      textY += Math.round(22*scale);

                      ctx.fillStyle = '#374151';
                      ctx.font = `${Math.round(16*scale)}px EYInterstate, Inter, Arial`;
                      ctx.fillText('EY Academy of Business', textX, textY);
                    } else {
                      ctx.fillStyle = '#111827';
                      ctx.font = `${Math.round(18*scale)}px EYInterstate, Inter, Arial`;
                      ctx.fillText(name, textX, textY);
                      ctx.fillStyle = '#4B5563';
                      ctx.font = `${Math.round(14*scale)}px EYInterstate, Inter, Arial`;
                      textY += Math.round(22*scale);
                      ctx.fillText(title, textX, textY);
                    }

                    const link = document.createElement('a');
                    link.download = `${(person.name || 'qr').replace(/\s+/g,'_')}.png`;
                    link.href = out.toDataURL('image/png');
                    document.body.appendChild(link);
                    link.click();
                    link.remove();
                  };
                  logoImg.src = src;
                });
              };

              if (exportTransparentBtn) exportTransparentBtn.onclick = doExportTransparent;
            });
          }, 0);
        })
        .catch(() => {
          const hint = document.querySelector('.qr-hint');
          if (hint) hint.textContent = 'Не удалось загрузить QR. Используйте кнопку ниже, чтобы скачать визитку.';
        });

      document.getElementById('downloadVcf').onclick = () => {
        // Генерируем вариант, совместимый с Outlook (Quoted-Printable, CRLF, без BOM)
        const vcfOutlook = toVCard(person, { forOutlook: true });
        const blob = new Blob([vcfOutlook], { type: 'text/vcard;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${(person.name || 'contact').replace(/\s+/g,'_')}.vcf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      };

      // Редактирование визитки на сайте (сохранение в localStorage)
      try {
        const editBtn = document.getElementById('editBtn');
        const section = document.getElementById('editFormSection');
        const f = {
          name: document.getElementById('f_name'),
          position: document.getElementById('f_position'),
          department: document.getElementById('f_department'),
          phone: document.getElementById('f_phone'),
          email: document.getElementById('f_email'),
          address: document.getElementById('f_address'),
          company: document.getElementById('f_company'),
          website: document.getElementById('f_website'),
          avatar: document.getElementById('f_avatar')
        };

        const openForm = () => {
          section.style.display = 'block';
          f.name.value = person.name || '';
          f.position.value = person.position || '';
          f.department.value = person.department || '';
          f.phone.value = person.phone || '';
          f.email.value = person.email || '';
          f.address.value = person.address || '';
          f.company.value = person.company || '';
          f.website.value = person.website || '';
          f.avatar.value = person.avatar || '';
        };
        const closeForm = () => { section.style.display = 'none'; };
        if (editBtn) editBtn.onclick = openForm;

        const saveBtn = document.getElementById('saveBtn');
        const cancelBtn = document.getElementById('cancelBtn');
        const resetBtn = document.getElementById('resetBtn');

        const applyAndPersist = (ov) => {
          // Применяем в UI
          Object.assign(person, ov);
          fill(person);
          // Сохраняем в localStorage
          try {
            const raw = localStorage.getItem('overrides');
            const all = raw ? JSON.parse(raw) : {};
            all[id] = ov;
            localStorage.setItem('overrides', JSON.stringify(all));
          } catch(e) { /* ignore */ }
        };

        if (saveBtn) saveBtn.onclick = () => {
          const ov = {
            name: f.name.value.trim(),
            position: f.position.value.trim(),
            department: f.department.value.trim(),
            phone: f.phone.value.trim(),
            email: f.email.value.trim(),
            address: f.address.value.trim(),
            company: f.company.value.trim(),
            website: f.website.value.trim(),
            avatar: f.avatar.value.trim()
          };
          applyAndPersist(ov);
          closeForm();
        };
        if (cancelBtn) cancelBtn.onclick = closeForm;
        if (resetBtn) resetBtn.onclick = () => {
          try {
            const raw = localStorage.getItem('overrides');
            const all = raw ? JSON.parse(raw) : {};
            delete all[id];
            localStorage.setItem('overrides', JSON.stringify(all));
          } catch(e) { /* ignore */ }
          // Перечитываем исходные данные без оверрайда
          window.location.reload();
        };
      } catch(e) { /* ignore */ }
    })
    .catch(err => {
      console.error(err);
      document.body.innerHTML = '<main class="container"><p>Ошибка загрузки данных.</p></main>';
    });
}

document.addEventListener('DOMContentLoaded', init);
