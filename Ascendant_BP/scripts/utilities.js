import { world, system } from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";

// ==========================================
// 1. CONSTANTES E CONTROLE DE ESTADO
// ==========================================
export const MINING_MODES = { NORMAL: "normal", VEIN: "vein", TUNNEL_3X3: "3x3", TUNNEL_1X2: "1x2" };
export const CHOPPER_MODES = { NORMAL: "normal", TREE: "tree", TREE_LEAVES: "leaves" };
export const SHOVEL_MODES = { NORMAL: "normal", AREA_3X3: "3x3" };
export const HOE_MODES = { NORMAL: "normal", AREA_3X3: "3x3" };
export const MAGNET_MODES = { OFF: "off", INSTANT: "instant", PULL: "pull" };

const PERFORMANCE_PROFILES = {
    POTATO: { id: "potato", batch: 1, interval: 2, label: "Pobre é Foda (0.5 bloco/tick)" },
    LOW:    { id: "low",    batch: 4, interval: 1, label: "Celular / Eco (4 blocos/tick)" },
    MEDIUM: { id: "medium", batch: 8, interval: 1, label: "Equilibrado (8 blocos/tick)" },
    HIGH:   { id: "high",   batch: 20, interval: 1, label: "Turbo / PC (20 blocos/tick)" }
};

const activeMiners = new Set();

// ==========================================
// 2. FUNÇÕES DE CHECAGEM
// ==========================================
export function isPickaxe(item) { return item ? item.typeId.includes("pickaxe") : false; }
export function isAxe(item) { return item ? item.typeId.includes("_axe") : false; }
export function isShovel(item) { return item ? item.typeId.includes("shovel") : false; }
export function isHoe(item) { return item ? item.typeId.includes("hoe") : false; }

function isLogOrWood(typeId) {
    if (!typeId) return false;
    return typeId.includes("_log") || typeId.includes("_wood") || 
           typeId.includes("stem") || typeId.includes("hyphae") || 
           typeId.includes("mangrove_roots");
}

function isLeaf(typeId) {
    if (!typeId) return false;
    return typeId.includes("leaves") || typeId.includes("leaf");
}

function isShovelable(typeId) {
    if (!typeId) return false;
    return typeId.includes("dirt") || typeId.includes("grass") || typeId.includes("sand") || 
           typeId.includes("gravel") || typeId.includes("clay") || typeId.includes("snow") || 
           typeId.includes("mud") || typeId.includes("soul_sand") || typeId.includes("soul_soil");
}

function isFoliageOrAir(typeId) {
    if (!typeId || typeId === "minecraft:air") return true;
    if (typeId.includes("grass_block")) return false;
    return typeId.includes("grass") || typeId.includes("flower") || typeId.includes("fern") || 
           typeId.includes("bush") || typeId.includes("sapling") || typeId.includes("tulip") || 
           typeId.includes("rose") || typeId.includes("dandelion") || typeId.includes("poppy") || 
           typeId.includes("snow_layer");
}

function isProtectedBlock(typeId) {
    if (!typeId) return true;
    if (typeId.includes("ore") || typeId === "minecraft:ancient_debris" || typeId.includes("raw_")) return true;
    if (typeId === "minecraft:bedrock" || 
        typeId.includes("portal") || 
        typeId.includes("spawner") || 
        typeId.includes("chest") || 
        typeId.includes("shulker") || 
        typeId.includes("barrel") || 
        typeId.includes("hopper")) return true;
    return false;
}

function getEquippedTool(player) {
    const equippable = player.getComponent("minecraft:equippable");
    return equippable?.getEquipment("Mainhand") ?? null;
}

function getPlayerProfile(player) {
    const savedId = player.getDynamicProperty("mine_speed_profile") ?? "medium";
    return Object.values(PERFORMANCE_PROFILES).find(p => p.id === savedId) ?? PERFORMANCE_PROFILES.MEDIUM;
}

