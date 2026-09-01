# Game5 — Web port

A hand-written HTML/CSS/JS re-creation of the Unity project in `C:\Game5\Game5`.
No engine, no framework, no build step.

Everything here was extracted from the Unity project itself: no gameplay, art,
layout or tuning value was invented.

---

## 0. Nasil oynanir

**Kurulum yok, indirme yok.** Siteyi ac, tek bir tus var:

> **OYUNU BASLAT**

Tusa basinca:

1. tarayici **tam ekrana** gecer (adres cubugu, sekmeler, sistem cubuklari kaybolur),
2. mumkunse ekran **yatay moda** kilitlenir,
3. oyun baslar.

Tam ekran ve yon kilidi tarayicilarda sadece bir kullanici hareketi icinde
verilir - bu yuzden ikisi de o tusun icinde cagriliyor. Tam ekrandan cikarsan
(ESC, sistem hareketi) sag altta kucuk bir tam ekran tusu belirir.

Telefonu dik tutarsan "Telefonu yan cevir" karti cikar ve **oyun o sirada
durur**, arkadan olmezsin.

### Yayinlamak (GitHub Pages)

`GITHUB-YUKLE.bat` -> cift tik -> Enter. Sonra acilan sayfada
**Settings > Pages > Deploy from a branch > main > /(root) > Save**.
1-2 dakika sonra:

```
https://efedefne1115.github.io/GravitySmallBall/
```

HTTPS oldugu icin `sw.js` devreye girer ve oyunu cihaza cacheler - ilk
acilistan sonra internet olmasa da calisir.

### Yerelde test

`SUNUCU-BASLAT.bat` -> `http://localhost:8765/`

## 1. Source project

| | |
|---|---|
| Unity version | `6000.3.20f1` |
| Render pipeline | Universal RP — **2D Renderer** (`Assets/Settings/Renderer2D.asset`) |
| Dimension | **2D** (orthographic camera, `orthographic size 5`, all sprites, all rotations Z-only — verified: 0 transforms with a non-zero quaternion X/Y) |
| Colour space | Linear (`m_ActiveColorSpace: 1`) |
| Scenes | **one**: `Assets/Scenes/SampleScene.unity` (59.5 MB, 65 605 YAML documents). The Unity/TMP package scenes under `Assets/TextMesh Pro/Examples & Extras/` are untouched package samples and are not part of the game. |
| Prefabs | none belonging to the game (only TMP sample prefabs) |
| Audio | **none in the project** |
| Animator / Animation clips | **none in the project** — the only "animation" is `Bird.cs` swapping between two sprites |
| AnimationCurve assets | none |
| Particle systems | none |

`SampleScene` contains the menu, the HUD **and** all ten playable maps at once.
They are stacked vertically in world space and the camera is snapped to a fixed
`Y` per level. Scene roots:

```
Map1, Map2DangerousPath, Map3TheWalkRoad, Map4NarrowForest, Map5LongWays,
Map6LostNest, Map7WhereIsThis, Map8PathOfLosers, Map9DesertedPass,
Map10StepByStep, MapGet (unused template), Twoxwoob (the player),
Twoxwoob_0 (decor), Main Camera, Global Light 2D, EventSystem,
MainMenuCanvas, GameCanvas, Managers, MainMenuSpawnPoint
```

Scale of the extraction: **20 339 SpriteRenderers**, **3 413 Collider2D**
(808 Box + 2 605 Polygon), **170 RectTransforms**.

---

## 2. Coordinate conversion

**World → screen** (`js/unity.js`, `World.draw`):

```
ppu     = canvasHeightPx / (2 * orthographicSize)        // orthoSize = 5
screenX = (worldX - camX) * ppu + canvasWidthPx / 2
screenY = canvasHeightPx / 2 - (worldY - camY) * ppu     // Unity +Y is up
```

