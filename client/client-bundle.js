(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
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

},{"./ActivityListUI":2,"./ActivityListUpdater":3,"min-dom/lib/classes":15}],2:[function(require,module,exports){
'use strict';

var domify = require('min-dom/lib/domify');
var domEvent = require('min-dom/lib/event');
var domQuery = require('min-dom/lib/query');

var SmartRenameWizard = require('./SmartRenameWizard').SmartRenameWizard;
var PromptSettingsDialog = require('./PromptSettingsDialog').PromptSettingsDialog;

/**
 * UI для списка активностей (таблица).
 */
function initActivityListUI(plugin, container, onFilterChange, onResize, onToggle) {
  var markup = `
  <div class="djs-popup djs-activity-list" style="width:1000px;">
    <div class="djs-activity-list-toggle">Activities</div>
    <div class="djs-activity-list-container">
      <div class="filters">
        <div class="filter-box">
          <select id="activity-type-select" class="activity-type-select">
            <option value="All">All</option>
            <option value="bpmn:UserTask">UserTask</option>
            <option value="bpmn:ServiceTask">ServiceTask</option>
            <option value="bpmn:ParallelGateway">ParallelGateway</option>
            <option value="bpmn:ExclusiveGateway">ExclusiveGateway</option>
            <option value="bpmn:StartEvent">StartEvent</option>
            <option value="bpmn:EndEvent">EndEvent</option>
            <option value="bpmn:BoundaryEvent">BoundaryEvent</option>
            <option value="bpmn:IntermediateCatchEvent">IntermediateCatchEvent</option>
            <option value="bpmn:IntermediateThrowEvent">IntermediateThrowEvent</option>
            <option value="bpmn:CallActivity">CallActivity</option>
            <option value="bpmn:SequenceFlow">SequenceFlow</option>
            <option value="bpmn:MessageEvent">MessageEvent</option>
          </select>
        </div>
        <div class="btn-box" style="display:flex; gap:4px;">
          <button class="generate-btn" title="Rename selected elements using AI">🤖 AI Rename</button>
          <button class="copy-btn" title="Copy table as Markdown">📋 Copy</button>
          <button class="prompt-settings-btn" title="Edit prompts">⚙️</button>
        </div>
      </div>
      <div class="activity-list-wrapper" style="overflow:auto; max-height:600px;">
        <div class="activity-list"></div>
      </div>
    </div>
    <div class="djs-activity-list-resize"></div>
  </div>`;

  plugin.element = domify(markup);
  container.appendChild(plugin.element);

  var header = domQuery('.djs-activity-list-toggle', plugin.element);

  // Перетаскивание панели
  var isDragging = false, wasDragged = false, offsetX = 0, offsetY = 0;
  header.style.cursor = 'move';

  header.addEventListener('mousedown', function (e) {
    isDragging = true;
    wasDragged = false;
    offsetX = e.clientX - plugin.element.offsetLeft;
    offsetY = e.clientY - plugin.element.offsetTop;
    document.body.style.userSelect = 'none';
  });

  document.addEventListener('mousemove', function (e) {
    if (!isDragging) return;
    wasDragged = true;
    plugin.element.style.left = (e.clientX - offsetX) + 'px';
    plugin.element.style.top  = (e.clientY - offsetY) + 'px';
    plugin.element.style.bottom = 'auto';
  });

  document.addEventListener('mouseup', function () {
    if (isDragging) setTimeout(function () { wasDragged = false; }, 100);
    isDragging = false;
    document.body.style.userSelect = '';
  });

  header.addEventListener('click', function (e) {
    if (wasDragged) {
      e.preventDefault();
      e.stopPropagation();
      wasDragged = false;
      return;
    }
    onToggle();
  });

  var activityTypeSelect = domQuery('#activity-type-select', plugin.element);

  // Исправленный хэндлер смены типа
  domEvent.bind(activityTypeSelect, 'change', function (e) {
    plugin.state.filter = plugin.state.filter || {};
    plugin.state.filter.type = e.target.value;

    if (typeof onFilterChange === 'function') {
      onFilterChange(e.target.value);
    }

    if (typeof plugin.updateList === 'function') {
      plugin.updateList();
    }
  });

  // 🤖 AI Rename
  var genBtn = domQuery('.generate-btn', plugin.element);
  domEvent.bind(genBtn, 'click', function () {
    if (!plugin.state.selected || plugin.state.selected.size === 0) {
      alert('Нет выбранных элементов для генерации ID.');
      return;
    }

    var wiz = new SmartRenameWizard(plugin);
    wiz.show();

    var currentType = (plugin.state.filter && plugin.state.filter.type) || 'All';
    var wait = setInterval(function () {
      var typeSelect  = document.querySelector('.ai-rename-wizard #type-select');
      var fieldSelect = document.querySelector('.ai-rename-wizard #field-select');
      if (!typeSelect || !fieldSelect) return;
      clearInterval(wait);

      if (currentType && currentType !== 'All') {
        var cleanType = currentType.replace('bpmn:', '');
        typeSelect.value = cleanType;
      }

      var evt = document.createEvent('Event');
      evt.initEvent('change', true, true);
      typeSelect.dispatchEvent(evt);
    }, 100);
  });

  // 📋 Copy table as Markdown
  var copyBtn = domQuery('.copy-btn', plugin.element);
  domEvent.bind(copyBtn, 'click', function () {
    var table = document.querySelector('.djs-activity-list table');
    if (!table) {
      alert('⚠️ Таблица не найдена.');
      return;
    }

    var headers = Array.from(table.querySelectorAll('th')).map(th => th.innerText.trim());
    var md = '| ' + headers.join(' | ') + ' |\n';
    md += '| ' + headers.map(() => '---').join(' | ') + ' |\n';

    var rows = Array.from(table.querySelectorAll('tbody tr'));
    rows.forEach(tr => {
      var cols = Array.from(tr.querySelectorAll('td')).map(td =>
        td.innerText.trim().replace(/\s+/g, ' ')
      );
      md += '| ' + cols.join(' | ') + ' |\n';
    });

    navigator.clipboard.writeText(md).then(() => {
      alert('✅ Таблица скопирована в буфер (Markdown)');
    }).catch(err => {
      console.error('Clipboard error:', err);
      alert('❌ Ошибка при копировании.');
    });
  });

  // ⚙️ Prompt Settings
  var settingsBtn = domQuery('.prompt-settings-btn', plugin.element);
  domEvent.bind(settingsBtn, 'click', function () {
    new PromptSettingsDialog().show();
  });

  // Ресайз панели
  var resizer = domQuery('.djs-activity-list-resize', plugin.element);
  var containerEl = domQuery('.djs-activity-list-container', plugin.element);
  var isResizing = false, startX = 0, startY = 0, startW = 0, startH = 0;

  resizer.addEventListener('mousedown', function (e) {
    e.stopPropagation();
    isResizing = true;
    startX = e.clientX;
    startY = e.clientY;
    startW = plugin.element.offsetWidth;
    startH = containerEl.offsetHeight;
    document.body.style.userSelect = 'none';
  });

  document.addEventListener('mousemove', function (e) {
    if (!isResizing) return;
    var dx = e.clientX - startX;
    var dy = e.clientY - startY;
    onResize(startW + dx, startH + dy, containerEl);
  });

  document.addEventListener('mouseup', function () {
    if (isResizing) {
      isResizing = false;
      document.body.style.userSelect = '';
    }
  });
}

module.exports = { initActivityListUI };

},{"./PromptSettingsDialog":6,"./SmartRenameWizard":7,"min-dom/lib/domify":17,"min-dom/lib/event":18,"min-dom/lib/query":19}],3:[function(require,module,exports){
'use strict';

var domify = require('min-dom/lib/domify');
var domEvent = require('min-dom/lib/event');
var clear = require('min-dom/lib/clear');
var focusAndSelectElement = require('./FocusAndSelectElement').focusAndSelectElement;

// === Иконки по типам BPMN ===
var ICONS = {
  'ServiceTask': '⚙️',
  'UserTask': '👤',
  'Message': '✉️',
  'MessageEvent': '✉️',
  'StartEvent': '🟢',
  'EndEvent': '🔴',
  'ParallelGateway': '➕',
  'ExclusiveGateway': '✖️',
  'BoundaryEvent': '⭕',
  'IntermediateCatchEvent': '🔘',
  'IntermediateThrowEvent': '🔘',
  'CallActivity': '▶️',
  'SequenceFlow': '➡️'
};

// Функция получения иконки по типу
function getIcon(type) {
  return ICONS[type] || '•';
}

function updateActivityList(plugin) {
  var list = plugin.element.querySelector('.activity-list');
  clear(list);

  var elements = plugin._elementRegistry._elements;
  var activities = [];
  var filterType = (plugin.state.filter && plugin.state.filter.type) || 'All';

  // Разрешенные типы
  var allowedTypes = {
    'bpmn:ServiceTask': true,
    'bpmn:UserTask': true,
    'bpmn:StartEvent': true,
    'bpmn:EndEvent': true,
    'bpmn:ExclusiveGateway': true,
    'bpmn:ParallelGateway': true,
    'bpmn:CallActivity': true,
    'bpmn:BoundaryEvent': true,
    'bpmn:IntermediateCatchEvent': true,
    'bpmn:IntermediateThrowEvent': true,
    'bpmn:SequenceFlow': true
  };

  var seen = {};

  function isMessageEvent(bo) {
    if (!bo || !bo.eventDefinitions) return false;
    for (var i = 0; i < bo.eventDefinitions.length; i++) {
      var def = bo.eventDefinitions[i];
      if (def && def.$type === 'bpmn:MessageEventDefinition') return true;
    }
    return false;
  }

  Object.keys(elements).forEach(function (key) {
    var el = elements[key].element;
    var bo = el.businessObject;
    if (!bo || !bo.id || el.type === 'label') return;

    var typeAllowed = !!allowedTypes[bo.$type] || isMessageEvent(bo);
    if (!typeAllowed) return;

    if (seen[bo.id]) return;
    seen[bo.id] = true;

    var match = false;
    if (filterType === 'All') {
      match = true;
    } else if (filterType === 'bpmn:MessageEvent') {
      match = isMessageEvent(bo);
    } else if (filterType === 'bpmn:ServiceTask' && bo.$type === 'bpmn:ServiceTask' && bo.type === 'external') {
      match = true;
    } else {
      match = bo.$type === filterType;
    }
    if (!match) return;

    var documentation = '';
    if (bo.documentation && bo.documentation[0] && bo.documentation[0].text) {
      documentation = bo.documentation[0].text;
    }

    if (bo.$type === 'bpmn:ServiceTask' && bo.type === 'external') {
      activities.push({
        type: 'ServiceTask',
        id: bo.id,
        extraKind: 'Topic',
        extra: bo.topic || '(нет топика)',
        name: bo.name || '(без имени)',
        documentation: documentation
      });
    } else if (bo.$type === 'bpmn:UserTask') {
      activities.push({
        type: 'UserTask',
        id: bo.id,
        extraKind: 'FormKey',
        extra: bo.formKey || '(нет formKey)',
        name: bo.name || '(без имени)',
        documentation: documentation
      });
    } else if (isMessageEvent(bo)) {
      // ищем messageRef без опц.цепочки
      var msgName = '(без имени сообщения)';
      if (bo.eventDefinitions) {
        for (var j = 0; j < bo.eventDefinitions.length; j++) {
          var d = bo.eventDefinitions[j];
          if (d && d.$type === 'bpmn:MessageEventDefinition' && d.messageRef) {
            msgName = d.messageRef.name || '(без имени сообщения)';
            break;
          }
        }
      }
      activities.push({
        type: 'MessageEvent',
        id: bo.id,
        extraKind: 'Message',
        extra: msgName,
        name: bo.name || '(без имени)',
        documentation: documentation
      });
    } else {
      activities.push({
        type: bo.$type.replace('bpmn:', ''),
        id: bo.id,
        extraKind: null,
        extra: '',
        name: bo.name || '(без имени)',
        documentation: documentation
      });
    }
  });

  if (activities.length === 0) {
    list.append(domify('<div style="padding:4px;">Нет подходящих элементов</div>'));
    return;
  }

  if (!plugin.state.selected) plugin.state.selected = new Set();

  function getHeaderHtml() {
    if (filterType === 'bpmn:ServiceTask') {
      return '' +
        '<tr>' +
        '<th></th><th></th>' +
        '<th>ID</th>' +
        '<th>Topic</th>' +
        '<th>Name</th>' +
        '<th>Element documentation</th>' +
        '</tr>';
    }
    if (filterType === 'bpmn:UserTask') {
      return '' +
        '<tr>' +
        '<th></th><th></th>' +
        '<th>ID</th>' +
        '<th>FormKey</th>' +
        '<th>Name</th>' +
        '<th>Element documentation</th>' +
        '</tr>';
    }
    if (filterType === 'bpmn:MessageEvent') {
      return '' +
        '<tr>' +
        '<th></th><th></th>' +
        '<th>ID</th>' +
        '<th>Message</th>' +
        '<th>Name</th>' +
        '<th>Element documentation</th>' +
        '</tr>';
    }
    if (filterType === 'All') {
      return '' +
        '<tr>' +
        '<th></th><th></th>' +
        '<th>Type</th>' +
        '<th>ID</th>' +
        '<th>Extra</th>' +
        '<th>Name</th>' +
        '<th>Element documentation</th>' +
        '</tr>';
    }
    return '' +
      '<tr>' +
      '<th></th><th></th>' +
      '<th>ID</th>' +
      '<th>Name</th>' +
      '<th>Element documentation</th>' +
      '</tr>';
  }

  var colgroupHtml;
  if (filterType === 'All') {
    colgroupHtml =
      '<colgroup>' +
      '<col style="width:30px;">' +
      '<col style="width:30px;">' +
      '<col style="width:110px;">' +   // Type
      '<col style="width:220px;">' +   // ID
      '<col style="width:220px;">' +   // Extra
      '<col style="width:260px;">' +   // Name
      '<col style="width:auto;">' +    // Doc
      '</colgroup>';
  } else {
    var withExtra = (filterType === 'bpmn:ServiceTask' ||
      filterType === 'bpmn:UserTask' ||
      filterType === 'bpmn:MessageEvent');
    colgroupHtml =
      '<colgroup>' +
      '<col style="width:30px;">' +
      '<col style="width:30px;">' +
      '<col style="width:220px;">' +   // ID
      (withExtra ? '<col style="width:240px;">' : '') +
      '<col style="width:260px;">' +   // Name
      '<col style="width:auto;">' +    // Doc
      '</colgroup>';
  }

  var table = domify(
    '<table>' +
    colgroupHtml +
    '<thead>' + getHeaderHtml() + '</thead>' +
    '<tbody></tbody>' +
    '</table>'
  );

  var tbody = table.querySelector('tbody');

  activities.forEach(function (a) {
    const icon = getIcon(a.type);

    var trHtml;
    if (filterType === 'All') {
      trHtml =
        '<tr>' +
        '<td><input type="checkbox" class="activity-checkbox" data-id="' + a.id + '"></td>' +
        '<td class="goto-icon" title="Показать элемент">' + icon + '</td>' +
        '<td>' + a.type + '</td>' +
        '<td class="activity-id" title="Кликните, чтобы изменить ID">' + a.id + '</td>' +
        '<td>' + (a.extra || '') + '</td>' +
        '<td>' + (a.name || '') + '</td>' +
        '<td>' + (a.documentation || '') + '</td>' +
        '</tr>';
    } else if (filterType === 'bpmn:ServiceTask' || filterType === 'bpmn:UserTask' || filterType === 'bpmn:MessageEvent') {
      trHtml =
        '<tr>' +
        '<td><input type="checkbox" class="activity-checkbox" data-id="' + a.id + '"></td>' +
        '<td class="goto-icon" title="Показать элемент">' + icon + '</td>' +
        '<td class="activity-id" title="Кликните, чтобы изменить ID">' + a.id + '</td>' +
        '<td>' + (a.extra || '') + '</td>' +
        '<td>' + (a.name || '') + '</td>' +
        '<td>' + (a.documentation || '') + '</td>' +
        '</tr>';
    } else {
      trHtml =
        '<tr>' +
        '<td><input type="checkbox" class="activity-checkbox" data-id="' + a.id + '"></td>' +
        '<td class="goto-icon" title="Показать элемент">' + icon + '</td>' +
        '<td class="activity-id" title="Кликните, чтобы изменить ID">' + a.id + '</td>' +
        '<td>' + (a.name || '') + '</td>' +
        '<td>' + (a.documentation || '') + '</td>' +
        '</tr>';
    }

    var tr = domify(trHtml);

    var checkbox = tr.querySelector('.activity-checkbox');
    if (plugin.state.selected.has(a.id)) checkbox.checked = true;
    domEvent.bind(checkbox, 'change', function () {
      if (checkbox.checked) plugin.state.selected.add(a.id);
      else plugin.state.selected.delete(a.id);
    });

    var gotoIcon = tr.querySelector('.goto-icon');
    domEvent.bind(gotoIcon, 'click', function (e) {
      e.stopPropagation();
      focusAndSelectElement(a.id, plugin);
    });

    var idCell = tr.querySelector('.activity-id');
    if (idCell) {
      domEvent.bind(idCell, 'click', function () {
        var width = idCell.getBoundingClientRect().width;
        var input = domify('<input type="text" class="activity-edit" value="' + a.id + '" style="width:' + Math.max(120, Math.floor(width)) + 'px;">');

        tr.classList.add('editing');
        idCell.parentNode.replaceChild(input, idCell);
        input.focus();
        input.select();

        function commit() {
          var newId = (input.value || '').trim();
          tr.classList.remove('editing');

          if (newId && newId !== a.id) {
            var element = plugin._elementRegistry.get(a.id);
            if (element && plugin._modeling) {
              try {
                plugin._modeling.updateProperties(element, { id: newId });
                plugin.updateList();
              } catch (err) {
                console.error('Failed to update ID:', err);
                plugin.updateList();
              }
            } else {
              plugin.updateList();
            }
          } else {
            plugin.updateList();
          }
        }

        domEvent.bind(input, 'blur', commit);
        domEvent.bind(input, 'keydown', function (e) {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') plugin.updateList();
        });
      });
    }

    tbody.appendChild(tr);
  });

  list.appendChild(table);
}

module.exports = { updateActivityList: updateActivityList };

},{"./FocusAndSelectElement":4,"min-dom/lib/clear":16,"min-dom/lib/domify":17,"min-dom/lib/event":18}],4:[function(require,module,exports){
'use strict';

function focusAndSelectElement(elementId, plugin) {
  const elementRegistry = plugin._elementRegistry;
  const canvas = plugin._canvas;
  const selection = plugin._selection;

  let element = elementRegistry.get(elementId);

  if (!element) {
    element = elementRegistry.filter(e =>
      e.businessObject &&
      e.businessObject.eventDefinitions &&
      e.businessObject.eventDefinitions.some(def =>
        def.messageRef && def.messageRef.id === elementId
      )
    )[0];
  }

  if (!element) {
    console.warn('Element ' + elementId + ' not found');
    return;
  }

  Object.keys(elementRegistry._elements).forEach(key => {
    const e = elementRegistry._elements[key].element;
    canvas.removeMarker(e, 'highlight');
  });
  canvas.addMarker(element, 'highlight');

  if (selection && typeof selection.select === 'function') {
    selection.select(element);
  }

  try {
    let bbox;
    if (typeof canvas.getAbsoluteBBox === 'function') {
      bbox = canvas.getAbsoluteBBox(element);
    } else {
      const gfx = canvas.getGraphics(element);
      bbox = gfx && gfx.getBBox ? gfx.getBBox() : null;
    }

    if (!bbox) {
      console.warn('No bbox for element:', elementId);
      return;
    }

    const viewbox = canvas.viewbox();

    // центр элемента
    const elementCenterX = bbox.x + bbox.width / 2;
    const elementCenterY = bbox.y + bbox.height / 2;

    canvas.viewbox({
      x: elementCenterX - viewbox.width / 2,
      y: elementCenterY - viewbox.height / 2,
      width: viewbox.width,
      height: viewbox.height
    });
  } catch (err) {
    console.warn('Centering failed:', err);
  }
}

module.exports = { focusAndSelectElement };

},{}],5:[function(require,module,exports){
'use strict';

/**
 * OpenAiClient
 * - читает токен и промпты из localStorage
 * - формирует запрос к OpenAI chat/completions
 * - ожидает ответ строго в формате [{ Id, entry, new }]
 */

function OpenAiClient() {}

/**
 * elements: [{ Id, Name, Type, Topic, FormKey }, ...]
 * selectedType: 'ServiceTask' | 'UserTask' | ...
 * selectedField: 'id' | 'name' | 'topic' | 'formKey'
 * prefixValue: string
 */
OpenAiClient.prototype.generateSmartOnes = function (elements, selectedType, selectedField, prefixValue) {
  var token = '';
  try { token = localStorage.getItem('openai_token') || ''; } catch (e) {}

  if (!token || token.indexOf('sk-') !== 0) {
    alert('❌ OpenAI token not found. Please set it first in Prompt Settings.');
    return Promise.resolve([]);
  }

  var fieldKey = (selectedField || 'id').toLowerCase();

  console.log('selectedType: ', selectedType);
  console.log('selectedField: ', selectedField);
  console.log('prefix: ', prefixValue);

  var promptKeyMap = {
    'id': 'prompt_id',
    'name': 'prompt_name',
    'topic': 'prompt_topic',
    'formkey': 'prompt_formKey'
  };
  var storagePromptKey = promptKeyMap[fieldKey] || 'prompt_id';

  var userPrompt = '';
  try { userPrompt = localStorage.getItem(storagePromptKey) || ''; } catch (e) {}

  if (!userPrompt) {
    if (fieldKey === 'id') userPrompt = 'Generate meaningful CamelCase IDs with given prefix.';
    if (fieldKey === 'name') userPrompt = 'Improve concise English names for tasks.';
    if (fieldKey === 'topic') userPrompt = 'Generate kebab-case ServiceTask topics with given prefix.';
    if (fieldKey === 'formkey') userPrompt = 'Generate form keys like prefix/verb-noun.';
  }

  try {
    console.log('[OpenAI] Selected field:', fieldKey);
    console.log('[OpenAI] Prompt key:', storagePromptKey);
    console.log('[OpenAI] Prefix:', prefixValue);
    console.log('[OpenAI] Selected activities:', elements);
  } catch (_) {}

  const systemMsg =
    'You are an assistant that returns ONLY VALID JSON. ' +
    'No comments, no markdown. ' +
    'Return an array of objects strictly like: ' +
    '[{ "Id": "<existing BPMN id>", "entry": "Id|Name|Topic|FormKey", "new": "<new value>" }].';

  let fieldInstruction = '';
  if (fieldKey === 'id') {
    fieldInstruction =
      'Entry MUST be "Id". Produce CamelCase ASCII identifiers starting with prefix. ' +
      'No spaces, only letters/digits/underscore. Example: Activity_ + StartAudit -> Activity_StartAudit';
  } else if (fieldKey === 'name') {
    fieldInstruction =
      'Entry MUST be "Name". Produce short, clear English names (1–3 words).';
  } else if (fieldKey === 'topic') {
    fieldInstruction =
      'Entry MUST be "Topic". Produce kebab-case topics for Camunda ServiceTask ' +
      'starting with prefix. Example: topic- + generate-report -> topic-generate-report';
  } else if (fieldKey === 'formkey') {
    fieldInstruction =
      'Entry MUST be "FormKey". Produce lowercase form keys like "prefix/verb-noun".';
  }

  var userMsg =
    userPrompt + '\n\n' +
    'Field to generate: ' + fieldKey + '\n' +
    'Type context: ' + (selectedType || '-') + '\n' +
    'Prefix: "' + prefixValue + '"\n' +
    'Source elements (JSON):\n' + safeStringify(elements) + '\n' +
    'Return ONLY pure JSON array; no markdown fences.\n' +
    'Each item MUST include: Id, entry, new.\n' +
    fieldInstruction;

  var body = {
    model: 'gpt-4o-mini',
    temperature: 0.2,
    messages: [
      { role: 'system', content: systemMsg },
      { role: 'user', content: userMsg }
    ]
  };

  try {
    console.log('[OpenAI] Starting generation...');
  } catch (_) {}

  return fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  })
  .then(function (res) {
    if (!res.ok) console.error('[OpenAI] HTTP status:', res.status);
    return res.json();
  })
  .then(function (data) {
    var content = '';
    try {
      content = data.choices[0].message.content;
    } catch (e) {
      console.warn('[OpenAI] Bad response structure:', data);
      return [];
    }

    content = stripCodeFences(content);
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      console.warn('[OpenAI] Cannot parse JSON:', content);
      parsed = [];
    }

    if (!Array.isArray(parsed)) {
      console.warn('[OpenAI] Non-array response:', parsed);
      return [];
    }

    const normalized = parsed.map(function (it) {
      const e = (it.entry || '').toLowerCase();
      const entryNorm =
        e === 'id' ? 'Id' :
          e === 'name' ? 'Name' :
            e === 'topic' ? 'Topic' :
              e === 'formkey' ? 'FormKey' : it.entry;
      return {Id: it.Id, entry: entryNorm, new: it.new};
    });

    console.log('[OpenAI] Normalized:', normalized);
    return normalized;
  })
  .catch(function (err) {
    console.error('[OpenAI] API error:', err);
    return [];
  });
};

