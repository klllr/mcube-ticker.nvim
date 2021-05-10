import { Neovim, NvimPlugin } from "neovim";
import { VimValue } from "neovim/lib/types/VimValue";
import WebSocket from "ws";
import { v4 } from "uuid";

import { execSync } from "child_process";
import os from "os";


console.log(os.platform())




const CONFIG = {
    HOST: () => CONFIG.CUSTOM_HOST ? CONFIG.CUSTOM_HOST : CONFIG.IS_WSL ? execSync("cat /etc/resolv.conf | grep nameserver | cut -d ' ' -f 2").toString() : "localhost",
    CUSTOM_HOST: <string | null> null,
    PORT: 7905,
    PORT2: 7906,
    DEVICE_ID: "neovim-ticker-" + v4().toString(),
    AUTHENTICATED: false,
    GLOBAL_VARAIBLE_PREFIX: "mcube_",
    IS_WSL: !!~execSync("cat /proc/version").indexOf("WSL"),
    VAR: () => CONFIG.CUSTOM_VAR ? CONFIG.CUSTOM_VAR : "SLTicker",
    CUSTOM_VAR: <string | null> null,
    INTERVAL: 144,
    VIEW_SIZE: 20,
};





function get_artwork() {} // @todo


let vi : Neovim;


interface Payload {
    type: "request" | "response" | "broadcast",
    id: string,
    name: string,
    device_id?: string,
    options?: {
        [key: string]: any,
    }
}




interface AuthPayload extends Payload {
    type: "request",
    name: "authenticate",
    options: {
        password: string,
    }
}


type Track = {
    id: number,
    external_id: string,
    title: string,
    track_num: number,
    album: string,
    album_id: number,
    album_artist: string,
    album_artist_id: number,
    thumbnail_id: number,
    artist: string,
    artist_id: number,
    genre: string,
    genre_id: number,
}


type Album = {
    id: number,
    title: string,
    thumbnail_id: number,
    album_artist: string,
    album_artist_id: number,
}

type Category = {
    id: number,
    value: string,
}


interface PlaybackPayload extends Playback {
    name: "get_playback_overview" | "playback_overview_changed",
    type: "response" | "broadcast",
    id: string,
    options: Playback
}

type Playback = {
    state: "stopped" | "playing" | "paused",
    repeat_mode: "none" | "track" | "list",
    volume: number,
    shuffled: boolean,
    muted: boolean,
    play_queue_count: number,
    play_queue_position: number,
    playing_duration: number,
    playing_current_time: number,
    playing_track: Track,

}




function socket_init (s: WebSocket) {
    s.on("open", () => {
        s.send(JSON.stringify(<AuthPayload>{ type: "request", name: "authenticate", id: v4(), device_id: CONFIG.DEVICE_ID, options: { password: "" } }));
    })

    s.on("message", (e) => {
        let msg: Payload = JSON.parse(e.toString());
        if (msg.name === "authenticate" && msg.options?.authenticated && msg.type == "response") { CONFIG.AUTHENTICATED = true; ask_server(s); return; }

    })

    s.on("error", (e) => {
        console.error(e);
    })
}


function ask_server (s: WebSocket) {
    s.send(JSON.stringify(<Payload>{ type: "request", name: "get_playback_overview", id: v4(), device_id: CONFIG.DEVICE_ID, options: {} }));
}

function handler (t: Text, s: WebSocket) {
    setInterval(function () {
        if (!s.OPEN || !CONFIG.AUTHENTICATED) return;
        ask_server(s);
    }, 10 * 1000)
    if (s.OPEN && CONFIG.AUTHENTICATED) ask_server(s);

    s.addEventListener("message", (e) => {
        let msg: Payload = JSON.parse(e.data);
        if ((msg.name !== "get_playback_overview" && msg.name as string !== "playback_overview_changed") || msg.type == "request") return;
        const pl = <PlaybackPayload> msg;
        t.track = pl.options.playing_track;
    })
}


class Text {
    track: Track | undefined;

    get name () {
        if (!this.track) return "lorem ipsum soimfj fdkl ssfs";
        const t = ":: " + this.track.artist + " — " + this.track.title + " ::";

        return (t + " ".repeat(this.VIEW_SIZE / 2 - 1)).repeat(5).trimEnd();
    }

    VIEW_SIZE = CONFIG.VIEW_SIZE;
    view = { cur: 0, size: this.VIEW_SIZE };

    tick () {
        this.view.cur = this.view.cur >= this.name.length + this.VIEW_SIZE ? 0 : this.view.cur + 1;
    }

    get text (): string {
        let str = (" ".repeat(this.VIEW_SIZE) + this.name).slice(this.view.cur, this.view.cur + this.view.size);
        if (str.length < this.VIEW_SIZE) str += " ".repeat(this.VIEW_SIZE - str.length);
        return str;
    }


}


function ticker (T: Text) {
    return setInterval(function () {
        vi.setVar(CONFIG.VAR(), T.text);
        T.tick();
    }, CONFIG.INTERVAL);
}

function get_variable (name: string, prefixed: boolean = true) : Promise<VimValue | Array<VimValue>> {
    return vi.getVar((prefixed ? CONFIG.GLOBAL_VARAIBLE_PREFIX : "") + name);
}

async function init () {
    const config_promises: Promise<VimValue | Array<VimValue> | null>[] = [];
    console.log("reading config");
    config_promises.push(
        get_variable("force_wsl").then(e => CONFIG.IS_WSL = e ? !!e : CONFIG.IS_WSL),
        get_variable("force_nowsl").then(e => CONFIG.IS_WSL = e ? false : CONFIG.IS_WSL),
        get_variable("host").then(e => CONFIG.CUSTOM_HOST = (e as string).length > 0 ? e as string : null),
        get_variable("port").then(e => CONFIG.PORT = e ? e as number : CONFIG.PORT),
        get_variable("port2").then(e => CONFIG.PORT2 = e ? e as number : CONFIG.PORT2),
        get_variable("var").then(e => CONFIG.CUSTOM_VAR = (e as string).length > 0 ? e as string : null),
        get_variable("interval").then(e => CONFIG.INTERVAL = e > 20 ? e as number : CONFIG.INTERVAL),
        get_variable("view").then(e => CONFIG.VIEW_SIZE = e ? e as number : CONFIG.VIEW_SIZE),
    );
    await Promise.allSettled(config_promises);
    const socket = new WebSocket(`ws://${CONFIG.HOST().trim()}:${CONFIG.PORT}/`); //
    socket_init(socket);
    const T = new Text();
    handler(T, socket);
    ticker(T);
}

export default (plugin: NvimPlugin) => {
    vi = plugin.nvim;
    plugin.registerAutocmd("VimEnter", init, { sync: false, pattern: "*" });
};
