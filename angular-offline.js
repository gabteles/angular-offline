/*! Angular offline v0.1.0 | (c) 2016 Greg Bergé | License MIT */
angular
.module('offline', ['uuid'])
.service('connectionStatus', ['$window', '$rootScope', function ($window, $rootScope) {

  /**
   * Test if the connection is online.
   *
   * @returns {boolean}
   */

  this.isOnline = function () {
    return $window.navigator.onLine;
  };

  /**
   * Listen online and offline events.
   *
   * @param {string} event
   * @param {function} listener
   */

  this.$on = function (event, listener) {
    $window.addEventListener(event, function () {
      $rootScope.$apply(listener);
    });
  };
}])
.provider('offline', function () {
  var offlineProvider = this;
  var $requester;

  /**
   * Enable or disable debug mode.
   *
   * @param {boolean} value
   * @returns {offlineProvider}
   */

  offlineProvider.debug = function (value) {
    this._debug = value;
    return this;
  };

  this.$get = ['$q', '$window', '$log', 'connectionStatus', '$cacheFactory', 'rfc4122',
  function ($q, $window, $log, connectionStatus, $cacheFactory, rfc4122) {
    var offline = {};
    var defaultStackCache = $cacheFactory('offline-request-stack');

    /**
     * Log in debug mode.
     *
     * @param {...*} logs
     */

    function log() {
      if (!offlineProvider._debug)
        return;

      return $log.debug.apply($log, ['%cOffline', 'font-weight: bold'].concat([].slice.call(arguments)));
    }

    /**
     * Clean cache if expired.
     *
     * @param {object} cache Cache
     * @param {string} key Cache key
     */

    function cleanIfExpired(cache, key) {
      if (cache === true)
        cache = $requester.defaults.cache || $cacheFactory.get('$http');
      var info = cache.info(key);
      if (info && info.isExpired)
        cache.remove(key);
    }

    /**
     * Get stack cache.
     *
     * @returns {object} Cache
     */

    function getStackCache() {
      return offline.stackCache || defaultStackCache;
    }

    /**
     * Get stack.
     *
     * @returns {object[]}
     */

    function getStack() {
      var cache = getStackCache();
      return cache.get('stack') || [];
    }

    /**
     * Set stack.
     *
     * @param {[]object} stack
     */

    function saveStack(stack) {
      var cache = getStackCache();
      cache.put('stack', stack);
    }

    /**
     * Generates an identifier to the
     *
     * @returns {int}
     */

    function getStack() {
      var cache = getStackCache();
      return cache.get('stack') || [];
    }

    /**
     * Push a request to the stack.
     *
     * @param {object} request
     * @returns {string} cache key
     */

    function stackPush(request) {
      var stack = getStack();
      request.$__offline_cache_key__$ = rfc4122.v4();
      stack.push(request);
      saveStack(stack);
      return request.$__offline_cache_key__$;
    }

    /**
     * Shift a request from the stack.
     *
     * @returns {object} request
     */

    function stackShift() {
      var stack = getStack();
      var request = stack.shift();
      saveStack(stack);
      if (request && request.$__offline_cache_key__$) {
        delete request.$__offline_cache_key__$;
      }
      return request;
    }

    /**
     * Store request to be played later.
     *
     * @param {object} config Request config
     * @returns {string} cache key
     */

    function storeRequest(config) {
      return stackPush({
        url: config.url,
        data: config.data,
        headers: config.headers,
        method: config.method,
        offline: config.offline,
        timeout: angular.isNumber(config.timeout) ? config.timeout : undefined
      });
    }

    /**
     * Process next request from the stack.
     *
     * @returns {Promise|null}
     */

    function processNextRequest() {
      var request = stackShift();

      if (!request)
        return $q.reject(new Error('empty stack'));

      log('will process request', request);

      return $requester(request)
        .then(function (response) {
          log('request success', response);
          return response;
        }, function (error) {
          log('request error', error);
          return $q.reject(error);
        });
    }

    /**
     * Process all the stack.
     *
     * @returns {Promise}
     */

    offline.processStack = function () {
      if (!connectionStatus.isOnline())
        return;

      return processNextRequest()
      .then(offline.processStack)
      .catch(function (error) {
        if (error && error.message === 'empty stack') {
          log('all requests completed');
          return;
        }

        if (error && error.message === 'request queued') {
          log('request has been queued, stop');
          return;
        }

        return offline.processStack();
      });
    };

    /**
     * Deletes a request from the request status based on it's cacheKey
     *
     * @param {int} cacheKey
     * @returns {boolean}
     */
    offline.removeRequest = function(cacheKey) {
      var stack = getStack();
      var i;

      for (i = stack.length - 1; i >= 0; i--) {
        if (stack[i].$__offline_cache_key__$ == cacheKey) {
          break;
        }
      };

      if (i > -1) {
        stack.splice(i, 1);
        saveStack(stack);
        return true;
      }

      return false;
    }

    /**
     * Run offline using a requester ($http).
     *
     * @param {$http} requester
     */

    offline.start = function (requester) {
      $requester = requester;
      connectionStatus.$on('online', offline.processStack);
      offline.processStack();
    };

    /**
     * Expose interceptors.
     */

    offline.interceptors = {
      request: function (config) {
        // If there is not offline options, do nothing.
        if (!config.offline)
          return config;

        log('intercept request', config);

        // Automatically set cache to true.
        if (!config.cache)
          config.cache = true;

        // For GET method, Angular will handle it.
        if (config.method === 'GET') {
          // Online we clean the cache.
          if (connectionStatus.isOnline())
            cleanIfExpired(config.cache, config.url);

          return config;
        }

        // For other methods in offline mode, we will put them in wait.
        if (!connectionStatus.isOnline()) {
          var cacheKey = storeRequest(config);

          // Fake response
          return $q.reject({
            config: config,
            data: "",
            cached: true,
            cacheKey: cacheKey,
            status: -1,
            headers: function(name) { return ''; },
            statusText: ''
          });
        }

        return config;
      }
    };

    return offline;
  }];
})
.config(['$provide', '$httpProvider', function ($provide, $httpProvider) {
  $provide.factory('offlineInterceptor', ['offline', function (offline) {
    return offline.interceptors;
  }]);

  $httpProvider.interceptors.push('offlineInterceptor');
}]);