Implemented as a canvas transform `setTransform(ppu, 0, 0, -ppu, e, f)` so that
the whole draw call happens in Unity world units; per sprite the matrix is then
`translate(x,y) · rotate(rotZ) · scale(sx·flipX, -sy·flipY)`.

**Sprite size and pivot:**

```
worldW = spriteRect.width  / spritePixelsToUnits * lossyScale.x
worldH = spriteRect.height / spritePixelsToUnits * lossyScale.y
```

Every sprite in `Assets/*.png` is imported with `spritePixelsToUnits: 100` and
`alignment: 0` (Center → pivot 0.5, 0.5). The two Unity built-in shapes are
`PPU 256`; `Triangle` has `alignment: 9` with the custom pivot
`(0.5, 0.28866667)` — that is reproduced exactly.

**Transform hierarchy:** the extractor composes each parent chain as a full 2-D
affine matrix (`a b c d e f`) and only then decomposes it into
position / rotation / scale, so nested + non-uniform + negative scales
(141 of them) come out right.

**Canvas / RectTransform → CSS** (`js/ui.js`):

```
w      = (aMax.x - aMin.x) * parentW + sizeDelta.x
h      = (aMax.y - aMin.y) * parentH + sizeDelta.y
pivotX = aMin.x*parentW + (aMax.x-aMin.x)*parentW*pivot.x + anchoredPosition.x
left   = pivotX - pivot.x * w
top    = parentH - (pivotY - pivot.y*h) - h        // CSS measures from the top
```

Both Canvases are `Screen Space – Overlay` with
`CanvasScaler: ScaleWithScreenSize, reference 1920×1080, match = 0 (width)`, so:

```
scaleFactor = screenWidth / 1920
canvasRect  = (1920, screenHeight / scaleFactor)
```

The DOM tree is laid out in those reference units inside a `.canvas-space` div
that is CSS-scaled once by `scaleFactor` — the same thing Unity does.

---

## 3. Assets

`assets/sprites/` — every sprite is cropped **programmatically** out of its source
PNG using the `spriteSheet.sprites[0].rect` block of the corresponding
`.meta` file (Unity's rect `y` is measured from the bottom, so
`topPx = imageHeight - (rect.y + rect.height)`). Pixels are copied 1:1
(`CompositingMode.SourceCopy`, 32-bit ARGB, re-encoded as PNG — lossless, no
resampling, no recompression artefacts).

| file | source | rect (x, y, w, h) | PPU | pivot |
|---|---|---|---|---|
| `Daire.png` | Daire.png | 0, 0, 1024, 1024 | 100 | 0.5, 0.5 |
| `Dirt.png` | Dirt.png | 0, 0, 1024, 1024 | 100 | 0.5, 0.5 |
| `Ending.png` | Ending.png | 495, 79, 210, 850 | 100 | 0.5, 0.5 |
| `EnemyBird.png` | EnemyBird.png | 7, 203, 874, 422 | 100 | 0.5, 0.5 |
| `EnemyFlyBird.png` | EnemyFlyBird.png | 30, 174, 864, 760 | 100 | 0.5, 0.5 |
| `Grasssssssss.png` | Grasssssssss.png | 0, 15, 1024, 497 | 100 | 0.5, 0.5 |
| `Kaktus.png` | Kaktus.png | 351, 0, 354, 801 | 100 | 0.5, 0.5 |
| `RBirdStay.png` | RBirdStay.png | 0, 190, 950, 471 | 100 | 0.5, 0.5 |
| `RBridFly.png` | RBridFly.png | 30, 174, 864, 760 | 100 | 0.5, 0.5 |
| `Sky.png` | Sky.png | 0, 0, 1024, 1024 | 100 | 0.5, 0.5 |
| `Treeeeeeeeeeeeee.png` | Treeeeeeeeeeeeee.png | 295, 0, 402, 561 | 100 | 0.5, 0.5 |
| `Twoxwoob.png` | Twoxwoob.png | 127, 223, 706, 610 | 100 | 0.5, 0.5 |
| `Square.png` | `com.unity.2d.sprite` package default | 0, 0, 256, 256 | 256 | 0.5, 0.5 |
| `Triangle.png` | `com.unity.2d.sprite` package default | 0, 0, 256, 256 | 256 | 0.5, 0.28866667 |

