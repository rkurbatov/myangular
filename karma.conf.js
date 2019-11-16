module.exports = function(config) {
  config.set({
    frameworks: ["browserify", "jasmine"],
    files: ["src/**/*.js", "test/**/*.test.js"],
    preprocessors: {
      "src/**/*.js": ["jshint", "browserify"],
      "test/**/*.js": ["jshint", "browserify"]
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
            ignore: /node_modules/
          }
        ]
      ],
      extensions: [".js"]
    }
  });
};
