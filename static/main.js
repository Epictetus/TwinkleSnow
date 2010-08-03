
Array.prototype.find = function(cond) {
  for(var i = 0, n = this.length; i < n; ++i) {
    if(cond(this[i])) {
      return this[i];
    }
  }
  return null;
};

$(function() {
  if(!("WebSocket" in window)) {
    alert('WebSocket is not supported in this browser.');
    return;
  }

  $('#main').hide();
  var currentTab = null;
  tabs.forEach(function(tab) {
    tab.tweets = [];
    tab.read = 0;
    tab.unreadCount = 0;
    tab.scrollTop = 0;
    $('#views').append(
      '<div id="view-' + tab.id + '"></div>');
    $('#tabs').append(
      '<li id="tab-' + tab.id + '">' +
        '<a href="#tabs/' + tab.name + '">' +
          tab.name +
          ' <span class="unread">(<span class="count">0</span>)</span>' +
        '</a>' +
      '</li>');
  });

  var updateUnreadCount = function(tab, count) {
    tab.unreadCount = count;
    var tabElement = $('#tab-' + tab.id);
    tabElement.find('.unread > .count').text(count);
    tabElement.toggleClass('has-unread', count > 0);
  };
  
  var updateRead = function() {
    var scrollTop = $(window).scrollTop();
    var tweets = currentTab.tweets;
    var n = tweets.length;
    for(var i = n - 1; i >= 0; --i) {
      var tweet = tweets[i];
      var id = tweet.data.id;
      var tweetElement = $('#tweet-' + id);
      if(tweetElement.offset().top - scrollTop > 0) {
        if(id > currentTab.read) {
          currentTab.read = id;
          var path = '/api/read/' + currentTab.id + '/' + id;
          $.getJSON(path, {}, function(data) {});
          updateUnreadCount(currentTab, n - i - 1);
        }
        break;
      }
    }
  }

  var updateHash = function() {
    if(window.location.hash.match(/^#tabs\/([a-z0-9\-]+)$/)) {
      var name = RegExp.$1;
      if(currentTab != null) {
        updateRead();
      }
      currentTab = tabs.find(function(t) { return t.name == name; });
      var viewId = '#view-' + currentTab.id;
      $('#views > div:not(' + viewId + ')').hide();
      $('#views > div:hidden' + viewId).show();
      $.scrollTo(currentTab.scrollTop);
    }
  };

  $(window).bind('hashchange', function() {
    updateHash();
  });
  if(!window.location.hash) {
    window.location.hash = '#tabs/timeline';
  }
  updateHash();

  $(window).scroll(function() {
    currentTab.scrollTop = $(window).scrollTop();
  });

  var prependTweet = function(tweet) {
    var convertDate = function(jsonDate) {
      var re = /^(.+) (.+) (..) (..):(..):(..) (.+) (.+)$/;
      var pattern = "$2 $3, $8 $4:$5:$6 UTC+0000";
      var d = new Date(jsonDate.replace(re, pattern));
      var month = d.getMonth() + 1;
      var date = d.getDate();
      var hours = d.getHours();
      var minutes = d.getMinutes();
      minutes = minutes < 10 ? '0' + minutes : minutes;
      return month + '/' + date + ' ' + hours + ':' + minutes;
    }

    var data = tweet.data;
    var user = data.user;
    var screen_name = user.screen_name;
    var id = data.id;

    var view = $('#views > #view-' + tweet.tab_id);
    view.prepend(
      '<div id="tweet-' + id + '">' +
        '<div class="content">' +
          '<div class="text">' +
            '<span class="screen_name">' +
              screen_name +
            '</span> ' +
            tweet.html +
          '</div>' +
          '<div class="information">' +
            '<a target="_blank" href="http://twitter.com/' + screen_name + '/status/' + id + '">' +
              convertDate(data.created_at) +
            '</a> ' +
            'via ' + data.source +
            ' | ' +
            '<a target="_blank" href="http://twitter.com/?status=@' + screen_name + ' &in_reply_to_status_id=' + id + '&in_reply_to=' + screen_name + '">Reply</a> ' +
            '<a href="#retweet">Retweet</a> ' +
            '<a target="_blank" href="http://twitter.com/?status= RT @' + screen_name + ': ' + data.text + '">RT</a> ' +
            '<a href="#unfollow">Unfollow</a> ' +
            '<a href="#fav">Fav</a>' + 
          '</div>' +
        '</div>' +
        '<div class="icon">' +
          '<img width="48" height="48" src="' + user.profile_image_url + '" />' +
        '</div>' +
      '</div>');
    var visible = view.is(':visible');
    if(!visible) {
      view.show();
    }
    var height = $('#tweet-' + data.id).outerHeight(true);
    if(!visible) {
      view.hide();
    }
    var tab = tabs[tweet.tab_id];
    tab.scrollTop += height;
    if(currentTab.id == tab.id) {
      $.scrollTo(currentTab.scrollTop, 0);
    }
  };

  var connectWebSocket = function(passwordHash) {
    var setMessage = function(text) {
      $('#auth > p').text(text);
    };

    setMessage('connecting...');

    var authorizeError = false;
    var ws = new WebSocket('ws://' + webSocket.host + ':' + webSocket.port);
    ws.onmessage = function(e) {
      ws.onmessage = function(e) {
        if(e.data == 'success') {
          ws.onmessage = function(e) {
            var tweet = eval('(' + e.data + ')');
            var tab = tabs[tweet.tab_id];
            tab.tweets.push(tweet);
            updateUnreadCount(tab, tab.unreadCount + 1);
            prependTweet(tweet);
          };
          ws.onclose = function() {
            connectWebSocket(passwordHash);
          };
          $('#auth').fadeOut(300);
          $('#main').fadeIn(300);
          setInterval(updateRead, 3000);
        }
        else if(e.data == 'failure') {
          setMessage('failure');
          ws.close();
        }
      };
      var serverRandom = e.data;
      var clientRandom = CybozuLabs.SHA1.calc(Math.random().toString());
      ws.send(CybozuLabs.SHA1.calc(passwordHash + serverRandom + clientRandom) + ',' + clientRandom);
    };
    ws.onclose = function() {
    };
    ws.onopen = function() {
    };
  };

  $('#auth form').submit(function() {
    var passwordHash = CybozuLabs.SHA1.calc($('#auth input[type="password"]').val());
    connectWebSocket(passwordHash);
    return false;
  });

  var getTweetIdFromAnchor = function(anchor) {
    var id = $(anchor).parent().parent().parent().attr('id');
    if(id.match(/^tweet-(\d+)$/)) {
      return parseInt(RegExp.$1);
    }
    return null;
  };

  var getTweetFromAnchor = function(anchor) {
    var id = getTweetIdFromAnchor(anchor);
    if(id == null) {
      return null;
    }
    var tweets = currentTab.tweets;
    for(var i = 0, n = tweets.length; i < n; ++i) {
      if(tweets[i].data.id == id) {
        return tweets[i];
      }
    }
    return null;
  };

  $('a[href="#retweet"]').live('click', function() {
    var tweet = getTweetFromAnchor(this);
    return false;
  });
  $('a[href="#unfollow"]').live('click', function() {
    var tweet = getTweetFromAnchor(this);
    $.getJSON('/api/unfollow/' + tweet.data.user.id, {}, function(data) {
      console.log(data);
    });
    return false;
  });
  $('a[href="#fav"]').live('click', function() {
    var tweet = getTweetFromAnchor(this);
    return false;
  });

});
