'use strict';

function ensureLogBox(root) {
  let box = root.querySelector('.activity-log');
  if (box) return box;

  box = document.createElement('div');
  box.className = 'activity-log';
  box.style.cssText =
    'margin-top:6px; max-height:140px; overflow:auto; ' +
    'background:#fafafa; border:1px solid #e5e5e5; border-radius:4px; ' +
    'font:12px/1.4 monospace; padding:6px; white-space:pre-wrap;';
  box.innerHTML = 'Log:\n';
  root.appendChild(box);
  return box;
}

function initPluginLog(plugin) {
  const container = plugin.element || plugin._canvas.getContainer().parentNode.querySelector('.djs-activity-list');
  const box = ensureLogBox(container || plugin.element || plugin._canvas.getContainer().parentNode);

  const log = (msg, level = 'info') => {
    const time = new Date().toISOString().slice(11, 19);
    const line = `[${time}] ${msg}\n`;
    box.textContent += line;
    box.scrollTop = box.scrollHeight;

    // дублируем в DevTools на всякий
    if (level === 'error') console.error(msg);
    else if (level === 'warn') console.warn(msg);
    else console.log(msg);
  };

  // чтобы можно было вызывать из других модулей
  plugin._log = log;
  return log;
}

module.exports = { initPluginLog };
