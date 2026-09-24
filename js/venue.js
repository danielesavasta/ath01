// Venue settings and the setup screen (press K).
//
// Settings come from content/venue.js; anything changed on the setup screen is kept in this browser
// (localStorage) and wins over the file until "Back to the file" is pressed. "Save file" downloads a
// venue.js with the current settings, to put in content/.
//
//   VENUE.get()                 current settings
//   VENUE.onChange(fn)          fn(settings) after every change
//   VENUE.statueBandNdc()       left and right edge of the statue mask, -1..1 across the frame
//
// Loaded as a plain script before js/scripts.js, which reads the camera and detection settings.

(function () {
    const KEY = 'ath.venue.v1';
    const FRAME_W = 1920, FRAME_H = 1080;
    const DEFAULTS = {
        statueImage: true,
        mask: { on: false, points: [[905, 150], [830, 380], [848, 520], [719, 600], [701, 1080], [1226, 1080], [1238, 920],
                                    [1200, 700], [1138, 580], [1008, 540], [1063, 420], [1048, 260], [990, 150]] },
        camera: { zoom: 1, cx: 0.5, cy: 0.5 },
        detect: { confidence: 0.6, upOnly: 70 }
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

    // ───────────── on the page: statue photo and mask ─────────────
    const SVGNS = 'http://www.w3.org/2000/svg';
    let maskSvg = null, maskPoly = null;
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
            maskPoly = document.createElementNS(SVGNS, 'polygon');
            maskSvg.appendChild(maskPoly);
            document.body.appendChild(maskSvg);
        }
        maskPoly.setAttribute('points', S.mask.points.map((p) => p.join(',')).join(' '));
        maskSvg.style.display = S.mask.on ? '' : 'none';
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
    let ui = null, tab = 'mask';
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
          <svg class="vs-edit" viewBox="0 0 ${FRAME_W} ${FRAME_H}" preserveAspectRatio="none"><polygon class="vs-poly"></polygon><g class="vs-handles"></g></svg>
          <div class="vs-panel">
            <div class="vs-head"><b>KURULUM</b><span>K ile kapat</span></div>
            <div class="vs-tabs"><button data-tab="mask">Heykel maskesi</button><button data-tab="camera">Kamera</button></div>
            <div class="vs-body" data-for="mask">
              <label><input type="checkbox" data-k="maskOn"> Maske açık: heykelin üstü siyah, oraya hiçbir şey yansımaz</label>
              <label><input type="checkbox" data-k="statueImage"> Heykel fotoğrafı görünsün (sadece çalışırken)</label>
              <p>Noktaları sürükle. Kenarın üstüne çift tıkla: yeni nokta. Noktaya sağ tıkla: sil.</p>
              <button data-act="statueShape">Fotoğraftaki heykelin şekline dön</button>
            </div>
            <div class="vs-body" data-for="camera">
              <p>Kameranın gördüğü, çerçeve de ekrana gelen alan. Ziyaretçilerin ellerinin gezindiği bölgeyi kapsasın; ne kadar dar olursa uzaktaki eller o kadar iyi bulunur. Sürükle: taşı. Tekerlek: yakınlaştır.</p>
              <label class="vs-slider">Yakınlaştırma <output data-o="zoom"></output><input type="range" min="1" max="3" step="0.05" data-k="zoom"></label>
              <label class="vs-slider">Algılama eşiği <output data-o="confidence"></output><input type="range" min="0.3" max="0.9" step="0.05" data-k="confidence"></label>
              <label class="vs-slider">Yukarı bakan el: dikeyden en fazla <output data-o="upOnly"></output><input type="range" min="20" max="180" step="5" data-k="upOnly"></label>
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
            const k = inp.dataset.k, v = inp.type === 'checkbox' ? inp.checked : parseFloat(inp.value);
            if (k === 'maskOn') S.mask.on = v;
            else if (k === 'statueImage') S.statueImage = v;
            else if (k === 'zoom') { S.camera.zoom = v; clampCamera(); }
            else S.detect[k] = v;
            changed(); refresh();
        }));
        ui.querySelector('[data-act="statueShape"]').addEventListener('click', () => { S.mask.points = clone(DEFAULTS.mask.points); changed(); refresh(); });
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
        set('zoom', S.camera.zoom); set('confidence', S.detect.confidence); set('upOnly', S.detect.upOnly);
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
        svg.querySelector('.vs-poly').setAttribute('points', S.mask.points.map((p) => p.join(',')).join(' '));
        g.innerHTML = '';
        S.mask.points.forEach((p, i) => {
            const c = document.createElementNS(SVGNS, 'circle');
            c.setAttribute('cx', p[0]); c.setAttribute('cy', p[1]); c.setAttribute('r', 14);
            c.dataset.i = i;
            g.appendChild(c);
        });
    }
    function wireMaskEditing() {
        const svg = ui.querySelector('.vs-edit');
        svg.addEventListener('pointerdown', (e) => {
            if (tab !== 'mask' || e.button !== 0 || e.target.tagName !== 'circle') return;
            dragging = +e.target.dataset.i;
            svg.setPointerCapture(e.pointerId);
        });
        svg.addEventListener('pointermove', (e) => {
            if (dragging < 0) return;
            const [x, y] = toFrame(e);
            S.mask.points[dragging] = [Math.max(-50, Math.min(FRAME_W + 50, x)), Math.max(-50, Math.min(FRAME_H + 50, y))];
            changed(false); drawMaskEditor();
        });
        svg.addEventListener('pointerup', () => { if (dragging >= 0) { dragging = -1; changed(); } });
        svg.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            if (tab !== 'mask' || e.target.tagName !== 'circle' || S.mask.points.length <= 3) return;
            S.mask.points.splice(+e.target.dataset.i, 1);
            changed(); drawMaskEditor();
        });
        svg.addEventListener('dblclick', (e) => {
            if (tab !== 'mask') return;
            const q = toFrame(e), P = S.mask.points;
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

    // camera: the (mirrored) camera image with the chosen area; drag to move, wheel to zoom
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
    // mirrored camera image; the returned cx, cy are the same after keeping the area inside the image.
    window.VENUE.cameraCrop = function (camW, camH) {
        const c = S.camera;
        const baseW = Math.min(camW, camH * 16 / 9);
        const w = baseW / Math.max(1, c.zoom), h = w * 9 / 16;
        const mx = Math.max(w / 2, Math.min(camW - w / 2, c.cx * camW));   // centre, mirrored image
        const my = Math.max(h / 2, Math.min(camH - h / 2, c.cy * camH));
        const x = (camW - mx) - w / 2, y = my - h / 2;                      // raw (unmirrored) top left
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
        // fit the whole camera image on screen, mirrored like the installation
        const s = Math.min(innerWidth * 0.94 / cam.w, (innerHeight - 40) * 0.94 / cam.h);
        const W = cam.w * s, H = cam.h * s, ox = (innerWidth - W) / 2, oy = 20;
        g.save(); g.translate(ox + W, oy); g.scale(-1, 1);
        try { g.drawImage(cam.el, 0, 0, W, H); } catch (e) { /* frame not ready */ }
        g.restore();
        const crop = window.VENUE.cameraCrop(cam.w, cam.h);
        camView = { w: W, h: H };
        const rx = ox + (cam.w - crop.x - crop.w) * s, ry = oy + crop.y * s;
        g.fillStyle = 'rgba(0,0,0,.55)';
        g.fillRect(ox, oy, W, ry - oy); g.fillRect(ox, ry + crop.h * s, W, oy + H - ry - crop.h * s);
        g.fillRect(ox, ry, rx - ox, crop.h * s); g.fillRect(rx + crop.w * s, ry, ox + W - rx - crop.w * s, crop.h * s);
        g.strokeStyle = '#F0B429'; g.lineWidth = 2; g.strokeRect(rx, ry, crop.w * s, crop.h * s);
        live.textContent = `Kamera ${cam.w}×${cam.h} · el bulucuya giden alan ${crop.w}×${crop.h} piksel · şu an ${lastHands} el`;
    }

    function saveFile() {
        const pts = S.mask.points.map((p) => `[${p[0]}, ${p[1]}]`).join(', ');
        const text = `// Settings for one room. Saved from the setup screen (K) on ${new Date().toLocaleString('tr-TR')}.
// See the comments in the original content/venue.js for what each value means.

window.VENUE_FILE = {
  statueImage: ${S.statueImage},
  mask: {
    on: ${S.mask.on},
    points: [${pts}]
  },
  camera: { zoom: ${+S.camera.zoom.toFixed(3)}, cx: ${+S.camera.cx.toFixed(4)}, cy: ${+S.camera.cy.toFixed(4)} },
  detect: { confidence: ${S.detect.confidence}, upOnly: ${S.detect.upOnly} }
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
