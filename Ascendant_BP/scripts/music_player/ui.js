import { system } from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";
import {
    TRACKS, getCurrentTrackIndex, isPlaying, isShuffle, isRepeat,
    playTrack, stopTrack, nextTrack, prevTrack, toggleShuffle, toggleRepeat
} from "./player.js";

export function openMusicMenu(player) {
    const currentIdx = getCurrentTrackIndex(player);
    const active = isPlaying(player);
    const currentName = TRACKS[currentIdx]?.name ?? "Nenhuma";

    const form = new ActionFormData()
    .title({ translate: "ascendant.music.title" })
    .body(`Tocando: §e${currentName}§r\nStatus: §a${active ? "▶ Reproduzindo" : "⏸ Pausado"}§r | Shuffle: §b${isShuffle(player) ? "ON" : "OFF"}§r | Loop: §b${isRepeat(player) ? "ON" : "OFF"}§r`);

    form.button(active ? "⏸ Pausar" : "▶ Tocar", "textures/ui/play_glyph");
    form.button({ translate: "ascendant.music.next" }, "textures/ui/arrow_right");
    form.button({ translate: "ascendant.music.prev" }, "textures/ui/arrow_left");
    form.button({ translate: "ascendant.music.shuffle" }, "textures/ui/refresh");
    form.button({ translate: "ascendant.music.repeat" }, "textures/ui/repeat");
    form.button({ translate: "ascendant.music.stop" }, "textures/ui/cancel");

    for (let i = 0; i < TRACKS.length; i++) {
        const isThis = (i === currentIdx && active);
        form.button(`${isThis ? "▶ " : "🎵 "}${TRACKS[i].name}`, "textures/items/record_wait");
    }

    form.show(player).then(res => {
        if (res.canceled) return;

                           system.run(() => {
                               switch (res.selection) {
                                   case 0:
                                       active ? stopTrack(player) : playTrack(player, currentIdx);
                                       break;
                                   case 1:
                                       nextTrack(player);
                                       break;
                                   case 2:
                                       prevTrack(player);
                                       break;
                                   case 3:
                                       toggleShuffle(player);
                                       break;
                                   case 4:
                                       toggleRepeat(player);
                                       break;
                                   case 5:
                                       stopTrack(player);
                                       break;
                                   default: {
                                       const selectedTrackIdx = res.selection - 6;
                                       if (selectedTrackIdx >= 0 && selectedTrackIdx < TRACKS.length) {
                                           playTrack(player, selectedTrackIdx);
                                       }
                                       break;
                                   }
                               }
                           });
    }).catch(err => {
        // Trata fechamento por movimento ou interface ocupada sem travar o script
        console.warn(`[Ascendant] Falha ao renderizar menu de música: ${err}`);
    });
}