`assets/fonts/LiberationSans.ttf` — copied from
`Assets/TextMesh Pro/Fonts/`. It is the font behind `LiberationSans SDF`
(guid `8f586378…`), the font asset used by every TMP text in the scene.

No texture atlases, no 9-slice borders (`spriteBorder` is `0,0,0,0` everywhere),
no sprite-sheet flipbooks, no sprite-swap animation assets.

`assets/data/` — the extracted scene, emitted as `.js` files that assign to
globals (rather than `.json` + `fetch`) purely so the game also runs from a
`file://` URL with no server.

* `sprites.data.js` — the sprite table above
* `config.data.js` — `GameManager` inspector data (11 level entries, camera,
  lobby, loading-screen timings), `PlayerController` inspector data, all 14
  `Bird` components
* `world.data.js` — every SpriteRenderer and every Collider2D of every map,
  already in world space
* `ui.data.js` — both Canvases as a RectTransform tree with Image / TMP_Text /
* `components.data.js` — Unity Inspector'daki efekt ayarlari (trail, halka,
  olum, toz, bar, panel, 2D isiklar) - birebir
* `spinners.data.js` — 289 BackgroundSpinner ornegi, dunya konumu + ayarlari
  Button / ScrollRect / Mask components

---

## 4. Gameplay logic

Each C# file has a 1:1 JS counterpart:

| Unity | Web |
|---|---|
| `PlayerController.cs` | `js/player.js` |
| `GameManager.cs` | `js/managers.js` (`GameManager`) |
| `MenuManager.cs` | `js/managers.js` (`MenuManager`) |
| `PanelManager.cs` | `js/managers.js` (`PanelManager`) |
| `LevelFinishZone.cs` | folded into the collider tagging + `PlayerController.onEnter` |
| `Bird.cs` | `js/bird.js` |
| `PlayerTrail.cs` | `js/fx.js` (`Trail`) |
| `PlayerEffects.cs` | `js/fx.js` (`Ring`) |
| `DeathAnimation.cs` | `js/fx.js` (`DeathAnim`) |
| `PlaceEffect.cs` | `js/fx.js` (`PlaceDust`) |
| `BackgroundSpinner.cs` | `js/fx.js` (`Spinners`, 289 ornek) |
| `BarManager.cs` | `js/hud.js` (`BarManager`) |
| `PlayPanelSystem.cs` | `js/hud.js` (`PlayPanelSystem`) |
| `FrameRateLimiter.cs` | n/a — see §7 |

**Player** (`Twoxwoob`, layer 7): `moveSpeed 4` (overwritten per level),
`gravityMagnitude 4`, `spikeLayer = m_Bits 64` → layer 6 `"Spike"`,
`flipSpriteOnGravity true`. `Rigidbody2D` Dynamic, mass 1, drag 0,
FreezeRotation, Continuous, Interpolate. `BoxCollider2D` size (7.06, 6.10),
offset (0,0), transform scale 0.137718 → world 0.97229 × 0.84008.

Click / tap:
* `WaitingToStart` → `Playing` and gravity is switched on,
* `Playing` → gravity direction is inverted and the sprite `flipY`s,
* clicks that land on a UI raycast target are ignored (`IsPointerOverGameObject`).

The 1-second "stuck" guard (`UpdateStuckCheck`) is reproduced verbatim,
including the fact that it compares against `moveSpeed * Time.deltaTime * 0.1`
and that it reads the *interpolated* transform position.

**Levels** (from the `GameManager.Levels` list — note that `Level6LostNest`
really is present twice in the Unity list; that is kept):

