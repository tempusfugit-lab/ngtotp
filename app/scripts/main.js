/*
 * The MIT License (MIT)
 *
 * Copyright (c) 2016 有限会社テンパス・フュジット Tempus Fugit,Inc.
 * http://www.tempusfugit.jp/
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */
Sync = (function() {

function Sync(func, intervalMin) {
  this.__f = func;
  this.__i = intervalMin * 60 * 1000;
  this.__next = null;
  this.__tid = null;
  this.__awake = awake.bind(this);
}
Sync.prototype.start = function(syncSec) {
  syncSec = (syncSec % 60) * 1000 || 60000;
  var now = new Date().getTime();
  var elapsed = (now % syncSec);
  this.__next = now - elapsed + syncSec;
  this.__awake();
};
Sync.prototype.stop = function() {
  if(this.__tid !== null) {
    clearTimeout(this.__tid);
    this.__tid = null;
  }
};
function awake() {
  var now = new Date().getTime();
  if(now >= this.__next) {
    this.__next += this.__i;
    if(this.__i) this.__tid = setTimeout(this.__awake, this.__next - now - 1000);
    this.__f();
  } else {
    this.__tid = setTimeout(this.__awake, this.__next - now);
  }
}
return Sync;
})();
(function() {
  var DATA_KEY = "items";
  var TIME_INTERVAL = 30;
  var TIME_EVENT_NAME = "ngtTimeElapsed";

  function Item(name, key) {
    this.name = name;
    this.__key = key;
    this.__value = "";
  }
  Object.defineProperty(Item.prototype, "value", { get: function() {
    return this.__value;
  } });
  Item.prototype.calc = function(baseTime) {
    if(!baseTime) baseTime = new Date();
    var hotpNumber = Hotp.generate(this.__key, (baseTime.getTime() / 30000) & 0xffffffff);
    this.__value = ("00000" + hotpNumber).slice(-6);
  };

  var app = angular.module("ngtotp", ["ng-sortable"]);
  app.controller("Notifier", ["$scope", "$interval", "$timeout", function($s, $i, $t) {
    var sync = new Sync(synchronize, 0);
    var refProm = null;
    var lastNotified = 0;
    $s.dialog = {showDialog: false, resultData: {}};
    $s.handler = {};
    angular.element(document).ready(function() {
      $t(notify, 0);
      var st = new Date().getSeconds();
      sync.start(st > 0 && st <= 30 ? 30 : 0);
    });

    function notify() {
      var nowTs = new Date().getTime();
      var syncstamp = Math.round(nowTs / 1000) * 1000;
      var sec = (syncstamp / 1000) % 60;
      var rsec = TIME_INTERVAL - sec;
      if(rsec <= 0) { rsec += TIME_INTERVAL; }
      $s.$broadcast(TIME_EVENT_NAME, rsec, TIME_INTERVAL, syncstamp);
      lastNotified = nowTs;
    }

    function synchronize() {
      if(refProm !== null) {
        $i.cancel(refProm);
      }
      if(new Date().getTime() - lastNotified > 1000) {
        $t(notify, 0);
      }
      refProm = $i(notify, 30000);
    }
  }]);
  app.directive("ngtMain", ["$interval", "$timeout", function(interval, timeout) {
    return {
      restrict: "E",
      templateUrl: "views/main.html",
      controller: "Notifier",
      controllerAs: "main",
    };
  }]);
  app.controller("ItemManager", ["$scope", function($s) {
    var lstorage = window.localStorage || {};
    var self = this;
    var now = new Date();
    self.val = 0;
    this.items = (lstorage[DATA_KEY] ? JSON.parse(lstorage[DATA_KEY]) : []).map(function(nk) {
      return new Item(nk.name, nk.key);
    });
    $s.handler.addResultHandler = addItem;
    $s.$on(TIME_EVENT_NAME, refresh);
    $s.sortConf = {
      onSort: function() {
        flushItems();
      }
    };
    this.confirmRemove = function(item) {
      $s.dialog.title = "Remove";
      $s.dialog.contentUrl = "views/remove.html";
      $s.dialog.params = item;
      $s.dialog.resultCallback = remove;
      $s.dialog.showDialog = true;
    };
    function remove(dialogResult) {
      if(dialogResult.result) {
        var idx = self.items.indexOf(dialogResult.data);
        self.items.splice(idx, 1);
        flushItems();
      }
      $s.dialog.showDialog = false;
    }
    function addItem(dialogResult) {
      var name = dialogResult.data.name;
      var key;
      if(!name || name.length <= 0 || !dialogResult.data.key) { return; }
      try {
          key = Hotp.decodeBase32(dialogResult.data.key.toUpperCase());
        } catch(e) {
          alert(e.message);
          return;
        }
      var itemObj = new Item(name, key);
      itemObj.calc();
      self.items.splice(0, 0, itemObj);
      flushItems();
      $s.dialog.showDialog = false;
    }
    function refresh(evt, rsec, interval, syncstamp) {
      var now = new Date(syncstamp);
      for(var i = 0; i < self.items.length; i++) {
        self.items[i].calc(now);
      }
    }
    function flushItems() {
      var itms = [];
      self.items.forEach(function(item) {
        itms.push({name: item.name, key: item.__key});
      });
      lstorage[DATA_KEY] = JSON.stringify(itms);
    }
  }]);
  app.controller("Menu", ["$scope", "$timeout", "$element", function($s, $t, $e) {
    var self = this;
    self.bar = [{width: "0%", transition: "all 1s linear"}];
    self.addIconClicked = function() {
      $s.dialog.title = "Add";
      $s.dialog.contentUrl = "views/add.html";
      $s.dialog.params = {};
      $s.dialog.resultCallback = self.dialogCallback || function() {};
      $s.dialog.showDialog = true;
    };
    $s.$on(TIME_EVENT_NAME, function(evt, rsec, interval) {
      self.bar[0] = {
        width: rsec / interval * 100 + "%",
        transition: "width " + rsec + "s linear"
      };
      tryResize(self.bar[0]);
    });
    function tryResize(ngData) {
      $t(function() {
        if($e.find("div")[3].clientWidth <= 0) {
          tryResize(ngData);
          return;
        }
        ngData.width = "0%";
      }, 0);
    }
  }]);
  app.directive("ngtMenu", function() {
    return {
      restrict: "E",
      templateUrl: "views/menu.html",
      controller: "Menu",
      controllerAs: "menu",
      scope: true,
      bindToController: {
        dialogCallback: "=",
        className: "@",
        showFooter: "=",
      },
    };
  });
})();