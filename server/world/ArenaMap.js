const Gameplay = require('../../src/shared/gameplay');

class ArenaMap {
    constructor() {
        const arena = Gameplay.ARENA;
        this.tileSize = arena.tileSize;
        this.worldTiles = arena.worldTiles;
        this.roadCenters = arena.roadCenters;
        this.roadHalfTiles = arena.roadHalfTiles;
        this.grassTiles = arena.grassTiles;
        this.sidewalkTiles = arena.sidewalkTiles;
        this.worldSize = this.tileSize * this.worldTiles;
    }

    getMapConfig() {
        return {
            tileSize: this.tileSize,
            worldTiles: this.worldTiles,
            roadCenters: this.roadCenters,
            roadHalfTiles: this.roadHalfTiles,
            grassTiles: this.grassTiles,
            sidewalkTiles: this.sidewalkTiles,
            disableAlleys: true
        };
    }

    getRandomSpawnPoint() {
        const rx = this.roadCenters[Math.floor(Math.random() * this.roadCenters.length)];
        const ry = this.roadCenters[Math.floor(Math.random() * this.roadCenters.length)];
        return {
            x: rx * this.tileSize + this.tileSize / 2,
            y: ry * this.tileSize + this.tileSize / 2
        };
    }

    isBlocked(wx, wy) {
        return Gameplay.isArenaBlocked(wx, wy, this);
    }

    isBlockedRect(cx, cy, r) {
        return this.isBlocked(cx - r, cy - r) ||
               this.isBlocked(cx + r, cy - r) ||
               this.isBlocked(cx - r, cy + r) ||
               this.isBlocked(cx + r, cy + r);
    }
}

module.exports = ArenaMap;
