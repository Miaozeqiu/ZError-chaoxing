"use strict";
var ZErrorSiteScript = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/login/index.js
  var login_exports = {};
  __export(login_exports, {
    run: () => run,
    workflow: () => workflow
  });
  function run(input) {
    if (input.operation === "observe") return observation(input);
    const { kind, host, modern, frameReady } = input;
    if (kind === "space" && ["i.chaoxing.com", "i.mooc.chaoxing.com"].includes(host)) return "logged_in";
    if (kind === "challenge") return "verify";
    if (host !== "passport2.chaoxing.com") return kind === "loading" ? "wait" : "open_space";
    if (kind === "form" && modern && frameReady) return "fill";
    return kind === "passport" || kind === "form" && !modern ? "open_form" : "wait";
  }
  var query = (kind, selector, pattern) => ({ kind, selector, pattern });
  function observation({ origin, path, matches }) {
    const space = ["https://i.chaoxing.com", "https://i.mooc.chaoxing.com"].includes(origin);
    let rules;
    if (space && /^\/(?:$|(?:space|base)(?:\/|$))/i.test(path)) {
      rules = [
        query("visible", '#zne_kc_icon, #zne_sy_icon, a[href*="logout" i], a[href*="loginOut" i]'),
        query("frame_path", "iframe#frame_content[src]")
      ];
      if (!matches) return { rules };
      return { kind: matches[0] || /^\/base\/?$/i.test(path) && typeof matches[1] === "string" && /^https:\/\/[^/]+\.chaoxing\.com\/visit\/(?:interaction|courses)\/?$/i.test(matches[1]) ? "space" : "loading" };
    }
    if (origin !== "https://passport2.chaoxing.com") return matches ? { kind: "other" } : { rules: [] };
    if (!/^\/login\/?$/i.test(path)) return matches ? { kind: "passport" } : { rules: [] };
    const errors = "#phoneMsg, #pwdMsg, #loginTip";
    rules = [
      query("text", errors, "\u9A8C\u8BC1\u7801|\u6ED1\u5757|\u5B89\u5168\u9A8C\u8BC1|\u4EBA\u673A\u9A8C\u8BC1"),
      query("visible", '#vercode, .geetest_panel, .geetest_slider, .geetest_captcha, .nc-container, iframe[src*="captcha" i]'),
      query("hidden_flag", "input#needVcode[type=hidden]"),
      query("editable", "input#phone:is([type=text], [type=tel], [type=email], [type=number], :not([type]))"),
      query("editable", 'input#pwd[type="password"]'),
      query("visible", "#loginBtn:not(:disabled, [aria-disabled=true])"),
      query("text", errors, "\\S"),
      { kind: "parameter", selector: "newversion", pattern: "true" }
    ];
    if (!matches) return { rules };
    if (matches[0] || matches[1] || matches[2]) return { kind: "challenge" };
    return { kind: matches[3] && matches[4] && matches[5] ? "form" : "loading", rejected: matches[6] === true, modern: matches[7] === true };
  }
  function* workflow({ verify, submittingCaptcha }) {
    const manual = (message) => ({ status: "manual", message });
    if (verify || submittingCaptcha) return manual("\u8BF7\u5728\u5B66\u4E60\u901A\u9875\u9762\u5B8C\u6210\u9A8C\u8BC1\u3002");
    const logged = { status: "logged_in" };
    const space = "https://i.chaoxing.com/";
    const passport = "https://passport2.chaoxing.com";
    const login = passport + "/login?fid=&newversion=true&refer=https%3A%2F%2Fi.chaoxing.com";
    const challenge = manual("\u5B66\u4E60\u901A\u8981\u6C42\u4EBA\u5DE5\u9A8C\u8BC1\u3002\u8BF7\u5728\u6D4F\u89C8\u5668\u5B8C\u6210\u9A8C\u8BC1\u7801\u6216\u6ED1\u5757\u540E\u7EE7\u7EED\u3002");
    let state = yield { op: "read" };
    if (state.kind === "unsupported") return manual("\u5F53\u524D\u6D4F\u89C8\u5668\u8BF7\u624B\u52A8\u767B\u5F55\u5B66\u4E60\u901A\u3002");
    if (state.kind === "space") return logged;
    if (state.kind === "challenge") return challenge;
    if (state.kind !== "loading" && state.origin !== passport) yield { op: "navigate", url: space };
    let openedForm = false;
    for (let i = 0; i < 20; i++) {
      if (state.kind === "space") return logged;
      if (state.kind === "challenge") return challenge;
      if (state.origin === passport && state.kind === "form" && state.modern && state.document) break;
      if (!openedForm && state.origin === passport && ["passport", "form"].includes(state.kind)) {
        yield { op: "navigate", url: login };
        openedForm = true;
      }
      state = yield { op: "read", delay: 250 };
    }
    if (state.origin !== passport || state.kind !== "form" || !state.modern || !state.document) {
      return manual("\u672A\u786E\u8BA4\u5B66\u4E60\u901A\u767B\u5F55\u8868\u5355\u6216\u5DF2\u767B\u5F55\u7A7A\u95F4\uFF0C\u8BF7\u6838\u5BF9\u5F53\u524D\u6D4F\u89C8\u5668\u9875\u9762\u3002");
    }
    const filled = yield { op: "fill_credentials", account: "input#phone", password: 'input#pwd[type="password"]' };
    if (filled === "missing") return manual("\u5B66\u4E60\u901A\u8D26\u53F7\u6216\u5BC6\u7801\u672A\u914D\u7F6E\uFF0C\u8BF7\u5728\u5BF9\u8BDD\u4E2D\u586B\u5199\u3002");
    const stale = { status: "stale", message: "\u5B66\u4E60\u901A\u8868\u5355\u5DF2\u53D8\u5316\uFF0C\u8BF7\u6838\u5BF9\u5F53\u524D\u9875\u9762\u3002" };
    if (filled !== "filled") return stale;
    const before = yield { op: "read" };
    if (before.kind === "challenge") return challenge;
    if (before.kind !== "form" || before.document !== state.document) return stale;
    if (!(yield { op: "submit", button: "#loginBtn" })) return stale;
    for (let i = 0; i < 24; i++) {
      state = yield { op: "read", delay: 250 };
      if (state.kind === "space") return logged;
      if (state.kind === "challenge") return challenge;
      if (state.origin === passport && state.rejected && (i >= 3 || !before.rejected)) {
        return { status: "rejected", message: "\u5B66\u4E60\u901A\u767B\u5F55\u8868\u5355\u8FD4\u56DE\u9519\u8BEF\uFF0C\u8BF7\u68C0\u67E5\u8D26\u53F7\u3001\u5BC6\u7801\u6216\u7F51\u9875\u63D0\u793A\u3002" };
      }
    }
    return manual("\u5DF2\u5C1D\u8BD5\u767B\u5F55\uFF0C\u5C1A\u672A\u786E\u8BA4\u8FDB\u5165\u5B66\u4E60\u901A\u7A7A\u95F4\u3002");
  }
  return __toCommonJS(login_exports);
})();