function getMagnetMode(player) {
    return player.getDynamicProperty("magnet_mode") ?? MAGNET_MODES.OFF;
}

function isDurabilityCritical(tool, player) {
    if (!tool) return false;
    const durability = tool.getComponent("minecraft:durability");
    if (!durability) return false;

    const remaining = durability.maxDurability - durability.damage;
    if (remaining <= 5) {
        player.onScreenDisplay.setActionBar(`§c⚠️ AVISO: Durabilidade crítica (${remaining})! Modo em área bloqueado.`);
        return true;
    }
    return false;
}

function applyToolDamage(player, amount = 1) {
    const equippable = player.getComponent("minecraft:equippable");
    if (!equippable) return;
    const tool = equippable.getEquipment("Mainhand");
    if (!tool) return;

    const durability = tool.getComponent("minecraft:durability");
    if (!durability) return;

    if (durability.damage + amount >= durability.maxDurability) {
        equippable.setEquipment("Mainhand", undefined);
        player.playSound("random.break");
    } else {
        durability.damage += amount;
        equippable.setEquipment("Mainhand", tool);
    }
}

// ==========================================
// 3. ÍMÃ DE ITENS OTIMIZADO (1 BUSCA GLOBAL)
// ==========================================
function triggerMagnetFast(dimension, player) {
    const mode = getMagnetMode(player);
    if (mode === MAGNET_MODES.OFF) return;

    system.run(() => {
        if (!player.isValid()) return;
        const pLoc = player.location;
        const targetPos = { x: pLoc.x, y: pLoc.y + 0.5, z: pLoc.z };

        // Realiza apenas UMA busca leve no raio do jogador
        const items = dimension.getEntities({
            type: "minecraft:item",
            location: pLoc,
            maxDistance: 12.0
        });

        for (const it of items) {
            if (!it.isValid()) continue;

            if (mode === MAGNET_MODES.INSTANT) {
                it.teleport(targetPos);
            } else if (mode === MAGNET_MODES.PULL) {
                const curr = it.location;
                const dx = targetPos.x - curr.x;
                const dy = targetPos.y - curr.y;
                const dz = targetPos.z - curr.z;
                const distSq = dx * dx + dy * dy + dz * dz;

                if (distSq <= 2.25) {
                    it.teleport(targetPos);
                } else {
                    it.teleport({
                        x: curr.x + dx * 0.45,
                        y: curr.y + dy * 0.45 + 0.1,
                        z: curr.z + dz * 0.45
                    });
                }
            }
        }
    });
}

// ==========================================
// 4. MOTOR DE QUEBRA EM CASCATA
// ==========================================
function breakBlockSafe(dimension, loc) {
    try {
        const target = dimension.getBlock(loc);
        if (!target || target.isAir) return false;
        const type = target.typeId;
        if (type === "minecraft:bedrock" || type.includes("water") || type.includes("lava")) return false;

        dimension.runCommand(`setblock ${loc.x} ${loc.y} ${loc.z} air destroy`);
        return true;
    } catch {
        return false;
    }
}

function breakGradually(dimension, player, blocks, profile) {
    if (!blocks || blocks.length === 0) {
        activeMiners.delete(player.id);
        return;
    }

    const batchSize = profile.batch ?? 8;
    const intervalTicks = profile.interval ?? 1;
    let index = 0;

    const runner = system.runInterval(() => {
        const tool = getEquippedTool(player);
        if (!player.isValid() || isDurabilityCritical(tool, player)) {
            system.clearRun(runner);
            activeMiners.delete(player.id);
            return;
        }

        const end = Math.min(index + batchSize, blocks.length);
        let brokenCount = 0;

        for (let i = index; i < end; i++) {
            if (breakBlockSafe(dimension, blocks[i])) {
                brokenCount++;
            }
        }

        if (brokenCount > 0) applyToolDamage(player, brokenCount);
        index = end;

        if (brokenCount > 0) {
            triggerMagnetFast(dimension, player);
        }

        if (index >= blocks.length) {
            system.clearRun(runner);
            activeMiners.delete(player.id);
        }
    }, intervalTicks);
}

