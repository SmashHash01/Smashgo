// ============================================================
//  NEON DELIVERY — world.js
//  Road-first procedural city.
//
//  Layout (tile indices, 60×60 grid):
//    Road centres: 7, 18, 29, 40, 51
//    Each road occupies [centre-1 … centre+1] (3 tiles wide)
//    Blocks between roads are subdivided into buildings + alleys
// ============================================================
NeonDelivery.World = (function () {
    const C  = NeonDelivery.Config;
    const TT = C.TILE;
    const TS = C.TILE_SIZE;
    const WT = C.WORLD_TILES;
    const RC = C.ROAD_CENTERS;   // [7, 18, 29, 40, 51]
    const RH = C.ROAD_HALF;      // 1

    // ── Module-level state ───────────────────────────────────
    let tiles        = null;  // Uint8Array length WT*WT
    let buildingRecs = [];    // [{x,y,w,h,colorIdx,windows:[{x,y,lit,warm}]}]
    let spawnPoints  = [];    // [{x,y}] road-centre points for jobs/spawns
    let carLanes     = [];    // lane descriptors for entities.js
    let rng          = Math.random; // replaceable for testing

    // ── Helpers ──────────────────────────────────────────────

    function tileIdx(tx, ty) { return ty * WT + tx; }

    function setTile(tx, ty, type) {
        if (tx >= 0 && ty >= 0 && tx < WT && ty < WT)
            tiles[tileIdx(tx, ty)] = type;
    }

    function distToNearestRoadCenter(tileCoord) {
        let best = Infinity;
        for (const center of RC) {
            best = Math.min(best, Math.abs(tileCoord - center));
        }
        return best;
    }

    // ── Generate ─────────────────────────────────────────────

    function generate(level) {
        tiles        = new Uint8Array(WT * WT);
        buildingRecs = [];
        spawnPoints  = [];
        carLanes     = [];

        const roadHalf = C.ROAD_HALF_TILES;
        const grass    = C.GRASS_TILES;
        const sidewalk = C.SIDEWALK_TILES;

        for (let ty = 0; ty < WT; ty++) {
            for (let tx = 0; tx < WT; tx++) {

                const dx = distToNearestRoadCenter(tx);
                const dy = distToNearestRoadCenter(ty);

                const onVerticalRoad   = dx <= roadHalf;
                const onHorizontalRoad = dy <= roadHalf;

                // ==============================
                // ROAD / INTERSECTION
                // ==============================
                if (onVerticalRoad && onHorizontalRoad) {
                    setTile(tx, ty, TT.INTERSECTION);
                    continue;
                }
                if (onVerticalRoad || onHorizontalRoad) {
                    setTile(tx, ty, TT.ROAD);
                    continue;
                }

                // ==============================
                // GRASS VERGE
                // ==============================
                const grassLimit = roadHalf + grass;
                if (dx <= grassLimit || dy <= grassLimit) {
                    setTile(tx, ty, TT.GRASS);
                    continue;
                }

                // ==============================
                // SIDEWALK / BUILDING SETBACK
                // ==============================
                const sidewalkLimit = grassLimit + sidewalk;
                if (dx <= sidewalkLimit || dy <= sidewalkLimit) {
                    setTile(tx, ty, TT.SIDEWALK);
                    continue;
                }

                // ==============================
                // BUILDINGS
                // ==============================
                setTile(tx, ty, TT.BUILDING);
            }
        }

        // Subdivide blocks with internal alleys
        generateAlleys(level);

        // Group TT.BUILDING tiles into logical building rectangles
        recordBuildings(level);

        buildSpawnPoints();
        buildCarLanes();

        return {
            tiles,
            buildingRecs,
            spawnPoints,
            carLanes
        };
    }

    // ── Alleys ───────────────────────────────────────────────

    function generateAlleys(level) {
        const alleyChance = Math.min(0.18 + level * 0.04, 0.35);
        
        // Very simple internal alley generation:
        // just randomly cut vertical and horizontal lines of TT.ALLEY through TT.BUILDING areas
        for (let ty = 0; ty < WT; ty++) {
            if (tiles[tileIdx(0, ty)] === TT.BUILDING || tiles[tileIdx(WT/2, ty)] === TT.BUILDING) {
                if (Math.random() < alleyChance * 0.2) {
                    for (let tx = 0; tx < WT; tx++) {
                        if (tiles[tileIdx(tx, ty)] === TT.BUILDING) setTile(tx, ty, TT.ALLEY);
                    }
                }
            }
        }
        for (let tx = 0; tx < WT; tx++) {
            if (tiles[tileIdx(tx, 0)] === TT.BUILDING || tiles[tileIdx(tx, WT/2)] === TT.BUILDING) {
                if (Math.random() < alleyChance * 0.2) {
                    for (let ty = 0; ty < WT; ty++) {
                        if (tiles[tileIdx(tx, ty)] === TT.BUILDING) setTile(tx, ty, TT.ALLEY);
                    }
                }
            }
        }
    }

    // ── Building recorder ────────────────────────────────────

    function recordBuildings(level) {
        const visited = new Uint8Array(WT * WT);

        for (let ty = 0; ty < WT; ty++) {
            for (let tx = 0; tx < WT; tx++) {
                const idx = tileIdx(tx, ty);
                if (tiles[idx] !== TT.BUILDING || visited[idx]) continue;

                // Greedy rectangle expansion
                let rx2 = tx, ry2 = ty;

                // Expand right
                while (rx2 + 1 < WT && tiles[tileIdx(rx2 + 1, ty)] === TT.BUILDING && !visited[tileIdx(rx2 + 1, ty)])
                    rx2++;

                // Expand down
                expand: while (ry2 + 1 < WT) {
                    for (let cx = tx; cx <= rx2; cx++) {
                        if (tiles[tileIdx(cx, ry2 + 1)] !== TT.BUILDING) break expand;
                    }
                    ry2++;
                }

                // Mark visited
                for (let cy = ty; cy <= ry2; cy++)
                    for (let cx = tx; cx <= rx2; cx++)
                        visited[tileIdx(cx, cy)] = 1;

                const bx = tx * TS, by = ty * TS;
                const bw = (rx2 - tx + 1) * TS;
                const bh = (ry2 - ty + 1) * TS;

                if (bw < TS || bh < TS) continue;

                const colorIdx = Math.floor(Math.random() * C.COLOR.BUILDING.length);
                buildingRecs.push({
                    x: bx, y: by, w: bw, h: bh,
                    colorIdx,
                    neon: Math.random() < 0.22,
                    neonColor: Math.random() < 0.5 ? '#ff28d7' : '#00edff',
                    windows: buildWindows(bx, by, bw, bh, level),
                    roofProps: buildRoofProps(bx, by, bw, bh)
                });
            }
        }
    }

    function buildRoofProps(bx, by, bw, bh) {
        const props = [];
        const count = Math.floor(Math.random() * 4);
        for (let i = 0; i < count; i++) {
            const w = 8 + Math.floor(Math.random() * 16);
            const h = 8 + Math.floor(Math.random() * 16);
            props.push({
                x: bx + 12 + Math.random() * Math.max(1, bw - w - 24),
                y: by + 12 + Math.random() * Math.max(1, bh - h - 24),
                w, h
            });
        }
        return props;
    }

    // ── Window generator ─────────────────────────────────────

    function buildWindows(bx, by, bw, bh, _level) {
        const padding = 5;
        const wStep   = 9;
        const wins    = [];
        const cols = Math.floor((bw - padding * 2) / wStep);
        const rows = Math.floor((bh - padding * 2) / wStep);

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (Math.random() < 0.55) {
                    wins.push({
                        x:    bx + padding + c * wStep,
                        y:    by + padding + r * wStep,
                        lit:  Math.random() < 0.72,
                        warm: Math.random() < 0.30,
                        mag:  Math.random() < 0.08
                    });
                }
            }
        }
        return wins;
    }

    // ── Spawn points ─────────────────────────────────────────

    function buildSpawnPoints() {
        spawnPoints = [];
        const step = 5;

        for (const rc of RC) {
            const py = (rc * TS) + Math.floor(TS / 2);
            for (let tx = 0; tx < WT; tx += step) {
                if (distToNearestRoadCenter(tx) > C.ROAD_HALF_TILES) {
                    spawnPoints.push({ x: tx * TS + TS / 2, y: py });
                }
            }
        }

        for (const rc of RC) {
            const px = (rc * TS) + Math.floor(TS / 2);
            for (let ty = 0; ty < WT; ty += step) {
                if (distToNearestRoadCenter(ty) > C.ROAD_HALF_TILES) {
                    spawnPoints.push({ x: px, y: ty * TS + TS / 2 });
                }
            }
        }
    }

    // ── Car lane descriptors ─────────────────────────────────

    function buildCarLanes() {
        carLanes = [];

        // Horizontal road -> two traffic lanes
        for (const rc of RC) {
            carLanes.push({ axis: 'h', y: (rc - 1.5) * TS + TS * 0.5, dir:  1 }); // top lane → right
            carLanes.push({ axis: 'h', y: (rc + 1.5) * TS + TS * 0.5, dir: -1 }); // bottom lane ← left
        }

        // Vertical road -> two traffic lanes
        for (const rc of RC) {
            carLanes.push({ axis: 'v', x: (rc - 1.5) * TS + TS * 0.5, dir:  1 }); // left lane ↓ down
            carLanes.push({ axis: 'v', x: (rc + 1.5) * TS + TS * 0.5, dir: -1 }); // right lane ↑ up
        }
    }

    // ══════════════════════════════════════════════════════════
    //  Public query API
    // ══════════════════════════════════════════════════════════

    function getTileAt(wx, wy) {
        const tx = Math.floor(wx / TS);
        const ty = Math.floor(wy / TS);
        if (tx < 0 || ty < 0 || tx >= WT || ty >= WT) return TT.BUILDING;
        return tiles[tileIdx(tx, ty)];
    }

    function isBlocked(wx, wy) {
        return getTileAt(wx, wy) === TT.BUILDING;
    }

    /** AABB collision check for the drone (square probe). */
    function isBlockedRect(cx, cy, r) {
        return isBlocked(cx - r, cy - r) ||
               isBlocked(cx + r, cy - r) ||
               isBlocked(cx - r, cy + r) ||
               isBlocked(cx + r, cy + r);
    }

    function isRoadAt(wx, wy) {
        const t = getTileAt(wx, wy);
        return t === TT.ROAD || t === TT.INTERSECTION;
    }

    function getRandomSpawnPoint() {
        return spawnPoints[Math.floor(Math.random() * spawnPoints.length)];
    }

    /** Pick a random spawn point that is at least `minDist` px from `refX,refY`. */
    function getRandomSpawnFar(refX, refY, minDist) {
        const filtered = spawnPoints.filter(p => {
            const dx = p.x - refX, dy = p.y - refY;
            return Math.sqrt(dx*dx+dy*dy) >= minDist;
        });
        const pool = filtered.length ? filtered : spawnPoints;
        return pool[Math.floor(Math.random() * pool.length)];
    }

    return {
        generate,
        getTileAt, isBlocked, isBlockedRect, isRoadAt,
        getRandomSpawnPoint, getRandomSpawnFar,
        get tiles()        { return tiles;        },
        get buildingRecs() { return buildingRecs; },
        get spawnPoints()  { return spawnPoints;  },
        get carLanes()     { return carLanes;     }
    };
})();
