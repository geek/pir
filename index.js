// Import the interface to Tessel hardware
var Tessel = require('tessel');
var Fs = require('fs');
var Http = require('http');
var Path = require('path');
var SerialPort = require('serialport');
var CowboyMouth = require('cowboymouth');
var Ws = require('ws');

var mountPoint = '/mnt/sda1'; // The first flash drive you plug in will be mounted here, the second will be at '/mnt/sdb1'
var filepath = Path.join(mountPoint, Date.now() + '.json');

var file = Fs.createWriteStream(filepath);


// Declare internals

var internals = {
  baud: 115200,
  webSockets: [],
  addons: []
};


var run = function (options, callback) {
  var settings = options || {};
  callback = callback || function () {};

  internals.openSerial(settings, function (err) {
    if (err) {
      console.error(err);
      process.exit(1);
    }

    internals.startServer(callback);
  });
};


internals.openSerial = function (settings, callback) {
  var serial = new SerialPort.SerialPort(settings.portname, {
    parser: SerialPort.parsers.readline("\n"),
    baudrate: internals.baud
  }, false);

  serial.open(function (err) {
    if (err) {
      internals.handleError(err);
      process.exit(1);
    }

    internals.wireEvents(serial, settings, callback);
  });
};


internals.wireEvents = function (serial, settings, callback) {
  var mouth = new CowboyMouth(serial);
  mouth.on('reading', function (data) {
    file.write(chunk + '\n');
    internals.transmit(chunk);
  });

  mouth.on('addon', function (addon) {
    internals.addons.push(addon);
  });

  serial.on('error', internals.handleError);
  callback();
};


internals.startServer = function (callback) {
  var server = Http.createServer(function (req, res) {
    res.writeHead(200);
    res.end(internals.markup);
  });

  server.listen({ port: 80 }, callback);

  var ws = new Ws.Server({ server: server, path: '/arduino' });
  ws.on('connection', function (socket) {
      socket.send('connected...');
      if (internals.addons.length) {
        var msg = '<h4>Addons:<h4><div id="addons">' + JSON.stringify(internals.addons, null, '  ') + '</div>';
        socket.send(msg);
      }
  });

  internals.webSockets.push(ws)
};

internals.transmit = function (data) {
  try {
    internals.webSockets.forEach(function (ws) {
      for (var i = 0, il = ws.clients.length; i < il; ++i) {
        ws.clients[i].send(data.toString());
      }
    });
  }
  catch (err) {}
};


internals.markup = '<!DOCTYPE html><html lang="en"><head><title>Debug Terminal</title>' +
    '<meta http-equiv="Content-Language" content="en-us">' +
    '<meta http-equiv="Content-Type" content="text/html; charset=utf-8">' +
    '</head><body><h1>Events</h1><div id="content"></div>' +
    '<script language="javascript">' +
    'var content = document.getElementById("content"); ' +
    'var protocol = window.location.protocol === "https:" ? "wss:" : "ws:"; ' +
    'var ws = new WebSocket(protocol + "//" + window.location.host + "/arduino");' +
    'ws.onmessage = function (event) { content.innerHTML += event.data + "<br>"; };' +
    '</script></body></html>';


internals.handleError = function (err) {
  if (err) {
    console.error(err);
  }
};

run({ portname: '/dev/ttyACM0' }, function (err) {
  if (err) {
    internals.handleError(err);
    process.exit(1);
  }
});
