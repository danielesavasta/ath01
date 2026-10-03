// Venue settings and the setup screen (press K).
//
// Settings come from content/venue.js; anything changed on the setup screen is kept in this browser
// (localStorage) and wins over the file until "Back to the file" is pressed. "Save file" downloads a
// venue.js with the current settings, to put in content/.
//
//   VENUE.get()                 current settings
//   VENUE.onChange(fn)          fn(settings) after every change
//   VENUE.statueBandNdc()       left and right edge of the statue mask, -1..1 across the frame
//   VENUE.get().parts           the cloth parts the Craft section lights: [{ id, points }], frame px
//
// Loaded as a plain script before js/scripts.js, which reads the camera and detection settings.
// Settings for one room. Saved from the setup screen (K) on 03.10.2026 16:06:45.
// See the comments in the original content/venue.js for what each value means.

window.VENUE_FILE = {
  statueImage: false,
  mask: {
    on: false,
    points: [[995, 83], [995, 121], [998, 159], [988, 189], [988, 221], [983, 264], [937, 282], [899, 307], [901, 340], [899, 368], [900, 391], [903, 418], [912, 440], [911, 463], [912, 487], [911, 510], [912, 533], [911, 554], [911, 576], [909, 656], [905, 630], [903, 598], [911, 682], [912, 707], [912, 729], [915, 749], [921, 764], [929, 784], [930, 814], [938, 846], [943, 880], [931, 927], [916, 959], [907, 990], [899, 1037], [920, 1068], [962, 1066], [1001, 1079], [1056, 1066], [1092, 1053], [1121, 1020], [1142, 986], [1146, 940], [1148, 890], [1154, 842], [1165, 807], [1174, 754], [1175, 695], [1178, 646], [1183, 609], [1185, 575], [1180, 536], [1194, 507], [1195, 474], [1186, 423], [1182, 378], [1173, 352], [1161, 315], [1121, 277], [1071, 264], [1023, 255], [1044, 235], [1076, 219], [1092, 191], [1091, 119], [1083, 81], [1051, 51], [1022, 55]],
    light: { on: true, color: '#ffffff', level: 1, soft: 8, slope: 0.3 }
  },
  camera: { zoom: 1.85, cx: 0.5269, cy: 0.4422 },
  detect: { confidence: 0.9, upOnly: 70,
            depth: { near: 500, far: 4000, reach: 180, margin: 120, push: 120 } },
  parts: [
    { id: 'chiton', points: [[755, 620], [815, 615], [840, 690], [875, 770], [890, 840], [930, 880], [970, 910], [940, 940], [850, 1000], [760, 1030], [740, 840], [735, 700]] },
    { id: 'aegis', points: [[1062, 332], [1089, 333], [1112, 323], [1126, 388], [1121, 431], [1113, 468], [1099, 494], [1090, 484], [1072, 484], [1058, 465], [1041, 452], [1031, 432], [1012, 426], [1007, 404], [980, 391], [997, 372], [973, 365], [971, 325], [990, 299], [1014, 313], [1037, 323]] },
    { id: 'himation', points: [[1040, 580], [1110, 580], [1150, 640], [1175, 740], [1195, 840], [1200, 910], [1150, 920], [1100, 960], [1060, 940], [1045, 860], [1055, 700]] },
    { id: 'roll', points: [[760, 1045], [890, 975], [1000, 915], [1040, 910], [1070, 940], [1060, 980], [970, 1030], [870, 1075], [765, 1080]] }
  ]
};

