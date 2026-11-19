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

  // src/courses/index.ts
  var courses_exports = {};
  __export(courses_exports, {
    run: () => run
  });

  // src/courses/pageRules.ts
  var courseListRules = {
    active: ".tab-item.current, .tab-item.active, .tab-item.selected",
    type: "#courseType",
    studentTab: '.tab-item[coursetype="1"]',
    menuName: "\u8BFE\u7A0B",
    list: "#courselistArea, .courselistArea, .course-list",
    item: "a[href], [data-href], [data-url], [onclick]",
    card: "li, .course, .course-item, .courseItem, .course-card, .courseCard",
    heading: '[class*="course-name"], [class*="courseName"], .course-title, .courseTitle, h3, h4',
    teacher: '.teacher, .teacher-name, .teacherName, [class*="courseTeacher"], .course-info > p.line2:last-child',
    more: ".folder, .course-folder, [folderid], [data-folder-id], .pagination .next, .load-more",
    disabled: ':disabled, .disabled, [aria-disabled="true"]',
    studentNames: ["\u6211\u5B66\u7684\u8BFE", "\u5DF2\u5B66\u7684\u8BFE"],
    actionNames: ["\u8FDB\u5165\u5B66\u4E60", "\u8FDB\u5165\u8BFE\u7A0B", "\u8BFE\u7A0B\u5C01\u9762", "\u5B66\u4E60"]
  };

  // src/matchTitle.ts
  var normalizeTitle = (text) => text.normalize("NFKC").replace(/\s+/gu, "").toLowerCase();
  function matchTitles(items, text) {
    const query = normalizeTitle(text);
    if (!query) return items;
    const exact = items.filter((item) => normalizeTitle(item.title) === query);
    return exact.length ? exact : items.filter((item) => normalizeTitle(item.title).includes(query));
  }

  // src/courses/match.ts
  function matchCourses(courses, text, teacherName) {
    const teacher = normalizeTitle(teacherName);
    const eligible = teacher ? courses.filter((course) => normalizeTitle(course.teacher ?? "").includes(teacher)) : courses;
    return matchTitles(eligible, text);
  }

  // src/courses/index.ts
  function run(input) {
    if (input.operation === "list_rules") return courseListRules;
    const { operation, query = "", teacher = "", courses } = input;
    const matched = matchCourses(courses, query, teacher);
    return {
      ids: matched.map((course) => course.id),
      ...operation === "open" && query.trim() && matched.length === 1 ? { selected: matched[0].id } : {}
    };
  }
  return __toCommonJS(courses_exports);
})();
