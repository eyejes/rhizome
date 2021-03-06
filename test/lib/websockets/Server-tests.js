var _ = require('underscore')
  , fs = require('fs')
  , WebSocket = require('ws')
  , async = require('async')
  , assert = require('assert')
  , websockets = require('../../../lib/websockets')
  , connections = require('../../../lib/connections')
  , coreMessages = require('../../../lib/core/messages')
  , ValidationError = require('../../../lib/core/errors').ValidationError
  , helpers = require('../../helpers')

var config = {
  port: 8000,
  rootUrl: '/',
  usersLimit: 5
}

var wsServer = new websockets.Server(config)
helpers.wsServer = wsServer


describe('websockets.Server', function() {

  var manager = new connections.ConnectionManager({
    store: new connections.NoStore()
  })

  beforeEach(function(done) {
    connections.manager = manager
    async.series([
      manager.start.bind(manager),
      wsServer.start.bind(wsServer)
    ], done)
  })
  
  afterEach(function(done) {
    helpers.afterEach([wsServer, manager], done)
  })

  describe('start', function() {

    it('should return ValidationError if config is not valid', function(done) {
      helpers.assertConfigErrors([
        [new websockets.Server({}), ['.port']],
        [new websockets.Server({rootUrl: 12345}), ['.rootUrl', '.port']],
        [new websockets.Server({rootUrl: '/'}), ['.port']],
        [new websockets.Server({rootUrl: '/', port: 80, serverInstance: 34}), ['.serverInstance']],
        [new websockets.Server({rootUrl: '/', port: 90, usersLimit: 'bla'}), ['.usersLimit']],
        [new websockets.Server({rootUrl: '/', port: 90, wot: '???'}), ['.']]
      ], done)
    })

  })

  describe('connection', function() {

    it('should reject connection when full', function(done) {
      assert.equal(wsServer._wsServer.clients.length, 0)

      helpers.dummyWebClients(wsServer, config.port, 6, function(err, sockets, messages) {
        if (err) throw err

        assert.deepEqual(
          _.pluck(wsServer._wsServer.clients.slice(0, 5), 'readyState'), 
          _.range(5).map(function() { return WebSocket.OPEN })
        )

        // Check that the last socket received connection rejected
        var lastMsg = messages.pop()
        assert.equal(lastMsg.length, 2)
        assert.equal(lastMsg[0], 1)
        assert.ok(_.isString(lastMsg[1]))
        assert.equal(_.last(wsServer._wsServer.clients).readyState, WebSocket.CLOSING)
        
        // Check that all sockets before got connection accepted
        messages.forEach(function(msg) {
          assert.equal(msg.length, 2)
          assert.equal(msg[0], 0)
          assert.ok(_.isString(msg[1]))
        })
        done()
      })
    })

  })

  describe('disconnection', function() {

    it('should forget the sockets', function(done) {
      assert.equal(wsServer._wsServer.clients.length, 0)
      async.waterfall([
        function(next) { helpers.dummyWebClients(wsServer, config.port, 3, next) },
        function(sockets, messages, next) {
          var connection1 = wsServer.connections[0]
            , connection2 = wsServer.connections[1]
          manager.subscribe(connection1, '/someAddr')
          manager.subscribe(connection2, '/someOtherAddr')
          assert.equal(manager._nsTree.get('/someAddr').connections.length, 1)
          assert.equal(manager._nsTree.get('/someOtherAddr').connections.length, 1)
          assert.equal(wsServer._wsServer.clients.length, 3)
          connection1._socket.close()
          connection1.on('close', function() { next() })
        }
      ], function(err) {
        if (err) throw err
        assert.equal(wsServer._wsServer.clients.length, 2)
        assert.equal(manager._nsTree.get('/someAddr').connections.length, 0)
        assert.equal(manager._nsTree.get('/someOtherAddr').connections.length, 1)
        done()
      })
    })

  })

  describe('send', function() {

    it('shouldn\'t crash if socket is not opened', function(done) {
      assert.equal(wsServer._wsServer.clients.length, 0)

      // Create dummy web clients, and immediately close one of them
      helpers.dummyWebClients(wsServer, config.port, 1, function(err, sockets) {
        if (err) throw err
        assert.equal(wsServer._wsServer.clients.length, 1)
        var serverSocket = wsServer._wsServer.clients[0]
        serverSocket.close()
        console.log('\nDO NOT PANIC : this is just a test (should say "web socket send failed")')
        wsServer.connections[0].send('/bla', [1, 2, 3])
        done()
      })

    })

  })

})