| # | name | camera Y | speed | grants ID | requires |
|---|---|---|---|---|---|
| 1 | Level1 | 0 | 5 | 1 | — |
| 2 | Level2DangerousPath | −34.15 | 7 | 6 | 6 |
| 3 | Level3TheWalkRoad | −68.85 | 6 | 2 | 1 |
| 4 | Level4TheNarrowForest | −99.91 | 5 | 3 | 2 |
| 5 | Level5LongWays | −130.27 | 9 | 4 | 2 |
| 6 | Level6LostNest | −161.16 | 7 | 5 | 8 |
| 6b | Level6LostNest (duplicate entry) | −161.16 | 7 | 5 | 8 |
| 7 | Level7WhereIsThis | −187.44 | 8 | 6 | 5 |
| 8 | Level8PathOfLosers | −217.51 | 8 | 7 | 3 **and** 4 |
| 9 | Level9DesetedPass | −247.94 | 7 | 8 | 7 |
| 10 | Level10StepByStep | −279.51 | 9 | 9 | 7 |

Level 10 has **no** `LevelFinishObject` in the scene (`fileID: 0`), so it cannot
be completed — that is how the Unity project ships.

**Camera** — `GameManager.LateUpdate`: `x = player.x + CameraOffsetX (3)`,
`y = the level's fixed Y`. No smoothing, no shake, no zoom, no bounds — exactly
what the C# does.

**Loading screens** — the `PlayLoadingScreen` coroutine is ported literally:
the screen snaps to opaque, the teleport/camera change happens behind it
(`onOpaque`), it holds for `0.5 s`, then `Mathf.Lerp(1,0,t/0.5)` fades it out.

---

## 5. Physics

Ported in `js/physics2d.js` + `PlayerController.fixedUpdate`.

* `Physics2D.gravity = (0, -9.81)`, `Fixed Timestep = 0.02`, both from
  `ProjectSettings`. Velocity is integrated **once per 0.02 s tick**, exactly
  like Unity (`v += g*gravityScale*dt; p += v*dt`), driven by an accumulator, so
  trajectories are frame-rate independent and match the editor.
* `Rigidbody2D.interpolation = Interpolate` is reproduced by rendering at
  `lerp(prevPos, pos, accumulator / 0.02)`.
* `m_CollisionDetection = Continuous` is reproduced by splitting each tick's
  displacement into ≤ 0.12-unit sub-moves and resolving after each one.
* Only **one** dynamic body exists in the whole scene, so no body-vs-body solver
  is needed.
* **Every** `PolygonCollider2D` in the project is on layer 6 (`Spike`), and
  touching layer 6 kills the player on the same physics step
  (`PlayerController.CheckSpikeCollision`). Polygons therefore only need an
  *overlap test*, never a collision *response* — which is why the concave,
  up-to-455-point sprite outlines (trees, crows) are tested exactly rather than
  approximated by convex hulls.
* Solid response is always AABB(player) vs OBB(static box) resolved with a
  minimum-translation-vector SAT, and the velocity component pushing into the
  surface is cancelled. Bounciness is 0 in Unity (no PhysicsMaterial2D is
  assigned anywhere), so nothing bounces here either.

Press **C** at any time to draw the collider overlay (green = solid,
red = lethal/layer 6, blue = trigger) if you want to compare against the Unity
scene view.

---

## 6. Save system

Unity uses a single `PlayerPrefs` entry:

```csharp
private const string SaveKey = "GM_FinishedLevelIDs";
PlayerPrefs.SetString(SaveKey, string.Join(",", finishedLevelIDs));
```

The web build writes the **same key** with the **same comma-separated integer
format** to `localStorage` (`js/save.js`). Written on level completion only,
read once in `GameManager.Awake`. Nothing else is persisted, and nothing is ever
reset by the game — clear it manually with:

```bash
localStorage.removeItem('GM_FinishedLevelIDs')
```

---

## 7. Things that are **not** bit-identical, and why

