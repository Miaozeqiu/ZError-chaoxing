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
    run: () => run
  });

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
    if (request.operation === "resolve_answers") return resolveAnswers(request);
    const { operation, query = "", assignments } = request;
    const matched = matchTitles(assignments, query);
    return {
      ids: matched.map((item) => item.id),
      ...operation === "open" && query.trim() && matched.length === 1 ? { selected: matched[0].id } : {}
    };
  }
  return __toCommonJS(homework_exports);
})();
