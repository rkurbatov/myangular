process.env.CHROME_BIN = require("puppeteer").executablePath();

module.exports = function(config) {
  config.set({
    frameworks: ["browserify", "jasmine"],
    files: ["src/**/*.js", "test/**/*.test.js"],
    preprocessors: {
      "src/**/*.js": ["browserify"],
      "test/**/*.js": ["browserify"]
    },
    reporters: ["spec", "clear-screen"],
    specReporter: {
      suppressPassed: true,
      suppressSkipped: true,
      suppressErrorSummary: true
    },
    browsers: ["ChromeHeadless"],
    browserify: {
      debug: true,
      transform: [
        [
          "babelify",
          {
            plugins: ["@babel/plugin-proposal-class-properties"],
            presets: ["@babel/preset-env"],
            ignore: [/node_modules/]
          }
        ]
      ],
      extensions: [".js"]
    }
  });
};
