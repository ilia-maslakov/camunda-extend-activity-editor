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