(function () {
    const KEY = 'ath.venue.v1';
    const FRAME_W = 1920, FRAME_H = 1080;
    const DEFAULTS = {
        statueImage: true,
        mask: { on: false, points: [[995, 83], [995, 121], [998, 159], [988, 189], [988, 221], [983, 264], [937, 282], [899, 307], [901, 340], [899, 368], [900, 391], [903, 418], [912, 440], [911, 463], [912, 487], [911, 510], [912, 533], [911, 554], [911, 576], [909, 656], [905, 630], [903, 598], [911, 682], [912, 707], [912, 729], [915, 749], [921, 764], [929, 784], [930, 814], [938, 846], [943, 880], [931, 927], [916, 959], [907, 990], [899, 1037], [920, 1068], [962, 1066], [1001, 1079], [1056, 1066], [1092, 1053], [1121, 1020], [1142, 986], [1146, 940], [1148, 890], [1154, 842], [1165, 807], [1174, 754], [1175, 695], [1178, 646], [1183, 609], [1185, 575], [1180, 536], [1194, 507], [1195, 474], [1186, 423], [1182, 378], [1173, 352], [1161, 315], [1121, 277], [1071, 264], [1023, 255], [1044, 235], [1076, 219], [1092, 191], [1091, 119], [1083, 81], [1051, 51], [1022, 55]],
                light: { on: false, color: '#fff1dc', level: 0.55, soft: 12, slope: 0.3 } },
        camera: { zoom: 1, cx: 0.5, cy: 0.5, kinectMirror: true },
        detect: { confidence: 0.6, upOnly: 70,
                  depth: { near: 500, far: 4000, reach: 180, margin: 120, push: 120 } },
        // cloth parts lit by the Craft section (js/craft/), drawn on the statue photo; redraw them at the venue (K)
        parts: [
            { id: 'chiton',   points: [[755, 620], [815, 615], [840, 690], [875, 770], [890, 840], [930, 880], [970, 910], [940, 940], [850, 1000], [760, 1030], [740, 840], [735, 700]] },
            { id: 'aegis',    points: [[815, 615], [900, 580], [1040, 580], [1055, 700], [1045, 860], [1025, 905], [970, 905], [930, 880], [890, 840], [875, 770], [840, 690]] },
            { id: 'himation', points: [[1040, 580], [1110, 580], [1150, 640], [1175, 740], [1195, 840], [1200, 910], [1150, 920], [1100, 960], [1060, 940], [1045, 860], [1055, 700]] },
            { id: 'roll',     points: [[760, 1045], [890, 975], [1000, 915], [1040, 910], [1070, 940], [1060, 980], [970, 1030], [870, 1075], [765, 1080]] }
        ]
    };
    const clone = (o) => JSON.parse(JSON.stringify(o));
    // objects merge key by key; arrays and values replace
    function merge(a, b) {
        if (b === undefined || b === null) return clone(a);
        if (typeof a !== 'object' || Array.isArray(a) || typeof b !== 'object' || Array.isArray(b)) return clone(b);
        const out = clone(a);
        for (const k of Object.keys(b)) out[k] = merge(a[k], b[k]);
        return out;
    }
    const fromFile = () => merge(DEFAULTS, window.VENUE_FILE || {});
    let stored = null;
    try { stored = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { stored = null; }
    let S = merge(fromFile(), stored || {});

    const listeners = [];
    function changed(persist = true) {
        if (persist) { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* private window: live only */ } }
        applyToPage();
        for (const f of listeners) { try { f(S); } catch (e) { console.error(e); } }
    }

    // ───────────── on the page: statue photo, mask and the light on the statue ─────────────
    // The mask is a black shape (nothing is projected onto the statue). With the light on, the same shape
    // is also filled with light, so the projector lights the statue: a colour, a brightness, a softened
    // edge and optionally brighter at the top or the bottom.
    const SVGNS = 'http://www.w3.org/2000/svg';
    let maskSvg = null, maskPoly = null, lightPoly = null;
    function frameRect() {
        const u = Math.min(innerWidth / FRAME_W, innerHeight / FRAME_H);
        return { x: (innerWidth - FRAME_W * u) / 2, y: (innerHeight - FRAME_H * u) / 2, u };
    }
    function applyToPage() {
        const statue = document.getElementById('athenaStatue');
        if (statue) statue.style.display = S.statueImage ? '' : 'none';
        if (!maskSvg) {
            maskSvg = document.createElementNS(SVGNS, 'svg');
            maskSvg.id = 'venueMask';
            maskSvg.setAttribute('viewBox', `0 0 ${FRAME_W} ${FRAME_H}`);
            maskSvg.setAttribute('preserveAspectRatio', 'none');
            maskSvg.innerHTML = `<defs>
                <linearGradient id="vmLight" x1="0" y1="0" x2="0" y2="1"><stop offset="0"/><stop offset="1"/></linearGradient>
                <filter id="vmSoft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="0"/></filter>
              </defs><polygon class="vm-base"/><polygon class="vm-light" fill="url(#vmLight)" filter="url(#vmSoft)"/>`;
            maskPoly = maskSvg.querySelector('.vm-base');
            lightPoly = maskSvg.querySelector('.vm-light');
            document.body.appendChild(maskSvg);
        }
        const pts = S.mask.points.map((p) => p.join(',')).join(' ');
        maskPoly.setAttribute('points', pts);
        lightPoly.setAttribute('points', pts);
        const L = S.mask.light;
        const top = L.level * (L.slope >= 0 ? 1 : 1 + L.slope), bottom = L.level * (L.slope >= 0 ? 1 - L.slope : 1);
        const stops = maskSvg.querySelectorAll('#vmLight stop');
        stops[0].setAttribute('stop-color', L.color); stops[0].setAttribute('stop-opacity', top.toFixed(3));
        stops[1].setAttribute('stop-color', L.color); stops[1].setAttribute('stop-opacity', bottom.toFixed(3));
        maskSvg.querySelector('#vmSoft feGaussianBlur').setAttribute('stdDeviation', (L.soft / 2).toFixed(1));
        lightPoly.style.display = L.on ? '' : 'none';
        maskSvg.style.display = S.mask.on || L.on ? '' : 'none';
    }

    window.VENUE = {
        get: () => S,
        onChange(fn) { listeners.push(fn); },
        statueBandNdc() {
            const xs = S.mask.points.map((p) => p[0]);
            if (!xs.length) return null;
            return [Math.min(...xs) / FRAME_W * 2 - 1, Math.max(...xs) / FRAME_W * 2 - 1];
        },
        set(fn) { fn(S); changed(); }
    };

    // ───────────── setup screen ─────────────
    let ui = null, tab = 'mask', part = 0;
    // the outline being edited: the mask, or one cloth part
    const editPoints = () => tab === 'parts' ? (S.parts[part] || S.parts[0]).points : S.mask.points;
    function el(tag, attrs = {}, html = '') {
        const e = document.createElement(tag);
        for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
        if (html) e.innerHTML = html;
        return e;
    }
    function buildUi() {
        ui = el('div', { id: 'venueSetup' });
        ui.innerHTML = `
          <canvas class="vs-cam"></canvas>
          <svg class="vs-edit" viewBox="0 0 ${FRAME_W} ${FRAME_H}" preserveAspectRatio="none"><g class="vs-others"></g><polygon class="vs-poly"></polygon><g class="vs-handles"></g></svg>
          <div class="vs-panel">
            <div class="vs-head"><b>KURULUM</b><span>K ile kapat</span></div>
            <div class="vs-tabs"><button data-tab="mask">Heykel maskesi</button><button data-tab="parts">Kumaş parçaları</button><button data-tab="camera">Kamera</button></div>
            <div class="vs-body" data-for="mask">
              <label><input type="checkbox" data-k="maskOn"> Maske açık: heykelin üstü siyah, oraya hiçbir şey yansımaz</label>
              <label><input type="checkbox" data-k="lightOn"> Heykeli projektörle aydınlat (maskenin içi ışık olur)</label>
              <div class="vs-light">
                <label class="vs-color">Işığın rengi <input type="color" data-k="lightColor"></label>
                <label class="vs-slider">Parlaklık <output data-o="level"></output><input type="range" min="0.05" max="1" step="0.01" data-k="level"></label>
                <label class="vs-slider">Kenar yumuşaklığı <output data-o="soft"></output><input type="range" min="0" max="120" step="2" data-k="soft"></label>
                <label class="vs-slider">Yön <output data-o="slope"></output><input type="range" min="-1" max="1" step="0.05" data-k="slope"></label>
              </div>
              <label><input type="checkbox" data-k="statueImage"> Heykel fotoğrafı görünsün (sadece çalışırken)</label>
              <p>Noktaları sürükle. Kenarın üstüne çift tıkla: yeni nokta. Noktaya sağ tıkla: sil.</p>
              <button data-act="statueShape">Fotoğraftaki heykelin şekline dön</button>
            </div>
            <div class="vs-body" data-for="parts">
              <p>Zanaat bölümünde aydınlanan parçalar. Birini seç, noktalarını heykelin üstündeki kıvrımlara oturt. Maskeyle aynı: sürükle, kenara çift tıkla, noktaya sağ tıkla.</p>
              <div class="vs-parts"></div>
              <button data-act="partShape">Bu parçayı fotoğraftaki şekline döndür</button>
            </div>
            <div class="vs-body" data-for="camera">
              <p>Kameranın gördüğü, çerçeve de ekrana gelen alan. Ziyaretçilerin ellerinin gezindiği bölgeyi kapsasın; ne kadar dar olursa uzaktaki eller o kadar iyi bulunur. Sürükle: taşı. Tekerlek: yakınlaştır.</p>
              <label><input type="checkbox" data-k="kinectMirror"> Kinect görüntüsünü yatay çevir</label>
              <label class="vs-slider">Yakınlaştırma <output data-o="zoom"></output><input type="range" min="1" max="3" step="0.05" data-k="zoom"></label>
              <label class="vs-slider">Algılama eşiği <output data-o="confidence"></output><input type="range" min="0.3" max="0.9" step="0.05" data-k="confidence"></label>
              <label class="vs-slider">Yukarı bakan el: dikeyden en fazla <output data-o="upOnly"></output><input type="range" min="20" max="180" step="5" data-k="upOnly"></label>
              <div class="vs-depth">
                <p><b>Derinlik (Kinect)</b>: eller karanlıkta da bulunur. Kinect duvarda, ziyaretçilere bakar; bir el,
                  sahibinin gövdesinden belli bir mesafe öne (duvara doğru) uzanınca el sayılır. Oda kendini öğrenir;
                  eşyalar yer değiştirdiyse ya da tuhaf eller çıkıyorsa buradan baştan öğret.</p>
                <button data-act="learn">Odayı baştan öğren (5 sn sonra)</button>
                <p class="vs-depth-status"></p>
                <label class="vs-slider">Gövdeden öne uzanma <output data-o="reach"></output><input type="range" min="80" max="500" step="10" data-k="reach"></label>
                <label class="vs-slider">En uzak <output data-o="far"></output><input type="range" min="1500" max="6000" step="100" data-k="far"></label>
                <label class="vs-slider">Tutmak için öne itme <output data-o="push"></output><input type="range" min="50" max="300" step="10" data-k="push"></label>
              </div>
              <p class="vs-live"></p>
            </div>
            <div class="vs-foot">
              <button data-act="save">Dosyaya kaydet (venue.js)</button>
              <button data-act="revert">Dosyadaki ayarlara dön</button>
            </div>
            <p class="vs-note"></p>
          </div>`;
        ui.hidden = true;
        document.body.appendChild(ui);
        // the page below must not react to the mouse while setting up
        for (const t of ['pointerdown', 'pointermove', 'pointerup', 'wheel', 'click', 'dblclick', 'contextmenu'])
            ui.addEventListener(t, (e) => e.stopPropagation());
        ui.querySelectorAll('.vs-tabs button').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.tab; refresh(); }));
        ui.querySelectorAll('input').forEach((inp) => inp.addEventListener('input', () => {
            const k = inp.dataset.k, v = inp.type === 'checkbox' ? inp.checked : inp.type === 'color' ? inp.value : parseFloat(inp.value);
            if (k === 'maskOn') S.mask.on = v;
            else if (k === 'lightOn') S.mask.light.on = v;
            else if (k === 'lightColor') S.mask.light.color = v;
            else if (k === 'level' || k === 'soft' || k === 'slope') S.mask.light[k] = v;
            else if (k === 'statueImage') S.statueImage = v;
            else if (k === 'zoom') { S.camera.zoom = v; clampCamera(); }
            else if (k === 'kinectMirror') S.camera.kinectMirror = v;
            else if (k === 'reach' || k === 'far' || k === 'push') S.detect.depth[k] = v;
            else S.detect[k] = v;
            changed(); refresh();
        }));
        ui.querySelector('[data-act="statueShape"]').addEventListener('click', () => { S.mask.points = clone(DEFAULTS.mask.points); changed(); refresh(); });
        ui.querySelector('[data-act="partShape"]').addEventListener('click', () => {
            const id = S.parts[part] && S.parts[part].id, d = DEFAULTS.parts.find((p) => p.id === id);
            if (d) { S.parts[part].points = clone(d.points); changed(); refresh(); }
        });
        ui.querySelector('[data-act="learn"]').addEventListener('click', () => {
            if (!window.athDepth) { note('Kinect derinliği bağlı değil (tools/kinect/bridge.py çalışıyor mu?).'); return; }
            let n = 5;
            const tick = () => {
                if (n > 0) { note(`Kinect'in önünden çekil: ${n}`); n--; setTimeout(tick, 1000); return; }
                window.athDepth.learn(); note('Oda öğreniliyor...');
            };
            tick();
        });
        ui.querySelector('[data-act="save"]').addEventListener('click', saveFile);
        ui.querySelector('[data-act="revert"]').addEventListener('click', () => {
            try { localStorage.removeItem(KEY); } catch (e) { /* nothing kept */ }
            S = fromFile(); changed(false); refresh();
            note('content/venue.js dosyasındaki ayarlara dönüldü.');
        });
        wireMaskEditing();
        wireCameraEditing();
        window.addEventListener('ath:hands', (e) => { lastHands = e.detail.hands.length; });
    }
    let lastHands = 0;
    function note(t) { ui.querySelector('.vs-note').textContent = t; }

    function refresh() {
        if (!ui) return;
        ui.dataset.tab = tab;
        ui.querySelectorAll('.vs-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
        ui.querySelectorAll('.vs-body').forEach((b) => { b.hidden = b.dataset.for !== tab; });
        const set = (k, v) => { const i = ui.querySelector(`input[data-k="${k}"]`); if (i.type === 'checkbox') i.checked = v; else i.value = v; };
        set('maskOn', S.mask.on); set('statueImage', S.statueImage);
        const L = S.mask.light;
        set('lightOn', L.on); set('lightColor', L.color); set('level', L.level); set('soft', L.soft); set('slope', L.slope);
        ui.querySelector('.vs-light').hidden = !L.on;
        ui.classList.toggle('lit', L.on);   // show the light itself while adjusting it: outline only
        ui.querySelector('[data-o="level"]').textContent = Math.round(L.level * 100) + '%';
        ui.querySelector('[data-o="soft"]').textContent = L.soft + ' px';
        ui.querySelector('[data-o="slope"]').textContent = Math.abs(L.slope) < 0.03 ? 'her yer eşit'
            : (L.slope > 0 ? 'üstten, alt %' : 'alttan, üst %') + Math.round((1 - Math.abs(L.slope)) * 100);
        const list = ui.querySelector('.vs-parts');
        list.innerHTML = '';
        S.parts.forEach((p, i) => {
            const b = el('button', {}, p.id);
            b.classList.toggle('on', i === part);
            b.addEventListener('click', () => { part = i; refresh(); });
            list.appendChild(b);
        });
        set('kinectMirror', S.camera.kinectMirror); set('zoom', S.camera.zoom); set('confidence', S.detect.confidence); set('upOnly', S.detect.upOnly);
        set('reach', S.detect.depth.reach); set('far', S.detect.depth.far); set('push', S.detect.depth.push);
        ui.querySelector('[data-o="reach"]').textContent = S.detect.depth.reach + ' mm';
        ui.querySelector('[data-o="far"]').textContent = (S.detect.depth.far / 1000).toFixed(1) + ' m';
        ui.querySelector('[data-o="push"]').textContent = S.detect.depth.push + ' mm';
        ui.querySelector('[data-o="zoom"]').textContent = S.camera.zoom.toFixed(2) + '×';
        ui.querySelector('[data-o="confidence"]').textContent = S.detect.confidence.toFixed(2);
        ui.querySelector('[data-o="upOnly"]').textContent = S.detect.upOnly >= 180 ? 'her yön' : S.detect.upOnly + '°';
        drawMaskEditor();
    }

    // mask: drag points, double-click an edge to add one, right-click a point to remove it
    const toFrame = (e) => { const r = frameRect(); return [Math.round((e.clientX - r.x) / r.u), Math.round((e.clientY - r.y) / r.u)]; };
    let dragging = -1;
    function drawMaskEditor() {
        const svg = ui.querySelector('.vs-edit'), g = svg.querySelector('.vs-handles');
        const r = frameRect();
        Object.assign(svg.style, { left: r.x + 'px', top: r.y + 'px', width: FRAME_W * r.u + 'px', height: FRAME_H * r.u + 'px' });
        const P = editPoints();
        svg.querySelector('.vs-poly').setAttribute('points', P.map((p) => p.join(',')).join(' '));
        // while editing a part, the others (and the mask) show as thin outlines
        svg.querySelector('.vs-others').innerHTML = tab !== 'parts' ? '' : [S.mask.points, ...S.parts.filter((p, i) => i !== part).map((p) => p.points)]
            .map((q) => `<polygon points="${q.map((p) => p.join(',')).join(' ')}"/>`).join('');
        g.innerHTML = '';
        P.forEach((p, i) => {
            const c = document.createElementNS(SVGNS, 'circle');
            c.setAttribute('cx', p[0]); c.setAttribute('cy', p[1]); c.setAttribute('r', 14);
            c.dataset.i = i;
            g.appendChild(c);
        });
    }
    function wireMaskEditing() {
        const svg = ui.querySelector('.vs-edit');
        svg.addEventListener('pointerdown', (e) => {
            if (tab === 'camera' || e.button !== 0 || e.target.tagName !== 'circle') return;
            dragging = +e.target.dataset.i;
            svg.setPointerCapture(e.pointerId);
        });
        svg.addEventListener('pointermove', (e) => {
            if (dragging < 0) return;
            const [x, y] = toFrame(e);
            editPoints()[dragging] = [Math.max(-50, Math.min(FRAME_W + 50, x)), Math.max(-50, Math.min(FRAME_H + 50, y))];
            changed(false); drawMaskEditor();
        });
        svg.addEventListener('pointerup', () => { if (dragging >= 0) { dragging = -1; changed(); } });
        svg.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            if (tab === 'camera' || e.target.tagName !== 'circle' || editPoints().length <= 3) return;
            editPoints().splice(+e.target.dataset.i, 1);
            changed(); drawMaskEditor();
        });
        svg.addEventListener('dblclick', (e) => {
            if (tab === 'camera') return;
            const q = toFrame(e), P = editPoints();
            let best = 0, bd = Infinity;
            for (let i = 0; i < P.length; i++) {
                const a = P[i], b = P[(i + 1) % P.length];
                const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy || 1;
                const t = Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / L));
                const d = Math.hypot(a[0] + t * dx - q[0], a[1] + t * dy - q[1]);
                if (d < bd) { bd = d; best = i; }
            }
            P.splice(best + 1, 0, q);
            changed(); drawMaskEditor();
        });
    }

    function cameraMirrored() {
        return ['kinect', 'depth', 'skeleton'].includes(window.athSource)
            ? S.camera.kinectMirror !== false : true;
    }
    // camera: the camera image with the chosen area; drag to move, wheel to zoom
    function clampCamera() {
        const c = S.camera;
        c.zoom = Math.max(1, Math.min(3, c.zoom));
        const cam = window.athCamera;
        if (cam && cam.w) {   // keep the area inside the camera image
            const k = window.VENUE.cameraCrop(cam.w, cam.h);
            c.cx = k.cx; c.cy = k.cy;
        }
    }
    let camView = null, camDrag = null;
    function wireCameraEditing() {
        const cv = ui.querySelector('.vs-cam');
        cv.addEventListener('pointerdown', (e) => {
            if (tab !== 'camera' || !camView) return;
            clampCamera();
            camDrag = { x: e.clientX, y: e.clientY, cx: S.camera.cx, cy: S.camera.cy };
            cv.setPointerCapture(e.pointerId);
        });
        cv.addEventListener('pointermove', (e) => {
            if (!camDrag) return;
            S.camera.cx = camDrag.cx + (e.clientX - camDrag.x) / camView.w;
            S.camera.cy = camDrag.cy + (e.clientY - camDrag.y) / camView.h;
            clampCamera(); changed(false);
        });
        cv.addEventListener('pointerup', () => { if (camDrag) { camDrag = null; changed(); refresh(); } });
        cv.addEventListener('wheel', (e) => {
            if (tab !== 'camera') return;
            e.preventDefault();
            S.camera.zoom *= Math.exp(-e.deltaY * 0.0015);
            clampCamera(); changed(); refresh();
        }, { passive: false });
    }
    // Camera area in raw camera pixels (js/scripts.js sends only this part to the hand detector):
    // a 16:9 rectangle, zoom 1 = as wide as the camera allows. cx, cy: its centre as fractions of the
    // displayed camera image; the returned cx, cy are the same after keeping the area inside the image.
    window.VENUE.cameraCrop = function (camW, camH) {
        const c = S.camera;
        const mirror = cameraMirrored();
        const baseW = Math.min(camW, camH * 16 / 9);
        const w = baseW / Math.max(1, c.zoom), h = w * 9 / 16;
        const mx = Math.max(w / 2, Math.min(camW - w / 2, c.cx * camW));   // centre in the displayed view
        const my = Math.max(h / 2, Math.min(camH - h / 2, c.cy * camH));
        const x = (mirror ? camW - mx : mx) - w / 2, y = my - h / 2;
        return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h), cx: mx / camW, cy: my / camH };
    };
    function drawCamera() {
        if (!ui || ui.hidden) return;
        requestAnimationFrame(drawCamera);
        const cv = ui.querySelector('.vs-cam');
        if (tab !== 'camera') { cv.style.display = 'none'; return; }
        cv.style.display = '';
        const dpr = devicePixelRatio || 1;
        if (cv.width !== innerWidth * dpr) { cv.width = innerWidth * dpr; cv.height = innerHeight * dpr; }
        const g = cv.getContext('2d');
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        g.fillStyle = '#111'; g.fillRect(0, 0, innerWidth, innerHeight);
        const cam = window.athCamera;
        const live = ui.querySelector('.vs-live');
        if (!cam || !cam.w) { live.textContent = 'Kamera görüntüsü yok.'; camView = null; return; }
        const mirror = cameraMirrored();
        // fit the whole camera image on screen in its active orientation
        const s = Math.min(innerWidth * 0.94 / cam.w, (innerHeight - 40) * 0.94 / cam.h);
        const W = cam.w * s, H = cam.h * s, ox = (innerWidth - W) / 2, oy = 20;
        g.save();
        if (mirror) { g.translate(ox + W, oy); g.scale(-1, 1); }
        else g.translate(ox, oy);
        try { g.drawImage(cam.el, 0, 0, W, H); } catch (e) { /* frame not ready */ }
        g.restore();
        const crop = window.VENUE.cameraCrop(cam.w, cam.h);
        camView = { w: W, h: H };
        const shownX = mirror ? cam.w - crop.x - crop.w : crop.x;
        const rx = ox + shownX * s, ry = oy + crop.y * s;
        g.fillStyle = 'rgba(0,0,0,.55)';
        g.fillRect(ox, oy, W, ry - oy); g.fillRect(ox, ry + crop.h * s, W, oy + H - ry - crop.h * s);
        g.fillRect(ox, ry, rx - ox, crop.h * s); g.fillRect(rx + crop.w * s, ry, ox + W - rx - crop.w * s, crop.h * s);
        g.strokeStyle = '#F04438'; g.lineWidth = 2; g.strokeRect(rx, ry, crop.w * s, crop.h * s);
        // hands found in depth, where the bridge sees them
        for (const p of cam.points || []) {
            g.beginPath(); g.arc(ox + (mirror ? 1 - p.x : p.x) * W, oy + p.y * H, 12, 0, Math.PI * 2);
            g.strokeStyle = '#3FA08C'; g.lineWidth = 3; g.stroke();
        }
        live.textContent = `Kamera ${cam.w}×${cam.h} · el bulucuya giden alan ${crop.w}×${crop.h} piksel · şu an ${lastHands} el`;
        const st = window.athDepth && window.athDepth.status;
        ui.querySelector('.vs-depth').hidden = !window.athDepth;
        if (st) ui.querySelector('.vs-depth-status').textContent = st.learning != null
            ? `Oda öğreniliyor: %${Math.round(st.learning * 100)}` : (st.bg ? 'Oda öğrenildi; kendini güncelliyor.' : 'Oda henüz öğrenilmedi.');
    }

    function saveFile() {
        const pts = S.mask.points.map((p) => `[${p[0]}, ${p[1]}]`).join(', ');
        const text = `// Settings for one room. Saved from the setup screen (K) on ${new Date().toLocaleString('tr-TR')}.
// See the comments in the original content/venue.js for what each value means.

window.VENUE_FILE = {
  statueImage: ${S.statueImage},
  mask: {
    on: ${S.mask.on},
    points: [${pts}],
    light: { on: ${S.mask.light.on}, color: '${S.mask.light.color}', level: ${S.mask.light.level}, soft: ${S.mask.light.soft}, slope: ${S.mask.light.slope} }
  },
    camera: { zoom: ${+S.camera.zoom.toFixed(3)}, cx: ${+S.camera.cx.toFixed(4)}, cy: ${+S.camera.cy.toFixed(4)}, kinectMirror: ${S.camera.kinectMirror} },
  detect: { confidence: ${S.detect.confidence}, upOnly: ${S.detect.upOnly},
            depth: { near: ${S.detect.depth.near}, far: ${S.detect.depth.far}, reach: ${S.detect.depth.reach}, margin: ${S.detect.depth.margin}, push: ${S.detect.depth.push} } },
  parts: [
${S.parts.map((p) => `    { id: '${p.id}', points: [${p.points.map((q) => `[${q[0]}, ${q[1]}]`).join(', ')}] }`).join(',\n')}
  ]
};
`;
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([text], { type: 'text/javascript' }));
        a.download = 'venue.js';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
        note('venue.js indirildi. content/ klasörüne koy (eskisinin yerine).');
    }

    function toggle() {
        if (!ui) buildUi();
        ui.hidden = !ui.hidden;
        document.body.classList.toggle('venue-setup', !ui.hidden);
        if (!ui.hidden) { note(stored ? 'Bu tarayıcıda kaydedilmiş ayarlar kullanılıyor.' : ''); refresh(); drawCamera(); }
    }
    window.addEventListener('keydown', (e) => {
        if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
        if (e.code === 'KeyK') toggle();
    });
    window.addEventListener('resize', () => { if (ui && !ui.hidden) drawMaskEditor(); });

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => changed(false));
    else changed(false);
})();