1. **Unity's built-in UI sprites.** `PlayPanel`, `Panel`, `PausePanel`,
   `PauseMenuButton`, `Continue`, `BackToMenu` and `Back` use sliced sprites from
   `unity_builtin_extra` (`fileID 10905 "UISprite"`, `10907 "Background"`,
   `10917 "UIMask"`, guid `0000000000000000f000000000000000`). That asset is a
   binary blob inside the Unity **editor installation**, not inside the project
   folder, so its pixels are not available here. They are all plain white
   (slightly rounded) rectangles that only ever get tinted, so they are rebuilt
   as CSS rectangles with `border-radius: 6px` (UISprite) / `0` (Background) and
   the exact Inspector tint. **If you want these pixel-exact, export those three
   sprites from the Unity editor as PNGs and drop them in `assets/sprites/` — I
   will wire them up.**
2. **TextMeshPro.** TMP renders SDF glyph atlases with its own layout engine.
   The port uses the real `LiberationSans.ttf` with the exact `m_fontSize`,
   `m_fontColor`, bold flag, alignment flags and margins, rendered by the
   browser. Glyph shapes are identical; line breaking and sub-pixel advance
   widths can differ by a pixel or two. TMP auto-sizing is not implemented
   (nothing in this scene has `m_enableAutoSizing: 1`).
3. **`ScrollRect` feel.** Movement type Elastic, `elasticity 0.1`,
   `inertia`, `decelerationRate 0.135` and `scrollSensitivity 1` are used, but
   the exact elastic overshoot curve of uGUI is approximated with a hard clamp +
   `v *= decel^dt` inertia. The initial scroll offset (`anchoredPosition.y =
   3607`, as saved in the scene) is preserved.
4. **Alpha blending in linear space.** The project renders in Linear colour
   space; the canvas blends in sRGB. *Colour tinting is unaffected* — multiplying
   in linear and converting back is mathematically identical to multiplying in
   sRGB — but the handful of sprites with fractional alpha (0.69–0.82) blend a
   shade differently against their background.
5. **UI sprite working resolution.** World sprites are drawn from the full-size
   PNGs. UI `Image`s that need a colour tint are painted into a per-element
   `<canvas>` capped at 512 px on the longest side (they are displayed at ~190
   CSS px at most, so this is invisible; it avoids `toDataURL`, which would
   throw on a `file://`-tainted canvas, and keeps canvas memory sane).
6. **`FrameRateLimiter.cs`** sets `Application.targetFrameRate = 300` with vSync
   off. A browser is capped by `requestAnimationFrame` at the display refresh
   rate. Because every system is delta-time driven and physics runs on a fixed
   0.02 s accumulator, this changes the sampling rate only, not the simulation.
7. **`Global Light 2D`** exists in the scene (type Global, colour white,
   intensity 1, blend style 0). At those values the URP 2D lit pass is a no-op
   on sprite colour, so the port draws unlit — visually identical. If the light
   is ever retuned in Unity the port would need a multiply pass.
8. **Bird reset.** `Bird.ResetBird()` is public and clearly meant to be called on
   respawn, but **nothing in the C# ever calls it**. The port matches that: birds
   that have flown away stay away until the level is re-entered.

Nothing was skipped silently: there are no unreadable, compressed or missing
assets in the project, no shaders beyond the URP defaults, no post-processing
(`DefaultVolumeProfile.asset` is the empty template), and no audio.

---

## 8. Layout

