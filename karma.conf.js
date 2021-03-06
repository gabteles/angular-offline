module.exports = function (config) {
  config.set({
    plugins: [
      'karma-mocha',
      'karma-chrome-launcher',
      'karma-firefox-launcher'
    ],
    frameworks: ['mocha'],
    singleRun: false,
    autoWatch: true,
    colors: true,
    reporters: ['dots'],
    browsers: [process.env.TRAVIS ? 'Firefox' : 'Chrome'],
    files: [
      'bower_components/angular/angular.js',
      'bower_components/angular-uuid-service/angular-uuid-service.js',
      'bower_components/angular-mocks/angular-mocks.js',

      'node_modules/chai/chai.js',
      'node_modules/chai-spies/chai-spies.js',

      'angular-offline.js',
      'test.js'
    ],
    logLevel: config.LOG_ERROR
  });
};