function mineVein(dimension, player, startLoc, targetBlockType, profile) {
    const isTargetOre = targetBlockType.includes("ore") || targetBlockType === "minecraft:ancient_debris";
    const isTargetWood = isLogOrWood(targetBlockType);

    if (!isTargetOre && !isTargetWood) {
        activeMiners.delete(player.id);
        return;
    }

    const queue = [startLoc];
    const visited = new Set([`${startLoc.x},${startLoc.y},${startLoc.z}`]);
    const oresToBreak = [];
    const MAX_BLOCKS = 48;

    while (queue.length > 0 && oresToBreak.length < MAX_BLOCKS) {
        const current = queue.shift();

        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                for (let dz = -1; dz <= 1; dz++) {
                    if (dx === 0 && dy === 0 && dz === 0) continue;

                    const nextLoc = { x: current.x + dx, y: current.y + dy, z: current.z + dz };
                    const key = `${nextLoc.x},${nextLoc.y},${nextLoc.z}`;
                    if (visited.has(key)) continue;
                    visited.add(key);

                    const neighbor = dimension.getBlock(nextLoc);
                    if (!neighbor || neighbor.isAir) continue;

                    const isMatch = neighbor.typeId === targetBlockType || 
                        (targetBlockType.includes("deepslate") && neighbor.typeId === targetBlockType.replace("deepslate_", "")) ||
                        (!targetBlockType.includes("deepslate") && neighbor.typeId === targetBlockType.replace("minecraft:", "minecraft:deepslate_"));

                    if (isMatch) {
                        oresToBreak.push(nextLoc);
                        queue.push(nextLoc);
                    }
                }
            }
        }
    }

    breakGradually(dimension, player, oresToBreak, profile);
}

function fellTree(dimension, player, startLoc, breakLeaves, profile) {
    const queue = [startLoc];
    const visited = new Set([`${startLoc.x},${startLoc.y},${startLoc.z}`]);
    const logsToBreak = [];
    const maxLogs = 128;

    // Foco estrito no tronco vertical/adjacente para evitar loops desnecessários
    while (queue.length > 0 && logsToBreak.length < maxLogs) {
        const curr = queue.shift();

        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = 0; dy <= 1; dy++) {
                for (let dz = -1; dz <= 1; dz++) {
                    if (dx === 0 && dy === 0 && dz === 0) continue;
                    const next = { x: curr.x + dx, y: curr.y + dy, z: curr.z + dz };
                    const key = `${next.x},${next.y},${next.z}`;

                    if (!visited.has(key)) {
                        visited.add(key);
                        const blk = dimension.getBlock(next);
                        if (!blk || blk.isAir) continue;

                        if (isLogOrWood(blk.typeId)) {
                            queue.push(next);
                            logsToBreak.push(next);
                        }
                    }
                }
            }
        }
    }

    const leavesToBreak = [];
    if (breakLeaves && logsToBreak.length > 0) {
        let maxY = startLoc.y;
        for (const log of logsToBreak) {
            if (log.y > maxY) maxY = log.y;
        }

        const topCenter = logsToBreak.find(l => l.y === maxY) ?? startLoc;
        const leafRadius = 3;
        const maxLeaves = 128;

        for (let dx = -leafRadius; dx <= leafRadius; dx++) {
            for (let dz = -leafRadius; dz <= leafRadius; dz++) {
                for (let dy = -1; dy <= 3; dy++) {
                    if (leavesToBreak.length >= maxLeaves) break;
                    const loc = { x: topCenter.x + dx, y: maxY + dy, z: topCenter.z + dz };
                    const blk = dimension.getBlock(loc);
                    if (blk && isLeaf(blk.typeId)) {
                        leavesToBreak.push(loc);
                    }
                }
            }
        }
    }

    logsToBreak.sort((a, b) => a.y - b.y);
    const finalBlocks = [...logsToBreak, ...leavesToBreak];
    breakGradually(dimension, player, finalBlocks, profile);
}

