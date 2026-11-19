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

  // src/chapters/index.ts
  var chapters_exports = {};
  __export(chapters_exports, {
    run: () => run
  });
  function run(chapter) {
    if (chapter.remaining === 0) return { action: "complete" };
    if (!chapter.loaded) return { action: "loading" };
    if (chapter.targetTab !== null) return { action: "tab", tab: chapter.targetTab };
    const index = chapter.jobs.findIndex((job) => !job.done && (!chapter.videoOnly || job.kind === "video"));
    if (index !== -1) return { action: chapter.jobs[index].kind, index };
    if (chapter.nextTab !== null) return { action: "tab", tab: chapter.nextTab };
    return { action: "pending" };
  }
  return __toCommonJS(chapters_exports);
})();
