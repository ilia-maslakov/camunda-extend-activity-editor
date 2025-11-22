'use strict';

module.exports = function(electronApp, menuState) {
  return [{
    label: 'Show Activities',
    accelerator: 'CommandOrControl+A',
    enabled: function() {
      return true;
    },
    action: function() {
      electronApp.emit('menu:action', 'showActivities');
    }
  }];
};
