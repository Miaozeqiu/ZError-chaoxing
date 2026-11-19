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
    run: () => run,
    workflow: () => workflow
  });

  // src/chapters/rules.ts
  var chapterRules = {
    directory: {
      target: 'a[title="\u7AE0\u8282"][data-url*="/mycourse/studentcourse"]',
      row: '.chapter_item[id^="cur"] > .catalog_title[role="link"]',
      name: ".catalog_name",
      number: ".catalog_sbar",
      task: ".catalog_task",
      hiddenCount: ".knowledgeJobCount",
      badge: ".catalog_points_yi",
      completed: ".icon_yiwanc"
    },
    sidebar: {
      target: '#coursetree .posCatalog_select[id^="cur"]:not(.firstLayer)',
      row: '.posCatalog_select[id^="cur"]',
      active: ".posCatalog_active",
      name: ".posCatalog_name",
      number: ".posCatalog_sbar",
      task: "",
      hiddenCount: ".jobUnfinishCount",
      badge: ".orangeNew",
      completed: ".icon_Completed"
    },
    completionLabel: "\u5DF2\u5B8C\u6210",
    cards: 'iframe[info="card"], iframe#iframe',
    cardTarget: "knowledge/cards",
    tabs: "#prev_tab .prev_ul > li[cardid]",
    activeTab: ".active",
    disabledTab: '.disabled, [aria-disabled="true"]',
    tabPrefix: "dct",
    body: "#pageDiv.ans-cc, .ans-cc",
    jobIcon: ".ans-job-icon",
    jobContainer: ".ans-attach-ct",
    jobDoneIcon: ".ans-job-icon-finish, .ans-job-icon-finished, .ans-job-done",
    jobDoneBox: ".ans-job-finished",
    player: {
      box: ".video-js",
      media: ".video-js video, .video-js audio",
      controls: [".vjs-play-control.vjs-paused", ".vjs-paused .vjs-big-play-button"]
    },
    jobDoneLabel: "\u4EFB\u52A1\u70B9\u5DF2\u5B8C\u6210"
  };
  var jobKinds = [
    ["video", "/(?:insertvideo|insertaudio|modules/(?:video|audio))\\b"],
    ["quiz", "/(?:insertwork|inserthomework|work|modules/(?:work|quiz))\\b"],
    ["discussion", "/ananas/modules/insertbbs/"],
    ["document", "/(?:insertdoc|insertbook|readsvr/book/mooc|modules/(?:pdf|document|innerbook|book|ppt|doc|read))\\b"]
  ];

  // src/chapters/index.ts
  function run(chapter) {
    if ("operation" in chapter) {
      if (chapter.operation === "page_rules") return chapterRules;
      const kinds = jobKinds.map(([kind, path]) => [kind, new RegExp(path, "i")]);
      return chapter.sources.map((source) => kinds.find(([, regex]) => regex.test(source))?.[0] ?? "unknown");
    }
    if (chapter.remaining === 0) return { action: "complete" };
    if (!chapter.loaded) return { action: "loading" };
    if (chapter.targetTab !== null) return { action: "tab", tab: chapter.targetTab };
    const index = chapter.jobs.findIndex((job) => !job.done && (!chapter.videoOnly || job.kind === "video"));
    if (index !== -1) return { action: chapter.jobs[index].kind, index };
    if (chapter.nextTab !== null) return { action: "tab", tab: chapter.nextTab };
    return { action: "pending" };
  }
  function* workflow({ currentOnly, allowQuiz }) {
    let readinessChecks = 0;
    const transitions = /* @__PURE__ */ new Set();
    while (true) {
      const result = yield { op: "process" };
      if (result.ok === true && result.status === "complete" && !currentOnly) {
        const next = yield { op: "next" };
        if (!next.opened) return { done: true };
        readinessChecks = 0;
        continue;
      }
      if (result.ok === true && result.status === "needs_quiz" && allowQuiz) {
        yield { op: "quiz" };
        return { done: true };
      }
      if (result.ok === true && ["tab_changed", "job_completed", "discussion_completed"].includes(String(result.status))) {
        const transition = JSON.stringify([result.chapterKey, result.status, result.tab, result.job, result.remaining]);
        if (transitions.has(transition)) return { error: "\u7AE0\u8282\u4EFB\u52A1\u70B9\u6CA1\u6709\u7EE7\u7EED\u63A8\u8FDB\uFF0C\u8BF7\u6838\u5BF9\u5F53\u524D\u9875\u9762\u3002" };
        transitions.add(transition);
        readinessChecks = 0;
        continue;
      }
      if (result.status !== "loading" && result.retryable !== true) return { done: true };
      if (++readinessChecks >= 12) return { done: true };
      yield { op: "wait" };
    }
  }
  return __toCommonJS(chapters_exports);
})();