function stripCodeFences(s) {
  if (!s || typeof s !== 'string') return s;
  var m = s.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  return m && m[1] ? m[1] : s;
}

function safeStringify(obj) {
  try { return JSON.stringify(obj); } catch (e) { return '[]'; }
}

module.exports = OpenAiClient;

},{}],6:[function(require,module,exports){
'use strict';

var domify = require('min-dom/lib/domify');

function PromptSettingsDialog() {
  this._ui = null;
  this._prevOverflow = null;
}

PromptSettingsDialog.prototype.show = function () {
  if (this._ui) return;

  const container = document.body;

  const defaultPrompts = {
    id: `Ты должен помочь придумать осмысленные ID для BPMN элементов.
ID должны быть на английском, в CamelCase, начинаться с заданного префикса.
Не добавляй пробелы, не используй спецсимволы.
Формат ответа: JSON-массив с объектами { Id, entry: "Id", new: "..." }`,

    name: `Ты должен улучшить имена задач (Name) для BPMN элементов.
Название должно быть коротким, понятным, на английском языке.
Формат ответа: JSON-массив с объектами { Id, entry: "Name", new: "..." }`,

    topic: `Ты должен помочь сгенерировать осмысленные Topic для ServiceTask.
Topic должен быть в стиле kebab-case, начинаться с префикса, отражающего контекст задачи.
Формат ответа: JSON-массив с объектами { Id, entry: "Topic", new: "..." }`,

    formKey: `Ты должен сгенерировать осмысленные FormKey для UserTask.
FormKey должен выглядеть как путь формата prefix/название-действия.
Формат ответа: JSON-массив с объектами { Id, entry: "FormKey", new: "..." }`
  };

  const stored = {
    token: localStorage.getItem('openai_token') || '',
    id: localStorage.getItem('prompt_id') || defaultPrompts.id,
    name: localStorage.getItem('prompt_name') || defaultPrompts.name,
    topic: localStorage.getItem('prompt_topic') || defaultPrompts.topic,
    formKey: localStorage.getItem('prompt_formKey') || defaultPrompts.formKey
  };

  const maskedToken = stored.token ? 'sk-...' + stored.token.slice(-6) : '';

  const html = `
  <div class="prompt-overlay"
       role="dialog" aria-modal="true"
       style="position:fixed;inset:0;width:100vw;height:100vh;
              background:rgba(0,0,0,0.5);z-index:99998;
              display:flex;align-items:center;justify-content:center;
              isolation:isolate;pointer-events:all;">
    <div class="prompt-settings-dialog"
         style="position:relative;width:500px;background:#fff;border:1px solid #bbb;
                border-radius:8px;box-shadow:0 6px 24px rgba(0,0,0,0.35);
                font-family:'Segoe UI',sans-serif;z-index:99999;">
      <div style="padding:16px 18px;">
        <h3 style="margin:0 0 12px 0;font-size:15px;display:flex;align-items:center;gap:6px;">
          <span style="color:#0074D9;">⚙️</span> Prompt & Token Settings
        </h3>

        <label style="font-weight:600;font-size:13px;">OpenAI Token</label>
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:10px;">
          <input type="text" id="token-input" value="${maskedToken}"
            ${stored.token ? 'readonly' : ''}
            style="flex:1;font-family:monospace;font-size:12px;
                   border:1px solid #ccc;border-radius:4px;
                   padding:4px 6px;height:28px;
                   background:${stored.token ? '#f3f3f3' : '#fff'};">
          <button id="edit-token"
            style="background:none;border:none;cursor:pointer;
                   font-size:14px;color:#0074D9;"
            title="Редактировать токен">✏️</button>
        </div>

        ${renderArea('ID Prompt', 'prompt-id', stored.id)}
        ${renderArea('Name Prompt', 'prompt-name', stored.name)}
        ${renderArea('Topic Prompt', 'prompt-topic', stored.topic)}
        ${renderArea('FormKey Prompt', 'prompt-formkey', stored.formKey)}

        <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:12px;">
          <button id="save-prompts"
                  style="background:#0074D9;color:#fff;border:none;border-radius:4px;
                         padding:6px 14px;cursor:pointer;font-size:13px;">Save</button>
          <button id="close-prompts"
                  style="background:#e0e0e0;color:#333;border:none;border-radius:4px;
                         padding:6px 14px;cursor:pointer;font-size:13px;">Close</button>
        </div>
      </div>
    </div>
  </div>`;

  const overlay = domify(html);
  container.appendChild(overlay);
  this._ui = overlay.querySelector('.prompt-settings-dialog');

  this._prevOverflow = container.style.overflow || '';
  container.style.overflow = 'hidden';

  const input = overlay.querySelector('#token-input');
  const editBtn = overlay.querySelector('#edit-token');
  const saveBtn = overlay.querySelector('#save-prompts');
  const closeBtn = overlay.querySelector('#close-prompts');
  const self = this;

  function closeAll() {
    container.style.overflow = self._prevOverflow;
    overlay.remove();
    self._ui = null;
  }

  editBtn.addEventListener('click', function () {
    if (input.hasAttribute('readonly')) {
      input.removeAttribute('readonly');
      input.value = '';
      input.style.background = '#fff';
      input.focus();
    }
  });

  saveBtn.addEventListener('click', function () {
    const newToken = input.value.trim();

    // сохраняем токен только если он реально новый
    if (!input.hasAttribute('readonly') && newToken.startsWith('sk-')) {
      localStorage.setItem('openai_token', newToken);
    }

    localStorage.setItem('prompt_id', overlay.querySelector('#prompt-id').value.trim());
    localStorage.setItem('prompt_name', overlay.querySelector('#prompt-name').value.trim());
    localStorage.setItem('prompt_topic', overlay.querySelector('#prompt-topic').value.trim());
    localStorage.setItem('prompt_formKey', overlay.querySelector('#prompt-formkey').value.trim());

    alert('Settings saved.');
    closeAll();
  });

  closeBtn.addEventListener('click', closeAll);

  overlay.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      closeAll();
    }
  });

  const firstInput = overlay.querySelector('#token-input') || overlay.querySelector('textarea') || overlay;
  if (firstInput && firstInput.focus) firstInput.focus();
};

