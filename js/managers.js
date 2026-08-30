/* ===========================================================================
 * managers.js - ports of
 *   Assets/Scripts/GameManager.cs
 *   Assets/Scripts/MenuManager.cs
 *   Assets/Scripts/PanelManager.cs
 *   Assets/Scripts/LevelFinishZone.cs   (folded into the collider tagging)
 *   Assets/Scripts/FrameRateLimiter.cs  (see note at the bottom)
 * plus a small UnityEngine.Input / EventSystem stand-in.
 * ======================================================================== */

/* ------------------------------------------------------------------ Input */
const Input = (function () {
  'use strict';
  let downThisFrame = false;
  let downOverUI = false;

  function isOverUI(target) {
    return !!(target && target.closest && target.closest('.rt.raycast'));
  }

  function init(root) {
    const handler = (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      downThisFrame = true;
      downOverUI = isOverUI(e.target);
    };
    window.addEventListener('pointerdown', handler, true);
    // keyboard alternative (space / click) is not present in the Unity project,
    // so we deliberately do NOT add one.
  }

  return {
    init,
    getMouseButtonDown(b) { return b === 0 && downThisFrame; },
    isPointerOverUI() { return downOverUI; },
    endFrame() { downThisFrame = false; downOverUI = false; },
  };
})();

/* ------------------------------------------------------------ GameManager */
class GameManager {
  constructor() {
    GameManager.Instance = this;
    const C = window.G5_CONFIG;
    this.cfg = C;

    this.SaveKey = C.saveKey;                       // "GM_FinishedLevelIDs"
    this.finishedLevelIDs = new Set();
    this.currentLevel = null;
    this.activeCameraY = 0;

    this.CameraOffsetX = C.CameraOffsetX;           // 3
    this.LobbyCameraFixedY = C.LobbyCameraFixedY;   // 0
    this.lobby = C.lobby;                           // (-31.39, 12.14)

    this.LoadingScreenTimeForGameCanvas = C.LoadingScreenTimeForGameCanvas;
    this.LoadingScreenTransparencyTimeForGameCanvas = C.LoadingScreenTransparencyTimeForGameCanvas;
    this.LoadingScreenTimeForMainMenuCanvas = C.LoadingScreenTimeForMainMenuCanvas;
    this.LoadingScreenTransparencyTimeForMainMenuCanvas = C.LoadingScreenTransparencyTimeForMainMenuCanvas;

    this.levels = C.levels.map((l) => Object.assign({}, l, { IsUnlocked: false }));

    this.co = new Unity.CoroutineRunner();

    this.loadFinishedLevels();
    this.injectFinishZones();
  }

  // -- canvases / loading screens ----------------------------------------
  bindUI() {
    this.mainMenu = UI.canvasByName('MainMenuCanvas');
    this.gameCanvas = UI.canvasByName('GameCanvas');
    this.loadingGame = this.gameCanvas.find('LoadingScreen');
    this.loadingMenu = this.mainMenu.find('LoadingScreen');
  }

  // GameManager.InjectFinishZones - adds LevelFinishZone to LevelFinishObject
  injectFinishZones() {
    for (const lvl of this.levels) {
      if (!lvl.finishGo) continue;                 // Level10 has none (fileID 0)
      const col = World.collidersByGo.get(lvl.finishGo);
      if (col) col.finishId = lvl.finishId;
      else console.warn('finish collider missing for ' + lvl.name);
    }
  }

  setupLevelButtons() {
    for (const lvl of this.levels) {
      if (!lvl.buttonCid) continue;
      UI.onClick(lvl.buttonCid, () => { if (lvl.IsUnlocked) this.enterLevel(lvl); });
    }
  }

  refreshLevelButtons() {
    for (const lvl of this.levels) {
      lvl.IsUnlocked = this.isLevelUnlocked(lvl);
      const node = this.mainMenu.findByBtnCid(lvl.buttonCid);
      if (node) node.setInteractable(lvl.IsUnlocked);
      // EntryButtonUnlockedSprite / EntryButtonLockedSprite are BOTH "Daire"
      // in the scene, so the sprite swap is a visual no-op (only the Button
      // colour-tint changes).
    }
  }

  isLevelUnlocked(lvl) {
    if (!lvl.need || lvl.need.length === 0) return true;
    for (const id of lvl.need) {
      if (id === 0) continue;
      if (!this.finishedLevelIDs.has(id)) return false;
    }
    return true;
  }

