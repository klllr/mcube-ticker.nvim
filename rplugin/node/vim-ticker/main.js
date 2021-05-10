"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const ws_1 = __importDefault(require("ws"));
const uuid_1 = require("uuid");
const child_process_1 = require("child_process");
const os_1 = __importDefault(require("os"));
console.log(os_1.default.platform());
const CONFIG = {
    HOST: () => CONFIG.CUSTOM_HOST ? CONFIG.CUSTOM_HOST : CONFIG.IS_WSL ? child_process_1.execSync("cat /etc/resolv.conf | grep nameserver | cut -d ' ' -f 2").toString() : "localhost",
    CUSTOM_HOST: null,
    PORT: 7905,
    PORT2: 7906,
    DEVICE_ID: "neovim-ticker-" + uuid_1.v4().toString(),
    AUTHENTICATED: false,
    GLOBAL_VARAIBLE_PREFIX: "mcube_",
    IS_WSL: !!~child_process_1.execSync("cat /proc/version").indexOf("WSL"),
    VAR: () => CONFIG.CUSTOM_VAR ? CONFIG.CUSTOM_VAR : "SLTicker",
    CUSTOM_VAR: null,
    INTERVAL: 144,
    VIEW_SIZE: 20,
};
function get_artwork() { }
let vi;
function socket_init(s) {
    s.on("open", () => {
        s.send(JSON.stringify({ type: "request", name: "authenticate", id: uuid_1.v4(), device_id: CONFIG.DEVICE_ID, options: { password: "" } }));
    });
    s.on("message", (e) => {
        var _a;
        let msg = JSON.parse(e.toString());
        if (msg.name === "authenticate" && ((_a = msg.options) === null || _a === void 0 ? void 0 : _a.authenticated) && msg.type == "response") {
            CONFIG.AUTHENTICATED = true;
            ask_server(s);
            return;
        }
    });
    s.on("error", (e) => {
        console.error(e);
    });
}
function ask_server(s) {
    s.send(JSON.stringify({ type: "request", name: "get_playback_overview", id: uuid_1.v4(), device_id: CONFIG.DEVICE_ID, options: {} }));
}
function handler(t, s) {
    setInterval(function () {
        if (!s.OPEN || !CONFIG.AUTHENTICATED)
            return;
        ask_server(s);
    }, 10 * 1000);
    if (s.OPEN && CONFIG.AUTHENTICATED)
        ask_server(s);
    s.addEventListener("message", (e) => {
        let msg = JSON.parse(e.data);
        if ((msg.name !== "get_playback_overview" && msg.name !== "playback_overview_changed") || msg.type == "request")
            return;
        const pl = msg;
        t.track = pl.options.playing_track;
    });
}
class Text {
    constructor() {
        this.VIEW_SIZE = CONFIG.VIEW_SIZE;
        this.view = { cur: 0, size: this.VIEW_SIZE };
    }
    get name() {
        if (!this.track)
            return "lorem ipsum soimfj fdkl ssfs";
        const t = ":: " + this.track.artist + " — " + this.track.title + " ::";
        return (t + " ".repeat(this.VIEW_SIZE / 2 - 1)).repeat(5).trimEnd();
    }
    tick() {
        this.view.cur = this.view.cur >= this.name.length + this.VIEW_SIZE ? 0 : this.view.cur + 1;
    }
    get text() {
        let str = (" ".repeat(this.VIEW_SIZE) + this.name).slice(this.view.cur, this.view.cur + this.view.size);
        if (str.length < this.VIEW_SIZE)
            str += " ".repeat(this.VIEW_SIZE - str.length);
        return str;
    }
}
function ticker(T) {
    return setInterval(function () {
        vi.setVar(CONFIG.VAR(), T.text);
        T.tick();
    }, CONFIG.INTERVAL);
}
function get_variable(name, prefixed = true) {
    return vi.getVar((prefixed ? CONFIG.GLOBAL_VARAIBLE_PREFIX : "") + name);
}
async function init() {
    const config_promises = [];
    console.log("reading config");
    config_promises.push(get_variable("force_wsl").then(e => CONFIG.IS_WSL = e ? !!e : CONFIG.IS_WSL), get_variable("force_nowsl").then(e => CONFIG.IS_WSL = e ? false : CONFIG.IS_WSL), get_variable("host").then(e => CONFIG.CUSTOM_HOST = e.length > 0 ? e : null), get_variable("port").then(e => CONFIG.PORT = e ? e : CONFIG.PORT), get_variable("port2").then(e => CONFIG.PORT2 = e ? e : CONFIG.PORT2), get_variable("var").then(e => CONFIG.CUSTOM_VAR = e.length > 0 ? e : null), get_variable("interval").then(e => CONFIG.INTERVAL = e > 20 ? e : CONFIG.INTERVAL), get_variable("view").then(e => CONFIG.VIEW_SIZE = e ? e : CONFIG.VIEW_SIZE));
    await Promise.allSettled(config_promises);
    const socket = new ws_1.default(`ws://${CONFIG.HOST().trim()}:${CONFIG.PORT}/`);
    socket_init(socket);
    const T = new Text();
    handler(T, socket);
    ticker(T);
}
exports.default = (plugin) => {
    vi = plugin.nvim;
    plugin.registerAutocmd("VimEnter", init, { sync: false, pattern: "*" });
};
