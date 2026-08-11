// ============================================================
//  NEON DELIVERY — config.js
//  Single source of truth for all game constants.
// ============================================================
window.NeonDelivery = window.NeonDelivery || {};

NeonDelivery.Config = {
    // ── Canvas ──────────────────────────────────────────────
    CANVAS_W: 960,
    CANVAS_H: 640,

    // ── World ───────────────────────────────────────────────
    TILE_SIZE: 32,
    WORLD_TILES: 60,
    get WORLD_SIZE() { return this.TILE_SIZE * this.WORLD_TILES; }, // 1920

    // Road centers (tile index).  Each road = center ±1 tile (3 tiles wide).
    ROAD_CENTERS: [7, 18, 29, 40, 51],
    ROAD_HALF: 1,

    // ── Tile types ──────────────────────────────────────────
    TILE: { ROAD: 0, BUILDING: 1, ALLEY: 2, INTERSECTION: 3 },

    // ── Drone physics ───────────────────────────────────────
    DRONE_RADIUS: 10,
    DRONE_ACCEL: 0.42,
    DRONE_MAX_SPEED: 4.8,
    DRONE_FRICTION: 0.86,
    BOOST_SPEED_MULT: 2.4,
    BOOST_DURATION: 900,    // ms
    BOOST_COOLDOWN: 3200,   // ms

    // ── Camera ──────────────────────────────────────────────
    CAMERA_LERP: 0.09,

    // ── Combo ───────────────────────────────────────────────
    MAX_COMBO: 8,
    // colour per combo level (index 0 = x1 … index 7 = x8)
    COMBO_COLORS: [
        '#00f5ff', '#00f5ff',           // x1-x2  cyan
        '#ff00cc', '#ff00cc',           // x3-x4  magenta
        '#ffe600', '#ffe600', '#ffe600', // x5-x7 yellow
        '#ffffff'                        // x8     white/gold
    ],

    // ── Game states ─────────────────────────────────────────
    GameState: {
        MENU:           'menu',
        PLAYING:        'playing',
        LEVEL_COMPLETE: 'level_complete',
        SHOP:           'shop',
        PAUSED:         'paused',
        GAMEOVER:       'gameover'
    },

    // ── Level progression ────────────────────────────────────
    // deliveriesRequired: how many deliveries to finish the level
    LEVEL_CONFIGS: [
        { level: 1, timer: 60, carCount: 0,  hazards: [],                         deliveriesRequired: 3 },
        { level: 2, timer: 60, carCount: 10, hazards: ['cars'],                   deliveriesRequired: 4 },
        { level: 3, timer: 55, carCount: 14, hazards: ['cars'],                   deliveriesRequired: 4 },
        { level: 4, timer: 55, carCount: 18, hazards: ['cars', 'police'],         deliveriesRequired: 5 },
        { level: 5, timer: 50, carCount: 22, hazards: ['cars', 'police'],         deliveriesRequired: 5 },
        { level: 6, timer: 45, carCount: 26, hazards: ['cars', 'police', 'wind'], deliveriesRequired: 6 },
        // Level 7+ generated dynamically
    ],
    getLevelConfig(level) {
        const idx = Math.min(level - 1, this.LEVEL_CONFIGS.length - 1);
        const base = this.LEVEL_CONFIGS[idx];
        if (level <= this.LEVEL_CONFIGS.length) return base;
        // Procedural difficulty beyond defined levels
        return {
            level,
            timer: Math.max(35, 45 - (level - 6) * 2),
            carCount: Math.min(40, 26 + (level - 6) * 3),
            hazards: ['cars', 'police', 'wind'],
            deliveriesRequired: 5 + Math.floor((level - 6) / 2)
        };
    },

    // ── Job types ────────────────────────────────────────────
    JOB_TYPE: { STANDARD: 'standard', EXPRESS: 'express', VIP: 'vip' },

    // ── Scoring ──────────────────────────────────────────────
    SCORE_BASE:         1000,
    SCORE_TIME_BONUS:   10,   // per second remaining on per-delivery timer
    SCORE_CLEAN_BONUS:  250,  // no collision during delivery
    VIP_MULTIPLIER:     5.0,
    EXPRESS_MULTIPLIER: 2.0,

    BASE_COINS_STANDARD: 120,
    BASE_COINS_EXPRESS:  200,
    BASE_COINS_VIP:      500,

    // Express delivery time limit (seconds)
    EXPRESS_TIME: 22,

    // ── Car speeds ───────────────────────────────────────────
    CAR_SPEED_MIN: 1.2,
    CAR_SPEED_MAX: 2.4,
    CAR_W: 22,
    CAR_H: 14,

    // ── Police ───────────────────────────────────────────────
    POLICE_SPEED: 2.8,
    POLICE_DETECT_RANGE: 180,
    POLICE_LOSE_RANGE:   260,
    POLICE_RADIUS:        14,

    // ── Wind ─────────────────────────────────────────────────
    WIND_MAX_FORCE: 0.18,

    // ── Events ───────────────────────────────────────────────
    EVENT_COOLDOWN:    25000,  // ms between events
    EVENT_BASE_CHANCE: 0.08,
    EVENT_LEVEL_SCALE: 0.025,
    EVENT_MAX_CHANCE:  0.30,

    // ── Minimap ──────────────────────────────────────────────
    MINIMAP_W: 128,
    MINIMAP_H:  86,
    MINIMAP_X:  20,   // from right edge
    MINIMAP_Y:  20,   // from bottom edge

    // ── Neon colour palette ──────────────────────────────────
    COLOR: {
        BG:           '#020810',
        ROAD:         '#080f1e',
        ROAD_LINE:    '#ffe600',
        INTERSECTION: '#0a1228',
        ALLEY:        '#060c18',
        BUILDING: [
            '#0c1428', '#0d1830', '#0a1222',
            '#111535', '#0e1628', '#0b1325'
        ],
        WIN_CYAN:    '#00f5ff',
        WIN_WARM:    '#ffcc44',
        WIN_MAGENTA: '#ff44cc',
        WIN_OFF:     '#0d1830',
        CYAN:    '#00f5ff',
        MAGENTA: '#ff00cc',
        YELLOW:  '#ffe600',
        GREEN:   '#00ff88',
        RED:     '#ff3366',
        WHITE:   '#ffffff',
        DRONE:       '#00f5ff',
        DRONE_CORE:  '#ffffff',
        DRONE_BOOST: '#00ffcc',
        PACKAGE:     '#00ff88',
        DELIVERY:    '#ff00cc',
        CAR: ['#ff3366', '#ffaa00', '#00ccff', '#ff66bb', '#44ffaa', '#cc44ff'],
        POLICE:      '#ff3366',
    }
};
