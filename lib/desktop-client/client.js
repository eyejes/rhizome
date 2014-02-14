/*
 * Copyright 2014, Sébastien Piquemal <sebpiq@gmail.com>
 *
 * rhizome is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * rhizome is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 * 
 * You should have received a copy of the GNU General Public License
 * along with rhizome.  If not, see <http://www.gnu.org/licenses/>.
 */
var fs = require('fs')
  , path = require('path')
  , _ = require('underscore')
  , async = require('async')
  , debug = require('debug')('rhizome.desktopClient')
  , shared = require('../shared')
  , utils = require('../server/utils')

var receiveFromServer, sendToServer

exports.start = function(config, done) {

  // Make sure `blobsDirName` ends with no /
  if (_.last(config.desktopClient.blobsDirName) === '/')
    config.desktopClient.blobsDirName = config.desktopClient.blobsDirName.slice(0, -1) 

  // Listens messages coming from the server
  receiveFromServer = new utils.OSCServer(config.desktopClient.port)

  // Client to send OSC back to the server
  sendToServer = new utils.OSCClient(config.server.hostname, config.osc.port)

  receiveFromServer.on('message', function (address, args, rinfo) {

    if (shared.sysAddressRe.exec(address)) {

      // Just save the blob in `blobsDirName` and send a message with the filename
      // to the Pd client.
      if (address === shared.fromWebBlobAddress) {
        debug('received blob at address \'' + address + '\'')
        var pdPort = args[0]
          , originalAddress = args[1]
          , blob = args[2]
          , userId = args[3]
        utils.saveBlob(config.desktopClient.blobsDirName, blob, function(err, filePath) {
          if (err) throw err
          var sendToPd = new utils.OSCClient('localhost', pdPort)
          sendToPd.send(originalAddress, [filePath, userId])
        })
      }

      // Opens the file and sends the blob to the server.
      // !!! For security reasons only files in `blobsDirName` can be sent.
      // TODO: limit to files in `blobsDirName`
      else if (address === shared.gimmeBlobAddress) {
        var originalAddress = args[0]
          , filePath = args[1]
        if (path.dirname(filePath) === path.normalize(config.desktopClient.blobsDirName)) {
          fs.readFile(filePath, function(err, buf) {
            sendToServer.send(shared.fromDesktopBlobAddress, [originalAddress, buf])
          })
        } else sendToServer.send(shared.errorAddress, 'this path is not allowed ' + filePath)
      }
    }

  })

  done(null)

}

exports.stop = function(done) {
  receiveFromServer.close()
  done()
}