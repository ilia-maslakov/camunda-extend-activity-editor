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
