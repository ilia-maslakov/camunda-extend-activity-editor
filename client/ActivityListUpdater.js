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
