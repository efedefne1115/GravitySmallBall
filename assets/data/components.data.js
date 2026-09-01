/* Unity sahnesindeki bilesenlerin Inspector degerleri - birebir. */
window.G5_COMP = {
  /* Twoxwoob > PlayerTrail */
  trail: {
    enabled: true, onlyWhilePlaying: true,
    duration: 0.22, startWidth: 0.62, endWidth: 0,
    minVertexDistance: 0.03,
    headColor: [1, 0.95, 0.25, 0.95],
    midColor:  [0.45, 0.95, 0.35, 0.55],
    tailColor: [0.15, 0.75, 0.35, 0],
    orderInLayer: 2, teleportDistance: 3
  },
  /* Twoxwoob > PlayerEffects (tik halkasi) */
  ring: {
    enabled: true, onlyWhenPlayerReacts: true, ignoreClicksOverUI: true,
    sprite: "b884dc2fe2fde3d4093387d9a298e44f",
    normalizeSpriteSize: true,
    startScale: 0.04, endScale: 2.45, duration: 0.55,
    scaleCurve: { p0: 0, s0: 3.2, p1: 1, s1: 0 },
    alphaCurve: { p0: 1, s0: 0, p1: 0, s1: -1.4 },
    color: [1, 1, 1, 0.22],
    followPlayer: false, offset: [0, 0],
    orderInLayer: 4, maxSimultaneous: 8
  },
  /* Twoxwoob > DeathAnimation */
  death: {
    parcaSuresi: 0.5, sureleriGameManagerdanAl: true,
    siyahBeklemeSuresi: 0.5, acilmaSuresi: 0.5,
    renk1: [1, 0.95, 0.25, 1],
    renk2: [0.35, 0.85, 0.3, 1],
    renk3: [0.029156225, 0.4415095, 0.07788584, 1],
    parcaSayisi: 18, hizMin: 3.5, hizMax: 9,
    yasamMin: 0.35, yasamMax: 0.7,
    baslangicBoyutu: 0.17, bitisBoyutu: 0,
    yercekimi: -11, suruklenme: 1.6, donmeHizi: 240,
    yayilmaYaricapi: 0.22, orderInLayer: 6, oyuncuyuGizle: true
  },
  /* Twoxwoob > PlaceEffect (inis tozu) */
  place: {
    minInisHizi: 2.2, normalEsigi: 0.5, enAzAralik: 0.08,
    tersYercekimindeDeCalissin: true,
    parcaSayisi: 14, hizMin: 1.57, hizMax: 4.08, yayilmaAcisi: 56.2,
    yasamMin: 0.528, yasamMax: 0.828,
    baslangicBoyutu: 0.162, bitisBoyutu: 0.067,
    yercekimi: 10.4, suruklenme: 2.4, yayilmaGenisligi: 0.34,
    orderInLayer: 2,
    renkCarpani: [1, 1, 1, 0.85], aydinlatma: 0.18,
    renkHassasiyeti: 5, enAzPikselAlfasi: 0.35,
    yedekRenk: [0.06668292, 0.5169811, 0.04584547, 1]
  },
  /* Managers > BarManager */
  bar: {
    barGo: 1761660311, miktarGo: 1832596839, bestMiktarGo: 1831125835,
    yumusatmaHizi: 0, geriGitmesin: false,
    bestKaydet: true, kayitAnahtarOneki: "GM_Best_",
    yaziBicimi: "%{0}", basamak: 0,
    spawnYakinlik: 0.05, bolumYDeviasyonu: 12, bolumYokkenGizle: false
  },
  /* Managers > PlayPanelSystem */
  playPanel: {
    panelName: "PlayLevelPanel",
    closeName: "ClosePanel", playName: "PlayLevel",
    levelNameText: "NameOfLevel", bestScoreText: "BestScore",
    diedText: "DiedCound", finishedText: "FinishedTimes",
    badgeImage: "Finished",
    badges: {
      "0":  "70ecb339d3197f6428eb47685be35d44",
      "1":  "81ed26df0cb1d194889330ccb252387e",
      "2":  "248113e33b1ef7a488decd13b8499a91",
      "5":  "4f89e490062d9ab468a19c525fec828e",
      "10": "22c09485f76045f46a9de0f1feab818e"
    },
    esik: { e1: 1, e2: 2, e5: 5, e10: 10 },
    spriteYoksaGizle: true,
    panelRenginiUygula: true,
    levelNameBicimi: "{0}",
    bestScoreBicimi: " Best Score %{0}",
    diedCoundBicimi: "Deaths: {0}",
    finishedTimesBicimi: "Completions: {0}",
    yuzdeBasamak: 0,
    bestKayitOneki: "GM_Best_", olumKayitOneki: "PP_Died_", bitirmeKayitOneki: "PP_Finished_",
    giristeKapat: true,
    levels: [
      { id: 1,  name: "Level of Freedoom", color: [1, 1, 1, 0.30588236] },
      { id: 2,  name: "Dangerous Path",    color: [0.8901961, 0, 0, 0.60784316] },
      { id: 3,  name: "The Walkrood",      color: [0.8156863, 0.49803922, 0.972549, 0.46666667] },
      { id: 4,  name: "Narrow Forest",     color: [0, 0, 0, 0.46666667] },
      { id: 5,  name: "Long Ways",         color: [0, 0.043137256, 1, 0.4392157] },
      { id: 6,  name: "Lost Nest",         color: [0, 0, 0, 0.7254902] },
      { id: 7,  name: "Where is This",     color: [0.21568628, 0, 0, 0.9137255] },
      { id: 8,  name: "Path of Losers",    color: [0.74509805, 0.24313726, 0, 0.64705884] },
      { id: 9,  name: "Deserted Pass",     color: [0.36078432, 0.36078432, 0.36078432, 0.64705884] },
      { id: 10, name: "Step by Step",      color: [0, 0, 0, 0] }
    ]
  },
  /* URP 2D isiklari */
  lights: {
    /* Global Light 2D: type 4 (Global), beyaz, siddet 0.8 -> tum dunya x0.8 */
    globalIntensity: 0.8,
    globalColor: [1, 1, 1],
    /* Twoxwoob > Spot Light 2D: type 3 (Point), siddet 0.6, dis yaricap 2.7587
       (oyuncunun 0.137718 olcegiyle carpilir), falloff 0.448 */
    playerLight: {
      intensity: 0.6, color: [1, 1, 1],
      outerRadius: 2.7587078, falloff: 0.448, scaledBy: 0.137718
    }
  }
};