function mineGeneric3x3(dimension, player, centerLoc, filterFn) {
    const rot = player.getRotation();
    const pitch = rot.x;
    const yaw = ((rot.y % 360) + 360) % 360;
    const toBreak = [];

    if (pitch > 45 || pitch < -45) {
        for (let dx = -1; dx <= 1; dx++) {
            for (let dz = -1; dz <= 1; dz++) {
                if (dx === 0 && dz === 0) continue;
                const loc = { x: centerLoc.x + dx, y: centerLoc.y, z: centerLoc.z + dz };
                const blk = dimension.getBlock(loc);
                if (blk && filterFn(blk.typeId)) toBreak.push(loc);
            }
        }
    } else {
        const isNorthSouth = (yaw >= 315 || yaw < 45 || (yaw >= 135 && yaw < 225));
        for (let dy = -1; dy <= 1; dy++) {
            for (let dHorizontal = -1; dHorizontal <= 1; dHorizontal++) {
                if (dy === 0 && dHorizontal === 0) continue;
                const loc = isNorthSouth
                    ? { x: centerLoc.x + dHorizontal, y: centerLoc.y + dy, z: centerLoc.z }
                    : { x: centerLoc.x, y: centerLoc.y + dy, z: centerLoc.z + dHorizontal };
                
                const blk = dimension.getBlock(loc);
                if (blk && filterFn(blk.typeId)) toBreak.push(loc);
            }
        }
    }

    breakGradually(dimension, player, toBreak, getPlayerProfile(player));
}

function mineTunnel1x2Straight(dimension, player, center) {
    const profile = getPlayerProfile(player);
    const playerY = Math.floor(player.location.y);
    const viewDir = player.getViewDirection();

    let forward = { dx: 0, dz: 0 };
    if (Math.abs(viewDir.x) > Math.abs(viewDir.z)) {
        forward.dx = viewDir.x > 0 ? 1 : -1;
    } else {
        forward.dz = viewDir.z > 0 ? 1 : -1;
    }

    const baseY = (center.y >= playerY + 1) ? center.y - 1 : center.y;
    const blocksToBreak = [];

    for (let step = 0; step < 10; step++) {
        const x = center.x + forward.dx * step;
        const z = center.z + forward.dz * step;

        for (let dy = 0; dy <= 1; dy++) {
            const loc = { x: x, y: baseY + dy, z: z };
            if (loc.x === center.x && loc.y === center.y && loc.z === center.z) continue;

            const block = dimension.getBlock(loc);
            if (!block || block.isAir) continue;
            
            const typeId = block.typeId;
            if (isProtectedBlock(typeId) || typeId.includes("water") || typeId.includes("lava")) continue;

            blocksToBreak.push(loc);
        }
    }

    breakGradually(dimension, player, blocksToBreak, profile);
}

// ==========================================
// 5. MENUS
// ==========================================
function openMagnetMenu(player, returnCallback) {
    const current = getMagnetMode(player);
    let label = "Desativado";
    if (current === MAGNET_MODES.INSTANT) label = "Instantâneo (Pés)";
    if (current === MAGNET_MODES.PULL) label = "Atração Suave (Flutuando)";

    new ActionFormData()
        .title("🧲 Configuração do Ímã")
        .body(`Modo Atual: §e${label}§r\n\nEscolha como os itens escavados devem vir até você:`)
        .button("❌ Desativado\nItens caem no chão", "textures/ui/cancel")
        .button("⚡ Instantâneo\nTeleporta para os pés", "textures/items/ender_pearl")
        .button("🧲 Atração Suave\nItens flutuam até você", "textures/items/iron_ingot")
        .button("⬅️ Voltar", "textures/ui/cancel")
        .show(player).then(res => {
            if (res.canceled) return;
            const modes = [MAGNET_MODES.OFF, MAGNET_MODES.INSTANT, MAGNET_MODES.PULL];
            if (res.selection >= 0 && res.selection <= 2) {
                player.setDynamicProperty("magnet_mode", modes[res.selection]);
                player.onScreenDisplay.setActionBar(`§aÍmã: §e${modes[res.selection].toUpperCase()}`);
                player.playSound("random.orb", { pitch: 1.2, volume: 0.8 });
            } else if (res.selection === 3 && returnCallback) {
                system.run(() => returnCallback(player));
            }
        });
}

