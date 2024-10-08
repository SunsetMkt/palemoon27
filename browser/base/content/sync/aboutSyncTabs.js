/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var Cu = Components.utils;

Cu.import("resource://services-common/utils.js");
Cu.import("resource://services-sync/main.js");
Cu.import("resource:///modules/PlacesUIUtils.jsm");
Cu.import("resource://gre/modules/PlacesUtils.jsm", this);
Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/XPCOMUtils.jsm");

let RemoteTabViewer = {
  _tabsList: null,

  init: function () {
    Services.obs.addObserver(this, "weave:service:login:finish", false);
    Services.obs.addObserver(this, "weave:engine:sync:finish", false);

    this._tabsList = document.getElementById("tabsList");

    this.buildList(true);
  },

  uninit: function () {
    Services.obs.removeObserver(this, "weave:service:login:finish");
    Services.obs.removeObserver(this, "weave:engine:sync:finish");
  },

  createItem: function(attrs) {
    let item = document.createElement("richlistitem");

    // Copy the attributes from the argument into the item
    for (let attr in attrs) {
      item.setAttribute(attr, attrs[attr]);
    }

    if (attrs["type"] == "tab") {
      item.label = attrs.title != "" ? attrs.title : attrs.url;
    }

    return item;
  },

  filterTabs: function(event) {
    let val = event.target.value.toLowerCase();
    let numTabs = this._tabsList.getRowCount();
    let clientTabs = 0;
    let currentClient = null;

    for (let i = 0; i < numTabs; i++) {
      let item = this._tabsList.getItemAtIndex(i);
      let hide = false;
      if (item.getAttribute("type") == "tab") {
        if (!item.getAttribute("url").toLowerCase().includes(val) && 
            !item.getAttribute("title").toLowerCase().includes(val)) {
          hide = true;
        } else {
          clientTabs++;
        }
      }
      else if (item.getAttribute("type") == "client") {
        if (currentClient) {
          if (clientTabs == 0) {
            currentClient.hidden = true;
          }
        }
        currentClient = item;
        clientTabs = 0;
      }
      item.hidden = hide;
    }
    if (clientTabs == 0) {
      currentClient.hidden = true;
    }
  },

  openSelected: function() {
    let items = this._tabsList.selectedItems;
    let urls = [];
    for (let i = 0;i < items.length;i++) {
      if (items[i].getAttribute("type") == "tab") {
        urls.push(items[i].getAttribute("url"));
        let index = this._tabsList.getIndexOfItem(items[i]);
        this._tabsList.removeItemAt(index);
      }
    }
    if (urls.length) {
      getTopWin().gBrowser.loadTabs(urls);
      this._tabsList.clearSelection();
    }
  },

  bookmarkSingleTab: function() {
    let item = this._tabsList.selectedItems[0];
    let uri = Weave.Utils.makeURI(item.getAttribute("url"));
    let title = item.getAttribute("title");
    PlacesUIUtils.showBookmarkDialog({ action: "add"
                                     , type: "bookmark"
                                     , uri: uri
                                     , title: title
                                     , hiddenRows: [ "description"
                                                   , "location"
                                                   , "loadInSidebar"
                                                   , "keyword" ]
                                     }, window.top);
  },

  bookmarkSelectedTabs: function() {
    let items = this._tabsList.selectedItems;
    let URIs = [];
    for (let i = 0;i < items.length;i++) {
      if (items[i].getAttribute("type") == "tab") {
        let uri = Weave.Utils.makeURI(items[i].getAttribute("url"));
        if (!uri) {
          continue;
        }

        URIs.push(uri);
      }
    }
    if (URIs.length) {
      PlacesUIUtils.showBookmarkDialog({ action: "add"
                                       , type: "folder"
                                       , URIList: URIs
                                       , hiddenRows: [ "description" ]
                                       }, window.top);
    }
  },

  getIcon: function (iconUri, defaultIcon) {
    try {
      let iconURI = Weave.Utils.makeURI(iconUri);
      return PlacesUtils.favicons.getFaviconLinkForIcon(iconURI).spec;
    } catch (ex) {
      // Do nothing.
    }

    // Just give the provided default icon or the system's default.
    return defaultIcon || PlacesUtils.favicons.defaultFavicon.spec;
  },

  _waitingForBuildList: false,

  _buildListRequested: false,

  buildList: function (force) {
    if (this._waitingForBuildList) {
      this._buildListRequested = true;
      return;
    }

    this._waitingForBuildList = true;
    this._buildListRequested = false;

    this._clearTabList();

    if (Weave.Service.isLoggedIn && this._refetchTabs(force)) {
      this._generateWeaveTabList();
    } else {
      //XXXzpao We should say something about not being logged in & not having data
      //        or tell the appropriate condition. (bug 583344)
    }

    function complete() {
      this._waitingForBuildList = false;
      if (this._buildListRequested) {
        CommonUtils.nextTick(this.buildList, this);
      }
    }

    complete();
  },

  _clearTabList: function () {
    let list = this._tabsList;

    // Clear out existing richlistitems
    let count = list.getRowCount();
    if (count > 0) {
      for (let i = count - 1; i >= 0; i--) {
        list.removeItemAt(i);
      }
    }
  },

  _generateWeaveTabList: function () {
    let engine = Weave.Service.engineManager.get("tabs");
    let list = this._tabsList;

    let seenURLs = new Set();
    let localURLs = engine.getOpenURLs();

    for (let [guid, client] in Iterator(engine.getAllClients())) {
      // Create the client node, but don't add it in-case we don't show any tabs
      let appendClient = true;

      client.tabs.forEach(function({title, urlHistory, icon}) {
        let url = urlHistory[0];
        if (!url || localURLs.has(url) || seenURLs.has(url)) {
          return;
        }
        seenURLs.add(url);

        if (appendClient) {
          let attrs = {
            type: "client",
            clientName: client.clientName,
            class: Weave.Service.clientsEngine.isMobile(client.id) ? "mobile" : "desktop"
          };
          let clientEnt = this.createItem(attrs);
          list.appendChild(clientEnt);
          appendClient = false;
          clientEnt.disabled = true;
        }
        let attrs = {
          type:  "tab",
          title: title || url,
          url:   url,
          icon:  this.getIcon(icon),
        }
        let tab = this.createItem(attrs);
        list.appendChild(tab);
      }, this);
    }
  },

  adjustContextMenu: function(event) {
    let mode = "all";
    switch (this._tabsList.selectedItems.length) {
      case 0:
        break;
      case 1:
        mode = "single"
        break;
      default:
        mode = "multiple";
        break;
    }

    let menu = document.getElementById("tabListContext");
    let el = menu.firstChild;
    while (el) {
      let showFor = el.getAttribute("showFor");
      if (showFor) {
        el.hidden = showFor != mode && showFor != "all";
      }

      el = el.nextSibling;
    }
  },

  _refetchTabs: function(force) {
    if (!force) {
      // Don't bother refetching tabs if we already did so recently
      let lastFetch = 0;
      try {
        lastFetch = Services.prefs.getIntPref("services.sync.lastTabFetch");
      }
      catch (e) {
        /* Just use the default value of 0 */
      }

      let now = Math.floor(Date.now() / 1000);
      if (now - lastFetch < 30) {
        return false;
      }
    }

    // if Clients hasn't synced yet this session, we need to sync it as well.
    if (Weave.Service.clientsEngine.lastSync == 0) {
      Weave.Service.clientsEngine.sync();
    }

    // Force a sync only for the tabs engine
    let engine = Weave.Service.engineManager.get("tabs");
    engine.lastModified = null;
    engine.sync();
    Services.prefs.setIntPref("services.sync.lastTabFetch",
                              Math.floor(Date.now() / 1000));

    return true;
  },

  observe: function(subject, topic, data) {
    switch (topic) {
      case "weave:service:login:finish":
        this.buildList(true);
        break;
      case "weave:engine:sync:finish":
        if (subject == "tabs") {
          this.buildList(false);
        }
        break;
    }
  },

  handleClick: function(event) {
    if (event.target.getAttribute("type") != "tab") {
      return;
    }


    if (event.button == 1) {
      let url = event.target.getAttribute("url");
      openUILink(url, event);
      let index = this._tabsList.getIndexOfItem(event.target);
      this._tabsList.removeItemAt(index);
    }
  }
}

