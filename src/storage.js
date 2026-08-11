// ============================================================
//  NEON DELIVERY — storage.js
//  localStorage persistence for scores, coins, upgrades.
// ============================================================
NeonDelivery.Storage = (function () {
    const KEY = 'neon_delivery_v1';

    function defaultData() {
        return {
            highScore:     0,
            totalCoins:    0,
            bestLevel:     1,
            ownedUpgrades: {},   // { upgradeId: level }
            settings:      { muted: false }
        };
    }

    function load() {
        try {
            const raw = localStorage.getItem(KEY);
            if (!raw) return defaultData();
            const parsed = JSON.parse(raw);
            // Merge with defaults so new fields are populated on older saves
            const def = defaultData();
            return {
                highScore:     parsed.highScore     ?? def.highScore,
                totalCoins:    parsed.totalCoins    ?? def.totalCoins,
                bestLevel:     parsed.bestLevel     ?? def.bestLevel,
                ownedUpgrades: parsed.ownedUpgrades ?? def.ownedUpgrades,
                settings:      Object.assign(def.settings, parsed.settings || {})
            };
        } catch (e) {
            return defaultData();
        }
    }

    function save(data) {
        try {
            localStorage.setItem(KEY, JSON.stringify(data));
        } catch (e) {
            // Storage quota exceeded or unavailable — fail silently
        }
    }

    function reset() {
        localStorage.removeItem(KEY);
    }

    return { load, save, reset };
})();