function openPerformanceMenu(player, returnCallback) {
    const currentProfile = getPlayerProfile(player);

    new ActionFormData()
        .title("⚙️ Ajuste de Desempenho")
        .body(`Perfil Atual: §e${currentProfile.label}§r\n\nVelocidade de quebra contra travamentos:\n`)
        .button("🥔 Pobre é Foda (0.5 bloco/tick)\n1 bloco a cada 2 ticks - Salva o J4!", "textures/items/potato")
        .button("📱 Celular / Eco (4 blocos/tick)\n~80 blocos/s - Máxima estabilidade", "textures/items/apple")
        .button("⚖️ Equilibrado (8 blocos/tick)\n~160 blocos/s - [PADRÃO]", "textures/items/iron_ingot")
        .button("🚀 Turbo / PC (20 blocos/tick)\n~400 blocos/s - Máquinas fortes", "textures/items/diamond")
        .button("⬅️ Voltar", "textures/ui/cancel")
        .show(player).then(res => {
            if (res.canceled) return;
            const profiles = [PERFORMANCE_PROFILES.POTATO, PERFORMANCE_PROFILES.LOW, PERFORMANCE_PROFILES.MEDIUM, PERFORMANCE_PROFILES.HIGH];
            if (res.selection >= 0 && res.selection < profiles.length) {
                const chosen = profiles[res.selection];
                player.setDynamicProperty("mine_speed_profile", chosen.id);
                player.onScreenDisplay.setActionBar(`§aDesempenho: §e${chosen.label}`);
                player.playSound("random.orb", { pitch: 1.2, volume: 0.8 });
            } else if (res.selection === 4 && returnCallback) {
                system.run(() => returnCallback(player));
            }
        });
}

export function openMiningMenu(player) {
    const current = player.getDynamicProperty("mining_mode") ?? MINING_MODES.NORMAL;
    new ActionFormData()
        .title("Configuração de Mineração")
        .body(`Modo Atual: §e${current.toUpperCase()}§r`)
        .button("§cDesativado (Normal 1x1)§r", "textures/ui/cancel")
        .button("§bVein Miner (Cascata)§r", "textures/items/diamond")
        .button("§6Túnel 3x3§r", "textures/items/iron_pickaxe")
        .button("§aTúnel Reto (10 Blocos)§r", "textures/items/stone_pickaxe")
        .button("🧲 Configurar Ímã", "textures/items/iron_ingot")
        .button("⚙️ Desempenho", "textures/items/compass_item")
        .show(player).then(res => {
            if (res.canceled) return;
            if (res.selection === 4) { system.run(() => openMagnetMenu(player, openMiningMenu)); return; }
            if (res.selection === 5) { system.run(() => openPerformanceMenu(player, openMiningMenu)); return; }

            const modes = [MINING_MODES.NORMAL, MINING_MODES.VEIN, MINING_MODES.TUNNEL_3X3, MINING_MODES.TUNNEL_1X2];
            const sel = modes[res.selection] ?? MINING_MODES.NORMAL;
            player.setDynamicProperty("mining_mode", sel);
            player.onScreenDisplay.setActionBar(`§aMineração: §e${sel.toUpperCase()}`);
            player.playSound("random.orb", { pitch: 1.2, volume: 0.8 });
        });
}

