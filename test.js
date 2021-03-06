var expect = chai.expect;
var spy = chai.spy;

describe('Angular offline', function () {
  var $http, $rootScope, $httpBackend, $cacheFactory, offline, startOffline, connectionStatus;

  beforeEach(module('offline', function (offlineProvider, $provide) {
    offlineProvider.debug(true);
    $provide.value('connectionStatus', {
      isOnline: function () {
        return this.online;
      },
      $on: function () {}
    });
  }));

  beforeEach(inject(function ($injector) {
    $http = $injector.get('$http');
    $rootScope = $injector.get('$rootScope');
    $cacheFactory = $injector.get('$cacheFactory');
    $httpBackend = $injector.get('$httpBackend');
    offline = $injector.get('offline');
    connectionStatus = $injector.get('connectionStatus');
    $httpBackend.whenGET('/test').respond(200);
    $httpBackend.whenPOST('/test').respond(201);

    startOffline = function () {
      offline.start($http);
    };
  }));

  afterEach(function() {
    $httpBackend.verifyNoOutstandingExpectation();
    $httpBackend.verifyNoOutstandingRequest();
  });

  describe('GET request', function () {
    describe('with offline config', function () {
      it('should cache request', function () {
        startOffline();

        $http.get('/test', {
          offline: true
        });

        $http.get('/test', {
          offline: true
        });

        // We flush only one request, if cache didn't work
        // we had to flush two.
        $httpBackend.flush(1);
      });

      describe('online', function () {
        beforeEach(function () {
          connectionStatus.online = true;
        });

        it('should clean the expired cache if we are online', function (done) {
          startOffline();

          $http.get('/test', {
            offline: true,
            cache: {
              get: function (key) {
                return this[key];
              },
              info: function () {
                return {isExpired: true};
              },
              put: function (key, value) {
                this[key] = value;
              },
              remove: function (key) {
                expect(key).to.equal('/test');
                done();
              }
            }
          });

          $httpBackend.flush(1);
        });
      });
    });
  });

  describe('POST request offline', function () {
    beforeEach(function () {
      connectionStatus.offline = true;
      $cacheFactory.get('offline-request-stack').remove('stack');
    });

    it('should stack request and return an error', function (done) {
      startOffline();

      var successSpy = spy(function() {});
      var failSpy = spy(function() {});

      $http.post('/test', {}, {
        offline: true
      }).then(successSpy, failSpy);

      $rootScope.$digest();

      expect(successSpy).to.not.have.been.called();
      expect(failSpy).to.have.been.called();

      var stack = $cacheFactory.get('offline-request-stack').get('stack');
      expect(stack).to.length(1);

      done();
    });

    it('should process requests', function () {
      startOffline();

      $http.post('/test', {}, {
        offline: true
      });

      $http.post('/test', {}, {
        offline: true
      });

      //$rootScope.$digest();

      connectionStatus.online = true;
      offline.processStack();

      // First request.
      $httpBackend.flush(1);

      // Second request.
      $httpBackend.flush(1);
    });

    it("should keep an cache key on chaced requests", function() {
      startOffline();

      $http.post('/test', {}, {offline: true}).then(function() {}, function(response) {
        expect(response).to.include.keys('cached', 'cacheKey');
      });
    });

    it("should be able to remove stacked requests by cache key", function() {
      startOffline();

      $http.post('/test', {}, {offline: true}).then(function() {}, function(response) {
        var removeSuccess = offline.removeRequest(response.cacheKey);
        expect(removeSuccess).to.be.true;
      });
    });

    it("should not be able to remove processed requests", function() {
      startOffline();

      var cacheKey;

      $http.post('/test', {}, {offline: true}).then(function() {}, function(response) {
        cacheKey = response.cacheKey;
      });

      connectionStatus.online = true;
      offline.processStack();
      $httpBackend.flush();

      var removeSuccess = offline.removeRequest(cacheKey);
      expect(removeSuccess).to.be.false;
    });
  });
});