  // -- save ---------------------------------------------------------------
  loadFinishedLevels() {
    this.finishedLevelIDs.clear();
    const saved = PlayerPrefs.GetString(this.SaveKey, '');
    if (!saved) return;
    for (const part of saved.split(',')) {
      const n = parseInt(part, 10);
      if (!isNaN(n) && /^-?\d+$/.test(part.trim())) this.finishedLevelIDs.add(n);
    }
  }
  saveFinishedLevels() {
    PlayerPrefs.SetString(this.SaveKey, Array.from(this.finishedLevelIDs).join(','));
    PlayerPrefs.Save();
  }

  // -- camera -------------------------------------------------------------
  lateUpdate() {
    const p = PlayerController.Instance;
    if (!p) return;
    Unity.Camera.x = p.renderX + this.CameraOffsetX;
    Unity.Camera.y = this.activeCameraY;
  }
  setCameraY(y) {
    this.activeCameraY = y;
    const p = PlayerController.Instance;
    if (p) { Unity.Camera.x = p.renderX + this.CameraOffsetX; Unity.Camera.y = y; }
  }

  // -- start --------------------------------------------------------------
  start() {
    this.setupLevelButtons();
    this.refreshLevelButtons();

    UI.setCanvasActive('GameCanvas', false);
    UI.setCanvasActive('MainMenuCanvas', true);

    this.hideInstant(this.loadingGame);
    this.hideInstant(this.loadingMenu);

    const p = PlayerController.Instance;
    if (p) {
      p.freezeAtLobby(this.lobby[0], this.lobby[1]);
      this.setCameraY(this.LobbyCameraFixedY);
    }
  }

  // -- level entry --------------------------------------------------------
  enterLevel(level) {
    if (!level) return;
    this.currentLevel = level;
    this.co.stopAll();
    const self = this;
    this.co.start(function* () {
      UI.setCanvasActive('MainMenuCanvas', false);
      UI.setCanvasActive('GameCanvas', true);
      yield* self.playLoadingScreen(
        self.loadingGame,
        self.LoadingScreenTimeForGameCanvas,
        self.LoadingScreenTransparencyTimeForGameCanvas,
        () => {
          const p = PlayerController.Instance;
          if (p) {
            p.setMoveSpeed(level.speed);
            p.resetForNewAttempt(level.spawn[0], level.spawn[1]);
          }
          self.setCameraY(level.camY);
          self.resetLevelObjects();
        });
      const p = PlayerController.Instance;
      if (p) p.beginWaitingForInput();
    }());
  }

  // -- death / respawn ----------------------------------------------------
  onPlayerDied() {
    if (!this.currentLevel) return;
    this.co.stopAll();
    const self = this;
    this.co.start(function* () {
      yield* self.playLoadingScreen(
        self.loadingGame,
        self.LoadingScreenTimeForGameCanvas,
        self.LoadingScreenTransparencyTimeForGameCanvas,
        () => {
          const p = PlayerController.Instance;
          if (p) {
            p.setMoveSpeed(self.currentLevel.speed);
            p.resetForNewAttempt(self.currentLevel.spawn[0], self.currentLevel.spawn[1]);
          }
          self.setCameraY(self.currentLevel.camY);
          self.resetLevelObjects();
        });
      const p = PlayerController.Instance;
      if (p) p.beginWaitingForInput();
    }());
  }

  // Bird.ResetBird is the only "reset on respawn" behaviour in the project.
  // (Bird exposes ResetBird() publicly for exactly this; nothing in the C#
  //  actually calls it, so we mirror that and leave the birds where they are.)
  resetLevelObjects() { /* intentionally empty - matches the C# */ }

  // -- finish -------------------------------------------------------------
  onLevelFinished(finishedID) {
    if (!this.finishedLevelIDs.has(finishedID)) {
      this.finishedLevelIDs.add(finishedID);
      this.saveFinishedLevels();
      this.refreshLevelButtons();
    }
    const p = PlayerController.Instance;
    if (p) p.freezeImmediately();
    this.co.stopAll();
    this.co.start(this.returnToMainMenuRoutine(this.lobby));
  }

  // -- back to menu -------------------------------------------------------
  returnToMainMenu(lobbyOverride) {
    const p = PlayerController.Instance;
    if (p) p.freezeImmediately();
    const target = lobbyOverride || this.lobby;
    this.co.stopAll();
    this.co.start(this.returnToMainMenuRoutine(target));
  }

