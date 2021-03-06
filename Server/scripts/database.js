
// VARIABLES

// Use mysql module for database connection
const mysql = require("mysql");

// Declare global connection object
var db_connection;



// EXPORTS

// Connect to database
exports.connect = function(DB_DATA, callback) {
  // Create connection
  db_connection = mysql.createConnection(DB_DATA);
  // Start connection
  console.log("CONNECTING TO DATABASE...");
  db_connection.connect(function(err) {
    if (err) throw err;
    // Setup error handling
    db_connection.on('error', function(err) {
      // Restart connection
      console.log('RESTARTING DATABASE CONNECTION...');
      module.exports.connect(DB_DATA, function() {})
    });
    console.log("CONNECTION TO GAME DATABASE ESTABLISHED.");
    callback();
  });
};

// Database validation
exports.verify = function(username, password, callback) {
  user(username, function(result) {
    // User exists and password matches
    callback(result != undefined && result.password === password);
  });
};

// Display database users
exports.print_users = function() {
  users(function(result) {
    console.log('USER - PASSWORDS:');
    for (var i in result) {
      console.log(' - ' + result[i].userName + ' - ' + result[i].password);
    }
  });
};

// Add users
exports.add_user = function(username, password) {
  var sql = "INSERT INTO Users (userName, password) VALUES ?";
  var user = [[username, password]];
  db_connection.query(sql, [user], function (error, results) {
    if (!error) {
      console.log('USER ADDED.');
    } else {
      console.log('USER ADD FAILED.');
      throw error;
    }
  });
};

// Check if username exists
exports.check_user = function(username, callback) {
  user(username, function(user) {
    if(user) {
      console.log('USER FOUND.');
      callback(true);
    } else {
      console.log('USER NOT FOUND.');
      callback(false);
    }
  });
};

// Get Leaderboard
exports.leaderboard = function(callback) {
  topscores(callback);
};

// Add to leaderboard
exports.add_score = function(username, score, callback) {
  highscore(username, function(result) {
    if (result && result.highScore < score) {
      set_score(username, score, function() {
        callback(true);
      })
    } else {
      callback(false);
    }
  })
};



// PRIVATE METHODS

// Get user
user = function (username, callback) {
  var sql = 'SELECT * FROM `Users` WHERE `userName` = ?';
  db_connection.query(sql, username, function(error, results) {
    callback(results[0]);
  });
};

// Get all users
users = function (callback) {
  var sql = 'SELECT * FROM `Users`';
  db_connection.query(sql, function(error, results) {
    callback(results);
  });
};

// Get leaderboard top 5
topscores = function(callback) {
  var sql = 'SELECT userName, highscore FROM Users ORDER BY highscore DESC LIMIT 5';
  db_connection.query(sql, function(error, results) {
    callback(results);
  });
};

// Get highscore
highscore = function (username, callback) {
  var sql = 'SELECT highScore FROM Users WHERE userName = ?';
  db_connection.query(sql, username, function(error, results) {
    callback(results[0]);
  });
};

// Set highscore
set_score = function (username, highscore, callback) {
  var sql = 'UPDATE Users SET highscore = ' + highscore + ' WHERE userName = ?';
  db_connection.query(sql, username, function() {
    callback();
  });
};