function renderArea(label, id, value) {
  return `
    <label for="${id}" style="font-weight:600;font-size:13px;">${label}</label>
    <textarea id="${id}" style="width:100%;height:52px;margin:4px 0 10px 0;
              border:1px solid #ccc;border-radius:4px;font-family:monospace;
              font-size:12px;padding:4px 6px;resize:vertical;">${value}</textarea>`;
}

module.exports = { PromptSettingsDialog };

},{"min-dom/lib/domify":17}],7:[function(require,module,exports){
'use strict';

var domify = require('min-dom/lib/domify');

function SmartRenameWizard(plugin) {
  this.plugin = plugin;
  this._ui = null;
}

SmartRenameWizard.prototype.show = function () {
  if (this._ui) return;

  var diagramId = 'default-diagram';
  try {
    if (this.plugin && this.plugin._canvas && this.plugin._canvas.getRootElement) {
      diagramId = this.plugin._canvas.getRootElement().id || 'default-diagram';
    }
  } catch (e) {}

  var storageKey = 'aiRenamePrefixes_' + diagramId;

  var defaultPrefixes = {
    ServiceTask: { id: 'Activity_', topic: 'topic-' },
    UserTask: { id: 'UserTask_', formKey: 'form/' },
    StartEvent: { id: 'Start_' },
    EndEvent: { id: 'End_' }
  };

  var prefixes;
  try {
    prefixes = JSON.parse(localStorage.getItem(storageKey)) || JSON.parse(JSON.stringify(defaultPrefixes));
  } catch (e) {
    prefixes = JSON.parse(JSON.stringify(defaultPrefixes));
  }

  // === HTML ===
  var html = ''
    + '<div class="ai-rename-wizard" '
    + '     style="position:fixed;left:calc(50% - 220px);top:120px;z-index:9999;'
    + '            width:440px;background:#fff;border:1px solid #bbb;'
    + '            border-radius:8px;box-shadow:0 3px 10px rgba(0,0,0,0.25);'
    + '            padding:14px 16px;font-family:Segoe UI,sans-serif;">'
    + '  <h3 style="margin:0 0 10px 0;font-size:15px;">⚙️ Smart Rename Wizard</h3>'
    + '  <div style="margin-bottom:6px;">Diagram: <b>' + diagramId + '</b></div>'
    + '  <label>Type:</label>'
    + '  <select id="type-select" style="width:100%;margin:4px 0 8px 0;"></select>'
    + '  <label>Field:</label>'
    + '  <select id="field-select" style="width:100%;margin:4px 0 8px 0;"></select>'
    + '  <label>Prefix:</label>'
    + '  <input type="text" id="prefix-input" style="width:100%;margin:4px 0 10px 0;">'
    + '  <div style="font-size:12px;color:#333;margin:6px 0 10px 0;">'
    + '    <b>Rule:</b> Prefix + "AI generated"<br><br>'
    + '    <b>Examples:</b><br>'
    + '    Activity_ + StartAudit → Activity_StartAudit<br>'
    + '    topic- + generate-report → topic-generate-report<br>'
    + '    objectaudit/createdate/ + fillCustomerData → objectaudit/createdate/fillCustomerData'
    + '  </div>'
    + '  <div style="display:flex;justify-content:center;gap:10px;">'
    + '    <button id="apply" '
    + '      style="background:#0074D9;color:#fff;border:none;border-radius:4px;'
    + '             padding:6px 14px;cursor:pointer;">Apply</button>'
    + '    <button id="cancel" '
    + '      style="background:#e0e0e0;color:#333;border:none;border-radius:4px;'
    + '             padding:6px 14px;cursor:pointer;">Cancel</button>'
    + '  </div>'
    + '</div>';

  var ui = domify(html);
  document.body.appendChild(ui);
  this._ui = ui;

  // === BACKDROP ===
  var backdrop = domify(
    '<div style="position:fixed;inset:0;background:rgba(0,0,0,0.15);z-index:9998;"></div>'
  );
  document.body.appendChild(backdrop);

  function block(ev) {
    ev.stopPropagation();
    ev.preventDefault();
  }

  var eventTypes = [
    'mousedown', 'mouseup', 'click', 'dblclick',
    'contextmenu', 'wheel', 'keydown', 'keypress', 'keyup'
  ];
  eventTypes.forEach(function (t) {
    backdrop.addEventListener(t, block, true);
  });

  // === Элементы управления ===
  var typeSelect = ui.querySelector('#type-select');
  var fieldSelect = ui.querySelector('#field-select');
  var prefixInput = ui.querySelector('#prefix-input');
  var applyBtn = ui.querySelector('#apply');
  var cancelBtn = ui.querySelector('#cancel');

  [
    'ServiceTask',           // ⚙️
    'UserTask',               // 👤
    'MessageEvent',           // ✉️
    'StartEvent',             // 🟢
    'EndEvent',               // 🔴
    'ParallelGateway',        // ➕
    'ExclusiveGateway',       // ✖️
    'BoundaryEvent',          // ⭕
    'IntermediateCatchEvent', // 🔘
    'CallActivity',           // 📞
    'SequenceFlow'            // ➡️
  ].forEach(function (t) {
    var o = document.createElement('option');
    o.textContent = t;
    typeSelect.appendChild(o);
  });

  function updateFieldOptions() {
    var type = typeSelect.value;
    var options = [];

    if (type === 'ServiceTask') {
      options = ['id', 'topic', 'name'];
    } else if (type === 'UserTask') {
      options = ['id', 'formKey', 'name'];
    } else {
      options = ['id', 'name'];
    }

    fieldSelect.innerHTML = '';
    options.forEach(function (opt) {
      var o = document.createElement('option');
      o.textContent = opt;
      fieldSelect.appendChild(o);
    });

    updatePrefixField();
  }

  function updatePrefixField() {
    var type = typeSelect.value;
    var field = fieldSelect.value;
    prefixInput.value =
      (prefixes[type] && prefixes[type][field]) ? prefixes[type][field] : '';
  }

  typeSelect.addEventListener('change', updateFieldOptions);
  fieldSelect.addEventListener('change', updatePrefixField);
  prefixInput.addEventListener('input', function () {
    var type = typeSelect.value;
    var field = fieldSelect.value;
    if (!prefixes[type]) prefixes[type] = {};
    prefixes[type][field] = prefixInput.value;
  });

  updateFieldOptions();

  function saveAllPrefixes() {
    try {
      localStorage.setItem(storageKey, JSON.stringify(prefixes));
    } catch (e) {
      console.error('Failed to save prefixes:', e);
    }
  }

  var self = this;
  function closeWizard() {
    eventTypes.forEach(function (t) {
      backdrop.removeEventListener(t, block, true);
    });
    if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
    if (ui.parentNode) ui.parentNode.removeChild(ui);
    saveAllPrefixes();
    self._ui = null;
    document.body.focus();
  }

  // === APPLY ===
  applyBtn.addEventListener('click', function () {
    // === Сохраняем текущее значение Prefix перед вызовом OpenAI ===
    var type = typeSelect.value;
    var field = fieldSelect.value;
    if (!prefixes[type]) prefixes[type] = {};
    prefixes[type][field] = prefixInput.value.trim();
    console.log('[OpenAI] Prefix (final before send):', prefixes[type][field]);

    saveAllPrefixes();

    var OpenAi = require('./OpenAiClient');
    var ai = typeof OpenAi === 'function'
      ? new OpenAi()
      : (OpenAi.OpenAiClient ? new OpenAi.OpenAiClient() : OpenAi);

    try {
      var selection = self.plugin.state && self.plugin.state.selected
        ? Array.from(self.plugin.state.selected)
        : [];
      if (!selection.length) {
        alert('Нет выбранных элементов.');
        return;
      }

      var selectedType = typeSelect.value;
      var selectedField = fieldSelect.value;

      var elements = selection.map(function (id) {
        var el = self.plugin._elementRegistry.get(id);
        if (!el) return null;
        var bo = el.businessObject;
        return {
          Id: bo.id,
          Name: bo.name || '',
          Type: bo.$type,
          Topic: bo.topic || '',
          FormKey: bo.formKey || ''
        };
      }).filter(Boolean);

      var prefixValue = prefixes[selectedType] && prefixes[selectedType][selectedField]
        ? prefixes[selectedType][selectedField]
        : '';

      ai.generateSmartOnes(elements, selectedType, selectedField, prefixValue).then(function (result) {
        if (!result || !result.length) {
          alert('⚠️ OpenAI не вернул изменений.');
          return;
        }

        var modeling = self.plugin._modeling;
        var elementRegistry = self.plugin._elementRegistry;

        result.forEach(function (item) {
          var el = elementRegistry.get(item.Id);
          if (!el || !modeling) return;

          var field = (item.entry || '').toLowerCase();
          var value = item.new;

          if (field === 'id' && value && value !== item.Id) {
            modeling.updateProperties(el, { id: value });
            return;
          }

          var newProps = {};
          if (field === 'name') newProps.name = value;
          else if (field === 'topic' && 'topic' in el.businessObject) newProps.topic = value;
          else if (field === 'formkey' && 'formKey' in el.businessObject) newProps.formKey = value;

          if (Object.keys(newProps).length > 0) {
            modeling.updateProperties(el, newProps);
          }
        });

        alert('✅ Smart Rename успешно выполнен.');
        closeWizard();
      }).catch(function (err) {
        console.error('❌ Ошибка при вызове OpenAI:', err);
        alert('Ошибка при вызове OpenAI API.');
        closeWizard();
      });

    } catch (err) {
      console.error('❌ Ошибка в Apply:', err);
      alert('Ошибка выполнения Apply.');
      closeWizard();
    }
  });

  // === CANCEL ===
  cancelBtn.addEventListener('click', closeWizard);
};

module.exports = { SmartRenameWizard };

},{"./OpenAiClient":5,"min-dom/lib/domify":17}],8:[function(require,module,exports){
var registerBpmnJSPlugin = require('camunda-modeler-plugin-helpers').registerBpmnJSPlugin;
var ActivityListPlugin = require('./ActivityListPlugin');

registerBpmnJSPlugin(ActivityListPlugin);

},{"./ActivityListPlugin":1,"camunda-modeler-plugin-helpers":9}],9:[function(require,module,exports){
/**
 * Validate and register a client plugin.
 *
 * @param {Object} plugin
 * @param {String} type
 */
function registerClientPlugin(plugin, type) {
  var plugins = window.plugins || [];
  window.plugins = plugins;

  if (!plugin) {
    throw new Error('plugin not specified');
  }

  if (!type) {
    throw new Error('type not specified');
  }

  plugins.push({
    plugin: plugin,
    type: type
  });
}

/**
 * Validate and register a bpmn-js plugin.
 *
 * Example use:
 *
 *    var registerBpmnJSPlugin = require('./camundaModelerPluginHelpers').registerBpmnJSPlugin;
 *    var module = require('./index');
 *
 *    registerBpmnJSPlugin(module);
 *
 * @param {Object} plugin
 */
function registerBpmnJSPlugin(plugin) {
  registerClientPlugin(plugin, 'bpmn.modeler.additionalModules');
}

module.exports.registerBpmnJSPlugin = registerBpmnJSPlugin;

},{}],10:[function(require,module,exports){
/**
 * Module dependencies.
 */

try {
  var index = require('indexof');
} catch (err) {
  var index = require('component-indexof');
}

/**
 * Whitespace regexp.
 */

var re = /\s+/;

/**
 * toString reference.
 */

var toString = Object.prototype.toString;

/**
 * Wrap `el` in a `ClassList`.
 *
 * @param {Element} el
 * @return {ClassList}
 * @api public
 */

module.exports = function(el){
  return new ClassList(el);
};

/**
 * Initialize a new ClassList for `el`.
 *
 * @param {Element} el
 * @api private
 */

function ClassList(el) {
  if (!el || !el.nodeType) {
    throw new Error('A DOM element reference is required');
  }
  this.el = el;
  this.list = el.classList;
}

/**
 * Add class `name` if not already present.
 *
 * @param {String} name
 * @return {ClassList}
 * @api public
 */

ClassList.prototype.add = function(name){
  // classList
  if (this.list) {
    this.list.add(name);
    return this;
  }

  // fallback
  var arr = this.array();
  var i = index(arr, name);
  if (!~i) arr.push(name);
  this.el.className = arr.join(' ');
  return this;
};

/**
 * Remove class `name` when present, or
 * pass a regular expression to remove
 * any which match.
 *
 * @param {String|RegExp} name
 * @return {ClassList}
 * @api public
 */

ClassList.prototype.remove = function(name){
  if ('[object RegExp]' == toString.call(name)) {
    return this.removeMatching(name);
  }

  // classList
  if (this.list) {
    this.list.remove(name);
    return this;
  }

  // fallback
  var arr = this.array();
  var i = index(arr, name);
  if (~i) arr.splice(i, 1);
  this.el.className = arr.join(' ');
  return this;
};

/**
 * Remove all classes matching `re`.
 *
 * @param {RegExp} re
 * @return {ClassList}
 * @api private
 */

ClassList.prototype.removeMatching = function(re){
  var arr = this.array();
  for (var i = 0; i < arr.length; i++) {
    if (re.test(arr[i])) {
      this.remove(arr[i]);
    }
  }
  return this;
};

/**
 * Toggle class `name`, can force state via `force`.
 *
 * For browsers that support classList, but do not support `force` yet,
 * the mistake will be detected and corrected.
 *
 * @param {String} name
 * @param {Boolean} force
 * @return {ClassList}
 * @api public
 */

ClassList.prototype.toggle = function(name, force){
  // classList
  if (this.list) {
    if ("undefined" !== typeof force) {
      if (force !== this.list.toggle(name, force)) {
        this.list.toggle(name); // toggle again to correct
      }
    } else {
      this.list.toggle(name);
    }
    return this;
  }

  // fallback
  if ("undefined" !== typeof force) {
    if (!force) {
      this.remove(name);
    } else {
      this.add(name);
    }
  } else {
    if (this.has(name)) {
      this.remove(name);
    } else {
      this.add(name);
    }
  }

  return this;
};

/**
 * Return an array of classes.
 *
 * @return {Array}
 * @api public
 */

ClassList.prototype.array = function(){
  var className = this.el.getAttribute('class') || '';
  var str = className.replace(/^\s+|\s+$/g, '');
  var arr = str.split(re);
  if ('' === arr[0]) arr.shift();
  return arr;
};

/**
 * Check if class `name` is present.
 *
 * @param {String} name
 * @return {ClassList}
 * @api public
 */

ClassList.prototype.has =
ClassList.prototype.contains = function(name){
  return this.list
    ? this.list.contains(name)
    : !! ~index(this.array(), name);
};

},{"component-indexof":12,"indexof":12}],11:[function(require,module,exports){
var bind = window.addEventListener ? 'addEventListener' : 'attachEvent',
    unbind = window.removeEventListener ? 'removeEventListener' : 'detachEvent',
    prefix = bind !== 'addEventListener' ? 'on' : '';

/**
 * Bind `el` event `type` to `fn`.
 *
 * @param {Element} el
 * @param {String} type
 * @param {Function} fn
 * @param {Boolean} capture
 * @return {Function}
 * @api public
 */

exports.bind = function(el, type, fn, capture){
  el[bind](prefix + type, fn, capture || false);
  return fn;
};

/**
 * Unbind `el` event `type`'s callback `fn`.
 *
 * @param {Element} el
 * @param {String} type
 * @param {Function} fn
 * @param {Boolean} capture
 * @return {Function}
 * @api public
 */

exports.unbind = function(el, type, fn, capture){
  el[unbind](prefix + type, fn, capture || false);
  return fn;
};
},{}],12:[function(require,module,exports){
module.exports = function(arr, obj){
  if (arr.indexOf) return arr.indexOf(obj);
  for (var i = 0; i < arr.length; ++i) {
    if (arr[i] === obj) return i;
  }
  return -1;
};
},{}],13:[function(require,module,exports){
function one(selector, el) {
  return el.querySelector(selector);
}

exports = module.exports = function(selector, el){
  el = el || document;
  return one(selector, el);
};

exports.all = function(selector, el){
  el = el || document;
  return el.querySelectorAll(selector);
};

exports.engine = function(obj){
  if (!obj.one) throw new Error('.one callback required');
  if (!obj.all) throw new Error('.all callback required');
  one = obj.one;
  exports.all = obj.all;
  return exports;
};

},{}],14:[function(require,module,exports){

/**
 * Expose `parse`.
 */

module.exports = parse;

/**
 * Tests for browser support.
 */

var innerHTMLBug = false;
var bugTestDiv;
if (typeof document !== 'undefined') {
  bugTestDiv = document.createElement('div');
  // Setup
  bugTestDiv.innerHTML = '  <link/><table></table><a href="/a">a</a><input type="checkbox"/>';
  // Make sure that link elements get serialized correctly by innerHTML
  // This requires a wrapper element in IE
  innerHTMLBug = !bugTestDiv.getElementsByTagName('link').length;
  bugTestDiv = undefined;
}

/**
 * Wrap map from jquery.
 */

var map = {
  legend: [1, '<fieldset>', '</fieldset>'],
  tr: [2, '<table><tbody>', '</tbody></table>'],
  col: [2, '<table><tbody></tbody><colgroup>', '</colgroup></table>'],
  // for script/link/style tags to work in IE6-8, you have to wrap
  // in a div with a non-whitespace character in front, ha!
  _default: innerHTMLBug ? [1, 'X<div>', '</div>'] : [0, '', '']
};

map.td =
map.th = [3, '<table><tbody><tr>', '</tr></tbody></table>'];

map.option =
map.optgroup = [1, '<select multiple="multiple">', '</select>'];

map.thead =
map.tbody =
map.colgroup =
map.caption =
map.tfoot = [1, '<table>', '</table>'];

map.polyline =
map.ellipse =
map.polygon =
map.circle =
map.text =
map.line =
map.path =
map.rect =
map.g = [1, '<svg xmlns="http://www.w3.org/2000/svg" version="1.1">','</svg>'];

/**
 * Parse `html` and return a DOM Node instance, which could be a TextNode,
 * HTML DOM Node of some kind (<div> for example), or a DocumentFragment
 * instance, depending on the contents of the `html` string.
 *
 * @param {String} html - HTML string to "domify"
 * @param {Document} doc - The `document` instance to create the Node for
 * @return {DOMNode} the TextNode, DOM Node, or DocumentFragment instance
 * @api private
 */

function parse(html, doc) {
  if ('string' != typeof html) throw new TypeError('String expected');

  // default to the global `document` object
  if (!doc) doc = document;

  // tag name
  var m = /<([\w:]+)/.exec(html);
  if (!m) return doc.createTextNode(html);

  html = html.replace(/^\s+|\s+$/g, ''); // Remove leading/trailing whitespace

  var tag = m[1];

  // body support
  if (tag == 'body') {
    var el = doc.createElement('html');
    el.innerHTML = html;
    return el.removeChild(el.lastChild);
  }

  // wrap map
  var wrap = Object.prototype.hasOwnProperty.call(map, tag) ? map[tag] : map._default;
  var depth = wrap[0];
  var prefix = wrap[1];
  var suffix = wrap[2];
  var el = doc.createElement('div');
  el.innerHTML = prefix + html + suffix;
  while (depth--) el = el.lastChild;

  // one element
  if (el.firstChild == el.lastChild) {
    return el.removeChild(el.firstChild);
  }

  // several elements
  var fragment = doc.createDocumentFragment();
  while (el.firstChild) {
    fragment.appendChild(el.removeChild(el.firstChild));
  }

  return fragment;
}

},{}],15:[function(require,module,exports){
module.exports = require('component-classes');
},{"component-classes":10}],16:[function(require,module,exports){
module.exports = function(el) {

  var c;

  while (el.childNodes.length) {
    c = el.childNodes[0];
    el.removeChild(c);
  }

  return el;
};
},{}],17:[function(require,module,exports){
module.exports = require('domify');
},{"domify":14}],18:[function(require,module,exports){
module.exports = require('component-event');
},{"component-event":11}],19:[function(require,module,exports){
module.exports = require('component-query');
},{"component-query":13}]},{},[8]);
