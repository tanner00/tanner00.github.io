const markdownIt = require("markdown-it");
const markdownItKatex = require("@traptitech/markdown-it-katex");
const syntaxHighlight = require("@11ty/eleventy-plugin-syntaxhighlight");
const fs = require("fs");
const path = require("path");

module.exports = function (eleventyConfig) {
  eleventyConfig.addPlugin(syntaxHighlight);

  eleventyConfig.addPassthroughCopy("src/CNAME");
  eleventyConfig.addPassthroughCopy("src/img");
  eleventyConfig.addWatchTarget("./src/img/");

  eleventyConfig.addFilter("inlineSvg", (filename) => {
    if (typeof filename !== "string" || !/^[a-z0-9-]+\.svg$/i.test(filename)) {
      return "";
    }
    const dir = path.join(__dirname, "src", "img");
    const fp = path.join(dir, filename);
    const rel = path.relative(dir, fp);
    if (rel.startsWith("..") || path.isAbsolute(rel)) return "";
    try {
      return fs.readFileSync(fp, "utf8");
    } catch {
      return "";
    }
  });

  const md = markdownIt({ html: true, linkify: true, typographer: true });
  md.use(markdownItKatex);
  eleventyConfig.setLibrary("md", md);

  eleventyConfig.addPassthroughCopy("src/css");
  eleventyConfig.addPassthroughCopy("src/js");

  const katexDistPath = path.dirname(require.resolve("katex/package.json"));
  eleventyConfig.addPassthroughCopy({
    [path.join(katexDistPath, "dist", "katex.min.css")]: "css/katex.min.css",
  });
  eleventyConfig.addPassthroughCopy({
    [path.join(katexDistPath, "dist", "fonts")]: "css/fonts",
  });

  eleventyConfig.addFilter("dateFormat", (date) => {
    return new Date(date).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  });

  eleventyConfig.addFilter("dateIso", (date) =>
    new Date(date).toISOString().split("T")[0]
  );

  eleventyConfig.addFilter("limit", (arr, n) => arr.slice(0, n));

  eleventyConfig.addFilter("startsWith", (str, prefix) =>
    typeof str === "string" && str.startsWith(prefix)
  );

  eleventyConfig.addFilter("isHttpUrl", (str) =>
    typeof str === "string" && /^https?:\/\//i.test(str)
  );

  eleventyConfig.addFilter("screenshotThumb", (url, width = 800) => {
    if (typeof url !== "string" || !/^https?:\/\//i.test(url)) return url;
    const w = Number(width) > 0 ? Math.round(Number(width)) : 800;
    return `https://wsrv.nl/?url=${encodeURIComponent(url)}&w=${w}&output=jpg&q=85`;
  });

  eleventyConfig.addFilter("joinUrl", (pathFromRoot, baseUrl) => {
    if (
      typeof baseUrl !== "string" ||
      !baseUrl.trim() ||
      typeof pathFromRoot !== "string"
    ) {
      return "";
    }
    const base = baseUrl.replace(/\/$/, "");
    const path = pathFromRoot.startsWith("/")
      ? pathFromRoot
      : `/${pathFromRoot}`;
    return `${base}${path}`;
  });

  return {
    pathPrefix: "/",
    dir: {
      input: "src",
      output: "_site",
      includes: "_includes",
      data: "_data",
    },
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",
  };
};
