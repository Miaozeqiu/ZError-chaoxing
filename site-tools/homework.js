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

  // src/homework/index.ts
  var homework_exports = {};
  __export(homework_exports, {
    run: () => run,
    workflow: () => workflow
  });

  // src/homework/pageRules.ts
  var pageRules = {
    rows: ".questionLi",
    quizRows: ":is(.questionLi, .singleQuesId)",
    keys: ["id", "data-questionid", "data-question-id", "questionid", "data"],
    typeInputs: 'input[id^="answertype"]',
    heading: ".mark_name, :scope > h3",
    quizHeading: ".mark_name, :scope > h3, .Zy_TItle",
    quizTitleKind: ".Zy_TItle",
    quizTitle: ".newZy_TItle",
    quizTitleNumber: ":scope > i",
    quizOptions: ".Zy_ulTop > li",
    quizChoiceText: ".after",
    options: ".answerBg .answer_p",
    optionRow: ".answerBg",
    optionMark: ".num_option",
    optionText: ".answer_p",
    nested: ".reading_answer, .filling_answer, .line_answer, iframe",
    extraStem: ".line_wid_half, .splitS-left .mark_name ~ .mark_name",
    visual: 'img,svg,canvas,math,mjx-container,.MathJax,.font-cxsecret,[class*="cxsecret"]',
    unreadableFont: "cxsecret",
    title: ".mark_title, .work-title, h1",
    labels: {
      single: ["\u5355\u9009", "\u5355\u9009\u9898", "\u5355\u9879\u9009\u62E9", "\u5355\u9879\u9009\u62E9\u9898"],
      multiple: ["\u591A\u9009", "\u591A\u9009\u9898", "\u591A\u9879\u9009\u62E9", "\u591A\u9879\u9009\u62E9\u9898"],
      judgement: ["\u5224\u65AD", "\u5224\u65AD\u9898"],
      completion: ["\u586B\u7A7A", "\u586B\u7A7A\u9898"]
    },
    codes: { 0: "single", 1: "multiple", 2: "completion", 3: "judgement" }
  };
  var homeworkListRules = {
    list: ".bottomList",
    item: "li[data]",
    title: ".right-content .overHidden2, .titTxt, .workName, .work-title",
    status: ".status",
    page: ".pageDiv .xl-active",
    previous: ".pageDiv .xl-prevPage",
    next: ".pageDiv .xl-nextPage",
    previousButton: ".pageDiv .xl-prevPage:not(.xl-disabled)",
    nextButton: ".pageDiv .xl-nextPage:not(.xl-disabled)",
    disabled: '.xl-disabled, [aria-disabled="true"], :disabled',
    tabName: "\u4F5C\u4E1A"
  };

  // src/matchTitle.ts
  var normalizeTitle = (text) => text.normalize("NFKC").replace(/\s+/gu, "").toLowerCase();
  function matchTitles(items, text) {
    const query = normalizeTitle(text);
    if (!query) return items;
    const exact = items.filter((item) => normalizeTitle(item.title) === query);
    return exact.length ? exact : items.filter((item) => normalizeTitle(item.title).includes(query));
  }

  // src/homework/answers.ts
  var answerKey = (value) => value.normalize("NFKC").trim().replace(/\s+/gu, " ");
  var judgement = (value) => {
    const key = answerKey(value).toLowerCase();
    if (/^(?:正确|对|是|true|√|✓)$/u.test(key)) return true;
    if (/^(?:错误|错|否|false|×|✗)$/u.test(key)) return false;
    return void 0;
  };
  var resolveChoice = (options, value, isJudgement) => {
    const polarity = isJudgement ? judgement(value) : void 0;
    const matches = options.filter((option) => polarity === void 0 ? answerKey(option.text) === answerKey(value) : judgement(option.text) === polarity);
    return matches.length === 1 ? matches[0].label : null;
  };
  function resolveAnswers({ questions }) {
    return { decisions: questions.map((question) => {
      const { id, options, type, blankCount, matches } = question;
      if (!matches.length) return { id, status: "no_match" };
      const resolutions = matches.map((match) => {
        const parts = match.answer.split("###").map((part) => part.trim());
        if (parts.some((part) => !part)) return null;
        if (type === "completion") {
          return parts.length === blankCount ? { bankId: match.id, blanks: parts } : null;
        }
        if (type !== "multiple" && parts.length !== 1) return null;
        const choices = parts.map((part) => resolveChoice(options, part, type === "judgement"));
        if (choices.some((choice) => !choice) || new Set(choices).size !== choices.length) return null;
        return { bankId: match.id, choices: choices.sort() };
      });
      const unique = new Set(resolutions.filter((item) => item !== null).map((item) => JSON.stringify(item.choices ?? item.blanks)));
      if (unique.size > 1) return { id, status: "conflict" };
      if (resolutions.some((item) => item === null)) return { id, status: "unmatched" };
      return { id, status: "ready", ...resolutions[0] };
    }) };
  }

  // src/homework/index.ts
  function run(request) {
    if (request.operation === "page_rules") return pageRules;
    if (request.operation === "list_rules") return homeworkListRules;
    if (request.operation === "resolve_answers") return resolveAnswers(request);
    const { operation, query = "", assignments } = request;
    const matched = matchTitles(assignments, query);
    return {
      ids: matched.map((item) => item.id),
      ...operation === "open" && query.trim() && matched.length === 1 ? { selected: matched[0].id } : {}
    };
  }
  function* workflow({ rows }) {
    for (const [index, row] of rows.entries()) {
      const receipt = yield { op: row.status === "ready" ? "apply" : "record", index };
      if (receipt?.ok !== true) return { done: false };
    }
    return { done: true };
  }
  return __toCommonJS(homework_exports);
})();
