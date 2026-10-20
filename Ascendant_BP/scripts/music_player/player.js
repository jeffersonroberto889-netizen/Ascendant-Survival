import { system } from "@minecraft/server";

export const TRACKS = [
    { id: "aria_math_01", name: "C418 - Aria Math (Remix 01)", sound: "music.aria_math_01" },
    { id: "aria_math_02", name: "C418 - Aria Math (Remix 02)", sound: "music.aria_math_02" },
    { id: "aria_math_03", name: "C418 - Aria Math (Remix 03)", sound: "music.aria_math_03" },
    { id: "aria_math_04", name: "C418 - Aria Math (Remix 04)", sound: "music.aria_math_04" },
    { id: "aria_math_05", name: "C418 - Aria Math (Remix 05)", sound: "music.aria_math_05" },
    { id: "aria_math_06", name: "C418 - Aria Math (Remix 06)", sound: "music.aria_math_06" },
    { id: "aria_math_07", name: "C418 - Aria Math (Remix 07)", sound: "music.aria_math_07" },
    { id: "aria_math_08", name: "C418 - Aria Math (Remix 08)", sound: "music.aria_math_08" },
    { id: "aria_math_09", name: "C418 - Aria Math (Remix 09)", sound: "music.aria_math_09" },
    { id: "aria_math_10", name: "C418 - Aria Math (Remix 10)", sound: "music.aria_math_10" },
    { id: "aria_math_11", name: "C418 - Aria Math (Remix 11)", sound: "music.aria_math_11" },
    { id: "aria_math_12", name: "C418 - Aria Math (Remix 12)", sound: "music.aria_math_12" },
    { id: "aria_math_13", name: "C418 - Aria Math (Remix 13)", sound: "music.aria_math_13" },
    { id: "aria_math_14", name: "C418 - Aria Math (Remix 14)", sound: "music.aria_math_14" },
    { id: "aria_math_15", name: "C418 - Aria Math (Remix 15)", sound: "music.aria_math_15" },
    { id: "aria_math_16", name: "C418 - Aria Math (Remix 16)", sound: "music.aria_math_16" },
    { id: "aria_math_17", name: "C418 - Aria Math (Remix 17)", sound: "music.aria_math_17" },
    { id: "aria_math_18", name: "C418 - Aria Math (Remix 18)", sound: "music.aria_math_18" },
    { id: "aria_math_19", name: "C418 - Aria Math (Remix 19)", sound: "music.aria_math_19" },
    { id: "aria_math_20", name: "C418 - Aria Math (Remix 20)", sound: "music.aria_math_20" },
    { id: "aria_math_21", name: "C418 - Aria Math (Remix 21)", sound: "music.aria_math_21" },
    { id: "aria_math_22", name: "C418 - Aria Math (Remix 22)", sound: "music.aria_math_22" },
    { id: "aria_math_23", name: "C418 - Aria Math (Remix 23)", sound: "music.aria_math_23" },
    { id: "aria_math_24", name: "C418 - Aria Math (Remix 24)", sound: "music.aria_math_24" },
    { id: "aria_math_25", name: "C418 - Aria Math (Remix 25)", sound: "music.aria_math_25" },
    { id: "aria_math_26", name: "C418 - Aria Math (Remix 26)", sound: "music.aria_math_26" },
    { id: "aria_math_27", name: "C418 - Aria Math (Remix 27)", sound: "music.aria_math_27" },
    { id: "aria_math_28", name: "C418 - Aria Math (Remix 28)", sound: "music.aria_math_28" },
    { id: "jackpot", name: "TheFatRat - Jackpot", sound: "music.jackpot" }
];

export function getCurrentTrackIndex(player) {
    return player.getDynamicProperty("spotify:track_idx") ?? 0;
}

export function isPlaying(player) {
    return player.getDynamicProperty("spotify:is_playing") ?? false;
}

export function isShuffle(player) {
    return player.getDynamicProperty("spotify:shuffle") ?? false;
}

export function isRepeat(player) {
    return player.getDynamicProperty("spotify:repeat") ?? true;
}

export function stopTrack(player) {
    try { player.stopMusic(); } catch {}
    // Para apenas o canal de música sem silenciar passos, ambiente e efeitos
    try { player.dimension.runCommand(`stopsound "${player.name}" music`); } catch {}

    player.setDynamicProperty("spotify:is_playing", false);
    player.onScreenDisplay.setActionBar({ rawtext: [{ translate: "ascendant.music.paused" }] });
}

export function playTrack(player, index) {
    if (index < 0 || index >= TRACKS.length) index = 0;
    const track = TRACKS[index];

    try { player.stopMusic(); } catch {}
    try { player.dimension.runCommand(`stopsound "${player.name}" music`); } catch {}

    player.setDynamicProperty("spotify:track_idx", index);
    player.setDynamicProperty("spotify:is_playing", true);

    try {
        player.playMusic(track.sound, { volume: 1.0, fade: 0.0, loop: false });
    } catch {
        try {
            player.dimension.runCommand(`music play ${track.sound} 1.0 0.0`);
        } catch {}
    }

    try {
        player.playSound("random.orb", { pitch: 1.5, volume: 0.6 });
    } catch {}

    player.onScreenDisplay.setActionBar({
        rawtext: [
            { translate: "ascendant.music.now_playing", with: [track.name] }
        ]
    });
}

export function nextTrack(player) {
    let current = getCurrentTrackIndex(player);
    if (isShuffle(player) && TRACKS.length > 1) {
        let nextIdx;
        do {
            nextIdx = Math.floor(Math.random() * TRACKS.length);
        } while (nextIdx === current);
        current = nextIdx;
    } else {
        current = (current + 1) % TRACKS.length;
    }
    playTrack(player, current);
}

export function prevTrack(player) {
    let current = getCurrentTrackIndex(player);
    current = (current - 1 + TRACKS.length) % TRACKS.length;
    playTrack(player, current);
}

export function toggleShuffle(player) {
    const next = !isShuffle(player);
    player.setDynamicProperty("spotify:shuffle", next);
    player.onScreenDisplay.setActionBar({ rawtext: [{ translate: "ascendant.action.mode_updated", with: ["Aleatório", next ? "ATIVADO" : "DESATIVADO"] }] });
}

export function toggleRepeat(player) {
    const next = !isRepeat(player);
    player.setDynamicProperty("spotify:repeat", next);
    player.onScreenDisplay.setActionBar({ rawtext: [{ translate: "ascendant.action.mode_updated", with: ["Repetir", next ? "ATIVADO" : "DESATIVADO"] }] });
}
