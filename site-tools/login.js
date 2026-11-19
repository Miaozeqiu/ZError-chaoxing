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
    run: () => run
  });
  function run({ kind, host, modern, frameReady }) {
    if (kind === "space" && ["i.chaoxing.com", "i.mooc.chaoxing.com"].includes(host)) return "logged_in";
    if (kind === "challenge") return "verify";
    if (host !== "passport2.chaoxing.com") return kind === "loading" ? "wait" : "open_space";
    if (kind === "form" && modern && frameReady) return "fill";
    return kind === "passport" || kind === "form" && !modern ? "open_form" : "wait";
  }
  return __toCommonJS(login_exports);
})();
