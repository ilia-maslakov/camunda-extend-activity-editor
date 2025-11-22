'use strict';

var { updateActivityList } = require('./ActivityListUpdater');
var { initActivityListUI } = require('./ActivityListUI');
var domClasses = require('min-dom/lib/classes');

/**
 * ActivityListPlugin
 * Сохраняет выделение и порядок при автоматических обновлениях.
 */
function ActivityListPlugin(elementRegistry, editorActions, canvas, selection, modeling, eventBus) {
  this._elementRegistry = elementRegistry;
  this._canvas = canvas;
  this._selection = selection;
  this._modeling = modeling || null;
  this._eventBus = eventBus;

  this.state = {
    open: false,
    filter: { type: 'All' },
    selected: new Set(),
    lastSort: null
  };

  const self = this;

  editorActions.register({
    showActivities: function () {
      self.showActivities();
    }
  });

  initActivityListUI(
    this,
    canvas.getContainer().parentNode,
    function onFilterChange(typeValue) {
      self.state.filter.type = typeValue;
      self.updateList();
    },
    function onResize(newW, newH, containerEl) {
      var w = Math.max(260, newW);
      var h = Math.max(120, newH);
      self.element.style.width = w + 'px';
      containerEl.style.maxHeight = h + 'px';
      containerEl.style.height = h + 'px';
    },
    function onToggle() {
      self.toggle();
    }
  );

  if (eventBus && typeof eventBus.on === 'function') {
    eventBus.on(['commandStack.changed', 'elements.changed', 'shape.changed'], function () {
      if (self.state.open) {
        self.safeRefresh();
      }
    });
  }
}

ActivityListPlugin.prototype.safeRefresh = function () {
  try {
    var oldSelected = new Set(this.state.selected);
    var oldSort = this.state.lastSort;

    updateActivityList(this);

    if (oldSelected.size > 0) {
      this.state.selected = oldSelected;
      for (const id of oldSelected) {
        const checkbox = this.element.querySelector('.activity-checkbox[data-id="' + id + '"]');
        if (checkbox) checkbox.checked = true;
      }
    }

    if (oldSort && typeof oldSort === 'function') {
      oldSort();
    }
  } catch (e) {
    console.warn('[ActivityListPlugin] safeRefresh failed:', e);
  }
};

ActivityListPlugin.prototype.toggle = function () {
  if (this.state.open) {
    domClasses(this.element).remove('open');
    this.state.open = false;
  } else {
    domClasses(this.element).add('open');
    this.state.open = true;
    this.updateList();
  }
};

ActivityListPlugin.prototype.showActivities = function () {
  if (!this.state.open) {
    this.toggle();
  }
  this.updateList();
};

/**
 * Базовое обновление без auto-refresh.
 */
ActivityListPlugin.prototype.updateList = function () {
  try {
    var oldSelected = new Set(this.state.selected);
    updateActivityList(this);

    this.state.selected = oldSelected;
    for (const id of oldSelected) {
      const checkbox = this.element.querySelector('.activity-checkbox[data-id="' + id + '"]');
      if (checkbox) checkbox.checked = true;
    }
  } catch (e) {
    console.error('[ActivityListPlugin] updateList failed:', e);
  }
};

ActivityListPlugin.$inject = [
  'elementRegistry',
  'editorActions',
  'canvas',
  'selection',
  'modeling',
  'eventBus'
];

module.exports = {
  __init__: ['activityListPlugin'],
  activityListPlugin: ['type', ActivityListPlugin]
};
