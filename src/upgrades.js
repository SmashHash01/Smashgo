// ============================================================
//  NEON DELIVERY — upgrades.js
//  Upgrade definitions (v0.2 shop system — defs loaded in v0.1
//  so saving/loading upgrade state works from day one).
// ============================================================
NeonDelivery.Upgrades = (function () {
    const definitions = [
        {
            id:          'turbo_boost',
            name:        'Turbo Boost',
            icon:        '⚡',
            description: 'Faster & longer boost. Lower cooldown.',
            cost:        [150, 300, 500],
            maxLevel:    3,
            apply(drone, level) {
                const C = NeonDelivery.Config;
                drone.boostSpeedMult = C.BOOST_SPEED_MULT + level * 0.4;
                drone.boostDuration  = C.BOOST_DURATION   * (1 + level * 0.25);
                drone.boostCooldown  = C.BOOST_COOLDOWN   * (1 - level * 0.12);
            }
        },
        {
            id:          'extended_cell',
            name:        'Extended Cell',
            icon:        '🔋',
            description: 'Carry more boost charges.',
            cost:        [120, 260, 420],
            maxLevel:    3,
            apply(drone, level) {
                drone.boostCharges = 1 + level;
            }
        },
        {
            id:          'nano_shield',
            name:        'Nano Shield',
            icon:        '🛡️',
            description: 'Absorb one hit per run.',
            cost:        [200, 450],
            maxLevel:    2,
            apply(drone, level) {
                drone.shieldMax = level;
                if (drone.shields < level) drone.shields = level;
            }
        },
        {
            id:          'multi_carry',
            name:        'Multi-Carry',
            icon:        '📦',
            description: 'Carry 2 packages simultaneously.',
            cost:        [350],
            maxLevel:    1,
            apply(drone, _level) {
                drone.maxCarry = 2;
            }
        },
        {
            id:          'mag_lock',
            name:        'Mag-Lock',
            icon:        '🧲',
            description: 'Auto-collect packages within 80 px.',
            cost:        [280],
            maxLevel:    1,
            apply(drone, _level) {
                drone.magnetRange = 80;
            }
        },
        {
            id:          'clock_hack',
            name:        'Clock Hack',
            icon:        '⏱️',
            description: '+10 s per delivery.',
            cost:        [180, 380],
            maxLevel:    2,
            apply(drone, level) {
                drone.extraDeliveryTime = level * 10;
            }
        }
    ];

    function getDefinition(id) {
        return definitions.find(d => d.id === id) || null;
    }

    function getCost(id, currentLevel) {
        const def = getDefinition(id);
        if (!def || currentLevel >= def.maxLevel) return null;
        return def.cost[currentLevel];
    }

    /** Apply all owned upgrades to a drone instance. */
    function applyAll(drone, ownedUpgrades) {
        for (const [id, level] of Object.entries(ownedUpgrades || {})) {
            const def = getDefinition(id);
            if (def && level > 0) def.apply(drone, level);
        }
    }

    return { definitions, getDefinition, getCost, applyAll };
})();