export function openChopperMenu(player) {
    const current = player.getDynamicProperty("chopper_mode") ?? CHOPPER_MODES.NORMAL;
    new ActionFormData()
        .title("Configuração de Lenhador")
        .body(`Modo Atual: §e${current.toUpperCase()}§r`)
        .button("§cDesativado (Normal 1x1)§r", "textures/ui/cancel")
        .button("§6Derrubar Árvore Inteira§r\nSuporte a Better Trees", "textures/items/iron_axe")
        .button("§aÁrvore + Folhas§r\nDerruba tronco e limpa copa", "textures/items/diamond_axe")
        .button("🧲 Configurar Ímã", "textures/items/iron_ingot")
        .button("⚙️ Desempenho", "textures/items/compass_item")
        .show(player).then(res => {
            if (res.canceled) return;
            if (res.selection === 3) { system.run(() => openMagnetMenu(player, openChopperMenu)); return; }
            if (res.selection === 4) { system.run(() => openPerformanceMenu(player, openChopperMenu)); return; }

            const modes = [CHOPPER_MODES.NORMAL, CHOPPER_MODES.TREE, CHOPPER_MODES.TREE_LEAVES];
            const sel = modes[res.selection] ?? CHOPPER_MODES.NORMAL;
            player.setDynamicProperty("chopper_mode", sel);
            player.onScreenDisplay.setActionBar(`§aLenhador: §e${sel.toUpperCase()}`);
            player.playSound("random.orb", { pitch: 1.2, volume: 0.8 });
        });
}

export function openShovelMenu(player) {
    new ActionFormData()
        .title("Configuração da Pá")
        .button("§cDesativado (Normal 1x1)§r", "textures/ui/cancel")
        .button("§6Escavação 3x3§r\nTerra, areia, cascalho, argila", "textures/items/iron_shovel")
        .button("🧲 Configurar Ímã", "textures/items/iron_ingot")
        .button("⚙️ Desempenho", "textures/items/compass_item")
        .show(player).then(res => {
            if (res.canceled) return;
            if (res.selection === 2) { system.run(() => openMagnetMenu(player, openShovelMenu)); return; }
            if (res.selection === 3) { system.run(() => openPerformanceMenu(player, openShovelMenu)); return; }

            const sel = res.selection === 1 ? SHOVEL_MODES.AREA_3X3 : SHOVEL_MODES.NORMAL;
            player.setDynamicProperty("shovel_mode", sel);
            player.onScreenDisplay.setActionBar(`§aPá: §e${sel.toUpperCase()}`);
            player.playSound("random.orb", { pitch: 1.2, volume: 0.8 });
        });
}

export function openHoeMenu(player) {
    new ActionFormData()
        .title("Configuração da Enxada")
        .button("§cDesativado (Normal 1x1)§r", "textures/ui/cancel")
        .button("§aAgricultura 3x3§r\nAra e colhe 9 blocos por vez", "textures/items/iron_hoe")
        .button("🧲 Configurar Ímã", "textures/items/iron_ingot")
        .show(player).then(res => {
            if (res.canceled) return;
            if (res.selection === 2) { system.run(() => openMagnetMenu(player, openHoeMenu)); return; }

            const sel = res.selection === 1 ? HOE_MODES.AREA_3X3 : HOE_MODES.NORMAL;
            player.setDynamicProperty("hoe_mode", sel);
            player.onScreenDisplay.setActionBar(`§aEnxada: §e${sel.toUpperCase()}`);
            player.playSound("random.orb", { pitch: 1.2, volume: 0.8 });
        });
}

