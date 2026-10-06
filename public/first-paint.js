// Sets the language, the direction and the theme on <html> before the
// body is parsed, so the first layout is already the right one: an Arabic
// page is never laid out left to right first, a dark one never painted
// light. A classic script in the head, so it runs before the body; a file
// of its own, not inline, so a script-src 'self' policy allows it. The
// rules are those of src/ui/prefs.ts (pickLang, pickTheme), which the app
// applies again once it runs.
(function () {
  var html = document.documentElement;
  var query = new URLSearchParams(location.search);
  var lang = query.get("lang") === "ar" ? "ar" : "en";
  html.lang = lang;
  html.dir = lang === "ar" ? "rtl" : "ltr";
  var asked = query.get("theme");
  var theme = asked === "light" || asked === "dark" ? asked : null;
  if (theme === null && asked !== "system") {
    try {
      var stored = localStorage.getItem("tyche-replay:theme");
      if (stored === "light" || stored === "dark") theme = stored;
    } catch (e) {
      // Storage blocked: follow the system.
    }
  }
  if (theme) html.dataset.theme = theme;
})();
