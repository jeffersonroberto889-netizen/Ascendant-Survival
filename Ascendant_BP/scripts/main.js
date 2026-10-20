import { world, system } from "@minecraft/server";
import {
    isPickaxe, isAxe, isShovel, isHoe,
    openMiningMenu, openChopperMenu, openShovelMenu, openHoeMenu,
    HOE_MODES
} from "./utilities.js";
import { openMusicMenu } from "./music_player/ui.js";

function getEquippedTool(player) {
    const equippable = player.getComponent("minecraft:equippable");
    return equippable?.getEquipment("Mainhand") ?? null;
}

function handleToolMenu(player, item) {
    if (!player.isSneaking || !item) return;

    if (isPickaxe(item)) system.run(() => openMiningMenu(player));
    else if (isAxe(item)) system.run(() => openChopperMenu(player));
    else if (isShovel(item)) system.run(() => openShovelMenu(player));
    else if (isHoe(item)) system.run(() => openHoeMenu(player));
    else if (
        item.typeId.includes("compass") ||
        item.typeId.includes("clock") ||
        item.typeId.includes("record") ||
        item.typeId.includes("fishing_rod")
    ) {
        system.run(() => openMusicMenu(player));
    }
}

// Gatilho 1: Interação no ar
world.afterEvents.itemUse.subscribe(event => {
    handleToolMenu(event.source, event.itemStack);
});

// Gatilho 2: Agachar + Interagir com bloco
world.afterEvents.playerInteractWithBlock.subscribe(event => {
    const player = event.player;
    if (!player.isSneaking) return;
    const tool = getEquippedTool(player);
    if (!tool) return;

    const isTilling = isHoe(tool) && (player.getDynamicProperty("hoe_mode") ?? HOE_MODES.NORMAL) === HOE_MODES.AREA_3X3;
    if (!isTilling) {
        handleToolMenu(player, tool);
    }
});

// Tocador de Música: Agachar + Pular de mãos vazias
system.runInterval(() => {
    for (const player of world.getAllPlayers()) {
        if (!player.isSneaking) continue;

        const vel = player.getVelocity();
        if (vel.y <= 0.15) continue;

        const equippable = player.getComponent("minecraft:equippable");
        const heldItem = equippable?.getEquipment("Mainhand");

        if (!heldItem) {
            let lastOpen = 0;
            try {
                lastOpen = player.getDynamicProperty("spotify:last_menu_tick") ?? 0;
            } catch {
                lastOpen = 0;
            }

            const currentTick = system.currentTick;
            if (currentTick - lastOpen > 20) {
                try {
                    player.setDynamicProperty("spotify:last_menu_tick", currentTick);
                } catch {}
                system.run(() => openMusicMenu(player));
            }
        }
    }
}, 8);