  *returnToMainMenuRoutine(lobbyTarget) {
    UI.setCanvasActive('GameCanvas', false);
    UI.setCanvasActive('MainMenuCanvas', true);
    yield* this.playLoadingScreen(
      this.loadingMenu,
      this.LoadingScreenTimeForMainMenuCanvas,
      this.LoadingScreenTransparencyTimeForMainMenuCanvas,
      () => {
        const p = PlayerController.Instance;
        if (p && lobbyTarget) p.freezeAtLobby(lobbyTarget[0], lobbyTarget[1]);
        this.setCameraY(this.LobbyCameraFixedY);
      });
  }

  // -- loading screen -----------------------------------------------------
  *playLoadingScreen(screen, waitTime, fadeTime, onOpaque) {
    if (!screen) { if (onOpaque) onOpaque(); return; }

    screen.el.parentNode.appendChild(screen.el);   // transform.SetAsLastSibling()
    screen.setActive(true);
    screen.setAlpha(1);
    screen.el.style.pointerEvents = 'auto';        // blocksRaycasts = true
    screen.el.classList.add('raycast');

    if (onOpaque) onOpaque();

    if (waitTime > 0) yield new Unity.WaitForSeconds(waitTime);

    if (fadeTime <= 0) {
      screen.setAlpha(0);
    } else {
      let t = 0;
      while (t < fadeTime) {
        t += Unity.Time.deltaTime;
        screen.setAlpha(Unity.Mathf.lerp(1, 0, t / fadeTime));
        yield null;
      }
      screen.setAlpha(0);
    }
    screen.el.style.pointerEvents = 'none';
    screen.el.classList.remove('raycast');
    screen.setActive(false);
  }

  hideInstant(screen) {
    if (!screen) return;
    screen.setAlpha(0);
    screen.el.style.pointerEvents = 'none';
    screen.el.classList.remove('raycast');
    screen.setActive(false);
  }

  update(dt) { this.co.update(dt); }
}
GameManager.Instance = null;

/* ------------------------------------------------------------ MenuManager */
class MenuManager {
  constructor() {
    MenuManager.Instance = this;
  }
  start() {
    const gc = UI.canvasByName('GameCanvas');
    this.PauseMenu = gc.find('PausePanel');
    this.pauseButton = gc.find('PauseMenuButton');
    this.continueButton = gc.find('Continue');
    this.backButton = gc.find('BackToMenu');
    this.PlayerLobbyLocation = window.G5_CONFIG.lobby;

    if (this.PauseMenu) this.PauseMenu.setActive(false);

    if (this.pauseButton) UI.onClick(this.pauseButton.data.btn.cid, () => this.openPauseMenu());
    if (this.continueButton) UI.onClick(this.continueButton.data.btn.cid, () => this.continueGame());
    if (this.backButton) UI.onClick(this.backButton.data.btn.cid, () => this.backToMainMenu());
  }
  openPauseMenu() {
    const p = PlayerController.Instance;
    if (!p) return;
    const s = p.CurrentState;
    if (s !== PlayerState.Playing && s !== PlayerState.WaitingToStart) return;
    p.pause();
    if (this.PauseMenu) this.PauseMenu.setActive(true);
  }
  continueGame() {
    if (this.PauseMenu) this.PauseMenu.setActive(false);
    const p = PlayerController.Instance;
    if (p) p.resume();
  }
  backToMainMenu() {
    if (this.PauseMenu) this.PauseMenu.setActive(false);
    if (GameManager.Instance) GameManager.Instance.returnToMainMenu(this.PlayerLobbyLocation);
  }
}
MenuManager.Instance = null;

/* ----------------------------------------------------------- PanelManager */
/* Scene data: one entry -> panelName "Play", panelObject PlayPanel,
   openButton = the "Play" button, closeButton = the "Back" button.
   The C# leaves the panel in whatever state the scene saved it in (the
   SetActive(false) line is commented out) - PlayPanel is saved ACTIVE, so the
   level map is already open when the main menu appears. */
class PanelManager {
  constructor() { this.panels = []; }
  start() {
    const mm = UI.canvasByName('MainMenuCanvas');
    const play = mm.find('PlayPanel');
    const openBtn = mm.find('Play');
    const closeBtn = mm.find('Back');
    const panel = { panelName: 'Play', panelObject: play, openButton: openBtn, closeButton: closeBtn };
    this.panels.push(panel);
    if (openBtn) UI.onClick(openBtn.data.btn.cid, () => this.openPanel(panel));
    if (closeBtn) UI.onClick(closeBtn.data.btn.cid, () => this.closePanel(panel));
  }
  openPanel(p) { if (p.panelObject) p.panelObject.setActive(true); }
  closePanel(p) { if (p.panelObject) p.panelObject.setActive(false); }
}