```
Game5ForWeb/
├─ SUNUCU-BASLAT.bat       cift tikla -> LAN sunucusu (telefon icin)
├─ serve.ps1               TcpListener + runspace havuzu, yonetici gerekmez
├─ index.html
├─ style.css
├─ manifest.webmanifest    PWA: fullscreen + orientation landscape, start_url ?app=1
├─ sw.js                   offline cache (yalnizca https/localhost'ta aktif)
├─ script.js               bootstrap + the Unity player loop
│                          (FixedUpdate×N → interpolate → Update → LateUpdate → render)
├─ js/
│  ├─ unity.js             Mathf / Time / Camera / sprite table / coroutines
│  ├─ save.js              PlayerPrefs → localStorage
│  ├─ physics2d.js         collider construction, broadphase, SAT, polygon overlap
│  ├─ world.js             SpriteRenderer scene graph + renderer + collider queries
│  ├─ player.js            PlayerController.cs
│  ├─ bird.js              Bird.cs
│  ├─ ui.js                Canvas / RectTransform / Image / TMP / Button / ScrollRect / Mask
│  ├─ managers.js          GameManager.cs, MenuManager.cs, PanelManager.cs, Input
│  ├─ fx.js               PlayerTrail / PlayerEffects / DeathAnimation / PlaceEffect / BackgroundSpinner
│  ├─ hud.js              BarManager, PlayPanelSystem
│  └─ start.js            acilis ekrani, tam ekran, yatay mod, service worker
└─ assets/
   ├─ sprites/             14 PNGs cropped from the Unity textures
   ├─ icons/               PWA ikonlari (Twoxwoob sprite'indan uretildi)
   ├─ fonts/               LiberationSans.ttf
   └─ data/                the extracted scene
```

**App-mode tespiti** (`js/pwa.js`) uc yolu birden dener, cunku duz LAN `http://`
uzerinde Chrome her zaman gercek bir WebAPK kurmaz:

1. `display-mode: fullscreen / standalone / minimal-ui`
2. `navigator.standalone === true` (iOS)
3. manifest `start_url` icindeki `?app=1` — ana ekrana eklenen her kisayol
   `start_url`'i actigi icin bu her durumda calisir.

## 9. Controls

* **Click / tap** anywhere that is not a UI element — start the run, then flip
  gravity.
* **PAUSE** button — pause menu (`Continue` / `Back To Menu`).
* **C** — collider debug overlay (added for verification; not in the Unity build).

---

## 10. Bu surumde birebir olmayan yeni seyler

Sahne 2026-09-01'de yeniden cikarildi; asagidakiler o gunku Unity halinin
karsiligidir.

**URP 2D isiklari.** Sahnede iki `Light2D` var:
* `Global Light 2D` — type Global, beyaz, **siddet 0.8**. Bu, dunyadaki butun
  sprite'lari 0.8 ile carpar. Web'de bu carpim dogrudan sprite tint'ine
  katildi (`js/world.js`, `GLOBAL_LIGHT`) — sonuc ayni, maliyeti sifir.
  Tek fark: kameranin arka plan rengi Unity'de isiktan etkilenmez, burada da
  etkilenmiyor, o yuzden ikisi ayni.
* `Twoxwoob > Spot Light 2D` — Point, siddet 0.6, dis yaricap 2.7587
  (oyuncunun 0.137718 olcegiyle carpilinca ~0.38 dunya birimi), falloff 0.448.
  Web'de oyuncunun uzerine additive bir radyal gradient olarak ciziliyor
  (`drawPlayerLight`). Gorsel olarak cok yakin ama URP'nin falloff egrisi
  birebir degil.

**TrailRenderer.** Unity kendi serit mesh'ini uretir. Web'de ayni nokta
gecmisi tutuluyor ve `canvas` cizgisi olarak ciziliyor; genislik ve 3 duraklı
renk gradyani birebir, ama kose birlesimleri (`numCornerVertices 4`) yuvarlak
uc/birlesim ile taklit ediliyor.

**PlaceEffect'in zemin rengi.** Unity'de dokular `isReadable: 0` oldugu icin
renk `RenderTexture` uzerinden okunuyordu; web'de doku zaten okunabilir, ayni
histogram (5 bit kova, kazanan kovanin ortalamasi) dogrudan uygulaniyor.
Sonuc ayni, yol farkli.

**Level 10** artik bitirilebiliyor — Unity'de `FinishObject` eklenmis, web de
onu aldi.
