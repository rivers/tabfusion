var TF = {};

(function() {
  'use strict';

  /**
  * Combine all tabs into a single window
  */
  TF.fuseTabs = function() {
    var that = this;

    that.getActiveTab(function(activeTab) {
      that.getTargetWindow(function(targetWindow) {
        that.moveAllToWindow(targetWindow, function() {
          that.focusTab(activeTab);
        });
      });
    });
  };

  /**
  * Get the active tab of the most recently focused window
  */
  TF.getActiveTab = function(callback) {
    var filters = { active: true, lastFocusedWindow: true };

    chrome.tabs.query(filters, function(tabs) {
      callback(tabs[0]);
    });
  };

  /**
  * Get the primary window into which all other tabs will be moved
  */
  TF.getTargetWindow = function(callback) {
    var that = this;

    chrome.windows.getLastFocused(function(topWindow) {
      if (topWindow.type === 'normal') {
        callback(topWindow);
        return;
      }

      that.getFirstNormalWindow(function(normalWindow) {
        callback(normalWindow);
        return;
      });
    });
  };

  /**
  * Get the first window with type 'normal'
  */
  TF.getFirstNormalWindow = function(callback) {
    chrome.windows.getAll({ populate: true }, function(windows) {
      windows.forEach(function(currentWindow) {
        if (currentWindow.type === 'normal') {
          callback(currentWindow);
        }
      });
    });
  };

  /**
  * Move all tabs to the provided window
  */
  TF.moveAllToWindow = function(targetWindow, callback) {
    var that = this;

    chrome.windows.getAll({ populate: true }, function(windows) {
      windows.forEach(function(currentWindow) {
        if (currentWindow.id === targetWindow.id) { return; }

        if (!that.isWindowMoveable(currentWindow)) { return; }

        currentWindow.tabs.forEach(function(tab) {
          that.moveTabToWindow(tab, targetWindow);
        });
      });

      callback();
    });
  };

  /**
  * Check whether a window should be moved according to the user's settings
  */
  TF.isWindowMoveable = function(theWindow) {
    var isMoveable = true
      , options = TF.Options.Cache;

    if (theWindow.type === 'panel' && !options.includePanels) {
      isMoveable = false;
    } else if (theWindow.type === 'popup' && !options.includePopups) {
      isMoveable = false;
    } else if (theWindow.type === 'app' && !options.includeApps) {
      isMoveable = false;
    }

    return isMoveable;
  };

  /**
  * Move a single tab to the provided window
  */
  TF.moveTabToWindow = function(tab, targetWindow) {
    if (!this.isTabMoveable(tab)) { return; }

    chrome.tabs.move(tab.id, {
      windowId: targetWindow.id,
      index: -1
    });
  };

  /**
  * Check whether a tab should be moved according to the user's settings
  */
  TF.isTabMoveable = function(tab) {
    var isMoveable = true
      , options = TF.Options.Cache
      , excludePattern = new RegExp(options.excludePattern);

    if (options.exclude && options.excludePattern !== '') {
      isMoveable = !excludePattern.exec(tab.url);
    }

    return isMoveable;
  };

  /**
  * Ensure that the provided tab is active and that its containing window is
  * focused
  */
  TF.focusTab = function(tab) {
    chrome.windows.update(tab.windowId, { focused: true }, function() {
      chrome.tabs.update(tab.id, { active: true });
    });
  };

  /**
  * Ensure init is called before listeners are created
  */
  TF.listen = function() {
    var that = this;

    that.init(function() { that.createListeners(); });
  };

  /**
  * Initialize extension by populating the options cache
  */
  TF.init = function(callback) {
    var that = this;

    that.setButtonTitle();

    chrome.storage.sync.get(that.Options.DEFAULTS, function(values) {
      that.Options.Cache = values;
      callback();
    });
  };

  /**
  * Create main listeners
  */
  TF.createListeners = function() {
    var that = this;

    chrome.commands.onCommand.addListener(function(command) {
      that[command]();
    });

    chrome.browserAction.onClicked.addListener(function() {
      that.fuseTabs();
    });
  };

  /**
  * Set browser action button title
  */
  TF.setButtonTitle = function() {
    var that = this
      , buttonTitle = 'Combine all tabs';

    that.getKeyboardShortcut('fuseTabs', function(shortcut) {
      if (shortcut.length > 0) {
        buttonTitle += ' (' + shortcut + ')';
      } else {
        buttonTitle += ' (no shortcut configured)';
      }

      chrome.browserAction.setTitle({ title: buttonTitle });
    });
  };

  /**
  * Get the keyboard shortcut associated with the provided name
  */
  TF.getKeyboardShortcut = function(name, callback) {
    chrome.commands.getAll(function(commands) {
      var i;
      for (i = 0; i < commands.length; ++i) {
        if (commands[i].name === name) {
          callback(commands[i].shortcut);
          return;
        }
      }
    });
  };

  /**
  * Options and defaults
  */
  TF.Options = {};

  TF.Options.Cache = {};

  TF.Options.DEFAULTS = {
    includePopups:  false,
    includePanels:  false,
    includeApps:    true,
    exclude:        false,
    excludePattern: ''
  };

  /**
  * Populate options form with current options from cache
  */
  TF.Options.populateForm = function() {
    var options = this.Cache;

    document.getElementById('popups').checked  = options.includePopups;
    document.getElementById('panels').checked  = options.includePanels;
    document.getElementById('apps').checked    = options.includeApps;
    document.getElementById('exclude').checked = options.exclude;

    document.getElementById('exclude_pattern').value = options.excludePattern;
  };

  /**
  * Show a status message for the given amount of time
  */
  TF.Options.flash = function(message, timeoutMs) {
    var statusEl = document.getElementById('status')
      , cancelEl = document.getElementById('cancel-container');

    cancelEl.style.display = 'none';
    statusEl.textContent = message;

    setTimeout(function() {
      statusEl.textContent   = '';
      cancelEl.style.display = 'inline';
    }, timeoutMs);
  };

  /**
  * Save options from form
  */
  TF.Options.save = function() {
    var that = this
      , includePopups  = document.getElementById('popups').checked
      , includePanels  = document.getElementById('panels').checked
      , includeApps    = document.getElementById('apps').checked
      , exclude        = document.getElementById('exclude').checked
      , excludePattern = document.getElementById('exclude_pattern').value
      , newOptions = {
          includePopups:  includePopups,
          includePanels:  includePanels,
          includeApps:    includeApps,
          exclude:        exclude,
          excludePattern: excludePattern
        };

    chrome.storage.sync.set(newOptions, function() {
      that.Cache = newOptions;
      that.flash('saved!', 750);
    });
  };

  /**
  * Set up options form listeners
  */
  TF.Options.listen = function() {
    var that = this;

    TF.init(function() { that.createListeners(); });
  };

  /**
  * Set up options form listeners
  */
  TF.Options.createListeners = function() {
    document.addEventListener('DOMContentLoaded',
      this.populateForm.bind(this));

    document.getElementById('save').addEventListener('click',
      this.save.bind(this));

    document.getElementById('cancel-link').addEventListener(
      'click', function() { window.close(); });

    this.populateForm();
  };
}());