// ==========================================
// 6. GATILHOS EXCLUSIVOS
// ==========================================
world.afterEvents.playerInteractWithBlock.subscribe(event => {
    const player = event.player;
    const tool = getEquippedTool(player);
    const block = event.block;

    if (!isHoe(tool)) return;
    if ((player.getDynamicProperty("hoe_mode") ?? HOE_MODES.NORMAL) !== HOE_MODES.AREA_3X3) return;
    if (isDurabilityCritical(tool, player)) return;

    const dimension = block.dimension ?? player.dimension;
    const t = block.typeId;

    if (t.includes("farmland") || t.includes("dirt") || t.includes("grass")) {
        system.run(() => {
            let tilledCount = 0;

            for (let dx = -1; dx <= 1; dx++) {
                for (let dz = -1; dz <= 1; dz++) {
                    if (dx === 0 && dz === 0) continue;
                    const loc = { x: block.location.x + dx, y: block.location.y, z: block.location.z + dz };
                    const target = dimension.getBlock(loc);
                    const above = dimension.getBlock({ x: loc.x, y: loc.y + 1, z: loc.z });
                    
                    if (target && (target.typeId.includes("dirt") || target.typeId.includes("grass")) && isFoliageOrAir(above?.typeId)) {
                        if (above && !above.isAir) {
                            dimension.runCommand(`setblock ${loc.x} ${loc.y + 1} ${loc.z} air destroy`);
                        }
                        dimension.runCommand(`setblock ${loc.x} ${loc.y} ${loc.z} farmland`);
                        tilledCount++;
                    }
                }
            }

            if (tilledCount > 0) applyToolDamage(player, tilledCount);
            triggerMagnetFast(dimension, player);
        });
    }
});

world.afterEvents.playerBreakBlock.subscribe(event => {
    const player = event.player;
    if (activeMiners.has(player.id)) return;

    const tool = getEquippedTool(player);
    if (!tool || isDurabilityCritical(tool, player)) return;

    const brokenType = event.brokenBlockPermutation.type.id;
    const blockLoc = {
        x: Math.floor(event.block.location.x),
        y: Math.floor(event.block.location.y),
        z: Math.floor(event.block.location.z)
    };
    const dimension = event.dimension;
    const profile = getPlayerProfile(player);

    if (isPickaxe(tool)) {
        const mode = player.getDynamicProperty("mining_mode") ?? MINING_MODES.NORMAL;
        if (mode === MINING_MODES.NORMAL) return;

        activeMiners.add(player.id);
        system.run(() => {
            if (mode === MINING_MODES.VEIN) mineVein(dimension, player, blockLoc, brokenType, profile);
            else if (mode === MINING_MODES.TUNNEL_3X3) mineGeneric3x3(dimension, player, blockLoc, () => true);
            else if (mode === MINING_MODES.TUNNEL_1X2) mineTunnel1x2Straight(dimension, player, blockLoc);
        });
    }
    else if (isAxe(tool) && isLogOrWood(brokenType)) {
        const chopMode = player.getDynamicProperty("chopper_mode") ?? CHOPPER_MODES.NORMAL;
        if (chopMode === CHOPPER_MODES.NORMAL) return;

        activeMiners.add(player.id);
        system.run(() => {
            fellTree(dimension, player, blockLoc, chopMode === CHOPPER_MODES.TREE_LEAVES, profile);
        });
    }
    else if (isShovel(tool) && isShovelable(brokenType)) {
        const shovelMode = player.getDynamicProperty("shovel_mode") ?? SHOVEL_MODES.NORMAL;
        if (shovelMode === SHOVEL_MODES.AREA_3X3) {
            activeMiners.add(player.id);
            system.run(() => {
                mineGeneric3x3(dimension, player, blockLoc, isShovelable);
            });
        }
    }
    else if (isHoe(tool) && (
        brokenType.includes("leaves") ||
        brokenType.includes("wheat") ||
        brokenType.includes("carrot") ||
        brokenType.includes("potato") ||
        brokenType.includes("beetroot")
    )) {
        const hoeMode = player.getDynamicProperty("hoe_mode") ?? HOE_MODES.NORMAL;
        if (hoeMode === HOE_MODES.AREA_3X3) {
            activeMiners.add(player.id);
            system.run(() => {
                mineGeneric3x3(dimension, player, blockLoc, () => true);
            });
        }
    }
});
