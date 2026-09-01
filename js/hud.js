/* ===========================================================================
 * hud.js - BarManager.cs ve PlayPanelSystem.cs'in birebir karsiliklari.
 * ======================================================================== */

/* ------------------------------------------------------------- BarManager */
class BarManager {
  constructor(cfg) {
    this.cfg = cfg;
    this.current = 0;
    this.best = 0;
    this.levelIndex = -1;
    this.bestLevelIndex = -1;

    const gc = UI.canvasByName('GameCanvas');
    this.barNode = gc && gc.findById(cfg.barGo);
    this.miktar = gc && gc.findById(cfg.miktarGo);
    this.bestMiktar = gc && gc.findById(cfg.bestMiktarGo);

    // Image Type: Filled / Horizontal / Left
    if (this.miktar) this.miktar.setFilled(0);
    if (this.bestMiktar) this.bestMiktar.setFilled(0);
  }

  lateUpdate() {
    const r = this.progress();
    if (r === null) {
      this.syncBest(-1);
      this.levelIndex = -1;
      this.setFill(0);
      this.setBestFill(0);
      return;
    }

    this.syncBest(this.levelIndex);

    let target = r;
    if (this.cfg.geriGitmesin && target < this.current && target > 0.001) target = this.current;

    if (this.cfg.yumusatmaHizi <= 0) this.current = target;
    else if (target < this.current - 0.05) this.current = target;
    else {
      const step = this.cfg.yumusatmaHizi * Unity.Time.deltaTime;
      this.current += Math.sign(target - this.current) * Math.min(Math.abs(target - this.current), step);
    }
    this.setFill(this.current);

    if (target > this.best) {
      this.best = target;
      if (this.cfg.bestKaydet) {
        const k = this.bestKey(this.levelIndex);
        if (k) PlayerPrefs.SetFloat(k, this.best);
      }
    }
    this.setBestFill(this.best);
  }

  // Ilerleme = (oyuncu.x - spawn.x) / (finish.x - spawn.x)
  progress() {
    const gm = GameManager.Instance, p = PlayerController.Instance;
    if (!gm || !p) return null;

    this.levelIndex = this.findLevelIndex(p.renderX, p.renderY);
    if (this.levelIndex < 0) return null;

    const lvl = gm.levels[this.levelIndex];
    if (!lvl.finishGo) return null;
    const fin = World.collidersByGo.get(lvl.finishGo);
    if (!fin) return null;

    const span = fin.cx - lvl.spawn[0];
    if (Math.abs(span) < 0.0001) return null;
    return Unity.Mathf.clamp01((p.renderX - lvl.spawn[0]) / span);
  }

  // Once spawn noktasina tam oturma, sonra dikey mesafeye gore en yakin bolum
  findLevelIndex(px, py) {
    const gm = GameManager.Instance;
    const snap = this.cfg.spawnYakinlik * this.cfg.spawnYakinlik;
    for (let i = 0; i < gm.levels.length; i++) {
      const s = gm.levels[i].spawn;
      const dx = px - s[0], dy = py - s[1];
      if (dx * dx + dy * dy <= snap) return i;
    }
    let best = -1, bd = this.cfg.bolumYDeviasyonu;
    for (let i = 0; i < gm.levels.length; i++) {
      const d = Math.abs(py - gm.levels[i].spawn[1]);
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }

  syncBest(index) {
    if (index === this.bestLevelIndex) return;
    this.bestLevelIndex = index;
    this.best = 0;
    if (index < 0 || !this.cfg.bestKaydet) return;
    const k = this.bestKey(index);
    if (k) this.best = Unity.Mathf.clamp01(PlayerPrefs.GetFloat(k, 0));
  }

  bestKey(index) {
    const gm = GameManager.Instance;
    if (!gm || index < 0 || index >= gm.levels.length) return null;
    let n = (gm.levels[index].name || '').trim();
    if (!n) n = 'Level' + index;
    return this.cfg.kayitAnahtarOneki + n;
  }

  setFill(v) { if (this.miktar) this.miktar.setFilled(Unity.Mathf.clamp01(v)); }
  setBestFill(v) { if (this.bestMiktar) this.bestMiktar.setFilled(Unity.Mathf.clamp01(v)); }
}

/* -------------------------------------------------------- PlayPanelSystem */
class PlayPanelSystem {
  constructor(cfg) {
    this.cfg = cfg;
    this.shownId = -1;
    this.activeId = -1;
    this.prevState = PlayerState.Idle;

    const mm = UI.canvasByName('MainMenuCanvas');
    this.mm = mm;
    this.panel = mm.find(cfg.panelName);
    this.closeBtn = mm.find(cfg.closeName);
    this.playBtn = mm.find(cfg.playName);
    this.tName = mm.find(cfg.levelNameText);
    this.tBest = mm.find(cfg.bestScoreText);
    this.tDied = mm.find(cfg.diedText);
    this.tFin = mm.find(cfg.finishedText);
    this.badge = mm.find(cfg.badgeImage);

    if (this.panel) this.panel.setActive(false);
    if (this.closeBtn) UI.onClick(this.closeBtn.data.btn.cid, () => this.close());
    if (this.playBtn) UI.onClick(this.playBtn.data.btn.cid, () => this.playPressed());
  }

