module.exports = function(config) {
  config.set({
    frameworks: ['browserify', 'jasmine'],
    files: [
      'src/**/*.js',
      'test/**/*.test.js'
    ],
    preprocessors: {
      'src/**/*.js': ['jshint', 'browserify'],
      'test/**/*.js': ['jshint', 'browserify']
    },
    browsers: ['PhantomJS'],
    browserify: {
      debug: true,
      transform: [
        ['babelify', {
          ignore: /node_modules/
        }]
      ],
      extensions: ['.js']
    }
  });
};
