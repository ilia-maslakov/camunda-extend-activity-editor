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