  // GameManager'in butonlara ekledigi "bas -> hemen gir" dinleyicisini devralir
  hookLevelButtons() {
    const gm = GameManager.Instance;
    const done = new Set();
    for (const cell of this.cfg.levels) {
      const lvl = gm.levels.find((l) => l.id === cell.id);
      if (!lvl || !lvl.buttonCid) continue;
      if (done.has(lvl.buttonCid)) continue;
      done.add(lvl.buttonCid);

      UI.clickHandlers.set(lvl.buttonCid, [() => this.levelButtonPressed(cell.id)]);
    }
  }

  levelButtonPressed(id) {
    const acik = this.panel && this.panel.activeSelf;
    if (acik && this.shownId === id) { this.enter(id); return; }
    this.open(id);
  }

  open(id) {
    const gm = GameManager.Instance;
    const lvl = gm.levels.find((l) => l.id === id);
    if (!lvl) return;

    this.shownId = id;
    if (this.panel) {
      this.panel.setActive(true);
      this.panel.el.parentNode.appendChild(this.panel.el);   // SetAsLastSibling
    }
    if (this.playBtn) this.playBtn.setInteractable(lvl.IsUnlocked);

    this.applyPanelColor(this.cfg.levels.find((c) => c.id === id));
    this.refresh();
  }

  close() {
    this.shownId = -1;
    if (this.panel) this.panel.setActive(false);
  }

  playPressed() { if (this.shownId >= 0) this.enter(this.shownId); }

  enter(id) {
    const gm = GameManager.Instance;
    const lvl = gm.levels.find((l) => l.id === id);
    if (!gm || !lvl || !lvl.IsUnlocked) return;
    this.activeId = id;
    if (this.cfg.giristeKapat) this.close(); else this.shownId = id;
    gm.enterLevel(lvl);
  }

  // Tek panelin KENDI rengini o bolume gore degistirir
  applyPanelColor(cell) {
    if (!this.cfg.panelRenginiUygula || !cell || !this.panel) return;
    if (cell.color[3] <= 0) return;
    this.panel.setGraphicColor(cell.color);
  }

  refresh() {
    if (this.shownId < 0) return;
    const gm = GameManager.Instance;
    const lvl = gm.levels.find((l) => l.id === this.shownId);
    if (!lvl) return;

    const cell = this.cfg.levels.find((c) => c.id === this.shownId);
    const ad = (cell && cell.name) ? cell.name : (lvl.name || '').trim();

    let n = (lvl.name || '').trim();
    if (!n) n = 'Level' + this.shownId;
    const best = PlayerPrefs.GetFloat(this.cfg.bestKayitOneki + n, 0) * 100;
    const bestStr = this.cfg.yuzdeBasamak <= 0
      ? String(Math.floor(Unity.Mathf.clamp(best, 0, 100)))
      : Unity.Mathf.clamp(best, 0, 100).toFixed(this.cfg.yuzdeBasamak);

    const win = PlayerPrefs.GetInt(this.cfg.bitirmeKayitOneki + this.shownId, 0);
    const died = PlayerPrefs.GetInt(this.cfg.olumKayitOneki + this.shownId, 0);

    this.write(this.tName, this.cfg.levelNameBicimi, ad);
    this.write(this.tBest, this.cfg.bestScoreBicimi, bestStr);
    this.write(this.tDied, this.cfg.diedCoundBicimi, String(died));
    this.write(this.tFin, this.cfg.finishedTimesBicimi, String(win));

    this.applyBadge(win);
  }

  write(node, fmt, val) {
    if (!node || !node.txtEl) return;
    node.txtEl.textContent = fmt ? fmt.replace('{0}', val) : val;
  }

  applyBadge(win) {
    if (!this.badge) return;
    const b = this.cfg.badges, e = this.cfg.esik;
    let g = null;
    if (win >= e.e10 && b['10']) g = b['10'];
    else if (win >= e.e5 && b['5']) g = b['5'];
    else if (win >= e.e2 && b['2']) g = b['2'];
    else if (win >= e.e1 && b['1']) g = b['1'];
    else g = b['0'];

    if (!g) { if (this.cfg.spriteYoksaGizle) this.badge.setImageVisible(false); return; }
    this.badge.setImageVisible(true);
    this.badge.setSprite(g);
  }

  // Olum : Playing -> Idle, GameCanvas ACIK
  // Bitis: Playing -> Idle, GameCanvas ayni karede KAPALI
  lateUpdate() {
    const p = PlayerController.Instance;
    if (!p) return;
    const now = p.CurrentState;
    const canvasOpen = !document.getElementById('GameCanvas').classList.contains('inactive');

    if (this.activeId >= 0 && this.prevState === PlayerState.Playing && now === PlayerState.Idle) {
      if (canvasOpen) {
        this.bump(this.cfg.olumKayitOneki + this.activeId);
      } else {
        this.bump(this.cfg.bitirmeKayitOneki + this.activeId);
        this.activeId = -1;
      }
      if (this.shownId >= 0) this.refresh();
    } else if (this.prevState === PlayerState.Paused && now === PlayerState.Idle) {
      this.activeId = -1;
    }
    this.prevState = now;
  }

  bump(key) { PlayerPrefs.SetInt(key, PlayerPrefs.GetInt(key, 0) + 1); PlayerPrefs.Save(); }
}
