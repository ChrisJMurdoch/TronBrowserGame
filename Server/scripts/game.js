
// VARIABLES

// Use socket_handler to broadcast to clients
var socket_handler = require('./socket_handler');

// Milliseconds between each server tick
const TICK_PERIOD = 5;

// Database connection object
var database;

// List of players in game
var players = [];

// Queue to store requests from socket interrupts
var queue = [];

// List to store last tick durations, for debugging
var load = [];



// EXPORTS

// Check if player exists in game
exports.has_player = function(in_name) {
  for(var i in players) {
    if ( players[i].name === in_name ) {
     return true;
    }
  }
  return false;
};

// Add player to game and return reference
exports.add_player = function(in_name) {
  var player = new Player(in_name);
  players.push(player);
  // Send leaderboard data
  database.leaderboard(function(result) {
    var mes = '7;';
    for (var i in result) {
      mes = mes + result[i].userName + '#' + result[i].highscore;
      if (i < result.length-1) {
        mes = mes + '@';
      }
    }
    socket_handler.broadcast(mes);
  });
  // Return reference
  return player;
};

// Create and push a request to the processing queue
exports.move = function(player, in_x, in_y, in_socket) {
  queue.push(new UpdateReq(player, parseInt(in_x), parseInt(in_y), in_socket));
};

// Remove player from game
exports.remove_player = function(in_player) {
  for(var i in players){
    if ( players[i].name === in_player.name ) {
     players.splice(i, 1);
     break;
    }
  }
};

// Main loop
exports.start = function(db) {
  database = db;
  console.log('STARTING GAME...')

  // Start a repeated interval to process request queue
  setInterval(function run() {
    // Get time for load logging
    var start_time = Date.now();
    // Process each request in queue
    for (var i in queue) {
      // Get first request
      req = queue.shift();
      // Get last time player was processed
      var last = req.player.time;
      // Set time player was processed
      req.player.time = Date.now();
      // Get time elapsed
      var elapsed = req.player.time - last;
      // Create new body part with time-adjusted coordinates
      req.player.x.push(req.player.x[req.player.x.length-1] + req.x * elapsed / 10);
      req.player.y.push(req.player.y[req.player.y.length-1] + req.y * elapsed / 10);
      req.player.t.push(Date.now());
      // Constrain new body part to 500 x 500 game map
      if (req.player.x[req.player.x.length-1] < 0) {
        req.player.x[req.player.x.length-1] = 500;
      } else if (req.player.x[req.player.x.length-1] > 500) {
        req.player.x[req.player.x.length-1] = 0;
      }
      if (req.player.y[req.player.y.length-1] < 0) {
        req.player.y[req.player.y.length-1] = 500;
      } else if (req.player.y[req.player.y.length-1] > 500) {
        req.player.y[req.player.y.length-1] = 0;
      }
      // Cut old body parts
      var time = Date.now();
      while (true) {
        if (time - req.player.t[0] > 2000) {
          req.player.t.shift();
          req.player.x.shift();
          req.player.y.shift();
        } else {
          break;
        }
      }
      // Collision detection
      // Escape if player has no body parts (lines)
      if (req.player.x.length <= 1) {
        continue;
      }
      // Check new body part against against each player
      outer: for (var player in players) {
        // Escape if other player has no body parts (lines)
        if (players[player].x.length <=1) {
          continue;
        }
        // Check each body part in other player
        for (var point in players[player].x) {
          if (hasIntersection(
            req.player.x[req.player.x.length-1],
            req.player.y[req.player.y.length-1],
            req.player.x[req.player.x.length-2],
            req.player.y[req.player.y.length-2],
            players[player].x[point],
            players[player].y[point],
            players[player].x[point-1],
            players[player].y[point-1]
          )) {
            // Die
            // Update scores
            database.add_score(req.player.name, (Date.now() - req.player.start)/1000, function() {
              database.leaderboard(function(result) {
                var mes = '7;';
                for (var i in result) {
                  mes = mes + result[i].userName + '#' + result[i].highscore;
                  if (i < result.length-1) {
                    mes = mes + '@';
                  }
                }
                socket_handler.broadcast(mes);
              });
            });
            // Remove clientside
            socket_handler.broadcast('6;' + req.player.name);
            // Remove serverside
            module.exports.remove_player(req.player);
            var n = new Player(req.player.name);
            players.push(n);
            req.soc.player = n;
            break outer;
          }
        }
      }
      // Update client
      pull_update(req.soc, req.player);
    }
    // Server load calculations
    var duration = Date.now() - start_time;
    load.push(duration);
    // Trim load queue to 100 entries
    if (load.length > 100) {
      load.shift();
    }
  }, TICK_PERIOD);

  console.log('GAME STARTED.')
};



// PRIVATE METHODS

// Send game data to client
function pull_update(in_socket, in_player) {
  var response = '4';
  for (var i in players) {
    var s = ';' + players[i].name + '@' + Math.floor(players[i].x[players[i].x.length-1]) + '@' + Math.floor(players[i].y[players[i].y.length-1]);
    response = response + s;
  }
  in_socket.send(response);
};

// Intersect method
function hasIntersection( x1, y1, x2, y2, x3, y3, x4, y4 ) {
  // Ignore gaps; lag gaps and edge teleporting.  Consistant with client rendering
  if (Math.abs(x1-x2) > 50 || Math.abs(x3-x4) > 50 || Math.abs(y1-y2) > 50 || Math.abs(y3-y4) > 50) {
    return false;
  }

  // Get line orientations
  var firstvert = x1 === x2;
  var secondvert = x3 === x4;

  // Parralel lines don't intersect
  if (firstvert === secondvert) {
    return false;
  }

  if (!firstvert) {
    // Second line is vertical
    // Check if linesoverlap on both planes
    var xs = (x1<x3 && x3<x2) || (x2<x3 && x3<x1);
    var ys = (y3<y1 && y1<y4) || (y4<y1 && y1<y3);
    return ( xs ) && ( ys );
  } else {
    // First line is vertical
    // Check if linesoverlap on both planes
    var xs = (x3<x1 && x1<x4) || (x4<x1 && x1<x3)
    var ys = (y1<y3 && y3<y2) || (y2<y3 && y3<y1)
    return ( xs ) && ( ys );
  }
}



// CLASSES

// Request record
class UpdateReq {
  constructor (in_player, in_x, in_y, in_socket) {
    this.player = in_player;
    this.x = in_x;
    this.y = in_y;
    this.soc = in_socket;
  };
};

// CLient record
class Player {
  constructor(in_name) {
    this.name = in_name;
    this.x = [Math.floor(Math.random() * 500)];
    this.y = [Math.floor(Math.random() * 500)];
    this.t = [Date.now()];
    this.time = Date.now();
    this.start = Date.now();
  };
};
