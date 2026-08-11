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

    function onHRoad(ty) {
        return RC.some(rc => ty >= rc - RH && ty <= rc + RH);
    }
    function onVRoad(tx) {
        return RC.some(rc => tx >= rc - RH && tx <= rc + RH);
    }

    // ── Generate ─────────────────────────────────────────────

    function generate(level) {
        tiles        = new Uint8Array(WT * WT);
        buildingRecs = [];
        spawnPoints  = [];
        carLanes     = [];

        // 1. Roads & intersections
        for (let ty = 0; ty < WT; ty++) {
            for (let tx = 0; tx < WT; tx++) {
                const h = onHRoad(ty);
                const v = onVRoad(tx);
                if      (h && v) setTile(tx, ty, TT.INTERSECTION);
                else if (h || v) setTile(tx, ty, TT.ROAD);
                else             setTile(tx, ty, TT.BUILDING);
            }
        }

        // 2. Block boundaries
        //    blockStarts / blockEnds for x and y (same, world is square)
        const blockEdges = computeBlockEdges();

        // 3. Subdivide each block
        const alleyChance = Math.min(0.18 + level * 0.04, 0.35);
        for (let bx = 0; bx < blockEdges.starts.length; bx++) {
            for (let by = 0; by < blockEdges.starts.length; by++) {
                const x1 = blockEdges.starts[bx];
                const x2 = blockEdges.ends[bx];
                const y1 = blockEdges.starts[by];
                const y2 = blockEdges.ends[by];
                if (x1 > x2 || y1 > y2) continue;
                fillBlock(x1, y1, x2, y2, alleyChance, level);
            }
        }

        // 4. Spawn points (road-centre pixels, away from intersections)
        buildSpawnPoints();

        // 5. Car lanes
        buildCarLanes();

        return {
            tiles,
            buildingRecs,
            spawnPoints,
            carLanes
        };
    }

    // ── Block edge calculator ────────────────────────────────

    function computeBlockEdges() {
        const starts = [];
        const ends   = [];

        // First block: from tile 0 to first road - 2 (leaving 1-tile alley margin)
        let cursor = 0;
        starts.push(cursor);
        ends.push(RC[0] - RH - 1);

        for (let i = 0; i < RC.length - 1; i++) {
            cursor = RC[i] + RH + 1;
            starts.push(cursor);
            ends.push(RC[i + 1] - RH - 1);
        }

        // Last block
        cursor = RC[RC.length - 1] + RH + 1;
        starts.push(cursor);
        ends.push(WT - 1);

        return { starts, ends };
    }

    // ── Block filler ─────────────────────────────────────────

    function fillBlock(x1, y1, x2, y2, alleyChance, level) {
        const bw = x2 - x1 + 1;
        const bh = y2 - y1 + 1;
        if (bw < 1 || bh < 1) return;

        // Border rows/cols become alleys (allow drone to hug the wall of roads)
        for (let ty = y1; ty <= y2; ty++) {
            for (let tx = x1; tx <= x2; tx++) {
                const edge = (tx === x1 || tx === x2 || ty === y1 || ty === y2);
                setTile(tx, ty, edge ? TT.ALLEY : TT.BUILDING);
            }
        }

        // Optional internal horizontal alley
        if (bh > 4 && Math.random() < alleyChance) {
            const ay = y1 + 1 + Math.floor(Math.random() * (bh - 2));
            for (let tx = x1; tx <= x2; tx++) setTile(tx, ay, TT.ALLEY);
        }

        // Optional internal vertical alley
        if (bw > 4 && Math.random() < alleyChance) {
            const ax = x1 + 1 + Math.floor(Math.random() * (bw - 2));
            for (let ty = y1; ty <= y2; ty++) setTile(ax, ty, TT.ALLEY);
        }

        // Record building rects (scan connected BUILDING regions)
        recordBuildings(x1, y1, x2, y2, level);
    }

    // ── Building recorder ────────────────────────────────────

    function recordBuildings(x1, y1, x2, y2, level) {
        const visited = new Uint8Array(WT * WT);

        for (let ty = y1; ty <= y2; ty++) {
            for (let tx = x1; tx <= x2; tx++) {
                const idx = tileIdx(tx, ty);
                if (tiles[idx] !== TT.BUILDING || visited[idx]) continue;

                // Greedy rectangle expansion
                let rx2 = tx, ry2 = ty;

                // Expand right
                while (rx2 + 1 <= x2 && tiles[tileIdx(rx2 + 1, ty)] === TT.BUILDING && !visited[tileIdx(rx2 + 1, ty)])
                    rx2++;

                // Expand down
                expand: while (ry2 + 1 <= y2) {
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
                    windows: buildWindows(bx, by, bw, bh, level)
                });
            }
        }
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

        // Along horizontal road centres
        for (const rc of RC) {
            const py = (rc * TS) + Math.floor(TS / 2);
            for (let tx = 0; tx < WT; tx += step) {
                if (!onVRoad(tx)) {
                    spawnPoints.push({ x: tx * TS + TS / 2, y: py });
                }
            }
        }

        // Along vertical road centres
        for (const rc of RC) {
            const px = (rc * TS) + Math.floor(TS / 2);
            for (let ty = 0; ty < WT; ty += step) {
                if (!onHRoad(ty)) {
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
            carLanes.push({ axis: 'h', y: (rc - 1) * TS + TS * 0.5, dir:  1 }); // top lane → right
            carLanes.push({ axis: 'h', y: (rc + 1) * TS + TS * 0.5, dir: -1 }); // bottom lane ← left
        }

        // Vertical road -> two traffic lanes
        for (const rc of RC) {
            carLanes.push({ axis: 'v', x: (rc - 1) * TS + TS * 0.5, dir:  1 }); // left lane ↓ down
            carLanes.push({ axis: 'v', x: (rc + 1) * TS + TS * 0.5, dir: -1 }); // right lane ↑ up
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
